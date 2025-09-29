const mongoose = require('mongoose');

const DeliveryAttemptSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      enum: ['in_app', 'email', 'push', 'sms'],
      required: true,
    },
    attemptedAt: {
      type: Date,
      default: Date.now,
    },
    success: {
      type: Boolean,
      default: false,
    },
    responseCode: {
      type: String,
      maxlength: 50,
    },
    errorMessage: {
      type: String,
      maxlength: 500,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { _id: false },
);

const NotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notificationType: {
      type: String,
      enum: [
        'budget_alert',
        'payment_reminder',
        'sync_error',
        'recommendation',
        'system',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 255,
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    actionUrl: {
      type: String,
      maxlength: 500,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    relatedType: {
      type: String,
      maxlength: 50,
    },
    scheduledAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    channel: {
      type: String,
      enum: ['in_app', 'email', 'push', 'sms'],
      default: 'in_app',
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'queued', 'sending', 'sent', 'failed', 'cancelled'],
      default: 'pending',
    },
    deliveryAttempts: {
      type: [DeliveryAttemptSchema],
      default: [],
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
    },
    nextAttemptAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // t?o createdAt & updatedAt
  },
);

// Indexes
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index({ scheduledAt: 1 });
NotificationSchema.index({ deliveryStatus: 1, nextAttemptAt: 1 });

NotificationSchema.methods.recordAttempt = function ({
  channel,
  success,
  responseCode,
  errorMessage,
  metadata,
}) {
  this.deliveryAttempts.push({
    channel,
    success,
    responseCode,
    errorMessage,
    metadata,
    attemptedAt: new Date(),
  });
  this.attempts = (this.attempts || 0) + 1;
  this.lastAttemptAt = new Date();
  this.deliveryStatus = success ? 'sent' : 'failed';
};

module.exports = mongoose.model('Notification', NotificationSchema);