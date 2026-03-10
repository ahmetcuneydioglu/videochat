const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  name: String,
  avatar: String,
  country: { type: String, default: null },
  countryFlag: { type: String, default: null },
  likes: { type: Number, default: 0 },
  isRegistered: { type: Boolean, default: false },
  role: { type: String, default: 'user' },
  trustScore: { type: Number, default: 100 },
  status: { type: String, default: 'active' },
  lastSeen: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  gems: { type: Number, default: 25 },
  dailyStreak: { type: Number, default: 0 },
  lastLoginDate: { type: Date },
  lastClaimedDate: { type: Date }
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
