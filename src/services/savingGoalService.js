import SavingGoal from '../models/saving_goal.js';
import Transaction from '../models/transaction.js';
import QuotaUsage from '../models/quota_usage.js';
import Subscription from '../models/subscription.js';
import SubscriptionPlan from '../models/subscription_plan.js';

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
    quotaUsage.savingGoalsCount = (quotaUsage.savingGoalsCount || 0) + 1;
    quotaUsage.lastUpdated = new Date();
    await quotaUsage.save();
  } catch (error) {
    console.error('Error updating quota usage for saving goals:', error);
  }
};

const calculateCurrentAmount = async (goal) => {
  try {
    // Calculate based on income transactions that might be allocated to this goal
    // This is a simplified calculation - in a real app, you might have dedicated allocation transactions
    const query = {
      user: goal.user,
      type: 'income',
      occurredAt: {
        $gte: goal.createdAt,
        $lte: goal.deadline,
      },
      isDeleted: false,
    };

    // If wallet is specified, filter by wallet
    if (goal.wallet) {
      query.wallet = goal.wallet;
    }

    const transactions = await Transaction.find(query);
    const totalIncome = transactions.reduce((total, tx) => {
      return total + parseFloat(tx.amount.toString());
    }, 0);

    // For now, return a percentage of total income as "allocated" to savings
    // In a real app, this would be based on user's actual savings allocation
    return totalIncome * 0.1; // Assume 10% of income goes to savings
  } catch (error) {
    console.error('Error calculating current amount:', error);
    return 0;
  }
};

