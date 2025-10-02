import cron from 'node-cron';
import UserExpenseCategory from '../models/user_expense_category.js';
import ExpenseCategory from '../models/expense_category.js';
import User from '../models/user.js';
import { mapToCanonicalCategory } from '../services/ai/categoryDictionary.js';

/**
 * Category Cleanup Job - Xóa suggestions cũ chưa confirm sau 30 ngày
 * Chạy hàng ngày lúc 2:00 AM
 */
export const categoryCleanupJob = () => {
    cron.schedule('0 2 * * *', async () => {
        try {
            console.log('🧹 Starting category cleanup job...');

            const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

            const result = await UserExpenseCategory.deleteMany({
                needsConfirmation: true,
                isActive: false,
                createdAt: { $lt: cutoffDate }
            });

            console.log(`✅ Category cleanup completed: Removed ${result.deletedCount} old suggestions`);
        } catch (error) {
            console.error('❌ Category cleanup job failed:', error);
        }
    });
};

/**
 * Category Learning Job - Aggregate category usage để cải thiện AI mapping
 * Chạy hàng tuần vào Chủ nhật lúc 3:00 AM
 */
export const categoryLearningJob = () => {
    cron.schedule('0 3 * * 0', async () => {
        try {
            console.log('🤖 Starting category learning job...');

            // Lấy active users trong 7 ngày qua
            const activeUsers = await User.find({
                lastActiveAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }).select('_id').limit(100);

            console.log(`📊 Processing ${activeUsers.length} active users for learning...`);

            let processedUsers = 0;
            let learningPatterns = {};

            for (const user of activeUsers) {
                try {
                    const patterns = await learnFromUserBehavior(user._id);

                    // Aggregate patterns globally
                    for (const [pattern, data] of Object.entries(patterns)) {
                        if (!learningPatterns[pattern]) {
                            learningPatterns[pattern] = { categoryId: data.categoryId, count: 0 };
                        }
                        learningPatterns[pattern].count += data.count;
                    }

                    processedUsers++;
                } catch (error) {
                    console.error(`❌ Learning failed for user ${user._id}:`, error.message);
                }
            }

            // Update AI dictionary with learned patterns
            await updateAIDictionary(learningPatterns);

            console.log(`✅ Category learning completed: Processed ${processedUsers} users, learned ${Object.keys(learningPatterns).length} patterns`);
        } catch (error) {
            console.error('❌ Category learning job failed:', error);
        }
    });
};

/**
 * Learn patterns from user's confirmed category mappings
 */
const learnFromUserBehavior = async (userId) => {
    const recentConfirmations = await UserExpenseCategory.find({
        user: userId,
        needsConfirmation: false,
        createdBy: 'ai',
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days
    }).populate('category');

    const patterns = {};

    for (const confirmation of recentConfirmations) {
        const pattern = confirmation.normalizedName;
        const categoryId = confirmation.category?._id;

        if (pattern && categoryId) {
            if (!patterns[pattern]) {
                patterns[pattern] = { categoryId, count: 0 };
            }
            patterns[pattern].count++;
        }
    }

    return patterns;
};

/**
 * Update AI dictionary with learned patterns
 */
const updateAIDictionary = async (patterns) => {
    // This would integrate with your AI service to improve mappings
    // For now, we'll just log the patterns
    const significantPatterns = Object.entries(patterns)
        .filter(([_, data]) => data.count >= 3) // Only patterns with 3+ confirmations
        .slice(0, 50); // Top 50 patterns

    if (significantPatterns.length > 0) {
        console.log('📚 Significant learning patterns:', significantPatterns.map(([pattern, data]) => ({
            pattern,
            categoryId: data.categoryId,
            confidence: Math.min(0.9, 0.5 + (data.count * 0.1))
        })));

        // TODO: Integrate with actual AI service to update model weights
        // await aiService.updateCategoryMappings(significantPatterns);
    }
};

/**
 * Category Statistics Job - Tạo thống kê usage hàng ngày
 * Chạy hàng ngày lúc 1:00 AM
 */
export const categoryStatsJob = () => {
    cron.schedule('0 1 * * *', async () => {
        try {
            console.log('📈 Starting category statistics job...');

            // Aggregate category usage statistics
            const stats = await UserExpenseCategory.aggregate([
                { $match: { isActive: true, needsConfirmation: false } },
                {
                    $group: {
                        _id: '$category',
                        usageCount: { $sum: 1 },
                        users: { $addToSet: '$user' }
                    }
                },
                {
                    $addFields: {
                        userCount: { $size: '$users' }
                    }
                },
                { $sort: { usageCount: -1 } },
                { $limit: 100 }
            ]);

            console.log(`📊 Category usage stats: ${stats.length} categories tracked`);

            // TODO: Store stats in a dedicated collection or cache
            // await CategoryStats.create({ date: new Date(), stats });

        } catch (error) {
            console.error('❌ Category statistics job failed:', error);
        }
    });
};

/**
 * Initialize all category background jobs
 */
export const initCategoryJobs = () => {
    console.log('🚀 Initializing category background jobs...');

    categoryCleanupJob();
    categoryLearningJob();
    categoryStatsJob();

    console.log('✅ Category background jobs initialized successfully');
};

export default {
    categoryCleanupJob,
    categoryLearningJob,
    categoryStatsJob,
    initCategoryJobs,
};