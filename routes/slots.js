const express = require('express');
const db = require('../db');
const { authRequired, petugasOnly } = require('../middleware/auth');

module.exports = function (io) {
  const router = express.Router();

  // LIST semua slot + zona (untuk peta area parkir & monitoring realtime)
  router.get('/', authRequired, (req, res) => {
    const slots = db.prepare(`
      SELECT s.*, z.nama as zona_nama, z.lokasi as zona_lokasi
      FROM slots s JOIN zones z ON z.id = s.zone_id
      ORDER BY z.id, s.kode_slot
    `).all();
    res.json({ slots });
  });

  // RINGKASAN (untuk dashboard)
  router.get('/summary', authRequired, (req, res) => {
    const total = db.prepare('SELECT COUNT(*) c FROM slots').get().c;
    const kosong = db.prepare("SELECT COUNT(*) c FROM slots WHERE status = 'kosong'").get().c;
    const terisi = db.prepare("SELECT COUNT(*) c FROM slots WHERE status = 'terisi'").get().c;
    const booked = db.prepare("SELECT COUNT(*) c FROM slots WHERE status = 'booked'").get().c;
    res.json({ total, kosong, terisi, booked });
  });

  // UPDATE status slot manual (petugas) - misal set maintenance
  router.patch('/:id', authRequired, petugasOnly, (req, res) => {
    const { status } = req.body;
    const valid = ['kosong', 'terisi', 'booked', 'maintenance'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Status tidak valid' });

    db.prepare('UPDATE slots SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, req.params.id);
    const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(req.params.id);
    io.emit('slot_update', slot);
    broadcastSummaryIfFull(io);
    res.json({ slot });
  });

  return router;
};

function broadcastSummaryIfFull(io) {
  const db2 = require('../db');
  const total = db2.prepare('SELECT COUNT(*) c FROM slots').get().c;
  const kosong = db2.prepare("SELECT COUNT(*) c FROM slots WHERE status = 'kosong'").get().c;
  if (kosong === 0) {
    io.emit('notification', {
      judul: 'Parkiran Penuh',
      pesan: 'Seluruh slot parkir kampus saat ini penuh.',
      tipe: 'danger',
    });
  }
}
