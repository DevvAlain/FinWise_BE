const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true },
    entity: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: Object },
  },
  { timestamps: true },
);

module.exports = mongoose.model('AuditLog', AuditLogSchema);
