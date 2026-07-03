const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// REGISTRASI
router.post('/register', (req, res) => {
  const { nama, nim_nip, email, password, role, plat_nomor } = req.body;
  if (!nama || !nim_nip || !email || !password) {
    return res.status(400).json({ error: 'Nama, NIM/NIP, email, dan password wajib diisi' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ? OR nim_nip = ?').get(email, nim_nip);
  if (exists) return res.status(409).json({ error: 'Email atau NIM/NIP sudah terdaftar' });

  const hash = bcrypt.hashSync(password, 8);
  const finalRole = role === 'petugas' ? 'petugas' : 'mahasiswa';
  const info = db.prepare(
    `INSERT INTO users (nama, nim_nip, email, password, role, plat_nomor) VALUES (?,?,?,?,?,?)`
  ).run(nama, nim_nip, email, hash, finalRole, plat_nomor || null);

  const user = { id: info.lastInsertRowid, nama, role: finalRole, email };
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000, sameSite: 'lax' });
  res.json({ user, token });
});

// LOGIN
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email atau password salah' });
  }
  const token = signToken(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000, sameSite: 'lax' });
  res.json({
    user: { id: user.id, nama: user.nama, role: user.role, email: user.email, plat_nomor: user.plat_nomor },
    token,
  });
});

// LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// SIAPA SAYA
router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, nama, nim_nip, email, role, plat_nomor FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

module.exports = router;
