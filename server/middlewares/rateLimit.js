const rateLimit = require('express-rate-limit');

function buildRateLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

module.exports = {
  authRateLimit: buildRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Çok fazla giriş denemesi yapıldı',
  }),
  userActionRateLimit: buildRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Çok fazla istek gönderildi',
  }),
  adminRateLimit: buildRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Admin istek limiti aşıldı',
  }),
};
