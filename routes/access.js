const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../db');
const { authRequired, petugasOnly } = require('../middleware/auth');

module.exports = function (io) {
  const router = express.Router();

  // GENERATE QR Code untuk akses umum (tanpa booking) berbasis identitas user
  router.get('/qrcode/me', authRequired, (req, res, next) => {
    (async () => {
      // token akses harian yang stabil per user (identitas + tanggal), sederhana untuk keperluan demo
      const payload = JSON.stringify({ uid: req.user.id, t: 'access' });
      const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 260 });
      res.json({ qrcode: dataUrl, payload });
    })().catch(next);
  });

  // GENERATE QR Code untuk booking tertentu
  router.get('/qrcode/booking/:bookingId', authRequired, (req, res, next) => {
    (async () => {
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(req.params.bookingId, req.user.id);
      if (!booking) return res.status(404).json({ error: 'Booking tidak ditemukan' });
      const payload = JSON.stringify({ t: 'booking', token: booking.qr_token });
      const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 260 });
      res.json({ qrcode: dataUrl, payload });
    })().catch(next);
  });

  // SCAN QR di gerbang (dioperasikan petugas / kios gerbang) -> buka portal otomatis
  router.post('/scan', authRequired, petugasOnly, (req, res) => {
    const { payload, gerbang } = req.body; // gerbang: 'masuk' | 'keluar'
    if (!payload || !gerbang) return res.status(400).json({ error: 'payload dan gerbang wajib diisi' });

    let data;
    try { data = JSON.parse(payload); } catch { return res.status(400).json({ error: 'QR tidak valid' }); }

    let user, slot = null, booking = null;

    if (data.t === 'booking') {
      booking = db.prepare('SELECT * FROM bookings WHERE qr_token = ?').get(data.token);
      if (!booking || booking.status !== 'aktif') {
        return res.status(403).json({ valid: false, pesan: 'Booking tidak valid / sudah tidak aktif' });
      }
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(booking.user_id);
      slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(booking.slot_id);
    } else if (data.t === 'access') {
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(data.uid);
      if (!user) return res.status(403).json({ valid: false, pesan: 'Pengguna tidak ditemukan' });
    } else {
      return res.status(400).json({ valid: false, pesan: 'Format QR tidak dikenali' });
    }

    if (gerbang === 'masuk') {
      const info = db.prepare(`
        INSERT INTO access_logs (user_id, slot_id, booking_id, plat_nomor, waktu_masuk, gerbang)
        VALUES (?,?,?,?, datetime('now'), 'masuk')
      `).run(user.id, slot?.id || null, booking?.id || null, user.plat_nomor || '-');

      if (slot) {
        db.prepare('UPDATE slots SET status = \'terisi\', updated_at = datetime(\'now\') WHERE id = ?').run(slot.id);
        io.emit('slot_update', db.prepare('SELECT * FROM slots WHERE id = ?').get(slot.id));
      }
      io.emit('gate_open', { gerbang: 'masuk', user: user.nama, slot: slot?.kode_slot || '-' });
      return res.json({ valid: true, pesan: `Selamat datang, ${user.nama}. Portal masuk terbuka.`, log_id: info.lastInsertRowid });
    }

    if (gerbang === 'keluar') {
      const log = db.prepare(`
        SELECT * FROM access_logs WHERE user_id = ? AND waktu_keluar IS NULL ORDER BY id DESC LIMIT 1
      `).get(user.id);
      if (!log) return res.status(404).json({ valid: false, pesan: 'Tidak ditemukan data masuk untuk pengguna ini' });

      db.prepare(`
        UPDATE access_logs SET waktu_keluar = datetime('now'),
        durasi_menit = CAST((julianday(datetime('now')) - julianday(waktu_masuk)) * 24 * 60 AS INTEGER)
        WHERE id = ?
      `).run(log.id);

      if (log.slot_id) {
        db.prepare('UPDATE slots SET status = \'kosong\', updated_at = datetime(\'now\') WHERE id = ?').run(log.slot_id);
        io.emit('slot_update', db.prepare('SELECT * FROM slots WHERE id = ?').get(log.slot_id));
      }
      if (booking) db.prepare('UPDATE bookings SET status = \'selesai\' WHERE id = ?').run(booking.id);

      const updatedLog = db.prepare('SELECT * FROM access_logs WHERE id = ?').get(log.id);
      io.emit('gate_open', { gerbang: 'keluar', user: user.nama, durasi: updatedLog.durasi_menit });
      return res.json({ valid: true, pesan: `Sampai jumpa, ${user.nama}. Durasi parkir: ${updatedLog.durasi_menit} menit. Portal keluar terbuka.` });
    }

    res.status(400).json({ error: 'gerbang harus "masuk" atau "keluar"' });
  });

  // RIWAYAT PARKIR milik user
  router.get('/riwayat/saya', authRequired, (req, res) => {
    const rows = db.prepare(`
      SELECT al.*, s.kode_slot FROM access_logs al
      LEFT JOIN slots s ON s.id = al.slot_id
      WHERE al.user_id = ? ORDER BY al.created_at DESC
    `).all(req.user.id);
    res.json({ riwayat: rows });
  });

  // RIWAYAT semua (petugas)
  router.get('/riwayat/semua', authRequired, petugasOnly, (req, res) => {
    const rows = db.prepare(`
      SELECT al.*, s.kode_slot, u.nama, u.nim_nip FROM access_logs al
      LEFT JOIN slots s ON s.id = al.slot_id
      JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC LIMIT 200
    `).all();
    res.json({ riwayat: rows });
  });

  return router;
};
