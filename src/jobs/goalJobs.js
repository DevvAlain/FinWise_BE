import cron from 'node-cron';
import SavingGoal from '../models/saving_goal.js';
import { getGoalAnalytics } from '../services/savingGoalService.js';
import { publishDomainEvents } from '../events/domainEvents.js';

/**
 * 🎯 Saving Goal Progress Evaluation Worker - Runs daily at 8 AM
 * Checks progress, generates alerts for behind-schedule goals
 */
const goalProgressEvaluationWorker = async () => {
  try {
    console.log('🎯 Starting saving goal progress evaluation...');

    // Get all active goals
    const activeGoals = await SavingGoal.find({
      status: 'active',
      isDeleted: false,
      deadline: { $gte: new Date() } // Not expired
    }).populate('user wallet');

    const evaluationResults = [];
    const alertEvents = [];

    for (const goal of activeGoals) {
      try {
        // Get goal analytics for this user
        const analytics = await getGoalAnalytics(goal.user._id, {
          includeProjections: true
        });

        const goalPerformance = analytics.goalPerformance.find(
          gp => gp.goalId.toString() === goal._id.toString()
        );

        if (!goalPerformance) continue;

        const projection = analytics.projections?.find(
          p => p.goalId.toString() === goal._id.toString()
        );

        // Generate alerts based on progress
        let alertType = null;
        let alertMessage = null;

        if (goalPerformance.status === 'behind_schedule') {
          alertType = 'behind_schedule';
          alertMessage = `Mục tiêu "${goal.title}" đang chậm tiến độ (${goalPerformance.progressPercentage}% hoàn thành, ${goalPerformance.timeProgressPercentage}% thời gian đã trôi qua)`;
        } else if (goalPerformance.daysRemaining <= 30 && goalPerformance.progressPercentage < 80) {
          alertType = 'deadline_approaching';
          alertMessage = `Mục tiêu "${goal.title}" sắp hết hạn trong ${goalPerformance.daysRemaining} ngày nhưng mới hoàn thành ${goalPerformance.progressPercentage}%`;
        } else if (goalPerformance.status === 'ahead_of_schedule') {
          alertType = 'ahead_schedule';
          alertMessage = `Mục tiêu "${goal.title}" đang vượt tiến độ (${goalPerformance.progressPercentage}% hoàn thành)`;
        }

        // Check if goal needs contribution reminder (no contribution in last 14 days)
        const lastContributionCheck = new Date();
        lastContributionCheck.setDate(lastContributionCheck.getDate() - 14);

        if (goal.lastUpdated < lastContributionCheck && goalPerformance.status !== 'completed') {
          alertEvents.push({
            name: 'goal.contribution_reminder',
            payload: {
              userId: goal.user._id,
              goalId: goal._id,
              goalTitle: goal.title,
              daysSinceLastContribution: Math.floor((new Date() - goal.lastUpdated) / (1000 * 60 * 60 * 24)),
              progressPercentage: goalPerformance.progressPercentage,
              timestamp: new Date(),
            }
          });
        }

        // Queue alert event if needed
        if (alertType) {
          alertEvents.push({
            name: 'goal.progress_alert',
            payload: {
              userId: goal.user._id,
              goalId: goal._id,
              alertType,
              message: alertMessage,
              progressPercentage: goalPerformance.progressPercentage,
              timeProgressPercentage: goalPerformance.timeProgressPercentage,
              daysRemaining: goalPerformance.daysRemaining,
              targetAmount: goalPerformance.targetAmount,
              currentAmount: goalPerformance.currentAmount,
              projection: projection || null,
              timestamp: new Date(),
            }
          });
        }

        evaluationResults.push({
          goalId: goal._id,
          userId: goal.user._id,
          title: goal.title,
          status: goalPerformance.status,
          progressPercentage: goalPerformance.progressPercentage,
          daysRemaining: goalPerformance.daysRemaining,
          alertType,
        });

      } catch (error) {
        console.error(`Error evaluating goal ${goal._id}:`, error);
      }
    }

    // Publish all alert events
    if (alertEvents.length > 0) {
      await publishDomainEvents(alertEvents);
      console.log(`📢 Published ${alertEvents.length} goal alert events`);
    }

    console.log(`✅ Goal evaluation completed. Processed ${activeGoals.length} goals, ${alertEvents.length} alerts`);

    return {
      processedGoals: activeGoals.length,
      alerts: alertEvents.length,
      evaluationResults,
    };

  } catch (error) {
    console.error('❌ Goal evaluation worker failed:', error);
    throw error;
  }
};

/**
 * 💡 Goal Insights Generator Worker - Runs weekly on Sunday at 9 AM
 * Generates weekly insights and recommendations for users
 */
const goalInsightsGeneratorWorker = async () => {
  try {
    console.log('💡 Starting goal insights generator...');

    // Get unique users with active goals
    const usersWithGoals = await SavingGoal.distinct('user', {
      status: 'active',
      isDeleted: false
    });

    const insightEvents = [];

    for (const userId of usersWithGoals) {
      try {
        const analytics = await getGoalAnalytics(userId, {
          includeProjections: true
        });

        // Generate weekly insights
        const insights = {
          weeklyProgress: analytics.summary.monthlyContributionTotal, // Last 30 days as proxy for weekly
          goalsOnTrack: analytics.goalPerformance.filter(g => g.status === 'on_track').length,
          goalsBehind: analytics.goalPerformance.filter(g => g.status === 'behind_schedule').length,
          goalsAhead: analytics.goalPerformance.filter(g => g.status === 'ahead_of_schedule').length,
          recommendations: analytics.insights,
        };

        insightEvents.push({
          name: 'goal.weekly_insights',
          payload: {
            userId,
            insights,
            generatedAt: new Date(),
          }
        });

      } catch (error) {
        console.error(`Error generating insights for user ${userId}:`, error);
      }
    }

    // Publish insight events
    if (insightEvents.length > 0) {
      await publishDomainEvents(insightEvents);
      console.log(`💡 Generated insights for ${insightEvents.length} users`);
    }

    return {
      usersProcessed: usersWithGoals.length,
      insightsGenerated: insightEvents.length,
    };

  } catch (error) {
    console.error('❌ Goal insights generator failed:', error);
    throw error;
  }
};

/**
 * 🔍 Initialize saving goal-related cron jobs
 */
export const initGoalJobs = () => {
  console.log('🚀 Initializing saving goal background jobs...');

  // Goal progress evaluation - Daily at 8 AM
  cron.schedule('0 8 * * *', goalProgressEvaluationWorker, {
    name: 'goal-progress-evaluation',
    timezone: 'Asia/Ho_Chi_Minh'
  });

  // Weekly insights - Sunday at 9 AM
  cron.schedule('0 9 * * 0', goalInsightsGeneratorWorker, {
    name: 'goal-insights-generator',
    timezone: 'Asia/Ho_Chi_Minh'
  });

  console.log('✅ Saving goal background jobs initialized successfully');

  // Return manual trigger functions for testing
  return {
    goalProgressEvaluationWorker,
    goalInsightsGeneratorWorker,
  };
};

export default {
  initGoalJobs,
  goalProgressEvaluationWorker,
  goalInsightsGeneratorWorker,
};