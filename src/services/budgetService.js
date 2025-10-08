import Budget from '../models/budget.js';
import Transaction from '../models/transaction.js';
import QuotaUsage from '../models/quota_usage.js';
import Subscription from '../models/subscription.js';
import SubscriptionPlan from '../models/subscription_plan.js';
import { publishDomainEvents } from '../events/domainEvents.js';

// 🔥 NEW: AI-powered recommendation service
const getHistoricalSpendingData = async (userId, categoryId, period, months = 12) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(endDate.getMonth() - months);

  const query = {
    user: userId,
    type: 'expense',
    occurredAt: { $gte: startDate, $lte: endDate },
    isDeleted: false,
  };

  if (categoryId) {
    query.category = categoryId;
  }

  const transactions = await Transaction.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          year: { $year: '$occurredAt' },
          month: { $month: '$occurredAt' },
          ...(period === 'weekly' && { week: { $week: '$occurredAt' } }),
        },
        totalAmount: { $sum: { $toDouble: '$amount' } },
        transactionCount: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  return transactions;
};

const detectSeasonalPatterns = (historicalData) => {
  const monthlyAverages = {};
  const monthlyTotals = {};

  historicalData.forEach(item => {
    const month = item._id.month;
    if (!monthlyTotals[month]) {
      monthlyTotals[month] = { total: 0, count: 0 };
    }
    monthlyTotals[month].total += item.totalAmount;
    monthlyTotals[month].count += 1;
  });

  Object.keys(monthlyTotals).forEach(month => {
    monthlyAverages[month] = monthlyTotals[month].total / monthlyTotals[month].count;
  });

  const currentMonth = new Date().getMonth() + 1;
  const seasonalMultiplier = monthlyAverages[currentMonth]
    ? monthlyAverages[currentMonth] / (Object.values(monthlyAverages).reduce((a, b) => a + b, 0) / Object.keys(monthlyAverages).length)
    : 1;

  return {
    monthlyAverages,
    seasonalMultiplier,
    hasSeasonalPattern: Math.abs(seasonalMultiplier - 1) > 0.2,
  };
};

// 🚀 Enhanced AI Recommendations
export const getAIRecommendations = async (userId, budgetData) => {
  try {
    const { category, period = 'monthly', includeSeasonality = true } = budgetData;

    // Get historical spending data
    const historicalData = await getHistoricalSpendingData(userId, category, period);

    if (historicalData.length === 0) {
      const fallbackAmount = period === 'monthly' ? 1000000 : 500000; // VND
      const recommendedAmount = fallbackAmount;
      const confidence = 'low';
      const reasoning = 'Không đủ dữ liệu lịch sử để đưa ra gợi ý chính xác; đang trả về giá trị mặc định để giúp bạn bắt đầu';

      return {
        recommendedAmount,
        confidence,
        insufficientData: true,
        reasoning,
        fallbackAmount,
        dataPoints: 0,
        // UI friendly fields for mobile
        ui: {
          amountFormatted: `${recommendedAmount.toLocaleString('vi-VN')} VND`,
          shortMessage: 'Chưa có đủ dữ liệu — gợi ý mặc định',
          confidenceBadge: 'Tin cậy thấp',
        },
      };
    }

    // Calculate average spending
    const totalSpent = historicalData.reduce((sum, item) => sum + item.totalAmount, 0);
    const averageSpending = totalSpent / historicalData.length;

    // Seasonal adjustment
    let recommendedAmount = averageSpending;
    let seasonalInfo = null;

    if (includeSeasonality && period === 'monthly') {
      seasonalInfo = detectSeasonalPatterns(historicalData);
      if (seasonalInfo.hasSeasonalPattern) {
        recommendedAmount = averageSpending * seasonalInfo.seasonalMultiplier;
      }
    }

    // Add 10% buffer for safety
    const safeRecommendedAmount = Math.round(recommendedAmount * 1.1);

    // Determine confidence based on data quality
    // Use period-aware thresholds so weekly/monthly recommendations behave sensibly
    let highThreshold;
    let mediumThreshold;
    if (period === 'weekly') {
      // For weekly: high ~ 3 months => 12 weeks, medium ~ 1 month => 4 weeks
      highThreshold = 12;
      mediumThreshold = 4;
    } else {
      // Default (monthly): high = 3 months, medium = 1 month
      highThreshold = 3;
      mediumThreshold = 1;
    }

    // Basic transactions-per-period quality check
    const totalTransactions = historicalData.reduce((sum, item) => sum + (item.transactionCount || 0), 0);
    const avgTxPerPeriod = historicalData.length > 0 ? totalTransactions / historicalData.length : 0;

    // If average transactions per period is very low, mark confidence down a notch
    let confidence = historicalData.length >= highThreshold ? 'high' :
      historicalData.length >= mediumThreshold ? 'medium' : 'low';

    if (avgTxPerPeriod < 1 && confidence !== 'low') {
      // Not enough transactions per period to fully trust even if there are many periods
      confidence = 'medium';
    }

    const result = {
      recommendedAmount: safeRecommendedAmount,
      baseAmount: Math.round(averageSpending),
      confidence,
      dataPoints: historicalData.length,
      seasonalInfo,
      reasoning: `Dựa trên ${historicalData.length} tháng dữ liệu, chi tiêu trung bình là ${Math.round(averageSpending).toLocaleString('vi-VN')} VND${seasonalInfo?.hasSeasonalPattern ? ', đã điều chỉnh theo xu hướng theo mùa' : ''}`,
      // UI friendly payload for frontend/mobile
      ui: {
        amountFormatted: `${Math.round(safeRecommendedAmount).toLocaleString('vi-VN')} VND`,
        shortMessage: confidence === 'high' ? 'Gợi ý dựa trên dữ liệu lịch sử' : 'Gợi ý sơ bộ (đã điều chỉnh)',
        confidenceBadge: confidence === 'high' ? 'Tin cậy cao' : confidence === 'medium' ? 'Tin cậy trung bình' : 'Tin cậy thấp',
      },
    };

    return result;
  } catch (error) {
    console.error('Error getting AI recommendations:', error);
    return {
      recommendedAmount: null,
      confidence: 'low',
      reasoning: 'Có lỗi khi phân tích dữ liệu',
    };
  }
};

