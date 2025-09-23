const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        walletName: {
            type: String,
            required: true,
            maxlength: 100,
            trim: true,
        },
        walletType: {
            type: String,
            enum: ['bank', 'e-wallet', 'cash', 'credit_card'],
            required: true,
        },
        provider: {
            type: String,
            maxlength: 50,
        },
        accountNumber: {
            type: String,
            maxlength: 100,
        },
        balance: {
            type: mongoose.Decimal128,
            default: 0.0,
        },
        currency: {
            type: String,
            default: 'VND',
            maxlength: 3,
        },
        isConnected: {
            type: Boolean,
            default: false,
        },
        connectionStatus: {
            type: String,
            enum: ['connected', 'disconnected', 'error', 'pending'],
            default: 'disconnected',
        },
        lastSyncAt: {
            type: Date,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true, // tạo createdAt & updatedAt tự động
    }
);

module.exports = mongoose.model('Wallet', WalletSchema);