export const create = async (userId, goalData) => {
  try {
    const {
      title,
      description,
      targetAmount,
      deadline,
      priority = 'medium',
      category = 'other',
      wallet,
    } = goalData;

    // Validate deadline is in the future
    const deadlineDate = new Date(deadline);
    if (deadlineDate <= new Date()) {
      throw new Error('Ngày hết hạn phải trong tương lai');
    }

    // Check for duplicate goals with same title
    const existingGoal = await SavingGoal.findOne({
      user: userId,
      title,
      isDeleted: false,
    });

    if (existingGoal) {
      throw new Error('Đã tồn tại mục tiêu tiết kiệm với tên này');
    }

    const goal = await SavingGoal.create({
      user: userId,
      title,
      description,
      targetAmount,
      deadline: deadlineDate,
      priority,
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

    // Calculate initial current amount
    const currentAmount = await calculateCurrentAmount(goal);
    goal.currentAmount = currentAmount;
    goal.lastUpdatedAt = new Date();
    await goal.save();

    await goal.populate('wallet');

    return goal;
  } catch (error) {
    throw error;
  }
};

export const list = async (userId, filters = {}) => {
  try {
    const {
      status,
      category,
      priority,
      wallet,
      page = 1,
      limit = 10,
      sortBy = 'deadline',
      sortOrder = 'asc',
    } = filters;

    const query = { user: userId, isDeleted: false };

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (wallet !== undefined) query.wallet = wallet;

    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const goals = await SavingGoal.find(query)
      .populate('wallet')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    // Update current amounts for all goals
    for (const goal of goals) {
      const currentAmount = await calculateCurrentAmount(goal);
      if (currentAmount !== parseFloat(goal.currentAmount.toString())) {
        goal.currentAmount = currentAmount;
        goal.lastUpdatedAt = new Date();
        await goal.save();
      }
    }

    const total = await SavingGoal.countDocuments(query);

    return {
      goals,
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

export const detail = async (userId, goalId) => {
  try {
    const goal = await SavingGoal.findOne({
      _id: goalId,
      user: userId,
      isDeleted: false,
    }).populate('wallet');

    if (!goal) {
      throw new Error('Không tìm thấy mục tiêu tiết kiệm');
    }

    // Update current amount
    const currentAmount = await calculateCurrentAmount(goal);
    goal.currentAmount = currentAmount;
    goal.lastUpdatedAt = new Date();
    await goal.save();

    return goal;
  } catch (error) {
    throw error;
  }
};

export const update = async (userId, goalId, updateData) => {
  try {
    const {
      title,
      description,
      targetAmount,
      deadline,
      priority,
      category,
      wallet,
      status,
    } = updateData;

    const goal = await SavingGoal.findOne({
      _id: goalId,
      user: userId,
      isDeleted: false,
    });
    if (!goal) {
      throw new Error('Không tìm thấy mục tiêu tiết kiệm');
    }

    // Validate deadline if provided
    if (deadline) {
      const deadlineDate = new Date(deadline);
      if (deadlineDate <= new Date()) {
        throw new Error('Ngày hết hạn phải trong tương lai');
      }
      goal.deadline = deadlineDate;
    }

    // Check for duplicate title if provided
    if (title && title !== goal.title) {
      const existingGoal = await SavingGoal.findOne({
        user: userId,
        title,
        isDeleted: false,
        _id: { $ne: goalId },
      });

      if (existingGoal) {
        throw new Error('Đã tồn tại mục tiêu tiết kiệm với tên này');
      }
      goal.title = title;
    }

    // Update other fields
    if (description !== undefined) goal.description = description;
    if (targetAmount !== undefined) goal.targetAmount = targetAmount;
    if (priority !== undefined) goal.priority = priority;
    if (category !== undefined) goal.category = category;
    if (wallet !== undefined) goal.wallet = wallet;
    if (status !== undefined) {
      goal.status = status;
      if (status === 'completed') {
        goal.completedAt = new Date();
      } else if (status !== 'completed' && goal.completedAt) {
        goal.completedAt = undefined;
      }
    }

    goal.lastUpdatedAt = new Date();
    await goal.save();

    // Recalculate current amount
    const currentAmount = await calculateCurrentAmount(goal);
    goal.currentAmount = currentAmount;
    await goal.save();

    await goal.populate('wallet');

    return goal;
  } catch (error) {
    throw error;
  }
};

export const remove = async (userId, goalId) => {
  try {
    const goal = await SavingGoal.findOne({
      _id: goalId,
      user: userId,
      isDeleted: false,
    });
    if (!goal) {
      throw new Error('Không tìm thấy mục tiêu tiết kiệm');
    }

    // Soft delete
    goal.isDeleted = true;
    goal.status = 'cancelled';
    goal.lastUpdatedAt = new Date();
    await goal.save();

    return { message: 'Xóa mục tiêu tiết kiệm thành công' };
  } catch (error) {
    throw error;
  }
};

export const updateProgress = async (userId, goalId, additionalAmount) => {
  try {
    const goal = await SavingGoal.findOne({
      _id: goalId,
      user: userId,
      isDeleted: false,
    });
    if (!goal) {
      throw new Error('Không tìm thấy mục tiêu tiết kiệm');
    }

    if (goal.status !== 'active') {
      throw new Error(
        'Chỉ có thể cập nhật tiến độ cho mục tiêu đang hoạt động',
      );
    }

    const currentAmount = parseFloat(goal.currentAmount.toString());
    const targetAmount = parseFloat(goal.targetAmount.toString());
    const newAmount = currentAmount + additionalAmount;

    goal.currentAmount = newAmount;
    goal.lastUpdatedAt = new Date();

    // Auto-complete if target reached
    if (newAmount >= targetAmount) {
      goal.status = 'completed';
      goal.completedAt = new Date();
    }

    await goal.save();
    await goal.populate('wallet');

    return goal;
  } catch (error) {
    throw error;
  }
};

export const getDashboard = async (userId) => {
  try {
    const goals = await SavingGoal.find({ user: userId, isDeleted: false })
      .populate('wallet')
      .sort({ deadline: 1 });

    // Update current amounts
    for (const goal of goals) {
      const currentAmount = await calculateCurrentAmount(goal);
      goal.currentAmount = currentAmount;
      goal.lastUpdatedAt = new Date();
      await goal.save();
    }

    const stats = {
      total: goals.length,
      active: 0,
      completed: 0,
      overdue: 0,
      totalTargetAmount: 0,
      totalCurrentAmount: 0,
      categories: {},
      priorities: {},
    };

    goals.forEach((goal) => {
      const targetAmount = parseFloat(goal.targetAmount.toString());
      const currentAmount = parseFloat(goal.currentAmount.toString());

      stats.totalTargetAmount += targetAmount;
      stats.totalCurrentAmount += currentAmount;

      // Count by status
      if (goal.status === 'active') stats.active++;
      else if (goal.status === 'completed') stats.completed++;

      // Check if overdue
      if (goal.status === 'active' && goal.daysRemaining <= 0) {
        stats.overdue++;
      }

      // Count by category
      stats.categories[goal.category] =
        (stats.categories[goal.category] || 0) + 1;

      // Count by priority
      stats.priorities[goal.priority] =
        (stats.priorities[goal.priority] || 0) + 1;
    });

    return {
      goals,
      stats,
    };
  } catch (error) {
    throw error;
  }
};
