const mongoose = require('mongoose');

const PaymentIntentSchema = new mongoose.Schema(
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
    provider: {
      type: String,
      enum: ['momo', 'zalopay', 'vnpay', 'napas', 'stripe', 'manual', 'payos'],
      required: true,
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
    amount: {
      type: mongoose.Decimal128,
      required: true,
    },
    currency: {
      type: String,
      default: 'VND',
      maxlength: 3,
    },
    status: {
      type: String,
      enum: [
        'initialized',
        'pending',
        'requires_action',
        'succeeded',
        'failed',
        'cancelled',
        'expired',
      ],
      default: 'initialized',
    },
    requestId: {
      type: String,
      required: true,
      unique: true,
    },
    signature: {
      type: String,
      maxlength: 255,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
    },
    expiresAt: {
      type: Date,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: [
            'initialized',
            'pending',
            'requires_action',
            'succeeded',
            'failed',
            'cancelled',
            'expired',
          ],
          required: true,
        },
        note: {
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
    ],
  },
  { timestamps: true },
);

PaymentIntentSchema.index({ user: 1, status: 1 });
PaymentIntentSchema.index({ expiresAt: 1 });

PaymentIntentSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push({ status: this.status, changedAt: new Date() });
  }
  next();
});

module.exports = mongoose.model('PaymentIntent', PaymentIntentSchema);
