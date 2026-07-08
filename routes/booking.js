const express = require('express');
const crypto = require('crypto');
const db = require('../db'); // Menggunakan pool mysql2 yang baru
const { authRequired } = require('../middleware/auth');

module.exports = function (io) {
  const router = express.Router();

  // BUAT BOOKING
  router.post('/', authRequired, async (req, res) => {
    const { slot_id, mulai, selesai } = req.body;
    if (!slot_id || !mulai || !selesai) {
      return res.status(400).json({ error: 'slot_id, mulai, dan selesai wajib diisi' });
    }

    try {
      // Ambil data slot dari MySQL
      const [slots] = await db.promise().query('SELECT * FROM slots WHERE id = ?', [slot_id]);
      const slot = slots[0];

      if (!slot) return res.status(404).json({ error: 'Slot tidak ditemukan' });
      if (slot.status === 'terisi' || slot.status === 'booked') {
        return res.status(409).json({ error: 'Slot sudah tidak tersedia untuk dibooking' });
      }

      const qr_token = crypto.randomBytes(16).toString('hex');
      
      // INSERT booking ke MySQL
      const [result] = await db.promise().query(`
        INSERT INTO bookings (user_id, slot_id, mulai, selesai, status, qr_token)
        VALUES (?,?,?,?, 'aktif', ?)
      `, [req.user.id, slot_id, mulai, selesai, qr_token]);

      // UPDATE status slot menggunakan NOW() MySQL
      await db.promise().query('UPDATE slots SET status = \'booked\', updated_at = NOW() WHERE id = ?', [slot_id]);
      
      const [updatedSlots] = await db.promise().query('SELECT * FROM slots WHERE id = ?', [slot_id]);
      io.emit('slot_update', updatedSlots[0]);

      // INSERT notifikasi
      await db.promise().query(`INSERT INTO notifications (user_id, judul, pesan, tipe) VALUES (?,?,?,?)`, [
        req.user.id, 'Booking Berhasil', `Slot ${slot.kode_slot} berhasil dibooking. Tunjukkan QR Code saat masuk.`, 'info'
      ]);

      // Ambil data booking yang baru dibuat menggunakan result.insertId
      const [bookings] = await db.promise().query('SELECT * FROM bookings WHERE id = ?', [result.insertId]);
      res.json({ booking: bookings[0] });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // DAFTAR BOOKING MILIK USER
  router.get('/my', authRequired, async (req, res) => {
    try {
      const [rows] = await db.promise().query(`
        SELECT b.*, s.kode_slot, z.nama as zona_nama
        FROM bookings b
        JOIN slots s ON s.id = b.slot_id
        JOIN zones z ON z.id = s.zone_id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
      `, [req.user.id]);
      res.json({ bookings: rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // BATALKAN BOOKING
  router.post('/:id/batal', authRequired, async (req, res) => {
    try {
      const [bookings] = await db.promise().query('SELECT * FROM bookings WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      const booking = bookings[0];

      if (!booking) return res.status(404).json({ error: 'Booking tidak ditemukan' });
      if (booking.status !== 'aktif') return res.status(400).json({ error: 'Booking sudah tidak aktif' });

      await db.promise().query('UPDATE bookings SET status = \'dibatalkan\' WHERE id = ?', [booking.id]);
      await db.promise().query('UPDATE slots SET status = \'kosong\', updated_at = NOW() WHERE id = ?', [booking.slot_id]);
      
      const [updatedSlots] = await db.promise().query('SELECT * FROM slots WHERE id = ?', [booking.slot_id]);
      io.emit('slot_update', updatedSlots[0]);

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};