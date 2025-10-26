import { publishDomainEvents } from '../src/events/domainEvents.js';

const now = new Date();

const run = async () => {
    const events = [
        {
            name: 'notification.quota_warning',
            payload: {
                userId: process.env.TEST_USER_ID || null,
                title: 'Bạn sắp đạt giới hạn ví',
                message: 'Bạn đã sử dụng 8/10 ví của gói hiện tại.',
                current: 8,
                maxWallets: 10,
                timestamp: now.toISOString(),
            },
        },
        {
            name: 'budget.threshold_reached',
            payload: {
                userId: process.env.TEST_USER_ID || null,
                budgetId: null,
                category: 'Ăn uống',
                message: 'Bạn đã sử dụng 85% ngân sách cho Ăn uống',
                budgeted: 2000000,
                spent: 1700000,
                remaining: 300000,
                timestamp: now.toISOString(),
            },
        },
        {
            name: 'goal.contribution_added',
            payload: {
                userId: process.env.TEST_USER_ID || null,
                goalId: null,
                amount: 500000,
                newCurrentAmount: 1500000,
                targetAmount: 5000000,
                timestamp: now.toISOString(),
            },
        },
        {
            name: 'payment.verified',
            payload: {
                userId: process.env.TEST_USER_ID || null,
                paymentId: null,
                amount: 299000,
                provider: 'PAYOS',
                processedAt: now.toISOString(),
            },
        },
        {
            name: 'recommendation.generated',
            payload: {
                userId: process.env.TEST_USER_ID || null,
                title: 'Gợi ý tiết kiệm',
                summary: 'Cắt giảm 10% chi tiêu ăn uống, tiết kiệm thêm 500k/tháng',
                recommendations: ['Giảm xuất ăn ngoài', 'Sử dụng coupon'],
            },
        },
    ];

    console.log('Publishing test events...');
    await publishDomainEvents(events);
    console.log('Done publishing test events');
};

run().catch((e) => {
    console.error('Test events failed:', e);
    process.exit(1);
});
