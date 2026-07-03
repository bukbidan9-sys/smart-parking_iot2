# Smart Parking Kampus Berbasis IoT

Sistem parkir pintar kampus menggunakan sensor ultrasonic (HC-SR04 + ESP8266) untuk
monitoring slot realtime, dan QR Code untuk akses masuk/keluar otomatis.

## Fitur

1. **Login & Registrasi** — mahasiswa & petugas, akun kampus
2. **Monitoring Slot Parkir Realtime** — via WebSocket (Socket.IO), didorong oleh sensor ultrasonic
3. **QR Code Access** — akses masuk/keluar via QR
4. **Booking Slot Parkir** — reservasi sebelum datang
5. **Notifikasi Otomatis** — parkiran penuh / booking hampir habis
6. **Riwayat Parkir** — histori masuk, keluar, durasi
7. **Dashboard Admin** — kelola slot, pengguna, kondisi parkir
8. **Portal Otomatis** — animasi gerbang terbuka setelah QR valid
9. **Peta Area Parkir** — visualisasi slot per zona
10. **Laporan & Statistik** — grafik harian, bulanan, okupansi per zona

## Teknologi

- **Backend**: Node.js, Express 5, Socket.IO, `node:sqlite` (bawaan Node, tanpa kompilasi native)
- **Autentikasi**: JWT + cookie httpOnly, password di-hash dengan bcrypt
- **Frontend**: HTML/CSS/JS vanilla (tanpa framework berat), Chart.js untuk grafik
- **IoT**: ESP8266 + sensor ultrasonic HC-SR04, kirim data via HTTP POST

## Menjalankan Proyek

Prasyarat: Node.js versi 22+ (karena memakai modul bawaan `node:sqlite`).

```bash
npm install
cp .env.example .env
node server.js
```

Buka `http://localhost:3000` di browser.

### Akun demo (dibuat otomatis saat pertama kali jalan)

| Peran     | Email                       | Password |
|-----------|------------------------------|----------|
| Mahasiswa | budi@mhs.kampus.ac.id         | mhs123   |
| Petugas   | admin@kampus.ac.id            | admin123 |

### Mode simulasi sensor

Karena hardware fisik belum tentu terpasang saat development, server secara default
mensimulasikan pembacaan sensor ultrasonic secara acak tiap 6 detik
(`SIMULATE_SENSORS=true` di `.env`). Matikan (`false`) saat sudah menyambungkan
ESP8266 sungguhan supaya data tidak bentrok.

## Menghubungkan Sensor ESP8266 Asli

Firmware contoh ada di folder `esp8266-firmware/sensor_slot_parkir.ino`.

1. Install Arduino IDE + board package **ESP8266 (esp8266 by ESP8266 Community)**.
2. Rangkai HC-SR04 ke ESP8266 sesuai komentar wiring di file `.ino`.
   **Penting**: pin ECHO HC-SR04 keluaran 5V, sedangkan ESP8266 hanya tahan 3.3V.
   Gunakan voltage divider resistor (misal 1kΩ + 2kΩ) di jalur ECHO agar tidak merusak GPIO.
3. Ubah `WIFI_SSID`, `WIFI_PASSWORD`, `SERVER_URL`, dan `DEVICE_ID` di kode.
   `DEVICE_ID` harus sama persis dengan kolom `device_id` pada tabel `slots`
   (lihat data awal di `db.js`, contoh: `ESP8266-A1`, `ESP8266-B3`, dst — atau
   ubah lewat query SQL langsung ke `db/parking.db`).
4. Upload ke board, buka Serial Monitor (115200 baud) untuk memantau pengiriman data.
5. Set `SIMULATE_SENSORS=false` di `.env` server, lalu restart server.

Server akan menerima data di endpoint:
```
POST /api/sensor/update
Header: x-device-key: <DEVICE_KEY dari .env>
Body JSON: { "device_id": "ESP8266-A1", "jarak_cm": 12.4 }
```
Ambang batas default: jarak **< 15 cm** dianggap ada kendaraan (slot **terisi**),
bisa diubah di `routes/sensor.js` (`AMBANG_BATAS_CM`).

### Portal / gerbang otomatis (opsional, tahap lanjut)

Endpoint `/api/access/scan` sudah memancarkan event Socket.IO `gate_open` setiap
QR valid dipindai. Untuk motor servo/portal fisik, tambahkan ESP8266/ESP32 kedua
yang terhubung ke server (misalnya lewat WebSocket client atau polling endpoint
baru) untuk menggerakkan servo saat menerima sinyal ini. Bagian ini belum
diimplementasikan sebagai firmware karena bergantung pada jenis motor/portal
yang dipakai kampus Anda — beri tahu saya jika ingin dibuatkan juga.

## Struktur Folder

```
smart-parking/
├── server.js              # entry point, setup Express + Socket.IO
├── db.js                  # setup & seed database SQLite
├── middleware/auth.js      # JWT auth middleware
├── routes/
│   ├── auth.js             # login, registrasi
│   ├── slots.js             # data & update status slot
│   ├── sensor.js            # endpoint khusus ESP8266
│   ├── booking.js           # booking slot
│   ├── access.js            # QR generate, scan, riwayat
│   ├── notifications.js     # notifikasi otomatis
│   └── admin.js              # dashboard admin, kelola user, laporan
├── public/                 # frontend (HTML/CSS/JS vanilla)
├── esp8266-firmware/        # firmware sensor ultrasonic
└── db/parking.db            # database (dibuat otomatis, jangan commit ke git)
```

## Catatan untuk Laporan/Presentasi Tugas

- Database memakai `node:sqlite`, modul bawaan Node.js (tidak perlu instalasi driver
  tambahan/kompilasi native) — cocok untuk demo tanpa masalah dependency.
- Realtime memakai WebSocket (Socket.IO), bukan polling — dashboard update otomatis
  begitu status sensor berubah, tanpa refresh halaman.
- QR Code dibuat server-side dengan library `qrcode`, berisi token unik per booking
  atau identitas pengguna untuk akses umum.
