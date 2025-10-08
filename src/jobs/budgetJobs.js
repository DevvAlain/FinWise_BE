import cron from 'node-cron';
import Budget from '../models/budget.js';
import { getBudgetAnalytics } from '../services/budgetService.js';
import { publishDomainEvents } from '../events/domainEvents.js';

/**
 * 🔄 Budget Evaluation Worker - Runs every hour
 * Checks budget status, generates alerts, updates spending calculations
 */
const budgetEvaluationWorker = async () => {
  try {
    console.log('🧮 Starting budget evaluation worker...');

    // Get all active budgets
    const activeBudgets = await Budget.find({
      isActive: true,
      periodEnd: { $gte: new Date() } // Not expired
    }).populate('user category wallet');

    const evaluationResults = [];
    const alertEvents = [];

    for (const budget of activeBudgets) {
      try {
        // Get budget analytics for this specific budget
        const analytics = await getBudgetAnalytics(budget.user._id, {
          period: budget.period,
          includeForecasting: true
        });

        const budgetStatus = analytics.budgetStatuses.find(
          bs => bs.budgetId.toString() === budget._id.toString()
        );

        if (!budgetStatus) continue;

        // Update budget spent amount
        if (budget.spentAmount !== budgetStatus.spent) {
          budget.spentAmount = budgetStatus.spent;
          budget.lastCalculatedAt = new Date();
          await budget.save();
        }

        // Generate alerts based on thresholds
        const percentage = budgetStatus.percentage;
        let alertType = null;
        let alertMessage = null;

        if (percentage >= 100) {
          alertType = 'exceeded';
          alertMessage = `Ngân sách "${budgetStatus.category}" đã vượt mức ${percentage}%`;
        } else if (percentage >= 95) {
          alertType = 'critical';
          alertMessage = `Ngân sách "${budgetStatus.category}" sắp vượt mức (${percentage}%)`;
        } else if (percentage >= 80) {
          alertType = 'warning';
          alertMessage = `Ngân sách "${budgetStatus.category}" đã sử dụng ${percentage}%`;
        } else if (percentage >= 50) {
          alertType = 'caution';
          alertMessage = `Ngân sách "${budgetStatus.category}" đã sử dụng ${percentage}%`;
        }

        // Check predictive alerts from forecasting
        const forecast = analytics.forecasting?.find(
          f => f.budgetId.toString() === budget._id.toString()
        );

        if (forecast?.willExceed && !alertType) {
          alertType = 'predictive';
          alertMessage = `Ngân sách "${budgetStatus.category}" dự kiến sẽ vượt mức trong ${forecast.daysRemaining} ngày`;
        }

        // Queue alert event if needed
        if (alertType) {
          alertEvents.push({
            name: 'budget.threshold_reached',
            payload: {
              userId: budget.user._id,
              budgetId: budget._id,
              alertType,
              message: alertMessage,
              percentage,
              budgeted: budgetStatus.budgeted,
              spent: budgetStatus.spent,
              remaining: budgetStatus.remaining,
              category: budgetStatus.category,
              forecast: forecast || null,
              timestamp: new Date(),
            }
          });
        }

        evaluationResults.push({
          budgetId: budget._id,
          userId: budget.user._id,
          category: budgetStatus.category,
          status: budgetStatus.status,
          percentage,
          alertType,
          updated: budget.spentAmount !== budgetStatus.spent,
        });

      } catch (error) {
        console.error(`Error evaluating budget ${budget._id}:`, error);
      }
    }

    // Publish all alert events
    if (alertEvents.length > 0) {
      await publishDomainEvents(alertEvents);
      console.log(`📢 Published ${alertEvents.length} budget alert events`);
    }

    console.log(`✅ Budget evaluation completed. Processed ${activeBudgets.length} budgets, ${alertEvents.length} alerts`);

    return {
      processedBudgets: activeBudgets.length,
      alerts: alertEvents.length,
      evaluationResults,
    };

  } catch (error) {
    console.error('❌ Budget evaluation worker failed:', error);
    throw error;
  }
};

/**
 * 📊 Budget Analytics Cache Worker - Runs every 30 minutes
 * Pre-calculates analytics for better API performance
 */
const budgetAnalyticsCacheWorker = async () => {
  try {
    console.log('📊 Starting budget analytics cache worker...');

    // This could cache analytics results in Redis for faster API responses
    // For now, we'll just log that it's ready to be implemented
    console.log('📊 Budget analytics cache worker ready for Redis implementation');

  } catch (error) {
    console.error('❌ Budget analytics cache worker failed:', error);
  }
};

/**
 * 🔍 Initialize budget-related cron jobs
 */
export const initBudgetJobs = () => {
  console.log('🚀 Initializing budget background jobs...');

  // Budget evaluation - Every hour at minute 0
  cron.schedule('0 * * * *', budgetEvaluationWorker, {
    name: 'budget-evaluation',
    timezone: 'Asia/Ho_Chi_Minh'
  });

  // Analytics cache - Every 30 minutes
  cron.schedule('*/30 * * * *', budgetAnalyticsCacheWorker, {
    name: 'budget-analytics-cache',
    timezone: 'Asia/Ho_Chi_Minh'
  });

  console.log('✅ Budget background jobs initialized successfully');

  // Return manual trigger functions for testing
  return {
    budgetEvaluationWorker,
    budgetAnalyticsCacheWorker,
  };
};

export default {
  initBudgetJobs,
  budgetEvaluationWorker,
  budgetAnalyticsCacheWorker,
};