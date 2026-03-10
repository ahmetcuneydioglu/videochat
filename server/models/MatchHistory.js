const mongoose = require('mongoose');

const MatchHistorySchema = new mongoose.Schema({
  user1: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user2: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  duration: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

MatchHistorySchema.index({ user1: 1 });
MatchHistorySchema.index({ user2: 1 });

module.exports = mongoose.models.MatchHistory || mongoose.model('MatchHistory', MatchHistorySchema);
