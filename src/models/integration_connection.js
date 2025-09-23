const mongoose = require('mongoose');

const IntegrationConnectionSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        provider: { type: String, required: true, index: true },
        status: { type: String, enum: ['connected', 'disconnected', 'error', 'pending'], default: 'disconnected' },
        maskedAccount: { type: String },
        lastSyncAt: { type: Date },
        errorMessage: { type: String },
        credentialsEncrypted: { type: String }, // store encrypted blob
    },
    { timestamps: true }
);

IntegrationConnectionSchema.index({ user: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('IntegrationConnection', IntegrationConnectionSchema);


