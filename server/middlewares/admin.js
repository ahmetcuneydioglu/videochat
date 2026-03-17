function requireAdmin(req, res, next) {
  if (req.auth?.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Admin yetkisi gerekli' });
}

module.exports = {
  requireAdmin,
};
