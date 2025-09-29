import Subscription from '../models/subscription.js';
import SubscriptionPlan from '../models/subscription_plan.js';
import QuotaUsage from '../models/quota_usage.js';
import Wallet from '../models/wallet.js';

const getActivePlan = async (userId) => {
  const sub = await Subscription.findOne({
    user: userId,
    status: 'active',
  }).populate('plan');
  return sub?.plan || null;
};

const getPeriodMonth = (date = new Date()) => {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
};

const ensureUsage = async (userId, session = null) => {
  const periodMonth = getPeriodMonth();
  let query = QuotaUsage.findOne({ user: userId, periodMonth });
  if (session) {
    query = query.session(session);
  }
  let usage = await query;
  if (!usage) {
    const createOptions = session ? { session } : undefined;
    const createdDocs = await QuotaUsage.create(
      [{ user: userId, periodMonth }],
      createOptions,
    );
    usage = createdDocs[0];
  }
  return usage;
};

// Enforce wallet count
const enforceWalletQuota = async (req, res, next) => {
  try {
    const plan = await getActivePlan(req.user.id);
    if (!plan) return next(); // no plan -> skip (or treat as free with defaults)
    const count = await Wallet.countDocuments({
      user: req.user.id,
      isActive: true,
    });
    if (typeof plan.maxWallets === 'number' && count >= plan.maxWallets) {
      return res
        .status(403)
        .json({
          success: false,
          message: 'Vượt giới hạn số lượng ví theo gói',
        });
    }
    next();
  } catch (e) {
    console.error('Wallet quota error:', e);
    return res
      .status(500)
      .json({ success: false, message: 'Lỗi kiểm tra hạn mức ví' });
  }
};

// Enforce monthly transaction count
const enforceTransactionQuota = async (req, res, next) => {
  try {
    const plan = await getActivePlan(req.user.id);
    if (!plan) return next();
    const usage = await ensureUsage(req.user.id);
    if (
      typeof plan.maxMonthlyTransactions === 'number' &&
      usage.transactionsCount >= plan.maxMonthlyTransactions
    ) {
      return res
        .status(403)
        .json({
          success: false,
          message: 'Vượt giới hạn số giao dịch theo gói tháng này',
        });
    }
    next();
  } catch (e) {
    console.error('Transaction quota error:', e);
    return res
      .status(500)
      .json({ success: false, message: 'Lỗi kiểm tra hạn mức giao dịch' });
  }
};

// Enforce budget count
const enforceBudgetQuota = async (req, res, next) => {
  try {
    const plan = await getActivePlan(req.user.id);
    if (!plan) return next();
    const usage = await ensureUsage(req.user.id);
    if (
      typeof plan.maxBudgets === 'number' &&
      usage.budgetsCount >= plan.maxBudgets
    ) {
      return res
        .status(403)
        .json({
          success: false,
          message: 'Vượt giới hạn số ngân sách theo gói',
        });
    }
    next();
  } catch (e) {
    console.error('Budget quota error:', e);
    return res
      .status(500)
      .json({ success: false, message: 'Lỗi kiểm tra hạn mức ngân sách' });
  }
};

// Enforce saving goals count
const enforceSavingGoalQuota = async (req, res, next) => {
  try {
    const plan = await getActivePlan(req.user.id);
    if (!plan) return next();
    const usage = await ensureUsage(req.user.id);
    if (
      typeof plan.maxSavingGoals === 'number' &&
      usage.savingGoalsCount >= plan.maxSavingGoals
    ) {
      return res
        .status(403)
        .json({
          success: false,
          message: 'Vượt giới hạn số mục tiêu tiết kiệm theo gói',
        });
    }
    next();
  } catch (e) {
    console.error('Saving goal quota error:', e);
    return res
      .status(500)
      .json({
        success: false,
        message: 'Lỗi kiểm tra hạn mức mục tiêu tiết kiệm',
      });
  }
};

export {
  enforceWalletQuota,
  enforceTransactionQuota,
  enforceBudgetQuota,
  enforceSavingGoalQuota,
  ensureUsage,
  getPeriodMonth,
};
