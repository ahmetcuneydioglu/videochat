const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role || 'user',
      email: user.email || null,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
