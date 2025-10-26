import mongoose from 'mongoose';
import SubscriptionPlan from '../models/subscription_plan.js';
import PaymentIntent from '../models/payment_intent.js';
import Payment from '../models/payment.js';
import payosClient, { verifySignature as verifyPayosSignature } from './payments/payosClient.js';
import {
  generateSecureRequestId,
  encryptMetadata,
  decryptMetadata,
  assessPaymentRisk,
} from './paymentSecurityService.js';
import subscriptionService from './subscriptionService.js';
import { publishDomainEvents } from '../events/domainEvents.js';
import { ensureUsage, getPeriodMonth } from '../middleware/quotaMiddleware.js';

const { PAYOS_RETURN_URL, PAYOS_CANCEL_URL } = process.env;

const STATUS_MAP = {
  payos: {
    PAID: 'completed',
    COMPLETED: 'completed',
    SUCCESS: 'completed',
    SUCCEEDED: 'completed',
    PROCESSING: 'processing',
    PENDING: 'pending',
    FAILED: 'failed',
    FAIL: 'failed',
    ERROR: 'failed',
    CANCELED: 'failed',
    CANCELLED: 'failed',
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

const mapManualStatus = (status) => {
  if (!status) return null;
  const normalized = String(status).trim().toLowerCase();
  if (
    ['success', 'succeeded', 'completed', 'complete', 'paid', 'payos_success'].includes(
      normalized,
    )
  ) {
    return 'completed';
  }
  if (
    ['failed', 'fail', 'error', 'cancelled', 'canceled', 'expired', 'voided'].includes(
      normalized,
    )
  ) {
    return 'failed';
  }
  if (['pending', 'processing', 'in_progress'].includes(normalized)) {
    return 'pending';
  }
  if (['refunded', 'refund'].includes(normalized)) {
    return 'refunded';
  }
  return null;
};

const resolveCompletionStatus = (provider, payloadStatus, providerData = {}, fallbackStatus) => {
  const manualCandidates = [
    payloadStatus,
    providerData?.status,
    providerData?.paymentStatus,
    providerData?.orderStatus,
    providerData?.data?.status,
    fallbackStatus,
  ];

  for (const candidate of manualCandidates) {
    const manual = mapManualStatus(candidate);
    if (manual) return manual;
  }

  for (const candidate of manualCandidates) {
    const mapped = mapProviderStatus(provider, candidate);
    if (mapped && mapped !== 'pending') return mapped;
  }

  return 'pending';
};

const extractRequestId = (payload = {}, providerData = {}) => {
  return (
    payload.requestId ||
    providerData?.requestId ||
    providerData?.orderCode ||
    providerData?.orderId ||
    providerData?.data?.orderCode ||
    providerData?.data?.orderId ||
    null
  );
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
    console.error('[SubscriptionBilling] Failed to reset quota usage:', error);
  }
};

const decimalToNumber = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof mongoose.Types.Decimal128) {
    return Number.parseFloat(value.toString());
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toDecimal128 = (value) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error('Invalid amount for Decimal128 conversion');
  }
  return mongoose.Types.Decimal128.fromString(normalized.toFixed(2));
};

