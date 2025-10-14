import mongoose from 'mongoose';
import PaymentWebhookEvent from '../models/payment_webhook_event.js';
import PaymentIntent from '../models/payment_intent.js';
import Payment from '../models/payment.js';
import SubscriptionPlan from '../models/subscription_plan.js';
import subscriptionService from './subscriptionService.js';
import { decryptMetadata } from './paymentSecurityService.js';
import { verifySignature as verifyPayosSignature } from './payments/payosClient.js';
import { publishDomainEvents } from '../events/domainEvents.js';
import { ensureUsage, getPeriodMonth } from '../middleware/quotaMiddleware.js';

const STATUS_MAP = {
  payos: {
    PAID: 'completed',
    COMPLETED: 'completed',
    SUCCESS: 'completed',
    SUCCEEDED: 'completed',
    PROCESSING: 'processing',
    PENDING: 'pending',
    FAILED: 'failed',
    CANCELED: 'failed',
    REFUNDED: 'refunded',
  },
};

const computePeriodEnd = (billingPeriod, startDate = new Date()) => {
  const endDate = new Date(startDate);
  if (billingPeriod === 'monthly') {
    endDate.setMonth(endDate.getMonth() + 1);
  } else if (billingPeriod === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else if (billingPeriod === 'weekly') {
    endDate.setDate(endDate.getDate() + 7);
  } else if (billingPeriod === 'daily') {
    endDate.setDate(endDate.getDate() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }
  return endDate;
};

const mapProviderStatus = (provider, rawStatus) => {
  if (!rawStatus) return 'pending';
  const normalized = String(rawStatus).toUpperCase();
  return STATUS_MAP[provider]?.[normalized] || 'pending';
};

const reverifySignature = (provider, event) => {
  if (provider === 'payos') {
    return verifyPayosSignature(event.rawPayload, event.signature);
  }
  return false;
};

const resetUsageForUser = async (userId, planId, session) => {
  try {
    const usage = await ensureUsage(userId, session);
    if (usage) {
      usage.plan = planId;
      usage.walletsCount = 0;
      usage.transactionsCount = 0;
      usage.aiCallsCount = 0;
      usage.budgetsCount = 0;
      usage.savingGoalsCount = 0;
      usage.lastResetAt = new Date();
      await usage.save({ session });
    }
  } catch (error) {
    console.error('[PaymentProcessing] Failed to reset quota usage:', error);
  }
};

const appendWebhookLog = (payment, event, status, responseCode) => {
  payment.webhookLogs = payment.webhookLogs || [];
  payment.webhookLogs.push({
    providerEvent: event.eventId,
    payload: event.payload,
    receivedAt: event.createdAt,
    processedAt: new Date(),
    responseCode: responseCode || status,
  });
};

const processPayosEvent = async (event, session) => {
  const requestId =
    event.payload?.data?.orderCode ||
    event.payload?.orderCode ||
    event.payload?.data?.orderId;

  if (!requestId) {
    event.status = 'ignored';
    event.errorMessage = 'Missing orderCode in webhook payload';
    await event.save({ session });
    return { ignored: true };
  }

  const intent = await PaymentIntent.findOne({ requestId }).session(session);
  if (!intent) {
    event.status = 'ignored';
    event.errorMessage = 'PaymentIntent not found for webhook';
    await event.save({ session });
    return { ignored: true };
  }

  if (['succeeded', 'failed', 'expired', 'cancelled'].includes(intent.status)) {
    event.status = 'processed';
    event.errorMessage = 'PaymentIntent already finalized';
    await event.save({ session });
    return { alreadyProcessed: true };
  }

  const payment = await Payment.findOne({ paymentIntent: intent._id }).session(session);
  if (!payment) {
    throw new Error('Payment record not found for intent');
  }

  const rawStatus =
    event.payload?.data?.status ||
    event.payload?.status ||
    event.payload?.data?.paymentStatus;
  const mappedStatus = mapProviderStatus('payos', rawStatus);

  if (mappedStatus === 'pending' || mappedStatus === 'processing') {
    appendWebhookLog(payment, event, mappedStatus, 'ignored');
    await payment.save({ session });
    event.status = 'processed';
    event.errorMessage = 'Webhook acknowledged (pending state)';
    await event.save({ session });
    return { pending: true };
  }

  const amount = Number(event.payload?.data?.amount || event.payload?.amount);
  const intentAmount = Number(intent.amount?.toString?.() || 0);

  if (amount && Math.abs(amount - intentAmount) > 1) {
    throw new Error(
      `Amount mismatch: intent=${intentAmount} provider=${amount}`,
    );
  }

  const metadata = decryptMetadata(intent.metadata?.encrypted);
  const planId = metadata?.planId || intent.metadata?.planId || intent.payload?.planId;
  const userId = intent.user;
  const plan = planId
    ? await SubscriptionPlan.findById(planId).session(session)
    : null;

  if (mappedStatus === 'completed') {
    payment.paymentStatus = 'completed';
    payment.gatewayResponse = event.payload;
    payment.providerTransactionId =
      event.payload?.data?.transactionId || payment.providerTransactionId;
    payment.paidAt = new Date(event.payload?.data?.paidAt || Date.now());
    appendWebhookLog(payment, event, mappedStatus, '200');
    await payment.save({ session });

    intent.status = 'succeeded';
    intent.payload = { ...intent.payload, webhook: event.payload };
    await intent.save({ session });

    let subscription = null;
    if (plan) {
      const startDate = new Date();
      const endDate = computePeriodEnd(plan.billingPeriod, startDate);
      subscription = await subscriptionService.createSubscription(
        userId,
        plan._id,
        {
          startDate,
          endDate,
          autoRenew: true,
          status: 'active',
          statusChangeNote: 'Activated via PayOS payment',
        },
        { session },
      );
      payment.subscription = subscription._id;
      await payment.save({ session });
      await resetUsageForUser(userId, plan._id, session);
    }

    event.status = 'processed';
    event.processedAt = new Date();
    await event.save({ session });

    await publishDomainEvents([
      {
        name: 'payment.verified',
        payload: {
          paymentId: payment._id,
          intentId: intent._id,
          userId,
          planId: plan?._id,
          provider: 'payos',
          amount: intentAmount,
          transactionId: payment.providerTransactionId,
          processedAt: new Date(),
        },
      },
      {
        name: 'subscription.activated',
        payload: {
          userId,
          subscriptionId: payment.subscription,
          planId: plan?._id,
          startDate: new Date(),
        },
      },
      {
        name: 'billing.cycle_started',
        payload: {
          userId,
          planId: plan?._id,
          subscriptionId: payment.subscription,
          periodStart: new Date(),
          periodEnd: plan ? computePeriodEnd(plan.billingPeriod) : null,
          periodMonth: getPeriodMonth(),
        },
      },
    ]);

    return { completed: true };
  }

  if (mappedStatus === 'failed') {
    payment.paymentStatus = 'failed';
    payment.gatewayResponse = event.payload;
    appendWebhookLog(payment, event, mappedStatus, '400');
    await payment.save({ session });

    intent.status = 'failed';
    intent.payload = { ...intent.payload, webhook: event.payload };
    await intent.save({ session });

    event.status = 'processed';
    event.errorMessage = 'Payment failed';
    await event.save({ session });

    await publishDomainEvents([
      {
        name: 'payment.failed',
        payload: {
          paymentId: payment._id,
          intentId: intent._id,
          userId,
          planId,
          provider: 'payos',
        },
      },
    ]);

    return { failed: true };
  }

  if (mappedStatus === 'refunded') {
    payment.paymentStatus = 'refunded';
    payment.gatewayResponse = event.payload;
    appendWebhookLog(payment, event, mappedStatus, '200');
    await payment.save({ session });

    intent.status = 'succeeded';
    await intent.save({ session });

    event.status = 'processed';
    event.errorMessage = 'Payment refunded';
    await event.save({ session });

    await publishDomainEvents([
      {
        name: 'payment.refunded',
        payload: {
          paymentId: payment._id,
          userId,
          planId,
          provider: 'payos',
        },
      },
    ]);

    return { refunded: true };
  }

  appendWebhookLog(payment, event, mappedStatus, '200');
  await payment.save({ session });
  event.status = 'processed';
  event.errorMessage = `Unhandled status ${mappedStatus}`;
  await event.save({ session });
  return { unhandled: true };
};

export const processWebhookEvent = async (eventId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const event = await PaymentWebhookEvent.findById(eventId).session(session);
    if (!event) return null;

    if (!reverifySignature(event.provider, event)) {
      event.status = 'failed';
      event.errorMessage = 'Signature re-verification failed';
      await event.save({ session });
      await session.commitTransaction();
      return { failed: true, reason: 'signature' };
    }

    event.status = 'processing';
    event.attempts += 1;
    event.lastAttemptAt = new Date();
    await event.save({ session });

    let result = null;
    if (event.provider === 'payos') {
      result = await processPayosEvent(event, session);
    } else {
      throw new Error(`Unsupported provider ${event.provider}`);
    }

    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    console.error('[PaymentProcessing] Failed to process event:', error);
    await PaymentWebhookEvent.findByIdAndUpdate(eventId, {
      status: 'failed',
      errorMessage: error.message,
    });
    return { failed: true, reason: error.message };
  } finally {
    session.endSession();
  }
};

export const processQueuedWebhookEvents = async (limit = 5) => {
  const events = await PaymentWebhookEvent.find({
    status: 'queued',
    lockedAt: { $in: [null, undefined] },
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  const results = [];
  for (const event of events) {
    await PaymentWebhookEvent.findByIdAndUpdate(event._id, {
      lockedAt: new Date(),
      status: 'processing',
    });
    const result = await processWebhookEvent(event._id);
    await PaymentWebhookEvent.findByIdAndUpdate(event._id, {
      $unset: { lockedAt: '' },
    });
    results.push({ eventId: event._id, result });
  }
  return results;
};

export default {
  processWebhookEvent,
  processQueuedWebhookEvents,
};
