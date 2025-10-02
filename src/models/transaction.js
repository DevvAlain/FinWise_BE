const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['expense', 'income', 'transfer'],
      required: true,
    },
    amount: { type: mongoose.Decimal128, required: true },
    currency: { type: String, default: 'VND', maxlength: 3 },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpenseCategory',
      default: null,
    },
    occurredAt: { type: Date, required: true },
    description: { type: String },
    merchant: { type: String, maxlength: 255 },
    fromWallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null,
    },
    toWallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null,
    },
    inputMethod: {
      type: String,
      enum: ['manual', 'auto_sync', 'import', 'ai_assisted'],
      required: true,
    },
    provider: { type: String, default: null },
    providerTransactionId: { type: String, default: null },
    syncHash: { type: String, default: null },
    rawProviderMetadata: { type: mongoose.Schema.Types.Mixed, default: null },
    message: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

TransactionSchema.index({ user: 1, occurredAt: 1 });
TransactionSchema.index({ category: 1, occurredAt: 1 });
TransactionSchema.index({ wallet: 1, occurredAt: 1 });
TransactionSchema.index(
  { user: 1, syncHash: 1 },
  {
    unique: true,
    partialFilterExpression: { syncHash: { $exists: true, $type: 'string' } },
  },
);

module.exports = mongoose.model('Transaction', TransactionSchema);
