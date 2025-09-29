const mongoose = require('mongoose');

const StatusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending'],
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

const SubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending'],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    gracePeriodEndsAt: {
      type: Date,
    },
    renewedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    cancelledAt: {
      type: Date,
    },
    statusChangeNote: {
      type: String,
      maxlength: 255,
    },
    statusChangeMetadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    statusHistory: {
      type: [StatusHistorySchema],
      default: [],
    },
    lastStatusChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
  },
);

// Indexes
SubscriptionSchema.index({ user: 1, status: 1 });
SubscriptionSchema.index({ endDate: 1 });
SubscriptionSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

SubscriptionSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    const historyEntry = {
      status: this.status,
      changedAt: new Date(),
    };

    if (this.isModified('statusChangeNote') && this.statusChangeNote) {
      historyEntry.reason = this.statusChangeNote;
    }

    if (
      this.isModified('statusChangeMetadata') &&
      this.statusChangeMetadata !== undefined
    ) {
      historyEntry.metadata = this.statusChangeMetadata;
    }

    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push(historyEntry);
    this.lastStatusChangedAt = historyEntry.changedAt;
  }
  next();
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);