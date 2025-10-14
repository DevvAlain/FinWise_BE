import { initCategoryJobs } from './categoryJobs.js';
import { initBudgetJobs } from './budgetJobs.js';
import { initGoalJobs } from './goalJobs.js';
import { initPaymentJobs } from './paymentJobs.js';

/**
 * Initialize all background jobs
 */
export const initBackgroundJobs = () => {
    console.log('🎯 Starting background jobs initialization...');

    try {
        // Initialize category-related jobs
        initCategoryJobs();

        // 🆕 Initialize budget-related jobs
        initBudgetJobs();

        // 🆕 Initialize saving goal-related jobs
        initGoalJobs();

        // Initialize payment-related jobs
        initPaymentJobs();

        // TODO: Add other job types here
        // initNotificationJobs();
        // initReportJobs();

        console.log('🚀 All background jobs initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize background jobs:', error);
        process.exit(1);
    }
};

export default {
    initBackgroundJobs,
};
