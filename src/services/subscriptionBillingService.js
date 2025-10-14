import mongoose from 'mongoose';
import SubscriptionPlan from '../models/subscription_plan.js';
import PaymentIntent from '../models/payment_intent.js';
import Payment from '../models/payment.js';
import payosClient from './payments/payosClient.js';
import {
  generateSecureRequestId,
  encryptMetadata,
  assessPaymentRisk,
} from './paymentSecurityService.js';
import subscriptionService from './subscriptionService.js';

const { PAYOS_RETURN_URL, PAYOS_CANCEL_URL } = process.env;

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

export default {
  initiateCheckout,
  initiateAutoRenewal,
  cancelCheckout,
};
