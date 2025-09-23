const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
        type: { type: String, enum: ['expense', 'income', 'transfer'], required: true },
        amount: { type: mongoose.Decimal128, required: true },
        currency: { type: String, default: 'VND', maxlength: 3 },
        category: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', default: null },
        occurredAt: { type: Date, required: true },
        description: { type: String },
        merchant: { type: String, maxlength: 255 },
        fromWallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
        toWallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', default: null },
        inputMethod: { type: String, enum: ['manual', 'auto_sync', 'import'], required: true },
        message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

TransactionSchema.index({ user: 1, occurredAt: 1 });
TransactionSchema.index({ category: 1, occurredAt: 1 });
TransactionSchema.index({ wallet: 1, occurredAt: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);


