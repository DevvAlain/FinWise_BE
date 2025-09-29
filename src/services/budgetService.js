import Budget from '../models/budget.js';
import Transaction from '../models/transaction.js';
import QuotaUsage from '../models/quota_usage.js';
import Subscription from '../models/subscription.js';
import SubscriptionPlan from '../models/subscription_plan.js';

const getPeriodDates = (period, startDate = new Date()) => {
  const date = new Date(startDate);
  let periodStart, periodEnd;

  switch (period) {
    case 'daily':
      periodStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      break;
    case 'weekly':
      const dayOfWeek = date.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      periodStart = new Date(
        date.getTime() - daysToMonday * 24 * 60 * 60 * 1000,
      );
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      break;
    case 'monthly':
      periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
      periodEnd = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      break;
    case 'yearly':
      periodStart = new Date(date.getFullYear(), 0, 1);
      periodEnd = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    default:
      throw new Error('Invalid period');
  }

  return { periodStart, periodEnd };
};

const calculateSpentAmount = async (budget) => {
  const query = {
    user: budget.user,
    type: 'expense',
    occurredAt: {
      $gte: budget.periodStart,
      $lte: budget.periodEnd,
    },
    isDeleted: false,
  };

  // Add category filter if specified
  if (budget.category) {
    query.category = budget.category;
  }

  // Add wallet filter if specified
  if (budget.wallet) {
    query.wallet = budget.wallet;
  }

  const transactions = await Transaction.find(query);
  const spentAmount = transactions.reduce((total, tx) => {
    return total + parseFloat(tx.amount.toString());
  }, 0);

  return spentAmount;
};

const updateQuotaUsage = async (userId, planId, periodMonth) => {
  try {
    let quotaUsage = await QuotaUsage.findOne({ user: userId, periodMonth });
    if (!quotaUsage) {
      quotaUsage = await QuotaUsage.create({
        user: userId,
        plan: planId,
        periodMonth,
      });
    }
    quotaUsage.budgetsCount = (quotaUsage.budgetsCount || 0) + 1;
    quotaUsage.lastUpdated = new Date();
    await quotaUsage.save();
  } catch (error) {
    console.error('Error updating quota usage for budgets:', error);
  }
};

