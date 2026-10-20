#!/usr/bin/env bash
# ==============================================================================
# Script Setup Cloudflare Tunnel di Proxmox (Akses HTTPS Gratis & Aman 24 Jam)
# Diperlukan agar Kamera Scanner & GPS di HP Karyawan Berfungsi Tanpa Diblokir Browser
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}❌ Harus dijalankan sebagai root.${NC}"
  exit 1
fi

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}  🌐 SETUP CLOUDFLARE TUNNEL (HTTPS) DI PROXMOX      ${NC}"
echo -e "${BLUE}====================================================${NC}"

# Cek arsitektur
ARCH=$(dpkg --print-architecture)
if [ "$ARCH" = "amd64" ]; then
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
elif [ "$ARCH" = "arm64" ]; then
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb"
else
  echo -e "${RED}Arsitektur $ARCH tidak didukung otomatis.${NC}"
  exit 1
fi

echo -e "\n${YELLOW}⬇️  Mengunduh dan memasang cloudflared (${ARCH})...${NC}"
wget -q "$CF_URL" -O /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb || apt-get install -f -y
rm -f /tmp/cloudflared.deb

echo -e "${GREEN}✅ cloudflared berhasil dipasang: $(cloudflared --version)${NC}"

echo -e "\n${YELLOW}Pilih Mode Tunnel:${NC}"
echo "1) Quick Tunnel Gratis (Otomatis dapat domain *.trycloudflare.com, tanpa daftar akun Cloudflare)"
echo "2) Named Tunnel dengan Token Cloudflare (Domain Anda sendiri, misal: absensi.perusahaan.com)"
read -p "Pilihan Anda (1 atau 2) [default: 1]: " PILIHAN
PILIHAN=${PILIHAN:-1}

if [ "$PILIHAN" = "2" ]; then
  echo -e "\n${YELLOW}Masukkan Token Tunnel dari Cloudflare Dashboard (Zero Trust -> Tunnels):${NC}"
  read -p "Cloudflare Tunnel Token: " CF_TOKEN
  if [ -n "$CF_TOKEN" ]; then
    cloudflared service install "$CF_TOKEN"
    systemctl restart cloudflared
    echo -e "${GREEN}🎉 Cloudflare Tunnel permanen aktif sebagai service systemd!${NC}"
  else
    echo -e "${RED}Token kosong. Beralih ke Quick Tunnel...${NC}"
    PILIHAN="1"
  fi
fi

if [ "$PILIHAN" = "1" ]; then
  echo -e "\n${YELLOW}Membuat service Quick Tunnel (absensi-tunnel.service)...${NC}"
  cat <<EOF > /etc/systemd/system/absensi-tunnel.service
[Unit]
Description=Cloudflare Quick Tunnel Absensi
After=network.target absensi.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloudflared tunnel --url http://127.0.0.1:3050
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable absensi-tunnel.service
  systemctl restart absensi-tunnel.service

  echo -e "\n${YELLOW}Menunggu link HTTPS aktif...${NC}"
  sleep 6
  JOURNAL_LOG=$(journalctl -u absensi-tunnel.service -n 30 --no-pager)
  TUNNEL_URL=$(echo "$JOURNAL_LOG" | grep -o 'https://[-a-zA-Z0-9@:%._\+~#=]*\.trycloudflare\.com' | tail -n 1)

  echo -e "\n${GREEN}================================================================${NC}"
  echo -e "${GREEN}🎉 TUNNEL HTTPS BERHASIL DIAKTIFKAN!${NC}"
  echo -e "${GREEN}================================================================${NC}"
  if [ -n "$TUNNEL_URL" ]; then
    echo -e "🔗 URL Akses HP (HTTPS): ${BLUE}${TUNNEL_URL}${NC}"
  else
    echo -e "ℹ️  Cek URL aktif dengan mengetik perintah:"
    echo -e "   ${BLUE}journalctl -u absensi-tunnel.service | grep trycloudflare.com | tail -n 1${NC}"
  fi
  echo -e "================================================================\n"
fi
