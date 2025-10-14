const mongoose = require('mongoose');

const PaymentStatusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'voided'],
      required: true,
    },
    reason: {
      type: String,
      maxlength: 255,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const PaymentWebhookLogSchema = new mongoose.Schema(
  {
    providerEvent: {
      type: String,
      maxlength: 100,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
    },
    responseCode: {
      type: String,
      maxlength: 30,
    },
    errorMessage: {
      type: String,
      maxlength: 500,
    },
  },
  { _id: false },
);

const PaymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    paymentIntent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentIntent',
      index: true,
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
    paymentMethod: {
      type: String,
      enum: [
        'momo',
        'zalopay',
        'vnpay',
        'bank_transfer',
        'credit_card',
        'other',
        'payos_qr',
      ],
      required: true,
    },
    provider: {
      type: String,
      enum: ['momo', 'zalopay', 'vnpay', 'napas', 'stripe', 'manual', 'payos'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'voided'],
      required: true,
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    providerRequestId: {
      type: String,
      index: true,
    },
    providerTransactionId: {
      type: String,
      index: true,
    },
    signature: {
      type: String,
      maxlength: 255,
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
    paidAt: {
      type: Date,
    },
    statusHistory: {
      type: [PaymentStatusHistorySchema],
      default: [],
    },
    webhookStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'ignored'],
      default: 'pending',
    },
    webhookLogs: {
      type: [PaymentWebhookLogSchema],
      default: [],
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastRetryAt: {
      type: Date,
    },
    lockedAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // t?o createdAt & updatedAt
  },
);

// Indexes
PaymentSchema.index({ user: 1, paymentStatus: 1 });
PaymentSchema.index({ provider: 1, providerRequestId: 1 }, { unique: true, sparse: true });
PaymentSchema.index({ provider: 1, providerTransactionId: 1 }, { sparse: true });

PaymentSchema.pre('save', function (next) {
  if (this.isModified('paymentStatus')) {
    const historyEntry = {
      status: this.paymentStatus,
      changedAt: new Date(),
    };

    if (this.isModified('gatewayResponse') && this.gatewayResponse) {
      historyEntry.metadata = { gatewayResponseSnapshot: this.gatewayResponse };
    }

    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push(historyEntry);
  }
  next();
});

module.exports = mongoose.model('Payment', PaymentSchema);
