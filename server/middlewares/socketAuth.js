const User = require('../models/User');
const { verifyAccessToken } = require('../utils/jwt');

function extractSocketToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (authToken) return authToken;

  const header = socket.handshake.headers?.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  return socket.handshake.query?.token || null;
}

async function socketAuthMiddleware(socket, next) {
  try {
    const token = extractSocketToken(socket);
    if (!token) {
      socket.data.auth = null;
      socket.data.user = null;
      return next();
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('_id role email likes gems status');
    if (!user) {
      return next(new Error('UNAUTHORIZED'));
    }

    socket.data.auth = {
      userId: String(user._id),
      role: user.role || 'user',
      email: user.email || null,
    };
    socket.data.user = user;
    return next();
  } catch (err) {
    return next(new Error('UNAUTHORIZED'));
  }
}

module.exports = {
  socketAuthMiddleware,
};
