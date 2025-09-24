const mongoose = require('mongoose');

const SavingGoalSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        title: {
            type: String,
            required: true,
            maxlength: 200,
            trim: true,
        },
        description: {
            type: String,
            maxlength: 500,
            trim: true,
        },
        targetAmount: {
            type: mongoose.Decimal128,
            required: true,
        },
        currency: {
            type: String,
            default: 'VND',
            maxlength: 3,
        },
        currentAmount: {
            type: mongoose.Decimal128,
            default: 0.0,
        },
        deadline: {
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ['active', 'completed', 'paused', 'cancelled'],
            default: 'active',
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium',
        },
        category: {
            type: String,
            enum: ['emergency', 'vacation', 'education', 'home', 'car', 'investment', 'other'],
            default: 'other',
        },
        wallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            default: null, // null means track from all wallets
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        completedAt: {
            type: Date,
        },
        lastUpdatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Index for efficient queries
SavingGoalSchema.index({ user: 1, status: 1, deadline: 1 });
SavingGoalSchema.index({ user: 1, category: 1 });
SavingGoalSchema.index({ user: 1, wallet: 1 });
SavingGoalSchema.index({ deadline: 1 });

// Virtual for progress percentage
SavingGoalSchema.virtual('progressPercentage').get(function () {
    if (parseFloat(this.targetAmount.toString()) === 0) return 0;
    return (parseFloat(this.currentAmount.toString()) / parseFloat(this.targetAmount.toString())) * 100;
});

// Virtual for remaining amount
SavingGoalSchema.virtual('remainingAmount').get(function () {
    return parseFloat(this.targetAmount.toString()) - parseFloat(this.currentAmount.toString());
});

// Virtual for days remaining
SavingGoalSchema.virtual('daysRemaining').get(function () {
    if (this.status !== 'active') return 0;
    const now = new Date();
    const deadline = new Date(this.deadline);
    const diffTime = deadline - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
});

// Virtual for daily required savings
SavingGoalSchema.virtual('dailyRequiredAmount').get(function () {
    if (this.status !== 'active' || this.daysRemaining <= 0) return 0;
    const remaining = this.remainingAmount;
    return remaining / this.daysRemaining;
});

// Virtual for status based on progress and deadline
SavingGoalSchema.virtual('calculatedStatus').get(function () {
    if (this.status === 'completed' || this.status === 'cancelled') {
        return this.status;
    }

    const progress = this.progressPercentage;
    const daysLeft = this.daysRemaining;

    if (progress >= 100) {
        return 'completed';
    } else if (daysLeft <= 0 && progress < 100) {
        return 'overdue';
    } else if (daysLeft <= 7 && progress < 50) {
        return 'urgent';
    } else if (progress >= 75) {
        return 'almost_done';
    }

    return this.status;
});

module.exports = mongoose.model('SavingGoal', SavingGoalSchema);
