const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
    {
        conversation: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        role: {
            type: String,
            enum: ['user', 'assistant'],
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        messageType: {
            type: String,
            enum: ['text', 'expense_input', 'query', 'recommendation'],
            default: 'text',
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed, // cho phép lưu object JSON linh hoạt
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false }, // chỉ cần createdAt
    }
);

// Indexes giống SQL
MessageSchema.index({ conversation: 1, createdAt: 1 });
MessageSchema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model('Message', MessageSchema);
