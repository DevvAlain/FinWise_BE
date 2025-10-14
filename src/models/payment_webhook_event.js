const mongoose = require('mongoose');

const PaymentWebhookEventSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['payos', 'momo', 'zalopay', 'vnpay', 'stripe', 'manual'],
      required: true,
    },
    eventId: {
      type: String,
      required: true,
    },
    requestId: {
      type: String,
      index: true,
    },
    signature: {
      type: String,
    },
    timestamp: {
      type: Date,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    rawPayload: {
      type: String,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'processed', 'ignored', 'failed'],
      default: 'queued',
    },
    errorMessage: {
      type: String,
      maxlength: 500,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
    },
    processedAt: {
      type: Date,
    },
    lockedAt: {
      type: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

PaymentWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
PaymentWebhookEventSchema.index({ status: 1, lockedAt: 1 });

module.exports = mongoose.model('PaymentWebhookEvent', PaymentWebhookEventSchema);
