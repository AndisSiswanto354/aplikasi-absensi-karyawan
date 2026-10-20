---
title: Aplikasi Absensi Karyawan
emoji: 🏢
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# 📱 Aplikasi Absensi Karyawan Modern (Sistem Presensi Berbasis QR Code & GPS Geofencing)

Aplikasi manajemen absensi dan kehadiran karyawan berbasis web modern, responsif, dan siap produksi. Dilengkapi dengan pemindaian QR Code (kamera smartphone/webcam), validasi koordinat GPS geofencing radius kantor, kalkulasi toleransi keterlambatan, shift kerja, pengajuan cuti/izin/sakit dengan lampiran dokumen, manajemen lembur, ekspor laporan Excel (.xlsx) & CSV, cetak resmi, backup/restore database SQL, notifikasi WhatsApp/Telegram, dan jejak audit aktivitas (activity logs).

---

## 🌟 Fitur Utama Lengkap

### 1. 🔐 Autentikasi & Hak Akses
- **Login Dua Peran**: Akses khusus untuk **Administrator** dan **Karyawan**.
- **Session Management**: Menggunakan `express-session` dengan masa aktif sesi 7 hari dan cookie aman.
- **Proteksi Rute**: Middleware `requireAuth` dan `requireAdmin` mencegah akses ilegal serta redirect otomatis.
- **Pengaturan Profil Mandiri**: Karyawan dapat mengubah profil dan kata sandi mandiri.

### 2. 👥 Manajemen Data Karyawan
- **CRUD Karyawan Lengkap**: Tambah, edit, dan hapus karyawan dengan proteksi duplikasi NIP dan email.
- **Pengelolaan Jabatan / Departemen**: Master departemen dengan jumlah karyawan per divisi.
- **Upload Foto Profil**: Mendukung upload avatar foto karyawan via Multer.
- **Pencarian & Filter Cepat**: Filter berdasarkan status (Aktif/Nonaktif), departemen, nama, NIP, atau email.

### 3. 📸 Absensi Karyawan (QR Code & GPS Geofencing)
- **Scan QR Code Masuk & Pulang**: Terintegrasi kamera perangkat menggunakan pustaka HTML5 QR Code Scanner.
- **Validasi Geofencing GPS**: Menghitung jarak presisi ke kantor dengan formula **Haversine**. Jika karyawan berada di luar radius kantor (contoh: > 100 meter), absensi otomatis ditolak.
- **Peta Interaktif Leaflet**: Visualisasi lingkaran batas radius kantor dan pin posisi karyawan secara live.
- **Toleransi Keterlambatan**: Otomatis membandingkan jam masuk dengan jam shift + toleransi keterlambatan (contoh: 15 menit). Melebihi batas toleransi akan tercatat berstatus **"Terlambat"** beserta durasi menit keterlambatan.
- **Riwayat Absensi**: Catatan jam masuk, jam pulang, total durasi kerja, jarak meter ke kantor, dan catatan kehadiran.

### 4. 📅 Jadwal Kerja & Shift
- **Master Shift Kerja**: Pengaturan shift fleksibel (contoh: Shift Reguler 08:00-17:00, Shift Pagi, Shift Siang, Shift Malam) dengan toleransi masing-masing.
- **Penetapan Shift Karyawan**: Penugasan shift per individu karyawan.
- **Pengajuan Cuti, Izin & Sakit**: Formulir permohonan dengan upload dokumen/surat dokter pendukung.
- **Alur Persetujuan (Approval Workflow)**: Admin dapat menyetujui atau menolak permohonan dengan catatan resmi. Saat disetujui, tanggal cuti otomatis tercatat pada rekap kehadiran!

### 5. 📊 Laporan Absensi & Ekspor Data
- **Rekapitulasi Harian & Bulanan**: Filter rentang tanggal, departemen, dan karyawan.
- **Metrik Kartu Ringkasan**: Total Hadir, Tepat Waktu, Terlambat, Izin, Sakit, Cuti, dan Alpha.
- **Grafik Interaktif Chart.js**: Distribusi kehadiran (Doughnut Chart) dan tren kehadiran harian 7 hari terakhir (Bar Chart).
- **Ekspor Excel (.xlsx)**: File Excel resmi ber-header, berkop, berwarna, dan bergaris border rapi menggunakan `exceljs`.
- **Ekspor CSV**: Format standar untuk olah data spreadsheet.
- **Mode Cetak / Print PDF**: Format kop surat resmi instansi lengkap dengan kolom tanda tangan Direktur Utama & Manajer HRD.

### 6. ⚡ Manajemen Lembur (Overtime)
- **Pengajuan Jam Lembur**: Karyawan mengajukan tanggal, jam mulai, jam selesai, kalkulasi otomatis jam, dan uraian tugas.
- **Persetujuan Manajemen**: Admin memverifikasi, menyetujui, atau menolak permohonan lembur.
- **Rekapitulasi Lembur**: Total jam lembur per bulan per karyawan.

