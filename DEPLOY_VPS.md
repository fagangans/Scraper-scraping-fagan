# Deploy ke VPS (Ubuntu/Debian)

## 1. Prasyarat sistem
Puppeteer perlu Chrome + library sistem. Tanpa ini, pencarian akan gagal
dengan error "Chrome gagal dijalankan karena library sistem belum lengkap".

```bash
sudo apt-get update
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libpangocairo-1.0-0 libcairo2 fonts-liberation xvfb
```

Paket `xvfb` (virtual display) opsional tapi direkomendasikan — kalau ada,
scraper otomatis menjalankan Chrome dalam mode non-headless di dalam
display virtual (lebih sulit dideteksi sebagai bot dibanding mode headless
biasa). Kalau `xvfb` tidak diinstal, scraper tetap jalan pakai mode
headless standar, cuma sedikit lebih mudah terdeteksi.

Pastikan Node.js versi 18+ terinstal (`node -v`).

## 2. Clone & install
```bash
git clone <repo-url>
cd Scraper-scraping-fagan
git checkout backup   # branch yang dipakai untuk deploy
npm install
```

`npm install` akan mengunduh Chromium bawaan Puppeteer (~200MB). Jika VPS
punya akses internet terbatas/lambat, proses ini bisa lama — tunggu sampai
selesai, jangan di-Ctrl+C.

Kalau download Chromium bawaan gagal terus, alternatif: install Google
Chrome sistem (`google-chrome-stable`) lalu set env:
```bash
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

## 3. Jalankan
```bash
PORT=3000 npm run start:web
```

Untuk produksi, jalankan dengan process manager supaya tetap hidup dan
auto-restart kalau crash:
```bash
npm install -g pm2
pm2 start "npm run start:web" --name mapsbiz-scraper
pm2 save
pm2 startup
```

## 4. Cek log kalau pencarian gagal
Error sekarang menampilkan alasan spesifik (bukan pesan generik), contoh:
- "library sistem belum lengkap" → jalankan ulang langkah 1.
- "melebihi batas waktu 60 detik" → server/koneksi VPS lambat, atau IP VPS
  sudah kena rate-limit Google — tunggu beberapa menit.
- "Google meminta verifikasi JavaScript (enablejs)" pada kedua mode →
  IP VPS kemungkinan diblokir sementara oleh Google, coba lagi nanti atau
  gunakan IP/proxy residensial.

Jalankan dengan `DEBUG_GMAPS=1 npm run start:web` untuk menyimpan HTML
mentah hasil scraping ke file, berguna untuk diagnosa lebih lanjut.
