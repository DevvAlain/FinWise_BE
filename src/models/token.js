import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    token: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['verification', 'reset-password'],
    },
    expiresAt: {
      type: Date,
      default: function () {
        // Verification tokens expire in 24 hours, reset-password tokens in 1 hour
        const hours = this.type === 'verification' ? 24 : 1;
        return new Date(Date.now() + hours * 60 * 60 * 1000);
      },
    },
  },
  {
    timestamps: true,
  },
);

// Auto-delete expired tokens
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Token = mongoose.model('Token', tokenSchema);

export default Token;
