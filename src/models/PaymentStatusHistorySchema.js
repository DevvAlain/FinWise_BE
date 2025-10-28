const mongoose = require('mongoose');

const PaymentStatusHistorySchema = new mongoose.Schema(
    {
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'refunded', 'voided'],
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

module.exports = PaymentStatusHistorySchema;