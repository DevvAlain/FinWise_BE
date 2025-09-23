const mongoose = require('mongoose');

const RecommendationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        message: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        recommendationType: {
            type: String,
            enum: ['saving_tip', 'budget_alert', 'spending_insight', 'goal_suggestion'],
            required: true,
        },
        title: {
            type: String,
            required: true,
            maxlength: 255,
            trim: true,
        },
        content: {
            type: String,
            required: true,
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium',
        },
        analysisData: {
            type: mongoose.Schema.Types.Mixed, // lưu JSON phân tích từ AI
        },
        status: {
            type: String,
            enum: ['pending', 'viewed', 'applied', 'dismissed'],
            default: 'pending',
        },
        expiresAt: {
            type: Date,
        },
    },
    {
        timestamps: true, // createdAt & updatedAt
    }
);

// Index giống SQL
RecommendationSchema.index({ user: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('Recommendation', RecommendationSchema);
