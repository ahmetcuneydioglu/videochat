const mongoose = require('mongoose');

const PurchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    productId: { type: String, required: true },
    transactionId: { type: String, required: true, unique: true },
    creditedAmount: { type: Number, required: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Purchase || mongoose.model('Purchase', PurchaseSchema);
