const mongoose = require('mongoose');

const QuotaUsageSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
        periodMonth: { type: String, required: true, index: true }, // YYYY-MM
        walletsCount: { type: Number, default: 0 },
        transactionsCount: { type: Number, default: 0 },
        aiCallsCount: { type: Number, default: 0 },
        budgetsCount: { type: Number, default: 0 },
        savingGoalsCount: { type: Number, default: 0 },
        lastResetAt: { type: Date },
    },
    { timestamps: true }
);

QuotaUsageSchema.index({ user: 1, periodMonth: 1 }, { unique: true });

module.exports = mongoose.model('QuotaUsage', QuotaUsageSchema);


