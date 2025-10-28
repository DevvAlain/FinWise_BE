const mongoose = require('mongoose');

const PaymentWebhookLogSchema = new mongoose.Schema(
    {
        providerEvent: {
            type: String,
            maxlength: 100,
        },
        payload: {
            type: mongoose.Schema.Types.Mixed,
        },
        receivedAt: {
            type: Date,
            default: Date.now,
        },
        processedAt: {
            type: Date,
        },
        responseCode: {
            type: String,
            maxlength: 30,
        },
        errorMessage: {
            type: String,
            maxlength: 500,
        },
    },
    { _id: false },
);

module.exports = PaymentWebhookLogSchema;