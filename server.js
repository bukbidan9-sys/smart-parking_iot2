require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const path = require('path');

const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ROUTES
app.use('/api/auth', require('./routes/auth'));
app.use('/api/slots', require('./routes/slots')(io));
app.use('/api/booking', require('./routes/booking')(io));
app.use('/api/access', require('./routes/access')(io));
app.use('/api/sensor', require('./routes/sensor')(io)); // endpoint khusus ESP8266
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));

app.get('/health', (req, res) => res.json({ ok: true, waktu: new Date().toISOString() }));

// Fallback SPA-ish routing untuk halaman statis
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.method !== 'GET') return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
    if (err) next();
  });
});

io.on('connection', (socket) => {
  console.log('Client tersambung:', socket.id);
  socket.on('disconnect', () => console.log('Client terputus:', socket.id));
});

// ============================================================
// SIMULATOR SENSOR ULTRASONIC (untuk demo tanpa hardware fisik)
// Di dunia nyata, bagian ini digantikan oleh ESP8266 yang memanggil
// POST /api/sensor/update setiap sensor HC-SR04 membaca jarak.
// Aktifkan/nonaktifkan lewat env SIMULATE_SENSORS=true/false
// ============================================================
if ((process.env.SIMULATE_SENSORS || 'true') === 'true') {
  setInterval(() => {
    const slots = db.prepare("SELECT * FROM slots WHERE status IN ('kosong','terisi')").all();
    if (slots.length === 0) return;
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const jadiTerisi = Math.random() > 0.5;
    const jarak = jadiTerisi ? (5 + Math.random() * 10) : (150 + Math.random() * 150);
    const statusBaru = jarak < 15 ? 'terisi' : 'kosong';

    db.prepare("UPDATE slots SET jarak_cm = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(jarak, statusBaru, slot.id);

    const updated = db.prepare('SELECT * FROM slots WHERE id = ?').get(slot.id);
    io.emit('slot_update', updated);

    const kosong = db.prepare("SELECT COUNT(*) c FROM slots WHERE status = 'kosong'").get().c;
    if (kosong === 0) {
      io.emit('notification', { judul: 'Parkiran Penuh', pesan: 'Seluruh slot parkir kampus penuh saat ini.', tipe: 'danger' });
    } else if (kosong <= 3) {
      io.emit('notification', { judul: 'Slot Hampir Penuh', pesan: `Tersisa ${kosong} slot kosong di seluruh area kampus.`, tipe: 'warning' });
    }
  }, 6000);
}

// Cek booking yang hampir habis waktunya, tiap 1 menit
setInterval(() => {
  const rows = db.prepare(`
    SELECT b.*, u.id as uid FROM bookings b JOIN users u ON u.id = b.user_id
    WHERE b.status = 'aktif' AND b.selesai <= datetime('now', '+10 minutes') AND b.selesai > datetime('now')
  `).all();
  rows.forEach((b) => {
    const already = db.prepare(`
      SELECT id FROM notifications WHERE user_id = ? AND judul = 'Booking Hampir Habis' AND created_at >= datetime('now','-15 minutes')
    `).get(b.uid);
    if (!already) {
      db.prepare(`INSERT INTO notifications (user_id, judul, pesan, tipe) VALUES (?,?,?,?)`).run(
        b.uid, 'Booking Hampir Habis', 'Waktu booking slot parkir Anda akan berakhir dalam 10 menit.', 'warning'
      );
      io.to(String(b.uid)).emit('notification', { judul: 'Booking Hampir Habis', pesan: 'Waktu booking Anda hampir habis.', tipe: 'warning' });
    }
  });

  // Expire booking yang lewat waktu
  db.prepare(`
    UPDATE bookings SET status = 'expired'
    WHERE status = 'aktif' AND selesai < datetime('now')
  `).run();
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Smart Parking Kampus server berjalan di http://localhost:${PORT}`);
});
