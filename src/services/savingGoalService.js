import SavingGoal from '../models/saving_goal.js';
import SavingGoalContribution from '../models/saving_goal_contribution.js';
import Transaction from '../models/transaction.js';
import QuotaUsage from '../models/quota_usage.js';
import Subscription from '../models/subscription.js';
import SubscriptionPlan from '../models/subscription_plan.js';
import Wallet from '../models/wallet.js';
import { publishDomainEvents } from '../events/domainEvents.js';
import mongoose from 'mongoose';

// 🆕 NEW: Add contribution to saving goal
export const addContribution = async (userId, goalId, contributionData) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let { amount, note, walletId, occurredAt } = contributionData;

    // Normalize occurredAt: accept strings or Date objects; fallback to now
    if (!occurredAt) {
      occurredAt = new Date();
    } else if (typeof occurredAt === 'string' || typeof occurredAt === 'number') {
      occurredAt = new Date(occurredAt);
    }

    // Validate goal exists and belongs to user
    const goal = await SavingGoal.findOne({
      _id: goalId,
      user: userId,
      isDeleted: false,
    }).session(session);

    if (!goal) {
      throw new Error('Không tìm thấy mục tiêu tiết kiệm');
    }

    // Validate wallet if provided
    let wallet = null;
    if (walletId) {
      wallet = await Wallet.findOne({
        _id: walletId,
        user: userId,
        isDeleted: false,
      }).session(session);

      if (!wallet) {
        throw new Error('Không tìm thấy ví');
      }

      // Check wallet balance
      const walletBalance = parseFloat(wallet.balance.toString());
      if (walletBalance < amount) {
        throw new Error('Số dư ví không đủ');
      }
    }

    // Create contribution record
    const contribution = await SavingGoalContribution.create([{
      savingGoal: goalId,
      user: userId,
      amount,
      note,
      wallet: walletId,
      occurredAt,
    }], { session });

    // Update goal's current amount
    const newCurrentAmount = parseFloat(goal.currentAmount.toString()) + amount;
    goal.currentAmount = newCurrentAmount;
    goal.lastUpdated = new Date();

    // Check if goal is completed
    const targetAmount = parseFloat(goal.targetAmount.toString());
    if (newCurrentAmount >= targetAmount && goal.status !== 'completed') {
      goal.status = 'completed';
      goal.completedAt = new Date();
    }

    await goal.save({ session });

    // Update wallet balance if wallet specified
    if (wallet) {
      wallet.balance = parseFloat(wallet.balance.toString()) - amount;
      await wallet.save({ session });
    }

    await session.commitTransaction();

    // Publish events
    await publishDomainEvents([
      {
        name: 'goal.contribution_added',
        payload: {
          userId,
          goalId,
          contributionId: contribution[0]._id,
          amount,
          newCurrentAmount,
          targetAmount,
          walletId,
          isCompleted: newCurrentAmount >= targetAmount,
          timestamp: new Date(),
        },
      }
    ]);

    // Return updated goal with contribution
    await goal.populate('wallet');

    return {
      goal,
      contribution: contribution[0],
      progressPercentage: Math.round((newCurrentAmount / targetAmount) * 100),
      remainingAmount: Math.max(0, targetAmount - newCurrentAmount),
    };

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// 📊 NEW: Get saving goals analytics
export const getGoalAnalytics = async (userId, options = {}) => {
  try {
    const { includeProjections = false } = options;

    // Get all user goals
    const goals = await SavingGoal.find({
      user: userId,
      isDeleted: false
    }).populate('wallet');

    // Get contributions for analysis
    const contributions = await SavingGoalContribution.find({
      user: userId,
    }).sort({ occurredAt: -1 });

    // Calculate summary statistics
    const totalGoals = goals.length;
    const activeGoals = goals.filter(g => g.status === 'active').length;
    const completedGoals = goals.filter(g => g.status === 'completed').length;
    const pausedGoals = goals.filter(g => g.status === 'paused').length;

    const totalTargetAmount = goals.reduce((sum, g) => sum + parseFloat(g.targetAmount.toString()), 0);
    const totalCurrentAmount = goals.reduce((sum, g) => sum + parseFloat(g.currentAmount.toString()), 0);
    const totalRemaining = totalTargetAmount - totalCurrentAmount;

    // Calculate monthly contribution average
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const recentContributions = contributions.filter(c => c.contributedAt >= last30Days);
    const monthlyContributionTotal = recentContributions.reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    // Goal performance analysis
    const goalPerformance = goals.map(goal => {
      const targetAmount = parseFloat(goal.targetAmount.toString());
      const currentAmount = parseFloat(goal.currentAmount.toString());
      const progressPercentage = Math.round((currentAmount / targetAmount) * 100);

      // Calculate time-based progress
      const totalTime = goal.deadline.getTime() - goal.createdAt.getTime();
      const elapsedTime = new Date().getTime() - goal.createdAt.getTime();
      const timeProgressPercentage = Math.round((elapsedTime / totalTime) * 100);

      // Determine status
      let status = 'on_track';
      if (progressPercentage >= 100) {
        status = 'completed';
      } else if (timeProgressPercentage > progressPercentage + 20) {
        status = 'behind_schedule';
      } else if (progressPercentage > timeProgressPercentage + 20) {
        status = 'ahead_of_schedule';
      }

      return {
        goalId: goal._id,
        title: goal.title,
        progressPercentage,
        timeProgressPercentage,
        status,
        targetAmount,
        currentAmount,
        remainingAmount: targetAmount - currentAmount,
        daysRemaining: Math.max(0, Math.ceil((goal.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))),
        priority: goal.priority,
      };
    });

    const result = {
      summary: {
        totalGoals,
        activeGoals,
        completedGoals,
        pausedGoals,
        totalTargetAmount,
        totalCurrentAmount,
        totalRemaining,
        overallProgressPercentage: totalTargetAmount > 0 ? Math.round((totalCurrentAmount / totalTargetAmount) * 100) : 0,
        monthlyContributionTotal,
        averageContributionPerGoal: activeGoals > 0 ? monthlyContributionTotal / activeGoals : 0,
      },
      goalPerformance,
      recentContributions: recentContributions.slice(0, 10), // Last 10 contributions
      insights: generateGoalInsights(goalPerformance, monthlyContributionTotal),
    };

    // Add projections if requested
    if (includeProjections) {
      result.projections = generateGoalProjections(goalPerformance, monthlyContributionTotal);
    }

    return result;

  } catch (error) {
    console.error('Error getting goal analytics:', error);
    throw error;
  }
};

