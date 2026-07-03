const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'db', 'parking.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  nim_nip TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'mahasiswa', -- mahasiswa | petugas
  plat_nomor TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  lokasi TEXT
);

CREATE TABLE IF NOT EXISTS slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id INTEGER NOT NULL,
  kode_slot TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'kosong', -- kosong | terisi | booked | maintenance
  jarak_cm REAL DEFAULT 400,
  device_id TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (zone_id) REFERENCES zones(id)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slot_id INTEGER NOT NULL,
  mulai TEXT NOT NULL,
  selesai TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aktif', -- aktif | selesai | dibatalkan | expired
  qr_token TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slot_id INTEGER,
  booking_id INTEGER,
  plat_nomor TEXT,
  waktu_masuk TEXT,
  waktu_keluar TEXT,
  durasi_menit INTEGER,
  gerbang TEXT, -- masuk | keluar
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  judul TEXT NOT NULL,
  pesan TEXT NOT NULL,
  tipe TEXT DEFAULT 'info', -- info | warning | danger
  dibaca INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// Seed awal jika kosong
const countUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
if (countUsers === 0) {
  const hash = (pw) => bcrypt.hashSync(pw, 8);

  db.prepare(`INSERT INTO users (nama, nim_nip, email, password, role, plat_nomor) VALUES (?,?,?,?,?,?)`)
    .run('Admin Parkir', 'PET001', 'admin@kampus.ac.id', hash('admin123'), 'petugas', '-');

  db.prepare(`INSERT INTO users (nama, nim_nip, email, password, role, plat_nomor) VALUES (?,?,?,?,?,?)`)
    .run('Budi Santoso', '2141720001', 'budi@mhs.kampus.ac.id', hash('mhs123'), 'mahasiswa', 'AG 1234 XYZ');

  const zoneNames = [
    ['Zona A', 'Gedung Rektorat'],
    ['Zona B', 'Fakultas Teknik'],
    ['Zona C', 'Perpustakaan'],
  ];
  const insZone = db.prepare('INSERT INTO zones (nama, lokasi) VALUES (?,?)');
  const zoneIds = zoneNames.map(z => insZone.run(z[0], z[1]).lastInsertRowid);

  const insSlot = db.prepare('INSERT INTO slots (zone_id, kode_slot, status, jarak_cm, device_id) VALUES (?,?,?,?,?)');
  zoneIds.forEach((zid, zi) => {
    const zoneLetter = zoneNames[zi][0].split(' ')[1];
    for (let i = 1; i <= 8; i++) {
      const status = Math.random() > 0.6 ? 'terisi' : 'kosong';
      const jarak = status === 'terisi' ? (10 + Math.random() * 20) : (150 + Math.random() * 100);
      insSlot.run(zid, `${zoneLetter}${String(i).padStart(2, '0')}`, status, jarak, `ESP8266-${zoneLetter}${i}`);
    }
  });

  console.log('Database di-seed dengan data awal.');
  console.log('Login petugas -> email: admin@kampus.ac.id / password: admin123');
  console.log('Login mahasiswa -> email: budi@mhs.kampus.ac.id / password: mhs123');
}

module.exports = db;
