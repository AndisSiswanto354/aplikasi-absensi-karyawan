@echo off
title Aplikasi Absensi Karyawan - Local Mode
cd /d "%~dp0"

echo ========================================================
echo   MENJALANKAN APLIKASI ABSENSI KARYAWAN (LOCAL MODE)
echo ========================================================
echo.
echo URL Akses: http://localhost:3050
echo Layar QR:  http://localhost:3050/qr-display
echo.
node server.js
pause
