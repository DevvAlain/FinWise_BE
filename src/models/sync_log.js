const mongoose = require('mongoose');

const SyncLogSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        wallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            required: true,
        },
        syncType: {
            type: String,
            enum: ['manual', 'scheduled', 'webhook'],
            required: true,
        },
        status: {
            type: String,
            enum: ['success', 'partial', 'failed'],
            required: true,
        },
        recordsProcessed: {
            type: Number,
            default: 0,
        },
        recordsAdded: {
            type: Number,
            default: 0,
        },
        recordsUpdated: {
            type: Number,
            default: 0,
        },
        errorMessage: {
            type: String,
        },
        syncData: {
            type: mongoose.Schema.Types.Mixed,
        },
        startedAt: {
            type: Date,
            required: true,
        },
        completedAt: {
            type: Date,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false }, // chỉ cần createdAt
    }
);

// Indexes
SyncLogSchema.index({ wallet: 1, status: 1 });
SyncLogSchema.index({ user: 1, startedAt: 1 });

module.exports = mongoose.model('SyncLog', SyncLogSchema);
