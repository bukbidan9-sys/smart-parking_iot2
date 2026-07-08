const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db'); // Menggunakan pool mysql2 yang baru
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// REGISTRASI
router.post('/register', async (req, res) => {
  const { nama, nim_nip, email, password, role, plat_nomor } = req.body;
  if (!nama || !nim_nip || !email || !password) {
    return res.status(400).json({ error: 'Nama, NIM/NIP, email, dan password wajib diisi' });
  }

  try {
    // Menggunakan query MySQL Asinkronus
    const [existingUsers] = await db.promise().query('SELECT id FROM users WHERE email = ? OR nim_nip = ?', [email, nim_nip]);
    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'Email atau NIM/NIP sudah terdaftar' });
    }

    const hash = bcrypt.hashSync(password, 8);
    const finalRole = role === 'petugas' ? 'petugas' : 'mahasiswa';

    // INSERT data ke MySQL
    const [result] = await db.promise().query(
      `INSERT INTO users (nama, nim_nip, email, password, role, plat_nomor) VALUES (?,?,?,?,?,?)`,
      [nama, nim_nip, email, hash, finalRole, plat_nomor || null]
    );

    // Di MySQL, ID baru diambil dari result.insertId
    const user = { id: result.insertId, nama, role: finalRole, email };
    const token = signToken(user);
    
    res.cookie('token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000, sameSite: 'lax' });
    res.json({ user, token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [users] = await db.promise().query('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, maxAge: 12 * 3600 * 1000, sameSite: 'lax' });
    res.json({
      user: { id: user.id, nama: user.nama, role: user.role, email: user.email, plat_nomor: user.plat_nomor },
      token,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// SIAPA SAYA
router.get('/me', authRequired, async (req, res) => {
  try {
    const [users] = await db.promise().query('SELECT id, nama, nim_nip, email, role, plat_nomor FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: users[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;