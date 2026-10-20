@echo off
title Push Aplikasi Absensi ke GitHub
cd /d "%~dp0"

echo ========================================================
echo   MENGIRIM (PUSH) KODE KE GITHUB REPOSITORY
echo   https://github.com/AndisSiswanto354/aplikasi-absensi-karyawan.git
echo ========================================================
echo.

git push -u origin main

echo.
echo ========================================================
if %errorlevel% equ 0 (
    echo   BERHASIL! Kode telah ter-upload ke GitHub Anda.
) else (
    echo   Gagal push. Silakan periksa kembali akun GitHub Anda.
)
echo ========================================================
echo.
pause
