const mongoose = require('mongoose');

const ExpenseCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    nameEn: {
      type: String,
      maxlength: 100,
      trim: true,
    },
    icon: {
      type: String,
      maxlength: 100,
    },
    color: {
      type: String,
      match: /^#[0-9A-Fa-f]{6}$/, // validate mã màu hex #RRGGBB
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // chỉ cần createdAt
  },
);

module.exports = mongoose.model('ExpenseCategory', ExpenseCategorySchema);
