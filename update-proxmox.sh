#!/usr/bin/env bash
# ==============================================================================
# Script Update Otomatis Aplikasi Absensi Karyawan di Proxmox
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔄 Memulai update Aplikasi Absensi Karyawan...${NC}"

APP_DIR="/opt/aplikasi-absensi-karyawan"
if [ ! -d "$APP_DIR" ]; then
  APP_DIR="$(cd "$(dirname "$0")" && pwd)"
fi

cd "$APP_DIR"

echo -e "${YELLOW}📥 Menarik update terbaru dari GitHub...${NC}"
git pull origin main

echo -e "${YELLOW}📦 Mengupdate modul npm...${NC}"
npm install --omit=dev

echo -e "${YELLOW}🔁 Me-restart service absensi...${NC}"
systemctl restart absensi.service

echo -e "${GREEN}✅ Update selesai! Aplikasi sudah aktif kembali.${NC}"
systemctl status absensi.service --no-pager
