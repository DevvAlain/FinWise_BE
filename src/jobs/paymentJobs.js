import cron from 'node-cron';
import mongoose from 'mongoose';
import PaymentIntent from '../models/payment_intent.js';
import Payment from '../models/payment.js';
import PaymentWebhookEvent from '../models/payment_webhook_event.js';
import Subscription from '../models/subscription.js';
import paymentProcessingService from '../services/paymentProcessingService.js';
import subscriptionBillingService from '../services/subscriptionBillingService.js';
import { publishDomainEvents } from '../events/domainEvents.js';

const TIMEZONE = 'Asia/Ho_Chi_Minh';

export const webhookSecureWorker = async () => {
  try {
    return await paymentProcessingService.processQueuedWebhookEvents(10);
  } catch (error) {
    console.error('[PaymentJobs] webhookSecureWorker error:', error);
    throw error;
  }
};

export const reconciliationWorker = async () => {
  const now = new Date();
  const results = {
    expiredIntents: 0,
    abortedPayments: 0,
    resetEvents: 0,
  };

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const expiredIntents = await PaymentIntent.find({
      status: 'pending',
      expiresAt: { $lt: now },
    }).session(session);

    for (const intent of expiredIntents) {
      intent.status = 'expired';
      await intent.save({ session });

      const payment = await Payment.findOne({ paymentIntent: intent._id }).session(session);
      if (payment && payment.paymentStatus === 'pending') {
        payment.paymentStatus = 'failed';
        payment.gatewayResponse = {
          reason: 'expired_intent',
          at: now,
        };
        await payment.save({ session });
        results.abortedPayments += 1;
      }
      results.expiredIntents += 1;

      await publishDomainEvents([
        {
          name: 'payment.expired',
          payload: {
            paymentIntentId: intent._id,
            requestId: intent.requestId,
            userId: intent.user,
            provider: intent.provider,
          },
        },
      ]);
    }

    const staleEvents = await PaymentWebhookEvent.updateMany(
      {
        status: 'processing',
        lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      {
        status: 'queued',
        lockedAt: null,
      },
    );
    results.resetEvents = staleEvents.modifiedCount;

    await session.commitTransaction();
    return results;
  } catch (error) {
    await session.abortTransaction();
    console.error('[PaymentJobs] reconciliationWorker error:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

export const autoRenewalWorker = async () => {
  const now = new Date();
  const windowStart = new Date(now);
  const windowEnd = new Date(now);
  windowStart.setDate(windowStart.getDate() + 2);
  windowEnd.setDate(windowEnd.getDate() + 3);

  const subscriptions = await Subscription.find({
    status: 'active',
    autoRenew: true,
    endDate: { $gte: windowStart, $lte: windowEnd },
  })
    .populate('user')
    .populate('plan');

  const attempts = [];
  for (const subscription of subscriptions) {
    try {
      const result = await subscriptionBillingService.initiateAutoRenewal(subscription);
      attempts.push({
        subscriptionId: subscription._id,
        result,
      });
      await publishDomainEvents([
        {
          name: 'subscription.autorenewal.attempted',
          payload: {
            subscriptionId: subscription._id,
            userId: subscription.user?._id || subscription.user,
            planId: subscription.plan?._id,
            status: result.success ? 'initiated' : 'blocked',
            message: result.message,
            timestamp: new Date(),
          },
        },
      ]);
    } catch (error) {
      console.error(
        '[PaymentJobs] autoRenewalWorker failed for subscription:',
        subscription._id,
        error,
      );
      attempts.push({
        subscriptionId: subscription._id,
        error: error.message,
      });
    }
  }

  return {
    subscriptionsProcessed: subscriptions.length,
    attempts,
  };
};

export const initPaymentJobs = () => {
  console.log('[PaymentJobs] Initializing payment jobs...');

  cron.schedule('*/1 * * * *', webhookSecureWorker, {
    name: 'payment-webhook-secure-processor',
    timezone: TIMEZONE,
  });

  cron.schedule('*/5 * * * *', reconciliationWorker, {
    name: 'payment-reconciliation',
    timezone: TIMEZONE,
  });

  cron.schedule('0 3 * * *', autoRenewalWorker, {
    name: 'subscription-auto-renewal',
    timezone: TIMEZONE,
  });

  console.log('[PaymentJobs] Payment cron jobs registered');

  return {
    webhookSecureWorker,
    reconciliationWorker,
    autoRenewalWorker,
  };
};

export default {
  initPaymentJobs,
  webhookSecureWorker,
  reconciliationWorker,
  autoRenewalWorker,
};
