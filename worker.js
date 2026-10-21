import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Client } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';

const app = new Hono();

// ==============================================================================
// DATABASE HELPER (PostgreSQL via WebSockets on Cloudflare Edge)
// ==============================================================================
async function getDb(env) {
  const client = new Client(env.DATABASE_URL);
  await client.connect();
  return client;
}

async function query(env, sql, params = []) {
  const client = await getDb(env);
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    try { await client.end(); } catch (e) {}
  }
}

// ==============================================================================
// AUTHENTICATION & SESSION TOKENS (Signed HMAC-SHA256)
// ==============================================================================
async function createToken(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'absensi-secret-2026'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const dataStr = JSON.stringify(payload);
  const dataB64 = btoa(dataStr);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${dataB64}.${sigB64}`;
}

async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [dataB64, sigB64] = token.split('.');
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret || 'absensi-secret-2026'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(dataB64));
    if (!valid) return null;
    return JSON.parse(atob(dataB64));
  } catch (e) {
    return null;
  }
}

// Middleware: Extract current user from cookie
app.use('/api/*', async (c, next) => {
  const token = getCookie(c, 'absensi_sid');
  if (token) {
    const user = await verifyToken(token, c.env.SESSION_SECRET);
    if (user) {
      c.set('user', user);
    }
  }
  await next();
});

// Middleware: Require Authenticated User
async function requireAuth(c, next) {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, message: 'Sesi telah berakhir, silakan login kembali.' }, 401);
  }
  await next();
}

// Middleware: Require Admin
async function requireAdmin(c, next) {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.json({ success: false, message: 'Akses ditolak: Hanya administrator yang diizinkan.' }, 403);
  }
  await next();
}

// Helper: Haversine Formula (GPS Distance in Meters)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * dist);
}

// Helper: Format today YYYY-MM-DD
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Format current time HH:MM
function getNowTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// Helper: Audit Log
async function logActivity(env, userId, userName, action, category, details = '', ip = '') {
  try {
    await query(env, `
      INSERT INTO activity_logs (user_id, user_name, action, category, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [userId, userName, action, category, details, ip]);
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// ==============================================================================
// 1. HEALTH CHECK & SYSTEM DIAGNOSTICS
// ==============================================================================
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    platform: 'Cloudflare Workers (Edge Serverless)',
    database: 'Supabase PostgreSQL Enterprise',
    timestamp: new Date().toISOString()
  });
});

