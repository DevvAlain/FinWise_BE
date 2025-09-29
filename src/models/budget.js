const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    period: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
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
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserExpenseCategory',
      default: null, // null means budget for all categories
    },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null, // null means budget for all wallets
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    spentAmount: {
      type: mongoose.Decimal128,
      default: 0.0,
    },
    lastCalculatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Index for efficient queries
BudgetSchema.index({ user: 1, periodStart: 1, periodEnd: 1 });
BudgetSchema.index({ user: 1, category: 1, periodStart: 1 });
BudgetSchema.index({ user: 1, wallet: 1, periodStart: 1 });

function decimalToNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof mongoose.Types.Decimal128) {
    return parseFloat(value.toString());
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Virtual for budget status
BudgetSchema.virtual('status').get(function () {
  const amount = decimalToNumber(this.amount);
  const spent = decimalToNumber(this.spentAmount);

  if (amount > 0 && spent >= amount) {
    return 'exceeded';
  }

  if (amount > 0 && spent >= amount * 0.8) {
    return 'warning';
  }

  return 'normal';
});

// Virtual for remaining amount
BudgetSchema.virtual('remainingAmount').get(function () {
  const amount = decimalToNumber(this.amount);
  const spent = decimalToNumber(this.spentAmount);
  return amount - spent;
});

// Virtual for percentage spent
BudgetSchema.virtual('percentageSpent').get(function () {
  const amount = decimalToNumber(this.amount);
  if (amount === 0) return 0;
  const spent = decimalToNumber(this.spentAmount);
  return (spent / amount) * 100;
});

module.exports = mongoose.model('Budget', BudgetSchema);