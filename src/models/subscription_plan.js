const mongoose = require('mongoose');

const SubscriptionPlanSchema = new mongoose.Schema(
    {
        planName: {
            type: String,
            required: true,
            maxlength: 100,
            trim: true,
        },
        planType: {
            type: String,
            enum: ['free', 'premium'],
            required: true,
        },
        price: {
            type: mongoose.Decimal128,
            required: true,
        },
        currency: {
            type: String,
            default: 'VND',
            maxlength: 3,
        },
        billingPeriod: {
            type: String,
            enum: ['monthly', 'yearly'],
            required: true,
        },
        features: {
            type: [String], // danh sách tính năng, có thể đổi sang Mixed nếu muốn lưu object
            default: [],
        },
        maxWallets: {
            type: Number,
            default: 3,
        },
        maxMonthlyTransactions: {
            type: Number,
            default: 1000,
        },
        aiRecommendationsLimit: {
            type: Number,
            default: 50,
        },
        maxBudgets: {
            type: Number,
            default: 10,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true, // tạo createdAt & updatedAt
    }
);

module.exports = mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
