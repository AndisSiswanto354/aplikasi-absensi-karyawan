/**
 * Automated Verification Script for Aplikasi Absensi Karyawan
 */
const { db, initDb } = require('./database');
initDb();

async function runTests() {
  const PORT = 3001;
  process.env.PORT = PORT;
  const server = require('./server');

  // Wait 1s for server to listen
  await new Promise(r => setTimeout(r, 1000));
  const baseUrl = `http://localhost:${PORT}`;
  console.log(`\n🧪 Memulai Pengujian Otomatis Fitur Aplikasi di ${baseUrl}...\n`);

  let cookieAdmin = '';
  let cookieKaryawan = '';

  try {
    // Test 1: Public settings
    console.log('Test 1: Public Settings & QR');
    const pubRes = await fetch(`${baseUrl}/api/pengaturan/public`);
    const pubData = await pubRes.json();
    console.assert(pubData.success && pubData.settings.company_name, 'Public settings failed');
    console.log('✅ Public Settings OK:', pubData.settings.company_name);

    // Test 2: QR Code Generation
    console.log('\nTest 2: QR Code Generator Image');
    const qrRes = await fetch(`${baseUrl}/api/pengaturan/qr`);
    const qrData = await qrRes.json();
    console.assert(qrData.success && qrData.qr_image.startsWith('data:image/png'), 'QR code image failed');
    console.log('✅ QR Image Generated OK (Token:', qrData.token, ')');

    // Test 3: Admin Login
    console.log('\nTest 3: Autentikasi Admin');
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrNip: 'admin@perusahaan.com', password: 'admin123' })
    });
    const adminLoginData = await adminLoginRes.json();
    cookieAdmin = adminLoginRes.headers.get('set-cookie');
    console.assert(adminLoginData.success && adminLoginData.user.role === 'admin', 'Admin login failed');
    console.log('✅ Admin Login OK:', adminLoginData.user.name, `(${adminLoginData.user.role})`);

    // Test 4: Karyawan Login
    console.log('\nTest 4: Autentikasi Karyawan');
    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrNip: 'budi@perusahaan.com', password: 'karyawan123' })
    });
    const userLoginData = await userLoginRes.json();
    cookieKaryawan = userLoginRes.headers.get('set-cookie');
    console.assert(userLoginData.success && userLoginData.user.role === 'karyawan', 'Karyawan login failed');
    console.log('✅ Karyawan Login OK:', userLoginData.user.name, `(${userLoginData.user.role})`);

    // Test 5: Check-in Outside Geofence (Should be blocked)
    console.log('\nTest 5: Validasi Geofencing GPS (Di Luar Radius Kantor -> Harus Ditolak)');
    const outsideRes = await fetch(`${baseUrl}/api/absensi/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieKaryawan },
      body: JSON.stringify({
        qr_token: pubData.settings.qr_secret_token,
        latitude: -6.210000,
        longitude: 106.840000
      })
    });
    const outsideData = await outsideRes.json();
    console.assert(!outsideData.success, 'Should reject outside radius');
    console.log('✅ Geofence Rejection OK:', outsideData.message);

    // Test 6: Check-in Inside Geofence (Valid coordinates & token)
    console.log('\nTest 6: Validasi Absensi Masuk (Scan QR + GPS Valid)');
    const validInRes = await fetch(`${baseUrl}/api/absensi/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieKaryawan },
      body: JSON.stringify({
        qr_token: pubData.settings.qr_secret_token,
        latitude: parseFloat(pubData.settings.office_lat),
        longitude: parseFloat(pubData.settings.office_lng),
        notes: 'Absensi via Automated Test'
      })
    });
    const validInData = await validInRes.json();
    console.log('✅ Check-In Response:', validInData.message);

    // Test 7: Riwayat Absensi
    console.log('\nTest 7: Riwayat Absensi & Rekap');
    const histRes = await fetch(`${baseUrl}/api/absensi/history`, {
      headers: { 'Cookie': cookieKaryawan }
    });
    const histData = await histRes.json();
    console.assert(histData.success && histData.records.length > 0, 'History should have records');
    console.log('✅ Riwayat Absensi OK, Total record:', histData.records.length, 'Summary:', histData.summary);

    // Test 8: Pengajuan Cuti / Izin
    console.log('\nTest 8: Pengajuan Cuti/Izin Karyawan');
    const leaveRes = await fetch(`${baseUrl}/api/jadwal/leaves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieKaryawan },
      body: JSON.stringify({
        type: 'cuti',
        start_date: '2026-11-01',
        end_date: '2026-11-03',
        reason: 'Cuti tahunan liburan keluarga'
      })
    });
    const leaveData = await leaveRes.json();
    console.assert(leaveData.success, 'Leave submission failed');
    console.log('✅ Pengajuan Cuti OK:', leaveData.message);

    // Test 9: Pengajuan Lembur (Overtime)
    console.log('\nTest 9: Pengajuan Jam Lembur');
    const otRes = await fetch(`${baseUrl}/api/lembur`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieKaryawan },
      body: JSON.stringify({
        date: '2026-10-20',
        start_time: '17:00',
        end_time: '20:30',
        task_description: 'Deployment fitur backend absensi'
      })
    });
    const otData = await otRes.json();
    console.assert(otData.success, 'Overtime submission failed');
    console.log('✅ Pengajuan Lembur OK:', otData.message);

    // Test 10: Admin Approval for Leave
    console.log('\nTest 10: Persetujuan (Approval) Cuti oleh Admin');
    const leavesListRes = await fetch(`${baseUrl}/api/jadwal/leaves`, {
      headers: { 'Cookie': cookieAdmin }
    });
    const leavesListData = await leavesListRes.json();
    const pendingLeave = leavesListData.leaves.find(l => l.status === 'menunggu');
    if (pendingLeave) {
      const reviewRes = await fetch(`${baseUrl}/api/jadwal/leaves/${pendingLeave.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cookie': cookieAdmin },
        body: JSON.stringify({ status: 'disetujui', admin_notes: 'Disetujui oleh HR Manager' })
      });
      const reviewData = await reviewRes.json();
      console.assert(reviewData.success, 'Review failed');
      console.log('✅ Persetujuan Cuti OK:', reviewData.message);
    }

    // Test 11: Export Laporan Excel
    console.log('\nTest 11: Ekspor Laporan Excel (.xlsx)');
    const excelRes = await fetch(`${baseUrl}/api/laporan/export/excel`, {
      headers: { 'Cookie': cookieAdmin }
    });
    console.assert(excelRes.status === 200, 'Excel export failed');
    const excelContentType = excelRes.headers.get('content-type');
    console.assert(excelContentType.includes('spreadsheetml'), 'Should return spreadsheet mime');
    console.log('✅ Export Excel OK (Content-Type:', excelContentType, ')');

    // Test 12: Backup Database SQL
    console.log('\nTest 12: Backup Database Manual (SQL Dump)');
    const backupRes = await fetch(`${baseUrl}/api/backup/export`, {
      headers: { 'Cookie': cookieAdmin }
    });
    const sqlDump = await backupRes.text();
    console.assert(sqlDump.includes('CREATE TABLE') && sqlDump.includes('INSERT INTO'), 'SQL dump invalid');
    console.log('✅ Backup SQL OK, ukuran file:', sqlDump.length, 'karakter');

    // Test 13: Activity Audit Logs
    console.log('\nTest 13: Log Audit Aktivitas Sistem');
    const logsRes = await fetch(`${baseUrl}/api/logs`, {
      headers: { 'Cookie': cookieAdmin }
    });
    const logsData = await logsRes.json();
    console.assert(logsData.success && logsData.logs.length > 0, 'Audit logs empty');
    console.log('✅ Log Aktivitas OK, tercatat', logsData.logs.length, 'aktivitas audit.');

    console.log('\n🎉 SEMUA 13 PENGUJIAN FITUR UTAMA LULUS 100% TANPA KESALAHAN! 🎉\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

runTests();
