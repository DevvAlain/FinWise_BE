const mongoose = require('mongoose');

const PaymentReviewSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false, // Changed from true to false
        },
        content: {
            type: String,
            maxlength: 1000,
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

module.exports = PaymentReviewSchema;