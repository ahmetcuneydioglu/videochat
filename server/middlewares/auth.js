const User = require('../models/User');
const { verifyAccessToken } = require('../utils/jwt');

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Yetkisiz erişim' });
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('_id role email status');
    if (!user) {
      return res.status(401).json({ error: 'Geçersiz oturum' });
    }

    req.auth = {
      userId: String(user._id),
      role: user.role || 'user',
      email: user.email || null,
    };
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Oturum doğrulanamadı' });
  }
}

function requireSelfOrAdmin(paramSource = 'params', key = 'userId') {
  return (req, res, next) => {
    const targetId = req[paramSource]?.[key] || req.body?.[key] || req.body?.dbUserId || req.body?.userId;
    if (req.auth?.role === 'admin' || String(targetId) === String(req.auth?.userId)) {
      return next();
    }
    return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
  };
}

module.exports = {
  requireAuth,
  requireSelfOrAdmin,
};
