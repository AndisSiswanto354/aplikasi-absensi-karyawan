# 📖 Panduan Lengkap Instalasi di Proxmox VE (LXC / VM)

Panduan ini menjelaskan cara menginstall dan menjalankan **Aplikasi Absensi Karyawan** di **Proxmox Virtual Environment (PVE)** agar dapat aktif **24 jam nonstop**, hemat daya, dan dapat diakses dari laptop kantor maupun smartphone karyawan.

---

## ⚡ Metode 1: LXC Container (Sangat Direkomendasikan - Ringan & Cepat)

LXC Container hanya memerlukan RAM ~200MB dan 1 vCPU, sangat hemat resource dibandingkan full VM.

### Langkah 1: Buat LXC Container di Proxmox
1. Buka dashboard web Proxmox Anda (`https://ip-proxmox:8006`).
2. Klik tombol **Create CT** (kanan atas).
3. Isi parameter container:
   - **Hostname**: `absensi-karyawan`
   - **Password**: Masukkan password root yang Anda inginkan
   - **Template**: Pilih template **Ubuntu 22.04**, **Ubuntu 24.04**, atau **Debian 12**
   - **Disks**: `8 GB` (cukup 4 GB - 8 GB)
   - **CPU**: `1 Core` (atau 2 Core)
   - **Memory**: `512 MB` atau `1024 MB` (Swap: 512 MB)
   - **Network**: DHCP atau Static IP (misal: `192.168.1.50/24`, Gateway: IP Router Anda)
4. Klik **Finish** dan nyalakan (*Start*) container tersebut.

---

### Langkah 2: Jalankan Script Instalasi Otomatis (1 Perintah)
Buka menu **Console** pada container Anda di Proxmox, lalu jalankan satu perintah berikut:

```bash
curl -fsSL https://raw.githubusercontent.com/AndisSiswanto354/aplikasi-absensi-karyawan/main/install-proxmox.sh | bash
```

> **Apa yang dilakukan script ini secara otomatis?**
> - Mengupdate repository Linux & memasang dependensi (build-essential, python3, sqlite3, git).
> - Memasang **Node.js 20 LTS** resmi.
> - Meng-clone source code ke folder `/opt/aplikasi-absensi-karyawan`.
> - Menginstall paket npm (`better-sqlite3`, `express`, dll).
> - Mendaftarkan **Systemd Service** (`absensi.service`) sehingga otomatis menyala saat Proxmox booting dan otomatis me-restart jika terjadi error.

Setelah selesai, layar akan menampilkan alamat IP dan port:
```text
================================================================
🎉 SUKSES! APLIKASI ABSENSI TELAH AKTIF DI PROXMOX (24 JAM NONSTOP)
================================================================
📡 URL Web Absensi:     http://192.168.x.x:3050
📺 Layar QR Frontdesk:  http://192.168.x.x:3050/qr-display

🔑 Akun Login:
   • Admin:    admin@perusahaan.com | admin123
   • Karyawan: budi@perusahaan.com  | karyawan123
================================================================
```

---

### Langkah 3: Aktifkan HTTPS untuk Kamera & GPS di HP Karyawan

Browser smartphone (Chrome Android & Safari iOS) **secara ketat mewajibkan HTTPS** untuk mengizinkan akses Kamera Scanner dan Lokasi GPS. Jika dibuka lewat HTTP biasa, browser HP akan memblokir kamera.

Agar mendapatkan link HTTPS resmi secara **gratis** tanpa perlu IP Publik Statis atau port-forwarding router, jalankan script tunnel di console container:

```bash
cd /opt/aplikasi-absensi-karyawan
bash setup-tunnel-proxmox.sh
```

- Pilih opsi **1 (Quick Tunnel Gratis)** jika ingin langsung aktif dengan domain `https://xxxx.trycloudflare.com`.
- Atau pilih opsi **2** jika Anda memiliki domain sendiri di Cloudflare.

---

## 🐳 Metode 2: Menggunakan Docker / Docker Compose di Proxmox

Jika Anda sudah memiliki VM atau LXC dengan Docker terpasang:

1. Clone repositori:
   ```bash
   git clone https://github.com/AndisSiswanto354/aplikasi-absensi-karyawan.git
   cd aplikasi-absensi-karyawan
   ```

2. Jalankan dengan Docker Compose:
   ```bash
   docker compose up -d
   ```

3. Cek status:
   ```bash
   docker compose ps
   ```
   Aplikasi akan berjalan di `http://<IP-DOCKER>:3050`.

---

## 🛠️ Perintah Manajemen di Proxmox (LXC)

Gunakan perintah ini di terminal console container Proxmox:

| Perintah | Fungsi |
| :--- | :--- |
| `systemctl status absensi` | Memeriksa status aplikasi apakah aktif |
| `journalctl -u absensi -f` | Melihat log aktivitas server secara live / real-time |
| `systemctl restart absensi` | Me-restart aplikasi |
| `systemctl stop absensi` | Menghentikan aplikasi |
| `bash /opt/aplikasi-absensi-karyawan/update-proxmox.sh` | Mengupdate aplikasi ke versi terbaru dari GitHub |

---

## 💾 Backup Data di Proxmox

Database SQLite disimpan di file:
`/opt/aplikasi-absensi-karyawan/data/absensi.db`

1. **Backup Otomatis Proxmox**: Anda bisa memanfaatkan fitur **Backup** bawaan Proxmox VE (VZDump) terjadwal setiap malam ke storage lokal atau NAS/PBS.
2. **Backup dari Web App**: Masuk ke menu **Pengaturan -> Backup Database** di panel Admin untuk mengunduh salinan database kapan saja.
