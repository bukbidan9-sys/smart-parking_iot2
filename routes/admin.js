const express = require('express');
const db = require('../db'); // Menggunakan pool mysql2 yang baru
const { authRequired, petugasOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, petugasOnly);

// DAFTAR PENGGUNA
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.promise().query('SELECT id, nama, nim_nip, email, role, plat_nomor, created_at FROM users ORDER BY id DESC');
    res.json({ users: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await db.promise().query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['mahasiswa', 'petugas'].includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
  
  try {
    await db.promise().query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// STATISTIK RINGKAS DASHBOARD
router.get('/dashboard', async (req, res) => {
  try {
    const [totalSlotRes] = await db.promise().query('SELECT COUNT(*) c FROM slots');
    const [kosongRes] = await db.promise().query("SELECT COUNT(*) c FROM slots WHERE status='kosong'");
    const [terisiRes] = await db.promise().query("SELECT COUNT(*) c FROM slots WHERE status='terisi'");
    const [bookedRes] = await db.promise().query("SELECT COUNT(*) c FROM slots WHERE status='booked'");
    const [totalUserRes] = await db.promise().query('SELECT COUNT(*) c FROM users');
    
    // Menggunakan CURDATE() untuk mencocokkan tanggal hari ini di MySQL
    const [kunjunganRes] = await db.promise().query(`
      SELECT COUNT(*) c FROM access_logs WHERE DATE(waktu_masuk) = CURDATE() AND gerbang='masuk'
    `);
    const [sedangParkirRes] = await db.promise().query(`SELECT COUNT(*) c FROM access_logs WHERE waktu_keluar IS NULL`);

    res.json({ 
      totalSlot: totalSlotRes[0].c, 
      kosong: kosongRes[0].c, 
      terisi: terisiRes[0].c, 
      booked: bookedRes[0].c, 
      totalUser: totalUserRes[0].c, 
      kunjunganHariIni: kunjunganRes[0].c, 
      sedangParkir: sedangParkirRes[0].c 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LAPORAN HARIAN (7 hari terakhir)
router.get('/laporan/harian', async (req, res) => {
  try {
    // Menggunakan DATE_SUB(CURDATE(), INTERVAL 6 DAY) untuk MySQL
    const [rows] = await db.promise().query(`
      SELECT DATE(waktu_masuk) as tanggal, COUNT(*) as jumlah_kendaraan,
             ROUND(AVG(durasi_menit)) as rata_durasi_menit
      FROM access_logs
      WHERE waktu_masuk >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND gerbang='masuk'
      GROUP BY DATE(waktu_masuk)
      ORDER BY tanggal ASC
    `);
    res.json({ laporan: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LAPORAN BULANAN (12 bulan terakhir)
router.get('/laporan/bulanan', async (req, res) => {
  try {
    // Menggunakan DATE_FORMAT dan DATE_SUB INTERVAL 12 MONTH untuk MySQL
    const [rows] = await db.promise().query(`
      SELECT DATE_FORMAT(waktu_masuk, '%Y-%m') as bulan, COUNT(*) as jumlah_kendaraan
      FROM access_logs
      WHERE waktu_masuk >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH) AND gerbang='masuk'
      GROUP BY bulan
      ORDER BY bulan ASC
    `);
    res.json({ laporan: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// STATISTIK PER ZONA (okupansi)
router.get('/laporan/zona', async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT z.nama as zona, COUNT(s.id) as total_slot,
        SUM(CASE WHEN s.status='terisi' THEN 1 ELSE 0 END) as terisi,
        SUM(CASE WHEN s.status='kosong' THEN 1 ELSE 0 END) as kosong,
        SUM(CASE WHEN s.status='booked' THEN 1 ELSE 0 END) as booked
      FROM zones z LEFT JOIN slots s ON s.zone_id = z.id
      GROUP BY z.id
    `);
    res.json({ zona: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;