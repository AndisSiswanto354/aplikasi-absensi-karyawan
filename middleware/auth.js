function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Sesi telah berakhir atau belum login. Silakan login kembali.' });
  }
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu.' });
    }
    return res.redirect('/login');
  }

  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses ditolak! Menu ini hanya untuk Administrator.' });
  }

  next();
}

module.exports = {
  requireAuth,
  requireAdmin
};
