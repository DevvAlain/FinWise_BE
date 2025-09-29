const mongoose = require('mongoose');

const UserExpenseCategorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpenseCategory',
      default: null,
    },
    customName: {
      type: String,
      maxlength: 100,
      trim: true,
    },
    normalizedName: {
      type: String,
      maxlength: 100,
      trim: true,
      lowercase: true,
    },
    createdBy: {
      type: String,
      enum: ['user', 'system', 'ai'],
      default: 'user',
    },
    needsConfirmation: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // ch? c?n createdAt
  },
);

// Normalize name before save for dedupe
UserExpenseCategorySchema.pre('save', function (next) {
  if (this.isModified('customName') && this.customName) {
    this.normalizedName = this.customName.trim().toLowerCase();
  }
  next();
});

// UNIQUE user + category
UserExpenseCategorySchema.index({ user: 1, category: 1 }, { unique: true, sparse: true });
UserExpenseCategorySchema.index(
  { user: 1, normalizedName: 1 },
  { unique: true, partialFilterExpression: { normalizedName: { $type: 'string' } } },
);

module.exports = mongoose.model(
  'UserExpenseCategory',
  UserExpenseCategorySchema,
);