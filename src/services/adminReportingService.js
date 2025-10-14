import mongoose from 'mongoose';
import User from '../models/user.js';
import Wallet from '../models/wallet.js';
import Transaction from '../models/transaction.js';
import Budget from '../models/budget.js';
import SavingGoal from '../models/saving_goal.js';
import Subscription from '../models/subscription.js';
import SubscriptionPlan from '../models/subscription_plan.js';
import SyncLog from '../models/sync_log.js';
import cacheService from './cacheService.js';

const METRICS_CACHE_KEY = 'admin:metrics:overview';
const METRICS_CACHE_TTL = 300; // 5 minutes

const decimalToNumber = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof mongoose.Types.Decimal128) {
    return Number.parseFloat(value.toString());
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const reduceAgg = (docs, defaultKeys = []) => {
  const result = Object.fromEntries(defaultKeys.map((k) => [k, { count: 0, volume: 0 }]));
  for (const doc of docs) {
    const key = doc._id || 'unknown';
    if (!result[key]) {
      result[key] = { count: 0, volume: 0 };
    }
    result[key].count = doc.count || 0;
    result[key].volume = decimalToNumber(doc.totalAmount || doc.total || 0);
  }
  return result;
};

const getSubscriptionsBreakdown = (docs) => {
  const breakdown = { active: 0, expired: 0, cancelled: 0, pending: 0, total: 0 };
  for (const doc of docs) {
    const status = doc._id;
    const count = doc.count || 0;
    if (status && breakdown.hasOwnProperty(status)) {
      breakdown[status] = count;
    }
    breakdown.total += count;
  }
  return breakdown;
};

const getSyncStatusBreakdown = (docs) => {
  const breakdown = { success: 0, partial: 0, failed: 0, total: 0 };
  for (const doc of docs) {
    const status = doc._id;
    const count = doc.count || 0;
    if (status && breakdown.hasOwnProperty(status)) {
      breakdown[status] = count;
    }
    breakdown.total += count;
  }
  return breakdown;
};

const fetchMetrics = async () => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    adminUsers,
    newUsersLast30,
    walletCount,
    budgetsCount,
    savingGoalsCount,
    subscriptionStatusAgg,
    planCounts,
    transactionAgg,
    syncStatusAgg,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Wallet.countDocuments({}),
    Budget.countDocuments({ isActive: true }),
    SavingGoal.countDocuments({ status: { $ne: 'cancelled' }, isDeleted: { $ne: true } }),
    Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    SubscriptionPlan.aggregate([
      {
        $group: {
          _id: '$isActive',
          count: { $sum: 1 },
        },
      },
    ]),
    Transaction.aggregate([
      {
        $match: {
          occurredAt: { $gte: thirtyDaysAgo },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: { $toDouble: '$amount' } },
        },
      },
    ]),
    SyncLog.aggregate([
      {
        $match: {
          createdAt: { $gte: last24Hours },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const subscriptionBreakdown = getSubscriptionsBreakdown(subscriptionStatusAgg);

  const planStats = planCounts.reduce(
    (acc, doc) => {
      if (doc._id === true) acc.active += doc.count || 0;
      if (doc._id === false) acc.inactive += doc.count || 0;
      acc.total += doc.count || 0;
      return acc;
    },
    { active: 0, inactive: 0, total: 0 },
  );

  const transactionStats = reduceAgg(transactionAgg, ['expense', 'income', 'transfer']);
  const syncStats = getSyncStatusBreakdown(syncStatusAgg);

  const totals = {
    users: totalUsers,
    activeUsers,
    adminUsers,
    newUsersLast30,
    wallets: walletCount,
    activeBudgets: budgetsCount,
    activeSavingGoals: savingGoalsCount,
  };

  const transactions = {
    last30Days: {
      expense: transactionStats.expense || { count: 0, volume: 0 },
      income: transactionStats.income || { count: 0, volume: 0 },
      transfer: transactionStats.transfer || { count: 0, volume: 0 },
    },
  };

  transactions.last30Days.totalCount =
    (transactions.last30Days.expense.count || 0) +
    (transactions.last30Days.income.count || 0) +
    (transactions.last30Days.transfer.count || 0);

  transactions.last30Days.totalVolume =
    (transactions.last30Days.expense.volume || 0) +
    (transactions.last30Days.income.volume || 0) +
    (transactions.last30Days.transfer.volume || 0);

  return {
    generatedAt: now.toISOString(),
    totals,
    subscriptions: subscriptionBreakdown,
    plans: planStats,
    transactions,
    sync: {
      last24Hours: syncStats,
    },
  };
};

export const getMetricsOverview = async () =>
  cacheService.wrap(METRICS_CACHE_KEY, METRICS_CACHE_TTL, fetchMetrics);

export const invalidateOverviewCache = async () => {
  await cacheService.del(METRICS_CACHE_KEY);
};

export default {
  getMetricsOverview,
  invalidateOverviewCache,
};