// ==============================================================================
// 2. SETTINGS & PUBLIC INFORMATION
// ==============================================================================
app.get('/api/pengaturan/public', async (c) => {
  try {
    const settingsRes = await query(c.env, 'SELECT key, value FROM settings');
    const settings = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    const officesRes = await query(c.env, 'SELECT * FROM office_locations ORDER BY is_primary DESC, id ASC');
    return c.json({
      success: true,
      settings: {
        company_name: settings.company_name || 'PT Nusantara Solusi Digital',
        company_address: settings.company_address || 'Jakarta Selatan',
        company_phone: settings.company_phone || '',
        company_email: settings.company_email || '',
        company_logo: settings.company_logo || '',
        office_lat: settings.office_lat || '-6.225014',
        office_lng: settings.office_lng || '106.804154',
        office_radius: parseInt(settings.office_radius || '100'),
        qr_secret_token: settings.qr_secret_token || 'OFFICE-QR-TOKEN-2026'
      },
      offices: officesRes.rows
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/pengaturan/qr', async (c) => {
  try {
    const res = await query(c.env, "SELECT value FROM settings WHERE key = 'qr_secret_token'");
    const token = res.rows[0]?.value || 'OFFICE-QR-TOKEN-2026';
    const svg = await QRCode.toString(token, {
      type: 'svg',
      margin: 2,
      color: { dark: '#1e1b4b', light: '#ffffff' }
    });
    const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    return c.json({ success: true, qr_image: qrDataUrl, token });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ==============================================================================
// 3. AUTHENTICATION (Login, Logout, Me, Password)
// ==============================================================================
app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const { emailOrNip, password } = body;

    if (!emailOrNip || !password) {
      return c.json({ success: false, message: 'Email/NIP dan kata sandi wajib diisi!' }, 400);
    }

    const res = await query(c.env, `
      SELECT u.*, d.name as department_name, s.name as shift_name, s.start_time, s.end_time
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE u.email = $1 OR u.nip = $1
    `, [emailOrNip.trim()]);

    const user = res.rows[0];
    if (!user) {
      return c.json({ success: false, message: 'NIP / Email tidak terdaftar dalam sistem.' }, 401);
    }

    if (user.status !== 'aktif') {
      return c.json({ success: false, message: 'Akun Anda sedang dinonaktifkan. Hubungi HRD/Admin.' }, 403);
    }

    const match = bcrypt.compareSync(password, user.password);
    if (!match) {
      return c.json({ success: false, message: 'Kata sandi yang Anda masukkan salah.' }, 401);
    }

    // Generate Session Token
    const sessionUser = {
      id: user.id,
      nip: user.nip,
      name: user.name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
      department_name: user.department_name,
      shift_id: user.shift_id,
      shift_name: user.shift_name,
      avatar: user.avatar
    };

    const token = await createToken(sessionUser, c.env.SESSION_SECRET);
    setCookie(c, 'absensi_sid', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    await logActivity(c.env, user.id, user.name, 'LOGIN', 'AUTH', `Login berhasil melalui Cloudflare Edge`, c.req.header('cf-connecting-ip') || '');

    return c.json({
      success: true,
      message: 'Login berhasil!',
      user: sessionUser
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, 'absensi_sid', { path: '/' });
  return c.json({ success: true, message: 'Berhasil logout.' });
});

app.get('/api/auth/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, message: 'Belum login' }, 401);
  }

  try {
    const res = await query(c.env, `
      SELECT u.id, u.nip, u.name, u.email, u.phone, u.address, u.role, u.avatar, u.status,
             d.name as department_name, s.name as shift_name, s.start_time, s.end_time
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE u.id = $1
    `, [user.id]);

    const latest = res.rows[0];
    if (!latest) {
      deleteCookie(c, 'absensi_sid', { path: '/' });
      return c.json({ success: false, message: 'User tidak ditemukan' }, 401);
    }

    return c.json({ success: true, user: latest });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ==============================================================================
// 4. ATTENDANCE (Presensi Masuk, Pulang, Riwayat)
// ==============================================================================
app.get('/api/absensi/today-status', requireAuth, async (c) => {
  const user = c.get('user');
  const today = getTodayString();
  try {
    const res = await query(c.env, 'SELECT * FROM attendances WHERE user_id = $1 AND date = $2', [user.id, today]);
    return c.json({ success: true, record: res.rows[0] || null });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/absensi/check-in', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { qr_token, latitude, longitude, notes, office_id } = body;
  const today = getTodayString();
  const nowTime = getNowTimeString();

  if (!qr_token) {
    return c.json({ success: false, message: 'QR Code atau token absensi kantor wajib disertakan!' }, 400);
  }

  try {
    // Check if already checked in today
    const existCheck = await query(c.env, 'SELECT * FROM attendances WHERE user_id = $1 AND date = $2', [user.id, today]);
    if (existCheck.rows.length > 0 && existCheck.rows[0].check_in_time) {
      return c.json({ success: false, message: `Anda sudah melakukan absensi masuk hari ini pada pukul ${existCheck.rows[0].check_in_time}.` }, 400);
    }

    // Verify token
    const tokenRes = await query(c.env, "SELECT value FROM settings WHERE key = 'qr_secret_token'");
    const validToken = tokenRes.rows[0]?.value || 'OFFICE-QR-TOKEN-2026';
    if (qr_token !== validToken) {
      return c.json({ success: false, message: 'QR Code kantor tidak valid atau sudah kedaluwarsa!' }, 400);
    }

    // Find target office & validate Geofence
    const officesRes = await query(c.env, 'SELECT * FROM office_locations ORDER BY is_primary DESC, id ASC');
    const offices = officesRes.rows;
    if (offices.length === 0) {
      return c.json({ success: false, message: 'Belum ada data titik kantor yang dikonfigurasi oleh Admin.' }, 400);
    }

    let targetOffice = null;
    let minDistance = Infinity;

    if (office_id && office_id !== 'auto') {
      targetOffice = offices.find(o => o.id === parseInt(office_id));
      if (targetOffice) {
        minDistance = calculateDistance(latitude, longitude, targetOffice.latitude, targetOffice.longitude);
      }
    }

    if (!targetOffice) {
      for (const off of offices) {
        const d = calculateDistance(latitude, longitude, off.latitude, off.longitude);
        if (d < minDistance) {
          minDistance = d;
          targetOffice = off;
        }
      }
    }

    if (minDistance > targetOffice.radius) {
      return c.json({
        success: false,
        message: `Lokasi Anda berada di luar radius ${targetOffice.name}! Jarak Anda: ${minDistance} meter (Batas radius: ${targetOffice.radius} meter).`
      }, 400);
    }

    // Calculate Late / On-time status
    const shiftRes = await query(c.env, `
      SELECT s.* FROM users u 
      LEFT JOIN shifts s ON u.shift_id = s.id 
      WHERE u.id = $1
    `, [user.id]);
    const shift = shiftRes.rows[0];

    let checkInStatus = 'Tepat Waktu';
    if (shift && shift.start_time) {
      const [shH, shM] = shift.start_time.split(':').map(Number);
      const [nowH, nowM] = nowTime.split(':').map(Number);
      const shiftMinutes = (shH * 60) + shM + (shift.tolerance_minutes || 15);
      const currentMinutes = (nowH * 60) + nowM;
      if (currentMinutes > shiftMinutes) {
        checkInStatus = 'Terlambat';
      }
    }

    // Save attendance
    await query(c.env, `
      INSERT INTO attendances (
        user_id, date, check_in_time, check_in_lat, check_in_lng, 
        check_in_distance, check_in_status, check_in_notes, office_name, office_location_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (user_id, date) DO UPDATE SET
        check_in_time = EXCLUDED.check_in_time,
        check_in_lat = EXCLUDED.check_in_lat,
        check_in_lng = EXCLUDED.check_in_lng,
        check_in_distance = EXCLUDED.check_in_distance,
        check_in_status = EXCLUDED.check_in_status,
        check_in_notes = EXCLUDED.check_in_notes,
        office_name = EXCLUDED.office_name,
        office_location_id = EXCLUDED.office_location_id
    `, [user.id, today, nowTime, latitude, longitude, minDistance, checkInStatus, notes || '', targetOffice.name, targetOffice.id]);

    await logActivity(c.env, user.id, user.name, 'CHECK_IN', 'ABSENSI', `Absen masuk di ${targetOffice.name} (${checkInStatus}) jarak ${minDistance}m`, c.req.header('cf-connecting-ip') || '');

    return c.json({
      success: true,
      message: `Absensi Masuk di ${targetOffice.name} berhasil dicatat (${checkInStatus})!`,
      status: checkInStatus,
      check_in_time: nowTime,
      office_name: targetOffice.name
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/absensi/check-out', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { qr_token, latitude, longitude } = body;
  const today = getTodayString();
  const nowTime = getNowTimeString();

  try {
    const existRes = await query(c.env, 'SELECT * FROM attendances WHERE user_id = $1 AND date = $2', [user.id, today]);
    const record = existRes.rows[0];
    if (!record || !record.check_in_time) {
      return c.json({ success: false, message: 'Anda belum melakukan absensi masuk hari ini!' }, 400);
    }
    if (record.check_out_time) {
      return c.json({ success: false, message: `Anda sudah melakukan absensi pulang hari ini pada pukul ${record.check_out_time}.` }, 400);
    }

    // Calculate duration
    let duration = 0;
    if (record.check_in_time) {
      const [inH, inM] = record.check_in_time.split(':').map(Number);
      const [outH, outM] = nowTime.split(':').map(Number);
      duration = Math.max(0, (outH * 60 + outM) - (inH * 60 + inM));
    }

    await query(c.env, `
      UPDATE attendances SET
        check_out_time = $1,
        check_out_lat = $2,
        check_out_lng = $3,
        work_duration_minutes = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [nowTime, latitude, longitude, duration, record.id]);

    await logActivity(c.env, user.id, user.name, 'CHECK_OUT', 'ABSENSI', `Absen pulang pada ${nowTime}. Durasi: ${duration} menit`, c.req.header('cf-connecting-ip') || '');

    return c.json({
      success: true,
      message: `Absensi Pulang berhasil dicatat pada pukul ${nowTime}! Durasi kerja: ${Math.floor(duration / 60)} jam ${duration % 60} menit.`,
      check_out_time: nowTime,
      work_duration_minutes: duration
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/absensi/history', requireAuth, async (c) => {
  const user = c.get('user');
  try {
    const recordsRes = await query(c.env, `
      SELECT a.*, u.name as user_name, u.nip
      FROM attendances a
      JOIN users u ON a.user_id = u.id
      WHERE a.user_id = $1
      ORDER BY a.date DESC
      LIMIT 30
    `, [user.id]);

    const statsRes = await query(c.env, `
      SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN check_in_status = 'Tepat Waktu' THEN 1 END)::int as tepat_waktu,
        COUNT(CASE WHEN check_in_status = 'Terlambat' THEN 1 END)::int as terlambat,
        COUNT(CASE WHEN check_in_status = 'Izin' THEN 1 END)::int as izin,
        COUNT(CASE WHEN check_in_status = 'Sakit' THEN 1 END)::int as sakit,
        COUNT(CASE WHEN check_in_status = 'Cuti' THEN 1 END)::int as cuti,
        COUNT(CASE WHEN check_in_status = 'Alpha' THEN 1 END)::int as alpha
      FROM attendances
      WHERE user_id = $1
    `, [user.id]);

    return c.json({
      success: true,
      records: recordsRes.rows,
      summary: statsRes.rows[0]
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ==============================================================================
// 5. EMPLOYEE MANAGEMENT (Karyawan)
// ==============================================================================
app.get('/api/karyawan', requireAuth, async (c) => {
  try {
    const usersRes = await query(c.env, `
      SELECT u.id, u.nip, u.name, u.email, u.phone, u.address, u.role, u.status, u.avatar,
             d.name as department_name, s.name as shift_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      ORDER BY u.id ASC
    `);

    const deptsRes = await query(c.env, 'SELECT * FROM departments ORDER BY name ASC');
    const shiftsRes = await query(c.env, 'SELECT * FROM shifts ORDER BY name ASC');

    return c.json({
      success: true,
      employees: usersRes.rows,
      departments: deptsRes.rows,
      shifts: shiftsRes.rows
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ==============================================================================
// 6. SCHEDULES & LEAVES (Jadwal & Cuti)
// ==============================================================================
app.get('/api/jadwal/shifts', requireAuth, async (c) => {
  try {
    const res = await query(c.env, 'SELECT * FROM shifts ORDER BY id ASC');
    return c.json({ success: true, shifts: res.rows });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.get('/api/jadwal/leaves', requireAuth, async (c) => {
  const user = c.get('user');
  try {
    let sql = `
      SELECT l.*, u.name as user_name, u.nip, d.name as department_name
      FROM leaves l
      JOIN users u ON l.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
    `;
    const params = [];
    if (user.role !== 'admin') {
      sql += ' WHERE l.user_id = $1';
      params.push(user.id);
    }
    sql += ' ORDER BY l.created_at DESC';

    const res = await query(c.env, sql, params);
    return c.json({ success: true, leaves: res.rows });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/jadwal/leaves', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { type, start_date, end_date, reason } = body;

  try {
    const start = new Date(start_date);
    const end = new Date(end_date);
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);

    const insertRes = await query(c.env, `
      INSERT INTO leaves (user_id, type, start_date, end_date, total_days, reason, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'menunggu')
      RETURNING id
    `, [user.id, type, start_date, end_date, totalDays, reason]);

    await logActivity(c.env, user.id, user.name, 'AJUKAN_CUTI', 'CUTI', `Mengajukan ${type} (${totalDays} hari): ${reason}`, c.req.header('cf-connecting-ip') || '');

    return c.json({
      success: true,
      message: `Pengajuan ${type} berhasil dikirim! Menunggu persetujuan manajemen/HRD.`,
      id: insertRes.rows[0].id
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ==============================================================================
// 7. OVERTIME (Lembur)
// ==============================================================================
app.get('/api/lembur', requireAuth, async (c) => {
  const user = c.get('user');
  try {
    let sql = `
      SELECT o.*, u.name as user_name, u.nip, d.name as department_name
      FROM overtimes o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
    `;
    const params = [];
    if (user.role !== 'admin') {
      sql += ' WHERE o.user_id = $1';
      params.push(user.id);
    }
    sql += ' ORDER BY o.date DESC, o.id DESC';

    const res = await query(c.env, sql, params);
    return c.json({ success: true, overtimes: res.rows });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

app.post('/api/lembur', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { date, start_time, end_time, task_description } = body;

  try {
    const [sH, sM] = start_time.split(':').map(Number);
    const [eH, eM] = end_time.split(':').map(Number);
    let totalMinutes = (eH * 60 + eM) - (sH * 60 + sM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

    const insertRes = await query(c.env, `
      INSERT INTO overtimes (user_id, date, start_time, end_time, total_hours, task_description, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'menunggu')
      RETURNING id
    `, [user.id, date, start_time, end_time, totalHours, task_description]);

    await logActivity(c.env, user.id, user.name, 'AJUKAN_LEMBUR', 'LEMBUR', `Lembur ${date} (${totalHours} jam): ${task_description}`, c.req.header('cf-connecting-ip') || '');

    return c.json({
      success: true,
      message: `Pengajuan lembur sebesar ${totalHours} jam berhasil dikirim untuk diverifikasi!`,
      id: insertRes.rows[0].id
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ==============================================================================
// 8. REPORTS SUMMARY (Laporan & Analitik)
// ==============================================================================
app.get('/api/laporan/summary', requireAuth, async (c) => {
  try {
    const statsRes = await query(c.env, `
      SELECT 
        COUNT(*)::int as total,
        COUNT(CASE WHEN check_in_status = 'Tepat Waktu' THEN 1 END)::int as tepat_waktu,
        COUNT(CASE WHEN check_in_status = 'Terlambat' THEN 1 END)::int as terlambat,
        COUNT(CASE WHEN check_in_status = 'Izin' THEN 1 END)::int as izin,
        COUNT(CASE WHEN check_in_status = 'Sakit' THEN 1 END)::int as sakit,
        COUNT(CASE WHEN check_in_status = 'Cuti' THEN 1 END)::int as cuti,
        COUNT(CASE WHEN check_in_status = 'Alpha' THEN 1 END)::int as alpha
      FROM attendances
    `);

    const usersCountRes = await query(c.env, "SELECT count(*)::int as count FROM users WHERE status = 'aktif'");

    return c.json({
      success: true,
      summary: statsRes.rows[0],
      total_active_employees: usersCountRes.rows[0]?.count || 0
    });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ==============================================================================
// 9. AUDIT LOGS (Log Aktivitas)
// ==============================================================================
app.get('/api/logs', requireAdmin, async (c) => {
  try {
    const res = await query(c.env, 'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100');
    return c.json({ success: true, logs: res.rows });
  } catch (err) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ==============================================================================
// 10. CLOUDFLARE WORKERS MAIN FETCH DISPATCHER
// ==============================================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. API Route Requests
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    // 2. Specific View: Front-desk QR Code Display
    if (url.pathname === '/qr-display') {
      const qrUrl = new URL('/qr-display.html', request.url);
      return env.ASSETS.fetch(new Request(qrUrl, request));
    }

    // 3. Static Assets from public/
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    // 4. SPA Fallback: return index.html for navigation
    if (request.method === 'GET' && !url.pathname.includes('.')) {
      const indexUrl = new URL('/index.html', request.url);
      return env.ASSETS.fetch(new Request(indexUrl, request));
    }

    return assetResponse;
  }
};
