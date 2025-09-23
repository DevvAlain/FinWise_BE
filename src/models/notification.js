const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        notificationType: {
            type: String,
            enum: ['budget_alert', 'payment_reminder', 'sync_error', 'recommendation', 'system'],
            required: true,
        },
        title: {
            type: String,
            required: true,
            maxlength: 255,
            trim: true,
        },
        message: {
            type: String,
            required: true,
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium',
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        actionUrl: {
            type: String,
            maxlength: 500,
        },
        relatedId: {
            type: mongoose.Schema.Types.ObjectId,
        },
        relatedType: {
            type: String,
            maxlength: 50,
        },
        scheduledAt: {
            type: Date,
        },
        sentAt: {
            type: Date,
        },
    },
    {
        timestamps: true, // tạo createdAt & updatedAt
    }
);

// Indexes
NotificationSchema.index({ user: 1, isRead: 1 });
NotificationSchema.index({ scheduledAt: 1 });

module.exports = mongoose.model('Notification', NotificationSchema);
