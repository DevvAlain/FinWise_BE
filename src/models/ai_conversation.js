const mongoose = require('mongoose');

const AiMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['system', 'user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    tokens: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const AiConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      maxlength: 140,
    },
    messages: {
      type: [AiMessageSchema],
      default: [],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    lastInteractionAt: {
      type: Date,
      default: Date.now,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

AiConversationSchema.index({ user: 1, conversationId: 1 }, { unique: true });

module.exports = mongoose.model('AiConversation', AiConversationSchema);
