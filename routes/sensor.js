const express = require('express');
const db = require('../db');

// Endpoint ini dipanggil oleh perangkat ESP8266, BUKAN oleh browser.
// Autentikasi memakai API key sederhana di header 'x-device-key' (bukan JWT user).
const DEVICE_KEY = process.env.DEVICE_KEY || 'esp8266-smartparking-key';
const AMBANG_BATAS_CM = 15; // jarak < 15cm dianggap ada kendaraan

module.exports = function (io) {
  const router = express.Router();

  // Dipanggil ESP8266 setiap sensor membaca jarak
  // Body JSON: { "device_id": "ESP8266-A1", "jarak_cm": 12.4 }
  router.post('/update', (req, res) => {
    const key = req.headers['x-device-key'];
    if (key !== DEVICE_KEY) return res.status(401).json({ error: 'Device key tidak valid' });

    const { device_id, jarak_cm } = req.body;
    if (!device_id || jarak_cm === undefined) {
      return res.status(400).json({ error: 'device_id dan jarak_cm wajib diisi' });
    }

    const slot = db.prepare('SELECT * FROM slots WHERE device_id = ?').get(device_id);
    if (!slot) return res.status(404).json({ error: `Slot dengan device_id ${device_id} tidak ditemukan` });

    // Jika slot sedang di-booking, jangan langsung ditimpa jadi 'terisi' oleh sensor kosong,
    // tapi tetap update jarak_cm untuk pemantauan.
    let statusBaru = slot.status;
    if (slot.status !== 'maintenance') {
      const terdeteksi = Number(jarak_cm) < AMBANG_BATAS_CM;
      if (terdeteksi) statusBaru = 'terisi';
      else if (slot.status === 'terisi') statusBaru = 'kosong'; // hanya turunkan dari terisi->kosong via sensor
    }

    db.prepare('UPDATE slots SET jarak_cm = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(jarak_cm, statusBaru, slot.id);

    const updated = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot.id);
    io.emit('slot_update', updated); // broadcast realtime ke semua client dashboard

    res.json({ ok: true, slot: updated });
  });

  return router;
};

module.exports.AMBANG_BATAS_CM = AMBANG_BATAS_CM;
