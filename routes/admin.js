const express = require('express');
const db = require('../db');
const { authRequired, petugasOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, petugasOnly);

// DAFTAR PENGGUNA
router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, nama, nim_nip, email, role, plat_nomor, created_at FROM users ORDER BY id DESC').all();
  res.json({ users: rows });
});

router.delete('/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.patch('/users/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['mahasiswa', 'petugas'].includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

// STATISTIK RINGKAS DASHBOARD
router.get('/dashboard', (req, res) => {
  const totalSlot = db.prepare('SELECT COUNT(*) c FROM slots').get().c;
  const kosong = db.prepare("SELECT COUNT(*) c FROM slots WHERE status='kosong'").get().c;
  const terisi = db.prepare("SELECT COUNT(*) c FROM slots WHERE status='terisi'").get().c;
  const booked = db.prepare("SELECT COUNT(*) c FROM slots WHERE status='booked'").get().c;
  const totalUser = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const kunjunganHariIni = db.prepare(`
    SELECT COUNT(*) c FROM access_logs WHERE date(waktu_masuk) = date('now') AND gerbang='masuk'
  `).get().c;
  const sedangParkir = db.prepare(`SELECT COUNT(*) c FROM access_logs WHERE waktu_keluar IS NULL`).get().c;

  res.json({ totalSlot, kosong, terisi, booked, totalUser, kunjunganHariIni, sedangParkir });
});

// LAPORAN HARIAN (7 hari terakhir)
router.get('/laporan/harian', (req, res) => {
  const rows = db.prepare(`
    SELECT date(waktu_masuk) as tanggal, COUNT(*) as jumlah_kendaraan,
           ROUND(AVG(durasi_menit)) as rata_durasi_menit
    FROM access_logs
    WHERE waktu_masuk >= date('now', '-6 days') AND gerbang='masuk'
    GROUP BY date(waktu_masuk)
    ORDER BY tanggal ASC
  `).all();
  res.json({ laporan: rows });
});

// LAPORAN BULANAN (12 bulan terakhir)
router.get('/laporan/bulanan', (req, res) => {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', waktu_masuk) as bulan, COUNT(*) as jumlah_kendaraan
    FROM access_logs
    WHERE waktu_masuk >= date('now', '-12 months') AND gerbang='masuk'
    GROUP BY bulan
    ORDER BY bulan ASC
  `).all();
  res.json({ laporan: rows });
});

// STATISTIK PER ZONA (okupansi)
router.get('/laporan/zona', (req, res) => {
  const rows = db.prepare(`
    SELECT z.nama as zona, COUNT(s.id) as total_slot,
      SUM(CASE WHEN s.status='terisi' THEN 1 ELSE 0 END) as terisi,
      SUM(CASE WHEN s.status='kosong' THEN 1 ELSE 0 END) as kosong,
      SUM(CASE WHEN s.status='booked' THEN 1 ELSE 0 END) as booked
    FROM zones z LEFT JOIN slots s ON s.zone_id = z.id
    GROUP BY z.id
  `).all();
  res.json({ zona: rows });
});

module.exports = router;