const ensureNoActiveIntent = async (userId, planId) => {
  const activeIntent = await PaymentIntent.findOne({
    user: userId,
    status: { $in: ['pending', 'requires_action'] },
    expiresAt: { $gte: new Date() },
    'payload.planId': planId,
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!activeIntent) return null;
  return activeIntent;
};

export const initiateCheckout = async (user, payload = {}) => {
  const { planId, provider: requestedProvider, returnUrl, cancelUrl } = payload;
  if (!planId) {
    return {
      success: false,
      statusCode: 400,
      message: 'planId is required',
    };
  }

  const plan = await SubscriptionPlan.findOne({ _id: planId, isActive: true }).lean();
  if (!plan) {
    return {
      success: false,
      statusCode: 404,
      message: 'Subscription plan not found or inactive',
    };
  }

  const amount = decimalToNumber(plan.price);
  const risk = assessPaymentRisk({ user, plan, amount });
  if (!risk.allow) {
    return {
      success: false,
      statusCode: 403,
      message: `Checkout blocked due to risk flags: ${risk.flags.join(', ')}`,
      risk,
    };
  }

  const existingIntent = await ensureNoActiveIntent(user.id, planId);
  if (existingIntent) {
    if (existingIntent.payload?.checkoutUrl) {
      return {
        success: true,
        statusCode: 200,
        message: 'Existing payment intent found',
        data: {
          requestId: existingIntent.requestId,
          provider: existingIntent.provider,
          paymentUrl: existingIntent.payload.checkoutUrl,
          expiresAt: existingIntent.expiresAt,
          expiresIn: Math.max(
            0,
            Math.floor((new Date(existingIntent.expiresAt).getTime() - Date.now()) / 1000),
          ),
          intentId: existingIntent._id,
          risk,
        },
      };
    }

    await PaymentIntent.findByIdAndUpdate(existingIntent._id, {
      status: 'failed',
      payload: { ...existingIntent.payload, error: 'Missing checkoutUrl from provider' },
    });
    await Payment.findOneAndUpdate(
      { paymentIntent: existingIntent._id },
      {
        paymentStatus: 'failed',
        gatewayResponse: {
          message: 'Missing checkoutUrl from provider',
          at: new Date(),
        },
      },
    );
  }

  const provider = (requestedProvider || 'payos').toLowerCase();
  if (provider !== 'payos') {
    return {
      success: false,
      statusCode: 400,
      message: `Provider ${provider} is not yet supported`,
    };
  }

  const requestId = generateSecureRequestId();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const metadataEncrypted = encryptMetadata({
    planId: plan._id.toString(),
    planName: plan.planName,
    amount,
    currency: plan.currency || 'VND',
    userId: user.id,
    issuedAt: Date.now(),
  });

  const intent = await PaymentIntent.create({
    user: user.id,
    provider,
    paymentMethod: 'payos_qr',
    amount: toDecimal128(amount),
    currency: plan.currency || 'VND',
    status: 'initialized',
    requestId,
    expiresAt,
    metadata: {
      encrypted: metadataEncrypted,
      riskScore: risk.score,
      planId: plan._id.toString(),
    },
    payload: {
      planId: plan._id.toString(),
      planSnapshot: {
        planName: plan.planName,
        billingPeriod: plan.billingPeriod,
        price: amount,
      },
      returnUrl: returnUrl || PAYOS_RETURN_URL,
      cancelUrl: cancelUrl || PAYOS_CANCEL_URL,
    },
  });

  const payment = await Payment.create({
    user: user.id,
    subscription: null,
    paymentIntent: intent._id,
    amount: toDecimal128(amount),
    currency: plan.currency || 'VND',
    paymentMethod: 'payos_qr',
    provider,
    paymentStatus: 'pending',
    providerRequestId: requestId,
    gatewayResponse: null,
  });

  try {
    const gatewayResult = await payosClient.createPaymentRequest({
      requestId,
      amount,
      description: `Subscription ${plan.planName}`,
      items: [
        {
          name: plan.planName,
          quantity: 1,
          price: amount,
        },
      ],
      buyer: {
        name: user.fullName,
        email: user.email,
      },
      returnUrl,
      cancelUrl,
      expiredAt: expiresAt,
    });

    intent.status = 'pending';
    intent.payload = {
      ...intent.payload,
      checkoutUrl: gatewayResult.checkoutUrl,
      providerTransactionId: gatewayResult.providerTransactionId,
      rawResponse: gatewayResult.raw,
    };
    intent.signature = gatewayResult.raw?.data?.signature || null;
    await intent.save();

    await Payment.findByIdAndUpdate(payment._id, {
      providerTransactionId: gatewayResult.providerTransactionId,
      gatewayResponse: gatewayResult.raw,
    });

    return {
      success: true,
      statusCode: 202,
      message: 'Payment intent created',
      data: {
        requestId,
        paymentUrl: gatewayResult.checkoutUrl,
        expiresAt,
        expiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        provider,
        risk,
      },
    };
  } catch (error) {
    console.error('[SubscriptionBilling] Failed to create PayOS payment:', error);
    await PaymentIntent.findByIdAndUpdate(intent._id, {
      status: 'failed',
      payload: { ...intent.payload, error: error.message },
    });
    await Payment.findByIdAndUpdate(payment._id, {
      paymentStatus: 'failed',
      gatewayResponse: error.response || { message: error.message },
    });
    return {
      success: false,
      statusCode: 502,
      message: error.response?.desc || error.message || 'Failed to initialize payment with provider',
    };
  }
};

export const initiateAutoRenewal = async (subscription) => {
  if (!subscription?.autoRenew) {
    return { success: false, message: 'Subscription is not auto-renewable' };
  }
  const userId = subscription.user?.toString?.() || subscription.user;
  if (!userId) {
    return { success: false, message: 'Subscription missing user' };
  }
  const userSubscription = await subscriptionService.getActiveSubscription(userId);
  if (!userSubscription?.plan?._id) {
    return { success: false, message: 'No active plan found for auto-renewal' };
  }
  return initiateCheckout(
    {
      id: userId,
      fullName: subscription.user?.fullName || 'Subscription user',
      email: subscription.user?.email,
      isActive: true,
    },
    {
      planId: userSubscription.plan._id.toString(),
      context: { mode: 'auto_renewal', subscriptionId: subscription._id.toString() },
    },
  );
};

export const cancelCheckout = async (userId, requestId) => {
  if (!requestId) {
    return {
      success: false,
      statusCode: 400,
      message: 'requestId is required',
    };
  }

  const intent = await PaymentIntent.findOne({
    user: userId,
    requestId,
    status: { $in: ['initialized', 'pending', 'requires_action'] },
  });

  if (!intent) {
    return {
      success: false,
      statusCode: 404,
      message: 'Active payment intent not found',
    };
  }

  intent.status = 'cancelled';
  intent.payload = {
    ...intent.payload,
    cancelledAt: new Date(),
    cancelledByUser: true,
  };
  await intent.save();

  const payment = await Payment.findOne({ paymentIntent: intent._id });
  if (payment) {
    payment.paymentStatus = 'failed';
    payment.gatewayResponse = {
      ...(payment.gatewayResponse || {}),
      cancelledAt: new Date(),
      cancelledBy: userId,
      message: 'User cancelled payment before completion',
    };
    payment.webhookStatus = 'ignored';
    await payment.save();
  }

  return {
    success: true,
    statusCode: 200,
    message: 'Payment cancelled successfully',
    data: {
      requestId,
      paymentStatus: payment?.paymentStatus ?? 'failed',
      intentStatus: intent.status,
    },
  };
};

export const finalizeCheckout = async (user, payload = {}) => {
  const provider = String(payload.provider || 'payos').toLowerCase();
  if (provider !== 'payos') {
    return {
      success: false,
      statusCode: 400,
      message: `Provider ${provider} is not supported`,
    };
  }

  const providerData =
    payload.providerData ||
    payload.data ||
    payload.payosData ||
    (typeof payload.providerResponse === 'object' ? payload.providerResponse : {}) ||
    {};

  const requestId = extractRequestId(payload, providerData);
  if (!requestId) {
    return {
      success: false,
      statusCode: 400,
      message: 'requestId is required to finalize checkout',
    };
  }

  if (!user?.id) {
    return {
      success: false,
      statusCode: 401,
      message: 'Authentication required',
    };
  }

  const signature =
    payload.signature ??
    providerData?.signature ??
    providerData?.data?.signature ??
    null;

  if (signature) {
    const signaturePayload =
      payload.rawSignaturePayload ?? payload.rawData ?? payload.rawBody ?? providerData;
    const signatureOk = verifyPayosSignature(signaturePayload, signature);
    if (!signatureOk) {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid provider signature',
      };
    }
  }

  const resolvedStatus = resolveCompletionStatus(
    provider,
    payload.status || payload.outcome || payload.result,
    providerData,
    payload.code || providerData?.code,
  );

  if (!['completed', 'failed', 'refunded'].includes(resolvedStatus)) {
    return {
      success: false,
      statusCode: 400,
      message: 'Unable to determine payment status from payload',
      data: { resolvedStatus },
    };
  }

  const amountFromProvider =
    Number(payload.amount) ||
    Number(providerData?.amount) ||
    Number(providerData?.data?.amount) ||
    null;

  const transactionId =
    payload.transactionId ||
    providerData?.transactionId ||
    providerData?.data?.transactionId ||
    providerData?.paymentLinkId ||
    providerData?.data?.paymentLinkId ||
    null;

  const paidAtValue =
    payload.paidAt ||
    providerData?.paidAt ||
    providerData?.data?.paidAt ||
    null;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const intent = await PaymentIntent.findOne({ requestId, user: user.id }).session(session);
    if (!intent) {
      await session.abortTransaction();
      return {
        success: false,
        statusCode: 404,
        message: 'Payment intent not found for this request',
      };
    }

    const payment = await Payment.findOne({ paymentIntent: intent._id }).session(session);
    if (!payment) {
      throw new Error('Payment record not found for intent');
    }

    if (['completed', 'failed', 'refunded'].includes(payment.paymentStatus)) {
      await session.commitTransaction();
      return {
        success: true,
        statusCode: 200,
        message: 'Payment already finalized',
        data: {
          requestId,
          paymentStatus: payment.paymentStatus,
          intentStatus: intent.status,
          subscriptionId: payment.subscription,
        },
      };
    }

    const intentAmount = Number(intent.amount?.toString?.() || 0);
    if (
      amountFromProvider &&
      intentAmount &&
      Number.isFinite(intentAmount) &&
      Math.abs(amountFromProvider - intentAmount) > 1
    ) {
      throw new Error(
        `Amount mismatch between intent (${intentAmount}) and provider (${amountFromProvider})`,
      );
    }

    const metadata = decryptMetadata(intent.metadata?.encrypted);
    const planId = metadata?.planId || intent.metadata?.planId || intent.payload?.planId;
    const plan = planId ? await SubscriptionPlan.findById(planId).session(session) : null;
    const userId = intent.user;

    const gatewayResponse = {
      ...(providerData && Object.keys(providerData).length ? providerData : {}),
      source: 'api_finalize',
      code: payload.code ?? providerData?.code,
      desc: payload.desc ?? payload.message ?? providerData?.desc,
      receivedAt: new Date(),
    };

    let subscription = null;

    if (resolvedStatus === 'completed') {
      payment.paymentStatus = 'completed';
      payment.gatewayResponse = gatewayResponse;
      payment.providerTransactionId = transactionId || payment.providerTransactionId;
      payment.paidAt = paidAtValue ? new Date(paidAtValue) : new Date();
      payment.webhookStatus = 'ignored';

      intent.status = 'succeeded';
      intent.payload = { ...intent.payload, apiFinalize: gatewayResponse };

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
            statusChangeNote: 'Activated via direct payment confirmation',
          },
          { session },
        );
        payment.subscription = subscription._id;
        await resetUsageForUser(userId, plan._id, session);
      }

      await payment.save({ session });
      await intent.save({ session });

      await publishDomainEvents([
        {
          name: 'payment.verified',
          payload: {
            paymentId: payment._id,
            intentId: intent._id,
            userId,
            planId: plan?._id,
            provider,
            amount: intentAmount,
            transactionId: payment.providerTransactionId,
            processedAt: new Date(),
          },
        },
        ...(subscription
          ? [
              {
                name: 'subscription.activated',
                payload: {
                  userId,
                  subscriptionId: subscription._id,
                  planId: plan?._id,
                  startDate: new Date(),
                },
              },
              {
                name: 'billing.cycle_started',
                payload: {
                  userId,
                  planId: plan?._id,
                  subscriptionId: subscription._id,
                  periodStart: new Date(),
                  periodEnd: plan ? computePeriodEnd(plan.billingPeriod) : null,
                  periodMonth: getPeriodMonth(),
                },
              },
            ]
          : []),
      ]);
    } else if (resolvedStatus === 'failed') {
      payment.paymentStatus = 'failed';
      payment.gatewayResponse = gatewayResponse;
      payment.webhookStatus = 'ignored';
      await payment.save({ session });

      intent.status = 'failed';
      intent.payload = { ...intent.payload, apiFinalize: gatewayResponse };
      await intent.save({ session });

      await publishDomainEvents([
        {
          name: 'payment.failed',
          payload: {
            paymentId: payment._id,
            intentId: intent._id,
            userId,
            planId,
            provider,
          },
        },
      ]);
    } else if (resolvedStatus === 'refunded') {
      payment.paymentStatus = 'refunded';
      payment.gatewayResponse = gatewayResponse;
      payment.webhookStatus = 'ignored';
      await payment.save({ session });

      intent.status = 'succeeded';
      await intent.save({ session });

      await publishDomainEvents([
        {
          name: 'payment.refunded',
          payload: {
            paymentId: payment._id,
            userId,
            planId,
            provider,
          },
        },
      ]);
    }

    await session.commitTransaction();
    return {
      success: true,
      statusCode: 200,
      message: 'Payment status updated',
      data: {
        requestId,
        paymentStatus: payment.paymentStatus,
        intentStatus: intent.status,
        subscriptionId: payment.subscription,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    console.error('[SubscriptionBilling] finalizeCheckout error:', error);
    return {
      success: false,
      statusCode: 500,
      message: error.message || 'Failed to finalize payment',
    };
  } finally {
    session.endSession();
  }
};

export default {
  initiateCheckout,
  initiateAutoRenewal,
  cancelCheckout,
  finalizeCheckout,
};