// 💡 Generate insights for goals
const generateGoalInsights = (goalPerformance, monthlyContribution) => {
  const insights = [];

  const behindSchedule = goalPerformance.filter(g => g.status === 'behind_schedule');
  const aheadOfSchedule = goalPerformance.filter(g => g.status === 'ahead_of_schedule');
  const completedGoals = goalPerformance.filter(g => g.status === 'completed');

  if (behindSchedule.length > 0) {
    insights.push({
      type: 'warning',
      message: `${behindSchedule.length} mục tiêu đang chậm tiến độ`,
      action: 'Hãy xem xét tăng mức đóng góp hoặc điều chỉnh deadline',
      goals: behindSchedule.map(g => g.title),
    });
  }

  if (aheadOfSchedule.length > 0) {
    insights.push({
      type: 'success',
      message: `${aheadOfSchedule.length} mục tiêu đang vượt tiến độ`,
      action: 'Tuyệt vời! Có thể xem xét tăng mục tiêu hoặc tạo mục tiêu mới',
      goals: aheadOfSchedule.map(g => g.title),
    });
  }

  if (completedGoals.length > 0) {
    insights.push({
      type: 'achievement',
      message: `Đã hoàn thành ${completedGoals.length} mục tiêu`,
      action: 'Chúc mừng! Hãy đặt thêm mục tiêu mới để tiếp tục tiết kiệm',
    });
  }

  if (monthlyContribution === 0) {
    insights.push({
      type: 'reminder',
      message: 'Chưa có đóng góp nào trong 30 ngày qua',
      action: 'Hãy thử đóng góp một ít để duy trì tiến độ',
    });
  }

  return insights;
};

// 🔮 Generate goal projections
const generateGoalProjections = (goalPerformance, monthlyContribution) => {
  return goalPerformance
    .filter(g => g.status !== 'completed')
    .map(goal => {
      const monthlyRate = monthlyContribution > 0 ? monthlyContribution / goalPerformance.length : 0;
      const monthsToComplete = monthlyRate > 0 ? Math.ceil(goal.remainingAmount / monthlyRate) : null;

      return {
        goalId: goal.goalId,
        title: goal.title,
        projectedCompletionDate: monthsToComplete ?
          new Date(Date.now() + monthsToComplete * 30 * 24 * 60 * 60 * 1000) : null,
        monthsToComplete,
        requiredMonthlyContribution: goal.daysRemaining > 0 ?
          Math.ceil(goal.remainingAmount / (goal.daysRemaining / 30)) : null,
        feasibility: monthsToComplete && goal.daysRemaining > 0 ?
          (monthsToComplete <= goal.daysRemaining / 30 ? 'achievable' : 'challenging') : 'unknown',
      };
    });
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
    // Additionally include explicit contributions made to this goal
    try {
      const contributions = await SavingGoalContribution.find({ savingGoal: goal._id, user: goal.user });
      const contributionsTotal = contributions.reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

      // Combine heuristic allocation and explicit contributions
      return contributionsTotal + totalIncome * 0.1;
    } catch (err) {
      console.error('Error fetching contributions for current amount calculation:', err);
      return totalIncome * 0.1;
    }
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
