const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'smart-parking-kampus-secret-key';

function signToken(user) {
  return jwt.sign(
    { id: user.id, nama: user.nama, role: user.role, email: user.email },
    SECRET,
    { expiresIn: '12h' }
  );
}

function authRequired(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Belum login' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang' });
  }
}

function petugasOnly(req, res, next) {
  if (req.user?.role !== 'petugas') {
    return res.status(403).json({ error: 'Khusus petugas/admin' });
  }
  next();
}

module.exports = { signToken, authRequired, petugasOnly, SECRET };
