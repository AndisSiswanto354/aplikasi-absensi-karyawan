# 📋 DOKUMEN HANDOVER PROYEK: APLIKASI ABSENSI KARYAWAN
> **Catatan untuk AI / Pengembang yang Melanjutkan (Claude):**
> Dokumen ini berisi ringkasan lengkap status proyek, lokasi folder lokal, repositori, database cloud, konfigurasi deployment, serta daftar tugas yang sudah selesai dan yang dapat dilanjutkan.

---

## 📂 1. Lokasi Folder & Repositori Proyek

* **Folder Lokal di Komputer (Windows):**
  `C:\Users\ASUS OLED\.gemini\antigravity\scratch\aplikasi-absensi-karyawan`
* **Repositori GitHub:**
  [https://github.com/AndisSiswanto354/aplikasi-absensi-karyawan](https://github.com/AndisSiswanto354/aplikasi-absensi-karyawan) *(branch: `main`, sudah up-to-date)*
* **URL Live Production (Aktif 24 Jam):**
  * Portal Absensi Karyawan & Admin: **https://absensi-karyawan.andisnet354.workers.dev**
  * Layar Kiosk QR Display (Lobi): **https://absensi-karyawan.andisnet354.workers.dev/qr-display**
* **Database Supabase Cloud (PostgreSQL):**
  * Dashboard: `https://supabase.com/dashboard/project/tsqnwwkicbvrqvayukno`
  * Project Name: `absensi-karyawan` (Region: Tokyo AWS `ap-northeast-1`)

---

## 🛠️ 2. Arsitektur & Teknologi Terkini

| Lapisan | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Edge Compute / Hosting** | **Cloudflare Workers** | Menjalankan `worker.js` (Hono framework) pada jaringan edge V8 Isolates global 24/7. |
| **Static Assets (CDN)** | **Cloudflare Workers Static Assets** | Menyajikan seluruh berkas dari direktori `./public` (`index.html`, `qr-display.html`, CSS, JS) via Cloudflare CDN. |
| **Database Cloud** | **Supabase Managed PostgreSQL 17** | Terhubung via driver `@neondatabase/serverless` (WebSocket-based PG) & `pg.Pool`. |
| **Database Lokal Fallback** | **SQLite3 (`better-sqlite3`)** | Tersimpan di `./data/absensi.db` untuk keperluan development offline. |
| **UI/UX & Ikon** | **100% Lucide SVG Icons** | Kebijakan *Zero Emoji*: Seluruh emoji unicode telah diganti dengan SVG resmi Lucide. Menggunakan font Google **Plus Jakarta Sans** & Tailwind CSS. |
| **Keamanan** | **Helmet & Strict Rate Limiting** | Proteksi CSP, HSTS, XSS, rate limiting 15 attempts / 15 min pada endpoint login. Token sesi berbasis **HMAC-SHA256 Signed Cookie**. |

---

## 🗄️ 3. Konfigurasi Kunci & Lingkungan

### A. Berkas `.env` (Lokal)
```ini
DATABASE_URL=postgresql://postgres.tsqnwwkicbvrqvayukno:Andisnet354313%21@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
PORT=3050
NODE_ENV=production
SESSION_SECRET=absensi-karyawan-super-secret-key-2026-enterprise
```

### B. Berkas `wrangler.toml` (Cloudflare Workers)
```toml
name = "absensi-karyawan"
main = "worker.js"
compatibility_date = "2024-10-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./public"
binding = "ASSETS"

[vars]
NODE_ENV = "production"
DATABASE_URL = "postgresql://postgres.tsqnwwkicbvrqvayukno:Andisnet354313%21@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
SESSION_SECRET = "absensi-karyawan-super-secret-key-2026-enterprise"
```

---

## 🔑 4. Akun Login Default Pengujian

* **Administrator**: `admin@perusahaan.com` / `admin123`
* **Karyawan 1**: `budi@perusahaan.com` / `karyawan123`
* **Karyawan 2**: `siti@perusahaan.com` / `karyawan123`

---

## ✅ 5. Yang Sudah Selesai 100%

1. **Fase 1 (UI/UX Zero Emoji)**: 0 Karakter emoji mentah tersisa, font Plus Jakarta Sans terintegrasi, seluruh icon memakai `<i data-lucide="...">`.
2. **Fase 2 (Migrasi Supabase)**: Seluruh 10 tabel (`departments`, `shifts`, `office_locations`, `users`, `attendances`, `leaves`, `overtimes`, `settings`, `notifications_log`, `activity_logs`) dan 100% data transaksi dari SQLite telah termigrasi utuh ke Supabase PostgreSQL.
3. **Fase 4 (Pengerasan Keamanan)**: Helmet headers, rate limiting anti brute force, anti GPS spoofing (Haversine validation).
4. **Fase 5 (Cloudflare Workers Live Deployment)**: Website sudah live 24/7 di domain `https://absensi-karyawan.andisnet354.workers.dev` tanpa perlu server lokal menyala.
5. **Multi-Cabang Geofencing**: Pengaturan multi-kantor, coordinate picker, dan auto-deteksi kantor terdekat aktif di frontend dan backend.

---

## 🎯 6. Tugas Lanjutan yang Bisa Dilanjutkan (Next Steps)

1. **Fase 3: Cloud Object Storage untuk Upload Berkas**:
   - Saat ini file upload (foto avatar & surat keterangan dokter/cuti) masih diarahkan ke folder lokal `./public/uploads/`.
   - **Tugas**: Integrasikan upload file langsung ke **Supabase Storage Bucket** (`absensi-avatars` dan `absensi-documents`) agar berkas foto tidak hilang pada environment serverless Cloudflare Workers.
2. **PWA (Progressive Web App)**:
   - Tambahkan `manifest.json` dan Service Worker agar karyawan bisa meng-install web absensi ini langsung ke layar utama HP Android/iOS layaknya aplikasi native (*Add to Home Screen*).
3. **Integrasi Notifikasi WhatsApp Gateway / Telegram Bot**:
   - Modul `notification.js` sudah memiliki kerangka kirim pesan WhatsApp & Telegram, tinggal dihubungkan ke token bot atau gateway aktif.

---

## 💻 7. Perintah-Perintah Berguna di Terminal

* **Deploy ulang perubahan ke Cloudflare Workers:**
  ```bash
  npx wrangler deploy
  ```
* **Jalankan pengujian otomatis lokal:**
  ```bash
  node test-features.js
  ```
* **Jalankan server Node.js lokal:**
  ```bash
  node server.js
  ```
* **Kirim perubahan ke GitHub:**
  ```bash
  git add .
  git commit -m "Deskripsi perubahan"
  git push origin main
  ```
