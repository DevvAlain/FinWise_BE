const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
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
        amount: {
            type: mongoose.Decimal128,
            required: true,
        },
        currency: {
            type: String,
            default: 'VND',
            maxlength: 3,
        },
        paymentMethod: {
            type: String,
            enum: ['momo', 'zalopay', 'vnpay', 'bank_transfer', 'credit_card'],
            required: true,
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'refunded'],
            required: true,
        },
        transactionId: {
            type: String,
            unique: true,
            sparse: true,
        },
        gatewayResponse: {
            type: mongoose.Schema.Types.Mixed,
        },
        paidAt: {
            type: Date,
        },
    },
    {
        timestamps: true, // tạo createdAt & updatedAt
    }
);

// Indexes
PaymentSchema.index({ user: 1, paymentStatus: 1 });
PaymentSchema.index({ transactionId: 1 });

module.exports = mongoose.model('Payment', PaymentSchema);
