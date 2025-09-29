const mongoose = require('mongoose');

const SavingGoalContributionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    savingGoal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SavingGoal',
      required: true,
      index: true,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
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
    occurredAt: {
      type: Date,
      required: true,
    },
    note: {
      type: String,
      maxlength: 255,
    },
    inputMethod: {
      type: String,
      enum: ['manual', 'auto_sync', 'ai_suggestion'],
      default: 'manual',
    },
    balanceAfterContribution: {
      type: mongoose.Decimal128,
      default: null,
    },
    createdBy: {
      type: String,
      enum: ['user', 'system', 'ai'],
      default: 'user',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

SavingGoalContributionSchema.index({ savingGoal: 1, occurredAt: 1 });
SavingGoalContributionSchema.index({ user: 1, occurredAt: 1 });

module.exports = mongoose.model(
  'SavingGoalContribution',
  SavingGoalContributionSchema,
);