export const create = async (userId, budgetData) => {
  try {
    const { period, amount, category, wallet, periodStart } = budgetData;

    // Calculate period dates
    const { periodStart: calculatedStart, periodEnd } = getPeriodDates(
      period,
      periodStart,
    );

    // Check for overlapping budgets
    const existingBudget = await Budget.findOne({
      user: userId,
      category: category || null,
      wallet: wallet || null,
      periodStart: { $lte: periodEnd },
      periodEnd: { $gte: calculatedStart },
      isActive: true,
    });

    if (existingBudget) {
      throw new Error(
        'Đã tồn tại ngân sách cho danh mục/ví này trong khoảng thời gian này',
      );
    }

    const budget = await Budget.create({
      user: userId,
      period,
      periodStart: calculatedStart,
      periodEnd,
      amount,
      category,
      wallet,
    });

    // Update quota usage
    const activeSubscription = await Subscription.findOne({
      user: userId,
      status: 'active',
    }).populate('plan');
    if (activeSubscription?.plan) {
      const periodMonth = `${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;
      await updateQuotaUsage(userId, activeSubscription.plan._id, periodMonth);
    }

    // Calculate initial spent amount
    const spentAmount = await calculateSpentAmount(budget);
    budget.spentAmount = spentAmount;
    budget.lastCalculatedAt = new Date();
    await budget.save();

    await budget.populate([
      { path: 'category', populate: { path: 'category' } },
      { path: 'wallet' },
    ]);

    return budget;
  } catch (error) {
    throw error;
  }
};

export const list = async (userId, filters = {}) => {
  try {
    const {
      period,
      category,
      wallet,
      isActive,
      page = 1,
      limit = 10,
    } = filters;

    const query = { user: userId };

    if (period) query.period = period;
    if (category !== undefined) query.category = category;
    if (wallet !== undefined) query.wallet = wallet;
    if (isActive !== undefined) query.isActive = isActive;

    const skip = (page - 1) * limit;

    const budgets = await Budget.find(query)
      .populate([
        { path: 'category', populate: { path: 'category' } },
        { path: 'wallet' },
      ])
      .sort({ periodStart: -1 })
      .skip(skip)
      .limit(limit);

    // Update spent amounts for all budgets
    for (const budget of budgets) {
      const spentAmount = await calculateSpentAmount(budget);
      if (spentAmount !== parseFloat(budget.spentAmount.toString())) {
        budget.spentAmount = spentAmount;
        budget.lastCalculatedAt = new Date();
        await budget.save();
      }
    }

    const total = await Budget.countDocuments(query);

    return {
      budgets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    throw error;
  }
};

export const detail = async (userId, budgetId) => {
  try {
    const budget = await Budget.findOne({
      _id: budgetId,
      user: userId,
    }).populate([
      { path: 'category', populate: { path: 'category' } },
      { path: 'wallet' },
    ]);

    if (!budget) {
      throw new Error('Không tìm thấy ngân sách');
    }

    // Update spent amount
    const spentAmount = await calculateSpentAmount(budget);
    budget.spentAmount = spentAmount;
    budget.lastCalculatedAt = new Date();
    await budget.save();

    return budget;
  } catch (error) {
    throw error;
  }
};

export const update = async (userId, budgetId, updateData) => {
  try {
    const { period, amount, category, wallet, periodStart } = updateData;

    const budget = await Budget.findOne({ _id: budgetId, user: userId });
    if (!budget) {
      throw new Error('Không tìm thấy ngân sách');
    }

    // If period or dates changed, recalculate period dates
    if (period || periodStart) {
      const { periodStart: calculatedStart, periodEnd } = getPeriodDates(
        period || budget.period,
        periodStart || budget.periodStart,
      );

      budget.period = period || budget.period;
      budget.periodStart = calculatedStart;
      budget.periodEnd = periodEnd;
    }

    // Update other fields
    if (amount !== undefined) budget.amount = amount;
    if (category !== undefined) budget.category = category;
    if (wallet !== undefined) budget.wallet = wallet;

    await budget.save();

    // Recalculate spent amount
    const spentAmount = await calculateSpentAmount(budget);
    budget.spentAmount = spentAmount;
    budget.lastCalculatedAt = new Date();
    await budget.save();

    await budget.populate([
      { path: 'category', populate: { path: 'category' } },
      { path: 'wallet' },
    ]);

    return budget;
  } catch (error) {
    throw error;
  }
};

export const remove = async (userId, budgetId) => {
  try {
    const budget = await Budget.findOne({ _id: budgetId, user: userId });
    if (!budget) {
      throw new Error('Không tìm thấy ngân sách');
    }

    await Budget.findByIdAndDelete(budgetId);
    return { message: 'Xóa ngân sách thành công' };
  } catch (error) {
    throw error;
  }
};

export const getStatus = async (userId, filters = {}) => {
  try {
    const { period, category, wallet } = filters;

    const query = { user: userId, isActive: true };

    if (period) query.period = period;
    if (category !== undefined) query.category = category;
    if (wallet !== undefined) query.wallet = wallet;

    const budgets = await Budget.find(query).populate([
      { path: 'category', populate: { path: 'category' } },
      { path: 'wallet' },
    ]);

    // Update spent amounts and calculate status
    const statusData = {
      totalBudgets: budgets.length,
      totalBudgetAmount: 0,
      totalSpentAmount: 0,
      budgets: [],
      summary: {
        normal: 0,
        warning: 0,
        exceeded: 0,
      },
    };

    for (const budget of budgets) {
      const spentAmount = await calculateSpentAmount(budget);
      budget.spentAmount = spentAmount;
      budget.lastCalculatedAt = new Date();
      await budget.save();

      const budgetAmount = parseFloat(budget.amount.toString());
      const spent = parseFloat(budget.spentAmount.toString());

      statusData.totalBudgetAmount += budgetAmount;
      statusData.totalSpentAmount += spent;

      let status = 'normal';
      if (spent >= budgetAmount) {
        status = 'exceeded';
        statusData.summary.exceeded++;
      } else if (spent >= budgetAmount * 0.8) {
        status = 'warning';
        statusData.summary.warning++;
      } else {
        statusData.summary.normal++;
      }

      statusData.budgets.push({
        ...budget.toObject(),
        status,
        remainingAmount: budgetAmount - spent,
        percentageSpent: budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0,
      });
    }

    return statusData;
  } catch (error) {
    throw error;
  }
};
