import mongoose from 'mongoose';
import SubscriptionPlan from '../models/subscription_plan.js';
import { invalidateOverviewCache } from './adminReportingService.js';

const { Types } = mongoose;

const PLAN_TYPES = ['free', 'premium'];
const BILLING_PERIODS = ['monthly', 'yearly'];

const sanitizeFeatures = (features) => {
  if (!Array.isArray(features)) return [];
  return features.map((item) => String(item).trim()).filter((item) => item.length > 0);
};

const sanitizeNumeric = (value, defaultValue = undefined) => {
  if (value === null || value === undefined) return defaultValue;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : defaultValue;
};

const normalizeCurrency = (value) => {
  if (!value) return 'VND';
  return String(value).trim().toUpperCase();
};

const mapPayload = (payload) => {
  const {
    planName,
    planType,
    price,
    currency,
    billingPeriod,
    features,
    maxWallets,
    maxMonthlyTransactions,
    aiRecommendationsLimit,
    maxBudgets,
    maxSavingGoals,
    isActive,
  } = payload;

  const mapped = {
    planName: planName ? String(planName).trim() : undefined,
    planType: planType ? String(planType).trim().toLowerCase() : undefined,
    price,
    currency: currency ? normalizeCurrency(currency) : undefined,
    billingPeriod: billingPeriod ? String(billingPeriod).trim().toLowerCase() : undefined,
    features: sanitizeFeatures(features),
    maxWallets: sanitizeNumeric(maxWallets),
    maxMonthlyTransactions: sanitizeNumeric(maxMonthlyTransactions),
    aiRecommendationsLimit: sanitizeNumeric(aiRecommendationsLimit),
    maxBudgets: sanitizeNumeric(maxBudgets),
    maxSavingGoals: sanitizeNumeric(maxSavingGoals),
    isActive: typeof isActive === 'boolean' ? isActive : undefined,
  };

  return mapped;
};

const validatePlanInput = (data) => {
  const errors = [];
  if (!data.planName) errors.push('planName is required');
  if (!data.planType) errors.push('planType is required');
  if (!PLAN_TYPES.includes(data.planType || '')) errors.push('planType must be one of: free, premium');
  if (data.price === undefined || data.price === null || data.price === '') {
    errors.push('price is required');
  } else if (!Number.isFinite(Number(data.price)) || Number(data.price) < 0) {
    errors.push('price must be a non-negative number');
  }
  if (!data.billingPeriod) errors.push('billingPeriod is required');
  if (!BILLING_PERIODS.includes(data.billingPeriod || '')) {
    errors.push('billingPeriod must be monthly or yearly');
  }
  return errors;
};

const createPlan = async (payload) => {
  const mapped = mapPayload(payload);
  const createInput = {
    ...mapped,
    currency: mapped.currency || 'VND',
  };
  const errors = validatePlanInput(createInput);
  if (errors.length) {
    return {
      success: false,
      statusCode: 400,
      message: errors.join(', '),
    };
  }

  try {
    const [plan] = await SubscriptionPlan.create([
      {
        ...createInput,
        price: mongoose.Types.Decimal128.fromString(String(createInput.price)),
      },
    ]);
    await invalidateOverviewCache();
    return { success: true, statusCode: 201, item: plan };
  } catch (error) {
    console.error('[AdminPlanService] createPlan error:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Unable to create subscription plan',
    };
  }
};

const updatePlan = async (planId, payload) => {
  if (!planId || !Types.ObjectId.isValid(planId)) {
    return {
      success: false,
      statusCode: 400,
      message: 'Invalid plan id',
    };
  }

  const mapped = mapPayload(payload);
  const updates = {};

  Object.entries(mapped).forEach(([key, value]) => {
    if (value !== undefined) {
      if (key === 'price') {
        if (!Number.isFinite(Number(value)) || Number(value) < 0) {
          return;
        }
        updates.price = mongoose.Types.Decimal128.fromString(String(value));
      } else if (key === 'features') {
        updates.features = value;
      } else {
        updates[key] = value;
      }
    }
  });

  const planType = mapped.planType;
  if (planType && !PLAN_TYPES.includes(planType)) {
    return {
      success: false,
      statusCode: 400,
      message: 'planType must be one of: free, premium',
    };
  }

  const billingPeriod = mapped.billingPeriod;
  if (billingPeriod && !BILLING_PERIODS.includes(billingPeriod)) {
    return {
      success: false,
      statusCode: 400,
      message: 'billingPeriod must be monthly or yearly',
    };
  }

  if (!Object.keys(updates).length) {
    return {
      success: false,
      statusCode: 400,
      message: 'No valid fields to update',
    };
  }

  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      planId,
      { $set: updates },
      { new: true },
    );
    if (!plan) {
      return {
        success: false,
        statusCode: 404,
        message: 'Subscription plan not found',
      };
    }
    await invalidateOverviewCache();
    return { success: true, statusCode: 200, item: plan };
  } catch (error) {
    console.error('[AdminPlanService] updatePlan error:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Unable to update subscription plan',
    };
  }
};

export default {
  createPlan,
  updatePlan,
};
