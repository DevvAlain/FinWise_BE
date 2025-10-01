import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import Wallet from '../models/wallet.js';
import Transaction from '../models/transaction.js';
import SyncLog from '../models/sync_log.js';
import IntegrationConnection from '../models/integration_connection.js';
import { ensureUsage } from '../middleware/quotaMiddleware.js';
import { publishDomainEvents } from '../events/domainEvents.js';
import { getProviderClient } from './providers/providerRegistry.js';

const activeJobs = new Map();

const buildSyncHash = ({ provider, providerTransactionId, amount, occurredAt }) => {
  const hash = createHash('sha256');
  hash.update(String(provider || 'unknown'));
  hash.update('|');
  hash.update(String(providerTransactionId || ''));
  hash.update('|');
  hash.update(String(amount));
  hash.update('|');
  hash.update(new Date(occurredAt).toISOString());
  return hash.digest('hex');
};

const normaliseTrigger = (value) => {
  if (!value) return 'manual';
  const normalized = value.toString().toLowerCase();
  if (['manual', 'scheduled', 'scheduler', 'webhook'].includes(normalized)) {
    if (normalized === 'scheduler') return 'scheduled';
    return normalized;
  }
  return 'manual';
};

const toSyncLogType = (trigger) => {
  if (trigger === 'scheduled') return 'scheduled';
  if (trigger === 'webhook') return 'webhook';
  return 'manual';
};

const fetchProviderPayload = async ({ provider, wallet, integration, options }) => {
  const client = getProviderClient(provider);
  if (!client || typeof client.fetchTransactions !== 'function') {
    throw new Error(`No provider client registered for ${provider}`);
  }
  const result = await client.fetchTransactions({ wallet, integration, options });
  if (!result || typeof result !== 'object') {
    return { transactions: [], metadata: { empty: true } };
  }
  const transactions = Array.isArray(result.transactions)
    ? result.transactions
    : [];
  return {
    transactions,
    balance: result.balance,
    metadata: result.metadata || null,
  };
};

const parseAmount = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error('Invalid transaction amount from provider');
  }
  return num;
};

const toDateSafe = (value) => {
  if (!value) return new Date();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
};

const upsertTransactions = async ({
  userId,
  walletId,
  provider,
  providerTransactions,
  session,
  walletCurrency,
}) => {
  const inserted = [];
  let processed = 0;
  let duplicates = 0;

  if (!providerTransactions.length) {
    return { inserted, processed, duplicates };
  }

  const usage = await ensureUsage(userId, session);
  let newCount = 0;

  for (const raw of providerTransactions) {
    processed += 1;
    try {
      const amount = parseAmount(raw.amount);
      const occurredAt = toDateSafe(raw.occurredAt || raw.date || raw.time);
      const providerTransactionId = raw.providerTransactionId || raw.id || raw.reference;
      const syncHash = buildSyncHash({ provider, providerTransactionId, amount, occurredAt });

      const existing = await Transaction.findOne({
        user: userId,
        syncHash,
      })
        .session(session)
        .exec();
      if (existing) {
        duplicates += 1;
        continue;
      }

      const [doc] = await Transaction.create(
        [
          {
            user: userId,
            wallet: walletId,
            type: raw.type || 'expense',
            amount,
            currency: raw.currency || raw.currencyCode || walletCurrency || 'VND',
            category: raw.categoryId || null,
            occurredAt,
            description: raw.description || raw.memo || '',
            merchant: raw.merchant || raw.payee || null,
            inputMethod: 'auto_sync',
            provider,
            providerTransactionId,
            syncHash,
            rawProviderMetadata: raw.metadata || raw.raw || raw,
          },
        ],
        { session },
      );

      inserted.push(doc);
      newCount += 1;
    } catch (error) {
      console.error('Failed to upsert provider transaction:', error?.message || error);
    }
  }

  if (newCount > 0) {
    await usage.updateOne({ $inc: { transactionsCount: newCount } }, { session });
  }

  return { inserted, processed, duplicates };
};