// 📊 Enhanced Budget Analytics
export const getBudgetAnalytics = async (userId, options = {}) => {
  try {
    const { period = 'monthly', includeForecasting = false } = options;

    // Get all user budgets
    const budgets = await Budget.find({
      user: userId,
      isActive: true
    }).populate('category wallet');

    // Calculate current status for each budget
    const budgetStatuses = [];
    let totalBudgeted = 0;
    let totalSpent = 0;

    for (const budget of budgets) {
      const spentAmount = await calculateSpentAmount(budget);
      const budgetAmount = parseFloat(budget.amount.toString());
      const percentage = (spentAmount / budgetAmount) * 100;

      totalBudgeted += budgetAmount;
      totalSpent += spentAmount;

      budgetStatuses.push({
        budgetId: budget._id,
        category: budget.category?.customName || 'Tất cả danh mục',
        budgeted: budgetAmount,
        spent: spentAmount,
        remaining: Math.max(0, budgetAmount - spentAmount),
        percentage: Math.round(percentage),
        status: percentage >= 100 ? 'exceeded' :
          percentage >= 95 ? 'critical' :
            percentage >= 80 ? 'warning' :
              percentage >= 50 ? 'caution' : 'on_track',
        period: budget.period,
        periodStart: budget.periodStart,
        periodEnd: budget.periodEnd,
      });
    }

    // Generate insights
    const insights = [];
    const exceededBudgets = budgetStatuses.filter(b => b.status === 'exceeded');
    const criticalBudgets = budgetStatuses.filter(b => b.status === 'critical');

    if (exceededBudgets.length > 0) {
      insights.push({
        type: 'alert',
        message: `${exceededBudgets.length} ngân sách đã vượt mức cho phép`,
        action: 'Cần xem xét điều chỉnh chi tiêu hoặc tăng ngân sách',
      });
    }

    if (criticalBudgets.length > 0) {
      insights.push({
        type: 'warning',
        message: `${criticalBudgets.length} ngân sách sắp vượt mức (>95%)`,
        action: 'Hãy cẩn thận với chi tiêu trong thời gian còn lại',
      });
    }

    const result = {
      summary: {
        totalBudgets: budgets.length,
        totalBudgeted,
        totalSpent,
        totalRemaining: totalBudgeted - totalSpent,
        overallPercentage: totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0,
      },
      budgetStatuses,
      insights,
      period,
      lastUpdated: new Date(),
    };

    // Add forecasting if requested
    if (includeForecasting) {
      const forecasting = await generateSpendingForecast(userId, budgetStatuses);
      result.forecasting = forecasting;
    }

    return result;
  } catch (error) {
    console.error('Error getting budget analytics:', error);
    throw error;
  }
};

// 🔮 Spending Forecast
const generateSpendingForecast = async (userId, budgetStatuses) => {
  const forecasts = [];

  for (const budget of budgetStatuses) {
    const daysElapsed = Math.floor((new Date() - new Date(budget.periodStart)) / (1000 * 60 * 60 * 24));
    const totalDays = Math.floor((new Date(budget.periodEnd) - new Date(budget.periodStart)) / (1000 * 60 * 60 * 24));
    const daysRemaining = totalDays - daysElapsed;

    if (daysRemaining > 0 && daysElapsed > 0) {
      const dailySpendRate = budget.spent / daysElapsed;
      const projectedTotalSpent = budget.spent + (dailySpendRate * daysRemaining);
      const projectedOverspend = Math.max(0, projectedTotalSpent - budget.budgeted);

      forecasts.push({
        budgetId: budget.budgetId,
        category: budget.category,
        projectedTotalSpent: Math.round(projectedTotalSpent),
        projectedOverspend: Math.round(projectedOverspend),
        daysRemaining,
        dailySpendRate: Math.round(dailySpendRate),
        willExceed: projectedTotalSpent > budget.budgeted,
        confidence: daysElapsed >= 7 ? 'high' : 'medium',
      });
    }
  }

  return forecasts;
};

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
