@echo off
title Aplikasi Absensi Karyawan - Online Mode
cd /d "%~dp0"

echo ========================================================
echo   MENJALANKAN APLIKASI ABSENSI KARYAWAN (ONLINE MODE)
echo ========================================================
echo.

:: 1. Cek & Jalankan Node.js server jika belum jalan
tasklist /fi "imagename eq node.exe" | find /i "node.exe" >nul
if %errorlevel% neq 0 (
    echo [1/2] Menyalakan server aplikasi...
    start /b node server.js
    timeout /t 3 /nobreak >nul
) else (
    echo [1/2] Server aplikasi sudah aktif di port 3050.
)

:: 2. Jalankan Cloudflare Tunnel untuk akses online HP
echo [2/2] Membuka jalur akses online publik (HTTPS)...
echo.
echo ========================================================
echo   Silakan tunggu beberapa detik untuk link HTTPS Anda...
echo ========================================================
echo.

"%~dp0cloudflared.exe" tunnel --url http://localhost:3050
pause