const processWalletSyncJob = async (jobId, options) => {
  const job = activeJobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  job.startedAt = new Date();
  activeJobs.set(jobId, job);

  const session = await mongoose.startSession();
  let status = 'success';
  let errorMessage = null;
  let recordsProcessed = 0;
  let recordsInserted = 0;
  let duplicates = 0;
  let providerMetadata = null;
  const events = [];
  const startedAt = job.startedAt;
  let completedAt = null;

  try {
    const wallet = await Wallet.findOne({
      _id: job.walletId,
      user: job.userId,
      isActive: true,
    });

    if (!wallet) {
      throw new Error('Wallet not found or inactive');
    }

    if (!wallet.provider) {
      throw new Error('Wallet is not connected to any provider');
    }

    const integration = await IntegrationConnection.findOne({
      user: job.userId,
      provider: wallet.provider,
    });

    if (!integration) {
      throw new Error('Integration connection not found');
    }

    const providerResult = await fetchProviderPayload({
      provider: wallet.provider,
      wallet,
      integration,
      options,
    });

    providerMetadata = providerResult.metadata || null;

    await session.withTransaction(async () => {
      const walletDoc = await Wallet.findOne({
        _id: job.walletId,
        user: job.userId,
        isActive: true,
      })
        .session(session)
        .exec();

      if (!walletDoc) {
        throw new Error('Wallet not found inside transaction');
      }

      const { inserted, processed, duplicates: duplicateCount } = await upsertTransactions({
        userId: job.userId,
        walletId: walletDoc._id,
        provider: wallet.provider,
        providerTransactions: providerResult.transactions,
        session,
        walletCurrency: walletDoc.currency,
      });

      recordsProcessed += processed;
      recordsInserted += inserted.length;
      duplicates += duplicateCount;

      for (const tx of inserted) {
        const basePayload = {
          transactionId: tx._id,
          userId: job.userId,
          walletId: tx.wallet,
          type: tx.type,
          occurredAt: tx.occurredAt,
          amount: tx.amount,
        };
        events.push({ name: 'budget.recalculate', payload: basePayload });
        events.push({ name: 'goal.recalculate', payload: basePayload });
        events.push({ name: 'report.transaction_aggregated', payload: basePayload });
      }

      if (typeof providerResult.balance !== 'undefined' && providerResult.balance !== null) {
        const providerBalance = parseAmount(providerResult.balance);
        await Wallet.updateOne(
          { _id: walletDoc._id },
          { $set: { balance: providerBalance } },
          { session },
        );
      }

      await IntegrationConnection.updateOne(
        { user: job.userId, provider: wallet.provider },
        {
          $set: {
            lastSyncAt: new Date(),
            status: 'connected',
            errorMessage: null,
          },
        },
        { session },
      );
    });

    if (events.length) {
      await publishDomainEvents(events);
    }
  } catch (error) {
    status = 'failed';
    errorMessage = error?.message || 'Sync failed';
    console.error('Wallet sync job failed:', error);
    await publishDomainEvents([
      {
        name: 'notification.sync_result',
        payload: {
          userId: job.userId,
          walletId: job.walletId,
          jobId,
          status: 'failed',
          message: errorMessage,
        },
      },
    ]);
  } finally {
    completedAt = new Date();
    await session.endSession();

    try {
      await SyncLog.create({
        user: job.userId,
        wallet: job.walletId,
        syncType: toSyncLogType(job.trigger),
        status,
        recordsProcessed,
        recordsAdded: recordsInserted,
        recordsUpdated: 0,
        errorMessage,
        syncData: {
          jobId,
          duplicates,
          providerMetadata,
        },
        startedAt,
        completedAt,
      });
    } catch (logError) {
      console.error('Failed to create sync log:', logError);
    }

    job.status = status;
    job.completedAt = completedAt;
    job.errorMessage = errorMessage;
    job.recordsProcessed = recordsProcessed;
    job.recordsInserted = recordsInserted;
    job.duplicates = duplicates;
    activeJobs.set(jobId, job);
  }
};

export const requestWalletSync = async (userId, walletId, options = {}) => {
  const wallet = await Wallet.findOne({
    _id: walletId,
    user: userId,
    isActive: true,
  });

  if (!wallet) {
    return { success: false, statusCode: 404, message: 'Khong tim thay vi' };
  }

  if (!wallet.provider) {
    return {
      success: false,
      statusCode: 400,
      message: 'Wallet chua duoc ket noi voi provider',
    };
  }

  const jobId = uuidv4();
  const trigger = normaliseTrigger(options.trigger);

  activeJobs.set(jobId, {
    id: jobId,
    userId,
    walletId,
    createdAt: new Date(),
    trigger,
    status: 'queued',
  });

  setImmediate(() => {
    processWalletSyncJob(jobId, options).catch((err) => {
      console.error('Wallet sync job crashed:', err);
    });
  });

  return {
    success: true,
    statusCode: 202,
    jobId,
    message: 'Wallet sync queued',
  };
};

export const getWalletSyncJob = (jobId) => {
  const job = activeJobs.get(jobId);
  if (!job) return null;
  return { ...job };
};

export default { requestWalletSync, getWalletSyncJob };
