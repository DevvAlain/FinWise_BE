const mongoose = require('mongoose');

const UserExpenseCategorySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ExpenseCategory',
            default: null,
        },
        customName: {
            type: String,
            maxlength: 100,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false }, // chỉ cần createdAt
    }
);

// UNIQUE user + category
UserExpenseCategorySchema.index({ user: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('UserExpenseCategory', UserExpenseCategorySchema);
