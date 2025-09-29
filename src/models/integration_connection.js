const mongoose = require('mongoose');

const CredentialRotationLogSchema = new mongoose.Schema(
  {
    rotatedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
    },
    errorMessage: {
      type: String,
      maxlength: 255,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { _id: false },
);

const IntegrationConnectionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    provider: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['connected', 'disconnected', 'error', 'pending'],
      default: 'disconnected',
    },
    maskedAccount: { type: String },
    scope: { type: [String], default: [] },
    lastSyncAt: { type: Date },
    errorMessage: { type: String },
    credentialsEncrypted: { type: String }, // store encrypted blob
    refreshTokenEncrypted: { type: String },
    accessTokenExpiresAt: { type: Date },
    refreshTokenExpiresAt: { type: Date },
    lastRotatedAt: { type: Date },
    rotationIntervalHours: { type: Number, default: 720 },
    rotationLogs: {
      type: [CredentialRotationLogSchema],
      default: [],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

IntegrationConnectionSchema.index({ user: 1, provider: 1 }, { unique: true });
IntegrationConnectionSchema.index({ status: 1, accessTokenExpiresAt: 1 });
IntegrationConnectionSchema.index({ user: 1, lastRotatedAt: 1 });

module.exports = mongoose.model(
  'IntegrationConnection',
  IntegrationConnectionSchema,
);