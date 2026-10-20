@echo off
title Push Aplikasi Absensi ke Hugging Face Space
cd /d "%~dp0"

echo ========================================================
echo   UPLOAD KODE KE HUGGING FACE SPACES
echo   Target: andissiswanto/absensi-karyawanbnc
echo ========================================================
echo.
echo Dapatkan Access Token di: https://huggingface.co/settings/tokens
echo (Buat token dengan izin / Role: Write)
echo.
set /p HF_TOKEN=Tempelkan (Paste) Access Token Anda di sini: 

if "%HF_TOKEN%"=="" (
    echo Token tidak boleh kosong!
    pause
    exit /b
)

echo.
echo Sedang mengunggah kode aplikasi ke Hugging Face Space...
git push https://andissiswanto:%HF_TOKEN%@huggingface.co/spaces/andissiswanto/absensi-karyawanbnc main --force

echo.
echo ========================================================
if %errorlevel% equ 0 (
    echo   BERHASIL! Kode telah terkirim ke Hugging Face.
    echo   Silakan pantau proses build di:
    echo   https://huggingface.co/spaces/andissiswanto/absensi-karyawanbnc
) else (
    echo   Gagal push. Pastikan Access Token benar dan memiliki izin WRITE.
)
echo ========================================================
echo.
pause