### 7. ⚙️ Pengaturan Sistem & Kiosk Display
- **Konfigurasi Kantor**: Pengaturan nama perusahaan, alamat, telepon, email, jam kerja standar.
- **Peta Penentuan Titik GPS**: Admin cukup mengklik peta atau menggeser pin lokasi kantor dan menentukan radius meter dengan slider interaktif.
- **QR Code Absensi Global**: Pembuatan token QR kantor, opsi buat ulang (*regenerate*), dan unduh gambar QR.
- **Layar Kiosk Kantor (`/qr-display`)**: Halaman khusus layar penuh (*fullscreen*) untuk tablet atau TV lobi kantor dengan jam digital live, tanggal bahasa Indonesia, dan QR Code besar yang diperbarui secara otomatis.
- **Upload Logo Perusahaan**: Mengubah logo perusahaan yang langsung diterapkan pada header, halaman login, dan cetak laporan.

### 8. 💾 Backup & Restore Database
- **Backup Manual**: Satu tombol untuk mengunduh dump database SQL (`backup_absensi_YYYY-MM-DD.sql`) lengkap dengan struktur DDL dan seluruh isi data tabel.
- **Restore Database**: Unggah file `.sql` untuk memulihkan seluruh data transaksi secara aman di dalam database SQLite.

### 9. 🔔 Notifikasi WhatsApp & Telegram
- **Integrasi WhatsApp**: Dukungan URL gateway dan API Token (Fonnte/Wablas/Generic API).
- **Integrasi Telegram Bot**: Kirim peringatan otomatis keterlambatan dan notifikasi pengajuan cuti/lembur baru ke grup HRD.
- **Uji Coba Pengiriman**: Fitur simulator tes kirim pesan langsung dari dashboard.
- **Log Riwayat Pengiriman**: Pemantauan status berhasil/gagal pengiriman pesan.

### 10. 📜 Log Aktivitas (Audit Trail)
- **Rekam Jejak Sistem**: Mencatat setiap login, logout, absensi masuk/pulang, CRUD karyawan, perubahan konfigurasi, persetujuan lembur/cuti, dan aksi backup.
- **Filter Log**: Pencarian teks, filter per kategori (AUTH, ABSENSI, KARYAWAN, CUTI, LEMBUR, PENGATURAN, BACKUP), dan tombol pembersihan log.

---

## 🛠️ Arsitektur & Teknologi

| Komponen | Teknologi |
|---|---|
| **Backend Runtime** | Node.js (v20+ / v24) |
| **Web Framework** | Express.js 5 |
| **Database** | SQLite3 (`better-sqlite3` dengan WAL mode berkinerja tinggi) |
| **Keamanan Kata Sandi** | BcryptJS (Salt 10 Rounds) |
| **Sesi Pengguna** | `express-session` (Cookie HttpOnly) |
| **Ekspor File** | `exceljs` (.xlsx) & CSV |
| **QR Code Engine** | `qrcode` (Generator) & `html5-qrcode` (Kamera Pemindai) |
| **Peta & Geofencing** | Leaflet.js, OpenStreetMap, & Formula Haversine |
| **Frontend Styling** | Tailwind CSS & Lucide Icons |
| **Visualisasi Data** | Chart.js 4 |
| **Kotak Dialog** | SweetAlert2 |
| **Penanganan Berkas** | Multer |

---

## 🚀 Panduan Menjalankan Aplikasi

### 1. Prasyarat
- Node.js (v18 atau lebih baru)

### 2. Pemasangan Dependensi (jika baru diunduh)
```bash
npm install
```

### 3. Menjalankan Server
```bash
npm start
```
Atau:
```bash
node server.js
```

### 4. Akses Web Browser
- 🌐 **Dashboard Utama**: [http://localhost:3050](http://localhost:3050)
- 📺 **Layar QR Kantor (Lobby Display)**: [http://localhost:3050/qr-display](http://localhost:3050/qr-display)

---

## 🔑 Akun Demo Pengujian

Aplikasi telah dilengkapi dengan data demo siap pakai (*pre-seeded*):

| Peran | NIP / Email | Kata Sandi | Deskripsi |
|---|---|---|---|
| **Administrator Utama** | `admin@perusahaan.com` / `ADM001` | `admin123` | Hak akses penuh seluruh menu manajemen |
| **Karyawan 1** | `budi@perusahaan.com` / `EMP001` | `karyawan123` | Budi Santoso (Software Engineer) |
| **Karyawan 2** | `siti@perusahaan.com` / `EMP002` | `karyawan123` | Siti Rahmawati (HR Staff) |
| **Karyawan 3** | `dimas@perusahaan.com` / `EMP003` | `karyawan123` | Dimas Aditya (Pemasaran & Sales) |

*Tersedia tombol pintas **"Akun Demo Cepat"** di halaman login untuk langsung mengisi akun dengan 1 klik.*

---

## 🧪 Menjalankan Pengujian Otomatis

Aplikasi dilengkapi dengan skrip verifikasi otomatis yang menguji seluruh 10 fitur secara menyeluruh:
```bash
npm test
```

Semua 13 rangkaian pengujian (Autentikasi, GPS Geofencing, Absensi Masuk/Pulang, Cuti, Lembur, Excel Export, Backup SQL, Log Audit) telah diverifikasi berjalan 100% lulus tanpa kesalahan.
