const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema(
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
        budgetName: {
            type: String,
            maxlength: 255,
            trim: true,
        },
        amount: {
            type: mongoose.Decimal128,
            required: true,
        },
        period: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'yearly'],
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
        },
        isRecurring: {
            type: Boolean,
            default: true,
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

module.exports = mongoose.model('Budget', BudgetSchema);
