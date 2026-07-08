const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../db'); // Menggunakan pool mysql2 yang baru
const { authRequired, petugasOnly } = require('../middleware/auth');

module.exports = function (io) {
  const router = express.Router();

  // GENERATE QR Code untuk akses umum
  router.get('/qrcode/me', authRequired, (req, res, next) => {
    (async () => {
      const payload = JSON.stringify({ uid: req.user.id, t: 'access' });
      const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 260 });
      res.json({ qrcode: dataUrl, payload });
    })().catch(next);
  });

  // GENERATE QR Code untuk booking tertentu
  router.get('/qrcode/booking/:bookingId', authRequired, (req, res, next) => {
    (async () => {
      // Menggunakan query MySQL (Asinkronus)
      const [bookings] = await db.promise().query('SELECT * FROM bookings WHERE id = ? AND user_id = ?', [req.params.bookingId, req.user.id]);
      const booking = bookings[0];

      if (!booking) return res.status(404).json({ error: 'Booking tidak ditemukan' });
      const payload = JSON.stringify({ t: 'booking', token: booking.qr_token });
      const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 260 });
      res.json({ qrcode: dataUrl, payload });
    })().catch(next);
  });

  // SCAN QR di gerbang
  router.post('/scan', authRequired, petugasOnly, async (req, res) => {
    const { payload, gerbang } = req.body; 
    if (!payload || !gerbang) return res.status(400).json({ error: 'payload dan gerbang wajib diisi' });

    let data;
    try { data = JSON.parse(payload); } catch { return res.status(400).json({ error: 'QR tidak valid' }); }

    let user = null, slot = null, booking = null;

    try {
      if (data.t === 'booking') {
        const [bookings] = await db.promise().query('SELECT * FROM bookings WHERE qr_token = ?', [data.token]);
        booking = bookings[0];
        if (!booking || booking.status !== 'aktif') {
          return res.status(403).json({ valid: false, pesan: 'Booking tidak valid / sudah tidak aktif' });
        }
        const [users] = await db.promise().query('SELECT * FROM users WHERE id = ?', [booking.user_id]);
        user = users[0];
        const [slots] = await db.promise().query('SELECT * FROM slots WHERE id = ?', [booking.slot_id]);
        slot = slots[0];
      } else if (data.t === 'access') {
        const [users] = await db.promise().query('SELECT * FROM users WHERE id = ?', [data.uid]);
        user = users[0];
        if (!user) return res.status(403).json({ valid: false, pesan: 'Pengguna tidak ditemukan' });
      } else {
        return res.status(400).json({ valid: false, pesan: 'Format QR tidak dikenali' });
      }

      if (gerbang === 'masuk') {
        // Menggunakan NOW() untuk MySQL
        const [result] = await db.promise().query(`
          INSERT INTO access_logs (user_id, slot_id, booking_id, plat_nomor, waktu_masuk, gerbang)
          VALUES (?,?,?,?, NOW(), 'masuk')
        `, [user.id, slot?.id || null, booking?.id || null, user.plat_nomor || '-']);

        if (slot) {
          await db.promise().query('UPDATE slots SET status = \'terisi\', updated_at = NOW() WHERE id = ?', [slot.id]);
          const [updatedSlots] = await db.promise().query('SELECT * FROM slots WHERE id = ?', [slot.id]);
          io.emit('slot_update', updatedSlots[0]);
        }
        io.emit('gate_open', { gerbang: 'masuk', user: user.nama, slot: slot?.kode_slot || '-' });
        return res.json({ valid: true, pesan: `Selamat datang, ${user.nama}. Portal masuk terbuka.`, log_id: result.insertId });
      }

      if (gerbang === 'keluar') {
        const [logs] = await db.promise().query(`
          SELECT * FROM access_logs WHERE user_id = ? AND waktu_keluar IS NULL ORDER BY id DESC LIMIT 1
        `, [user.id]);
        const log = logs[0];
        if (!log) return res.status(404).json({ valid: false, pesan: 'Tidak ditemukan data masuk untuk pengguna ini' });

        // Menggunakan TIMESTAMPDIFF untuk kalkulasi menit di MySQL
        await db.promise().query(`
          UPDATE access_logs SET waktu_keluar = NOW(),
          durasi_menit = TIMESTAMPDIFF(MINUTE, waktu_masuk, NOW())
          WHERE id = ?
        `, [log.id]);

        if (log.slot_id) {
          await db.promise().query('UPDATE slots SET status = \'kosong\', updated_at = NOW() WHERE id = ?', [log.slot_id]);
          const [updatedSlots] = await db.promise().query('SELECT * FROM slots WHERE id = ?', [log.slot_id]);
          io.emit('slot_update', updatedSlots[0]);
        }
        if (booking) await db.promise().query('UPDATE bookings SET status = \'selesai\' WHERE id = ?', [booking.id]);

        const [updatedLogs] = await db.promise().query('SELECT * FROM access_logs WHERE id = ?', [log.id]);
        const updatedLog = updatedLogs[0];
        io.emit('gate_open', { gerbang: 'keluar', user: user.nama, durasi: updatedLog.durasi_menit });
        return res.json({ valid: true, pesan: `Sampai jumpa, ${user.nama}. Durasi parkir: ${updatedLog.durasi_menit} menit. Portal keluar terbuka.` });
      }

      res.status(400).json({ error: 'gerbang harus "masuk" atau "keluar"' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // RIWAYAT PARKIR milik user
  router.get('/riwayat/saya', authRequired, async (req, res) => {
    try {
      const [rows] = await db.promise().query(`
        SELECT al.*, s.kode_slot FROM access_logs al
        LEFT JOIN slots s ON s.id = al.slot_id
        WHERE al.user_id = ? ORDER BY al.created_at DESC
      `, [req.user.id]);
      res.json({ riwayat: rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // RIWAYAT semua (petugas)
  router.get('/riwayat/semua', authRequired, petugasOnly, async (req, res) => {
    try {
      const [rows] = await db.promise().query(`
        SELECT al.*, s.kode_slot, u.nama, u.nim_nip FROM access_logs al
        LEFT JOIN slots s ON s.id = al.slot_id
        JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC LIMIT 200
      `);
      res.json({ riwayat: rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};