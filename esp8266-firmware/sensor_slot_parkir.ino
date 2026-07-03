/*
  Smart Parking Kampus — Firmware ESP8266 + Sensor Ultrasonic HC-SR04
  ----------------------------------------------------------------
  Perangkat ini membaca jarak dari sensor HC-SR04, lalu mengirim data
  ke server backend (Node.js/Express) lewat HTTP POST setiap beberapa detik.

  WIRING (ESP8266 NodeMCU):
    HC-SR04 VCC  -> 5V (VU / VIN)
    HC-SR04 GND  -> GND
    HC-SR04 TRIG -> D5 (GPIO14)
    HC-SR04 ECHO -> D6 (GPIO12)  -- gunakan voltage divider (1k+2k) karena ECHO 5V, ESP8266 3.3V!

  LIBRARY YANG DIPERLUKAN (install lewat Arduino Library Manager):
    - ESP8266WiFi (bawaan board ESP8266)
    - ESP8266HTTPClient (bawaan board ESP8266)

  Board Manager: "NodeMCU 1.0 (ESP-12E Module)" atau sesuai board Anda.
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// ================= KONFIGURASI =================
const char* WIFI_SSID     = "NAMA_WIFI_ANDA";
const char* WIFI_PASSWORD = "PASSWORD_WIFI_ANDA";

// Ganti dengan alamat IP/domain server backend Anda
// Contoh lokal: "http://192.168.1.10:3000"
const char* SERVER_URL   = "http://192.168.1.10:3000/api/sensor/update";
const char* DEVICE_KEY   = "esp8266-smartparking-key"; // harus sama dengan DEVICE_KEY di server (.env)
const char* DEVICE_ID    = "ESP8266-A1"; // HARUS SAMA PERSIS dengan device_id slot di database (lihat db.js)

const int PIN_TRIG = D5;
const int PIN_ECHO = D6;

const unsigned long INTERVAL_MS = 3000; // kirim data tiap 3 detik
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Menghubungkan ke WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Terhubung! IP ESP8266: ");
  Serial.println(WiFi.localIP());
}

// Membaca jarak dalam cm menggunakan sensor ultrasonic HC-SR04
float bacaJarakCM() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long durasi = pulseIn(PIN_ECHO, HIGH, 30000); // timeout 30ms (~5m)
  if (durasi == 0) return 400.0; // tidak ada pantulan -> anggap kosong/jauh

  float jarak = durasi * 0.0343 / 2.0; // konversi ke cm
  return jarak;
}

void kirimDataKeServer(float jarakCM) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi terputus, skip pengiriman.");
    return;
  }

  WiFiClient client;
  HTTPClient http;

  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);

  String body = String("{\"device_id\":\"") + DEVICE_ID +
                "\",\"jarak_cm\":" + String(jarakCM, 1) + "}";

  int httpCode = http.POST(body);

  if (httpCode > 0) {
    String resp = http.getString();
    Serial.printf("[%s] jarak=%.1fcm -> HTTP %d: %s\n", DEVICE_ID, jarakCM, httpCode, resp.c_str());
  } else {
    Serial.printf("Gagal kirim data: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

void loop() {
  unsigned long now = millis();
  if (now - lastSend >= INTERVAL_MS) {
    lastSend = now;
    float jarak = bacaJarakCM();
    kirimDataKeServer(jarak);
  }
}
