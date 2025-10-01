import mongoose from 'mongoose';
import Wallet from '../models/wallet.js';
import IntegrationConnection from '../models/integration_connection.js';
import AuditLog from '../models/audit_log.js';
import Notification from '../models/notification.js';
import Subscription from '../models/subscription.js';
import { ensureUsage } from '../middleware/quotaMiddleware.js';
import integrationJobService from './integrationJobService.js';
import walletSyncService from './walletSyncService.js';

const WALLET_TYPES = ['bank', 'e-wallet', 'cash', 'credit_card'];
const DEFAULT_CURRENCY = 'VND';

const SUPPORTED_CURRENCIES = (() => {
  const raw = process.env.SUPPORTED_CURRENCIES || DEFAULT_CURRENCY;
  const list = raw
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return list.length ? list : [DEFAULT_CURRENCY];
})();

const ALLOWED_PROVIDERS = (() => {
  const raw = process.env.ALLOWED_WALLET_PROVIDERS || '';
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
})();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const maskAccountNumber = (value) => {
  const digits = value.replace(/\s+/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  const masked = '*'.repeat(digits.length - 4);
  return `${masked}${digits.slice(-4)}`;
};

const buildWalletResponse = (doc) => {
  if (!doc) return null;
  const obj = doc.toObject({ virtuals: true });
  delete obj.__v;
  return obj;
};

const maybeTriggerWalletQuotaWarning = async (userId, { previous, current }) => {
  if (current <= previous) return;
  try {
    const subscription = await Subscription.findOne({
      user: userId,
      status: 'active',
    }).populate('plan');

    const maxWallets = subscription?.plan?.maxWallets;
    if (!maxWallets || typeof maxWallets !== 'number' || maxWallets <= 0) {
      return;
    }

    const prevRatio = previous / maxWallets;
    const currentRatio = current / maxWallets;

    if (currentRatio >= 0.8 && prevRatio < 0.8) {
      await Notification.create({
        user: userId,
        notificationType: 'system',
        title: 'Sap dat gioi han so vi',
        message: `Ban da su dung ${current}/${maxWallets} vi theo goi hien tai. Vui long xem xet nang cap neu can them.`,
        priority: 'medium',
        channel: 'in_app',
      });
    }
  } catch (error) {
    console.error('Failed to create wallet quota warning notification:', error);
  }
};

const isProviderAllowed = (provider) => {
  if (!provider) return true;
  if (!ALLOWED_PROVIDERS.length) return true;
  return ALLOWED_PROVIDERS.includes(provider.toLowerCase());
};

const createWallet = async (userId, payload) => {
  const {
    walletName,
    walletType,
    currency,
    provider,
    accountNumber,
    alias,
  } = payload;

  const sanitizedName = typeof walletName === 'string' ? walletName.trim() : '';
  if (!sanitizedName) {
    return {
      success: false,
      statusCode: 400,
      message: 'walletName is required',
    };
  }

  const walletTypeNormalized =
    typeof walletType === 'string' ? walletType.trim().toLowerCase() : '';
  if (!WALLET_TYPES.includes(walletTypeNormalized)) {
    return {
      success: false,
      statusCode: 400,
      message: 'walletType is not supported',
    };
  }

  const currencyNormalized = ((currency ?? DEFAULT_CURRENCY).toString().trim() || DEFAULT_CURRENCY).toUpperCase();
  if (SUPPORTED_CURRENCIES.length && !SUPPORTED_CURRENCIES.includes(currencyNormalized)) {
    return {
      success: false,
      statusCode: 400,
      message: 'currency is not supported',
    };
  }

  const providerNormalized =
    typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  if (providerNormalized && !isProviderAllowed(providerNormalized)) {
    return {
      success: false,
      statusCode: 400,
      message: 'provider is not allowed',
    };
  }

  const aliasNormalized = typeof alias === 'string' ? alias.trim() : '';
  if (aliasNormalized) {
    const existingAlias = await Wallet.findOne({
      user: userId,
      alias: new RegExp(`^${escapeRegex(aliasNormalized)}$`, 'i'),
      isActive: true,
    });
    if (existingAlias) {
      return {
        success: false,
        statusCode: 409,
        message: 'alias already exists',
      };
    }
  }

  const accountNumberNormalized =
    typeof accountNumber === 'string' ? accountNumber.trim() : '';

  const session = await mongoose.startSession();
  let walletDoc;
  let integrationRecord;
  const quotaSnapshot = { previous: 0, current: 0 };
  const shouldLinkProvider = Boolean(providerNormalized);

  try {
    await session.withTransaction(async () => {
      const walletPayload = {
        user: userId,
        walletName: sanitizedName,
        walletType: walletTypeNormalized,
        currency: currencyNormalized,
        connectionStatus: shouldLinkProvider ? 'pending' : 'disconnected',
      };

      if (shouldLinkProvider) {
        walletPayload.provider = providerNormalized;
      } else if (providerNormalized) {
        walletPayload.provider = providerNormalized;
      }

      if (accountNumberNormalized) {
        walletPayload.accountNumber = accountNumberNormalized;
      }
      if (aliasNormalized) {
        walletPayload.alias = aliasNormalized;
      }

      const createdWallets = await Wallet.create([walletPayload], { session });
      walletDoc = createdWallets[0];

      const usage = await ensureUsage(userId, session);
      quotaSnapshot.previous = usage.walletsCount || 0;
      usage.walletsCount = quotaSnapshot.previous + 1;
      if (!usage.lastResetAt) {
        usage.lastResetAt = new Date();
      }
      await usage.save({ session });
      quotaSnapshot.current = usage.walletsCount;

      await AuditLog.create(
        [
          {
            user: userId,
            action: 'wallet_create_requested',
            entity: 'Wallet',
            entityId: walletDoc._id,
            metadata: {
              walletType: walletTypeNormalized,
              provider: providerNormalized || null,
            },
          },
        ],
        { session },
      );

      if (shouldLinkProvider) {
        const integrationUpdate = {
          status: 'pending',
          errorMessage: null,
          lastSyncAt: null,
          metadata: {
            walletId: walletDoc._id,
            requestedAt: new Date(),
          },
        };

        const maskedAccount = accountNumberNormalized
          ? maskAccountNumber(accountNumberNormalized)
          : '';
        if (maskedAccount) {
          integrationUpdate.maskedAccount = maskedAccount;
        }

        integrationRecord = await IntegrationConnection.findOneAndUpdate(
          { user: userId, provider: providerNormalized },
          {
            $set: integrationUpdate,
            $setOnInsert: {
              scope: [],
              credentialsEncrypted: null,
              refreshTokenEncrypted: null,
            },
          },
          { new: true, upsert: true, session, setDefaultsOnInsert: true },
        );
      }
    });

    const walletResponse = buildWalletResponse(walletDoc);
    let message = 'Wallet created successfully.';
    if (shouldLinkProvider) {
      message = 'Wallet created successfully. Provider connection is being initialised.';
    }

    let integrationJob = null;
    if (shouldLinkProvider) {
      try {
        const enqueueResult = await integrationJobService.enqueueInitConnection({
          userId,
          walletId: walletDoc._id,
          provider: providerNormalized,
          integrationId: integrationRecord?._id,
        });
        integrationJob = {
          provider: providerNormalized,
          status: enqueueResult?.queued ? 'queued' : 'pending',
        };
      } catch (queueError) {
        console.error('Failed to enqueue integration init job:', queueError);
      }
    }

    await maybeTriggerWalletQuotaWarning(userId, quotaSnapshot);

    return {
      success: true,
      statusCode: 201,
      wallet: walletResponse,
      message,
      integration: integrationJob,
    };
  } catch (error) {
    console.error('createWallet error:', error);
    let statusCode = 500;
    let message = 'Failed to create wallet';
    if (error?.code === 11000 && error?.keyPattern?.alias) {
      statusCode = 409;
      message = 'alias already exists';
    } else if (error?.name === 'ValidationError') {
      statusCode = 400;
      message = error.message;
    }
    return { success: false, statusCode, message };
  } finally {
    await session.endSession();
  }
};

const listWallets = async (userId) => {
  const items = await Wallet.find({ user: userId, isActive: true }).sort({
    createdAt: -1,
  });
  return { success: true, statusCode: 200, items };
};

const getWallet = async (userId, walletId) => {
  const wallet = await Wallet.findOne({
    _id: walletId,
    user: userId,
    isActive: true,
  });
  if (!wallet)
    return { success: false, statusCode: 404, message: 'Khong tim thay vi' };
  return { success: true, statusCode: 200, wallet };
};

const updateWallet = async (userId, walletId, payload) => {
  const allowed = [
    'walletName',
    'walletType',
    'currency',
    'provider',
    'accountNumber',
    'balance',
    'alias',
  ];
  const updates = {};
  for (const key of allowed) {
    if (typeof payload[key] !== 'undefined') updates[key] = payload[key];
  }
  const wallet = await Wallet.findOneAndUpdate(
    { _id: walletId, user: userId, isActive: true },
    { $set: updates },
    { new: true },
  );
  if (!wallet)
    return { success: false, statusCode: 404, message: 'Khong tim thay vi' };
  return { success: true, statusCode: 200, wallet };
};

const deleteWallet = async (userId, walletId) => {
  const wallet = await Wallet.findOneAndUpdate(
    { _id: walletId, user: userId, isActive: true },
    { $set: { isActive: false } },
    { new: true },
  );
  if (!wallet)
    return { success: false, statusCode: 404, message: 'Khong tim thay vi' };
  return { success: true, statusCode: 200, message: 'Da xoa vi', wallet };
};

export const requestWalletSync = (userId, walletId, options = {}) =>
  walletSyncService.requestWalletSync(userId, walletId, options);

export const getWalletSyncJob = walletSyncService.getWalletSyncJob;

export default {
  createWallet,
  listWallets,
  getWallet,
  updateWallet,
  deleteWallet,
  requestWalletSync,
  getWalletSyncJob,
};
