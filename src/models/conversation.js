const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // liên kết với bảng users
      required: true,
    },
    title: {
      type: String,
      default: 'Cuộc trò chuyện mới',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // tạo createdAt & updatedAt tự động
  },
);

module.exports = mongoose.model('Conversation', ConversationSchema);
