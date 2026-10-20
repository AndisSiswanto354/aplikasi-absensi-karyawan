#!/usr/bin/env bash
# ==============================================================================
# Script Instalasi Otomatis Aplikasi Absensi Karyawan di Proxmox VE (LXC / VM)
# OS Yang Didukung: Ubuntu 22.04 / 24.04 & Debian 11 / 12
# ==============================================================================

set -e

# Warna output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   🚀 INSTALASI APLIKASI ABSENSI KARYAWAN DI PROXMOX ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Pastikan script dijalankan sebagai root
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}❌ Script ini harus dijalankan sebagai root (gunakan 'sudo' atau login sebagai root di LXC).${NC}"
  exit 1
fi

# 2. Update repository & install paket dasar
echo -e "\n${YELLOW}📦 [1/6] Memperbarui paket sistem & dependensi dasar...${NC}"
apt-get update -y
apt-get install -y curl wget git build-essential python3 sqlite3 ca-certificates gnupg

# 3. Cek dan Install Node.js 20 LTS jika belum ada
echo -e "\n${YELLOW}⚙️  [2/6] Memeriksa instalasi Node.js LTS...${NC}"
NEED_NODE=false
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=true
else
  NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VER" -lt 18 ]; then
    NEED_NODE=true
  fi
fi

if [ "$NEED_NODE" = true ]; then
  echo -e "${BLUE}Mengunduh dan memasang Node.js 20 LTS dari NodeSource...${NC}"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi

NODE_PATH=$(which node)
echo -e "${GREEN}✅ Node.js terpasang: $(node -v) di ${NODE_PATH}${NC}"

# 4. Tentukan direktori aplikasi
APP_DIR="/opt/aplikasi-absensi-karyawan"

if [ -f "$(pwd)/server.js" ] && [ -f "$(pwd)/package.json" ]; then
  APP_DIR="$(pwd)"
  echo -e "\n${YELLOW}📂 [3/6] Menggunakan direktori saat ini: ${APP_DIR}${NC}"
else
  echo -e "\n${YELLOW}📂 [3/6] Menyiapkan source code di ${APP_DIR}...${NC}"
  if [ -d "$APP_DIR/.git" ]; then
    echo "Direktori sudah ada, memperbarui dari GitHub..."
    cd "$APP_DIR"
    git pull origin main
  else
    git clone https://github.com/AndisSiswanto354/aplikasi-absensi-karyawan.git "$APP_DIR"
    cd "$APP_DIR"
  fi
fi

cd "$APP_DIR"

# 5. Install dependensi NPM
echo -e "\n${YELLOW}📦 [4/6] Menginstall dependensi NPM (better-sqlite3, express, dll)...${NC}"
npm install --omit=dev

# Pastikan folder data dan izin file siap
mkdir -p "$APP_DIR/data"
chmod -R 755 "$APP_DIR/data"

# 6. Konfigurasi Systemd Service (Otomatis jalan saat boot & auto-restart saat crash)
echo -e "\n${YELLOW}⚙️  [5/6] Mengkonfigurasi Systemd Service (absensi.service)...${NC}"
cat <<EOF > /etc/systemd/system/absensi.service
[Unit]
Description=Aplikasi Absensi Karyawan
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_PATH} server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3050
Environment=DATA_DIR=${APP_DIR}/data

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable absensi.service
systemctl restart absensi.service

# Izinkan port 3050 di firewall jika ufw aktif
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 3050/tcp
fi

# 7. Verifikasi status
echo -e "\n${YELLOW}🔍 [6/6] Memverifikasi status layanan...${NC}"
sleep 3

if systemctl is-active --quiet absensi.service; then
  IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ -z "$IP_ADDR" ]; then
    IP_ADDR="<IP-PROXMOX-CONTAINER>"
  fi

  echo -e "\n${GREEN}================================================================${NC}"
  echo -e "${GREEN}🎉 SUKSES! APLIKASI ABSENSI TELAH AKTIF DI PROXMOX (24 JAM NONSTOP)${NC}"
  echo -e "${GREEN}================================================================${NC}"
  echo -e "📡 URL Web Absensi:     ${BLUE}http://${IP_ADDR}:3050${NC}"
  echo -e "📺 Layar QR Frontdesk:  ${BLUE}http://${IP_ADDR}:3050/qr-display${NC}"
  echo -e ""
  echo -e "🔑 Akun Login:"
  echo -e "   • Admin:    admin@perusahaan.com | admin123"
  echo -e "   • Karyawan: budi@perusahaan.com  | karyawan123"
  echo -e ""
  echo -e "🛠️  Perintah Berguna:"
  echo -e "   • Cek status:   systemctl status absensi"
  echo -e "   • Cek log live: journalctl -u absensi -f"
  echo -e "   • Restart:      systemctl restart absensi"
  echo -e "   • Stop:         systemctl stop absensi"
  echo -e "================================================================\n"
else
  echo -e "${RED}⚠️  Layanan gagal dimulai otomatis. Cek log dengan: journalctl -u absensi -n 20 --no-pager${NC}"
  exit 1
fi
