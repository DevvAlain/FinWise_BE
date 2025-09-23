const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        plan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionPlan',
            required: true,
        },
        status: {
            type: String,
            enum: ['active', 'expired', 'cancelled', 'pending'],
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
        },
        autoRenew: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true, // createdAt & updatedAt
    }
);

// Indexes
SubscriptionSchema.index({ user: 1, status: 1 });
SubscriptionSchema.index({ endDate: 1 });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
