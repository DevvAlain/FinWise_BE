const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        wallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            default: null,
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ExpenseCategory',
            default: null,
        },
        amount: {
            type: mongoose.Decimal128,
            required: true,
        },
        currency: {
            type: String,
            default: 'VND',
            maxlength: 3,
        },
        description: {
            type: String,
        },
        expenseDate: {
            type: Date,
            required: true,
        },
        expenseTime: {
            type: String, // HH:mm:ss
        },
        location: {
            type: String,
            maxlength: 255,
        },
        merchant: {
            type: String,
            maxlength: 255,
        },
        transactionRef: {
            type: String,
            maxlength: 255,
        },
        inputMethod: {
            type: String,
            enum: ['manual', 'auto_sync', 'import'],
            required: true,
        },
        sourceData: {
            type: mongoose.Schema.Types.Mixed,
        },
        message: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true, // createdAt, updatedAt
    }
);

// Indexes cho query nhanh
ExpenseSchema.index({ user: 1, expenseDate: 1 });
ExpenseSchema.index({ category: 1, expenseDate: 1 });
ExpenseSchema.index({ wallet: 1, expenseDate: 1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
