const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    walletName: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    walletType: {
      type: String,
      enum: ['bank', 'e-wallet', 'cash', 'credit_card'],
      required: true,
    },
    provider: {
      type: String,
      maxlength: 50,
    },
    alias: {
      type: String,
      trim: true,
      maxlength: 50,
      // IMPORTANT: leave undefined if not provided so partial index ignores it
      default: undefined,
    },
    accountNumber: {
      type: String,
      maxlength: 100,
    },
    balance: {
      type: mongoose.Decimal128,
      default: 0.0,
    },
    currency: {
      type: String,
      default: 'VND',
      maxlength: 3,
    },
    isConnected: {
      type: Boolean,
      default: false,
    },
    connectionStatus: {
      type: String,
      enum: ['connected', 'disconnected', 'error', 'pending'],
      default: 'disconnected',
    },
    lastSyncAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // tạo createdAt & updatedAt tự động
  },
);

// Unique alias per user, only when alias exists and is a string
WalletSchema.index(
  { user: 1, alias: 1 },
  { unique: true, partialFilterExpression: { alias: { $type: 'string' } } }
);

module.exports = mongoose.model('Wallet', WalletSchema);
