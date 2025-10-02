import { initCategoryJobs } from './categoryJobs.js';

/**
 * Initialize all background jobs
 */
export const initBackgroundJobs = () => {
    console.log('🎯 Starting background jobs initialization...');

    try {
        // Initialize category-related jobs
        initCategoryJobs();

        // TODO: Add other job types here
        // initPaymentJobs();
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