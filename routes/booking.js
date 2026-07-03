const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

module.exports = function (io) {
  const router = express.Router();

  // BUAT BOOKING
  router.post('/', authRequired, (req, res) => {
    const { slot_id, mulai, selesai } = req.body;
    if (!slot_id || !mulai || !selesai) {
      return res.status(400).json({ error: 'slot_id, mulai, dan selesai wajib diisi' });
    }

    const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot_id);
    if (!slot) return res.status(404).json({ error: 'Slot tidak ditemukan' });
    if (slot.status === 'terisi' || slot.status === 'booked') {
      return res.status(409).json({ error: 'Slot sudah tidak tersedia untuk dibooking' });
    }

    const qr_token = crypto.randomBytes(16).toString('hex');
    const info = db.prepare(`
      INSERT INTO bookings (user_id, slot_id, mulai, selesai, status, qr_token)
      VALUES (?,?,?,?, 'aktif', ?)
    `).run(req.user.id, slot_id, mulai, selesai, qr_token);

    db.prepare('UPDATE slots SET status = \'booked\', updated_at = datetime(\'now\') WHERE id = ?').run(slot_id);
    const updatedSlot = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot_id);
    io.emit('slot_update', updatedSlot);

    db.prepare(`INSERT INTO notifications (user_id, judul, pesan, tipe) VALUES (?,?,?,?)`).run(
      req.user.id, 'Booking Berhasil', `Slot ${slot.kode_slot} berhasil dibooking. Tunjukkan QR Code saat masuk.`, 'info'
    );

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(info.lastInsertRowid);
    res.json({ booking });
  });

  // DAFTAR BOOKING MILIK USER
  router.get('/my', authRequired, (req, res) => {
    const rows = db.prepare(`
      SELECT b.*, s.kode_slot, z.nama as zona_nama
      FROM bookings b
      JOIN slots s ON s.id = b.slot_id
      JOIN zones z ON z.id = s.zone_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(req.user.id);
    res.json({ bookings: rows });
  });

  // BATALKAN BOOKING
  router.post('/:id/batal', authRequired, (req, res) => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!booking) return res.status(404).json({ error: 'Booking tidak ditemukan' });
    if (booking.status !== 'aktif') return res.status(400).json({ error: 'Booking sudah tidak aktif' });

    db.prepare('UPDATE bookings SET status = \'dibatalkan\' WHERE id = ?').run(booking.id);
    db.prepare('UPDATE slots SET status = \'kosong\', updated_at = datetime(\'now\') WHERE id = ?').run(booking.slot_id);
    const updatedSlot = db.prepare('SELECT * FROM slots WHERE id = ?').get(booking.slot_id);
    io.emit('slot_update', updatedSlot);

    res.json({ ok: true });
  });

  return router;
};
