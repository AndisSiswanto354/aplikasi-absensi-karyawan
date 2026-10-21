const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db, logActivity } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendNotification } = require('../notification');

// Haversine formula for distance in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// GET /api/absensi/today-status - Status absensi user hari ini
router.get('/today-status', requireAuth, (req, res) => {
  try {
    const userId = req.session.user.id;
    const today = dayjs().format('YYYY-MM-DD');

    const attendance = db.prepare(`SELECT * FROM attendances WHERE user_id = ? AND date = ?`).get(userId, today);

    // Get office settings
    const officeLat = parseFloat(db.prepare(`SELECT value FROM settings WHERE key='office_lat'`).get()?.value || '-6.225014');
    const officeLng = parseFloat(db.prepare(`SELECT value FROM settings WHERE key='office_lng'`).get()?.value || '106.809756');
    const officeRadius = parseInt(db.prepare(`SELECT value FROM settings WHERE key='office_radius'`).get()?.value || '100');
    const companyName = db.prepare(`SELECT value FROM settings WHERE key='company_name'`).get()?.value || 'PT Nusantara Solusi Digital';

    // Get user shift
    const userShift = db.prepare(`
      SELECT s.* FROM users u
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE u.id = ?
    `).get(userId);

    // Get all office locations
    const offices = db.prepare(`SELECT * FROM office_locations ORDER BY is_primary DESC, name ASC`).all();

    res.json({
      success: true,
      today,
      attendance: attendance || null,
      offices,
      office: {
        name: companyName,
        lat: officeLat,
        lng: officeLng,
        radius: officeRadius
      },
      shift: userShift || {
        name: 'Shift Standar',
        start_time: '08:00',
        end_time: '17:00',
        tolerance_minutes: 15
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Helper: Resolve office location by ID or auto-detect closest
function resolveOfficeLocation(officeId, userLat, userLng) {
  const offices = db.prepare(`SELECT * FROM office_locations ORDER BY is_primary DESC, name ASC`).all();
  if (offices.length === 0) {
    const lat = parseFloat(db.prepare(`SELECT value FROM settings WHERE key='office_lat'`).get()?.value || '-6.225014');
    const lng = parseFloat(db.prepare(`SELECT value FROM settings WHERE key='office_lng'`).get()?.value || '106.809756');
    const rad = parseInt(db.prepare(`SELECT value FROM settings WHERE key='office_radius'`).get()?.value || '100');
    return { id: null, name: 'Kantor Pusat', latitude: lat, longitude: lng, radius: rad, distance: calculateDistance(userLat, userLng, lat, lng) };
  }

  const withDist = offices.map(o => ({
    ...o,
    distance: calculateDistance(userLat, userLng, o.latitude, o.longitude)
  }));

  if (officeId && officeId !== 'auto') {
    const chosen = withDist.find(o => String(o.id) === String(officeId));
    if (chosen) return chosen;
  }

  // Auto pick: find the one within radius first
  const withinRadius = withDist.find(o => o.distance <= o.radius);
  if (withinRadius) return withinRadius;

  // Otherwise pick closest
  withDist.sort((a, b) => a.distance - b.distance);
  return withDist[0];
}

// POST /api/absensi/check-in - Absensi Masuk (Scan QR + GPS)
router.post('/check-in', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { qr_token, latitude, longitude, notes, office_id } = req.body;
    const today = dayjs().format('YYYY-MM-DD');
    const nowTime = dayjs().format('HH:mm');

    // 1. Verify QR Token
    const storedSecret = db.prepare(`SELECT value FROM settings WHERE key='qr_secret_token'`).get()?.value || 'ABSEN-KEY';
    if (!qr_token || (qr_token !== storedSecret && !qr_token.includes(storedSecret))) {
      return res.status(400).json({
        success: false,
        message: 'QR Code tidak valid atau sudah kedaluwarsa! Pastikan Anda memindai QR Code resmi kantor hari ini.'
      });
    }

    // 2. Validate GPS coordinates & Radius
    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      return res.status(400).json({
        success: false,
        message: 'Lokasi GPS tidak terdeteksi! Harap aktifkan izin lokasi di browser/smartphone Anda.'
      });
    }

    const targetOffice = resolveOfficeLocation(office_id, latitude, longitude);
    const distance = targetOffice.distance;

    if (distance > targetOffice.radius) {
      return res.status(400).json({
        success: false,
        message: `Lokasi Anda berada di luar radius ${targetOffice.name}! Jarak Anda: ${distance} meter (Batas radius: ${targetOffice.radius} meter).`,
        distance,
        office_name: targetOffice.name,
        allowed_radius: targetOffice.radius
      });
    }

    // 3. Check existing attendance
    const existing = db.prepare(`SELECT * FROM attendances WHERE user_id = ? AND date = ?`).get(userId, today);
    if (existing && existing.check_in_time) {
      return res.status(400).json({
        success: false,
        message: `Anda sudah melakukan absensi masuk hari ini pada pukul ${existing.check_in_time}.`
      });
    }

    // 4. Calculate Late Tolerance
    const userShift = db.prepare(`
      SELECT s.* FROM users u
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE u.id = ?
    `).get(userId);

    const shiftStart = userShift?.start_time || '08:00';
    const tolerance = userShift?.tolerance_minutes ?? 15;

    const [shiftHour, shiftMinute] = shiftStart.split(':').map(Number);
    const [nowHour, nowMinute] = nowTime.split(':').map(Number);

    const shiftStartTotalMinutes = shiftHour * 60 + shiftMinute;
    const nowTotalMinutes = nowHour * 60 + nowMinute;
    const diffMinutes = nowTotalMinutes - shiftStartTotalMinutes;

    let checkInStatus = 'Tepat Waktu';
    let lateDetails = '';

    if (diffMinutes > tolerance) {
      checkInStatus = 'Terlambat';
      lateDetails = `Terlambat ${diffMinutes} menit (Toleransi: ${tolerance} mnt)`;
    }

    // 5. Save or update attendance record
    if (existing) {
      db.prepare(`
        UPDATE attendances
        SET check_in_time = ?, check_in_lat = ?, check_in_lng = ?, check_in_distance = ?,
            check_in_status = ?, check_in_notes = ?, office_name = ?, office_location_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nowTime, latitude, longitude, distance, checkInStatus, notes || lateDetails || null, targetOffice.name, targetOffice.id, existing.id);
    } else {
      db.prepare(`
        INSERT INTO attendances (user_id, date, check_in_time, check_in_lat, check_in_lng, check_in_distance, check_in_status, check_in_notes, office_name, office_location_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, today, nowTime, latitude, longitude, distance, checkInStatus, notes || lateDetails || null, targetOffice.name, targetOffice.id);
    }

    logActivity(
      userId,
      req.session.user.name,
      `Absensi Masuk di ${targetOffice.name}: ${checkInStatus} (${nowTime}, jarak ${distance}m)`,
      'ABSENSI',
      { status: checkInStatus, time: nowTime, distance, shift: shiftStart, office: targetOffice.name },
      req.ip
    );

    // Optional notification if employee is late
    if (checkInStatus === 'Terlambat') {
      sendNotification({
        channel: 'Telegram',
        recipient: '',
        message: `<b>[Peringatan Keterlambatan]</b>\nKaryawan: ${req.session.user.name} (${req.session.user.nip})\nLokasi: ${targetOffice.name}\nJam Masuk: ${nowTime}\nStatus: ${lateDetails}`,
        autoOnly: true
      });
    }

    res.json({
      success: true,
      message: `Absensi Masuk di ${targetOffice.name} berhasil dicatat (${checkInStatus})!`,
      status: checkInStatus,
      check_in_time: nowTime,
      office_name: targetOffice.name,
      distance
    });
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ success: false, message: 'Gagal mencatat absensi: ' + err.message });
  }
});

// POST /api/absensi/check-out - Absensi Pulang
router.post('/check-out', requireAuth, (req, res) => {
  try {
    const userId = req.session.user.id;
    const { qr_token, latitude, longitude, office_id } = req.body;
    const today = dayjs().format('YYYY-MM-DD');
    const nowTime = dayjs().format('HH:mm');

    // 1. Verify QR Token
    const storedSecret = db.prepare(`SELECT value FROM settings WHERE key='qr_secret_token'`).get()?.value || 'ABSEN-KEY';
    if (!qr_token || (qr_token !== storedSecret && !qr_token.includes(storedSecret))) {
      return res.status(400).json({
        success: false,
        message: 'QR Code tidak valid! Pastikan Anda memindai QR Code resmi kantor.'
      });
    }

    // 2. Validate GPS coordinates & Radius
    let distance = 0;
    let targetOffice = null;
    if (latitude && longitude) {
      targetOffice = resolveOfficeLocation(office_id, latitude, longitude);
      distance = targetOffice.distance;

      if (distance > targetOffice.radius) {
        return res.status(400).json({
          success: false,
          message: `Lokasi Anda berada di luar radius ${targetOffice.name}! Jarak Anda: ${distance} meter (Batas: ${targetOffice.radius}m).`,
          distance,
          office_name: targetOffice.name
        });
      }
    }

    // 3. Check existing attendance record
    const attendance = db.prepare(`SELECT * FROM attendances WHERE user_id = ? AND date = ?`).get(userId, today);
    if (!attendance || !attendance.check_in_time) {
      return res.status(400).json({
        success: false,
        message: 'Anda belum melakukan absensi masuk hari ini!'
      });
    }

    if (attendance.check_out_time) {
      return res.status(400).json({
        success: false,
        message: `Anda sudah melakukan absensi pulang hari ini pada pukul ${attendance.check_out_time}.`
      });
    }

    // Calculate work duration in minutes
    const [inH, inM] = attendance.check_in_time.split(':').map(Number);
    const [outH, outM] = nowTime.split(':').map(Number);
    const duration = (outH * 60 + outM) - (inH * 60 + inM);

    db.prepare(`
      UPDATE attendances
      SET check_out_time = ?, check_out_lat = ?, check_out_lng = ?, check_out_distance = ?,
          work_duration_minutes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nowTime, latitude || null, longitude || null, distance, Math.max(0, duration), attendance.id);

    logActivity(
      userId,
      req.session.user.name,
      `Absensi Pulang: ${nowTime} di ${targetOffice?.name || attendance.office_name || 'Kantor'} (Durasi: ${Math.floor(duration / 60)}j ${duration % 60}m)`,
      'ABSENSI',
      { check_out_time: nowTime, duration_minutes: duration, office: targetOffice?.name },
      req.ip
    );

    res.json({
      success: true,
      message: `Absensi Pulang berhasil dicatat pada ${nowTime}. Terima kasih atas kerja keras Anda hari ini!`,
      check_out_time: nowTime,
      office_name: targetOffice?.name || attendance.office_name,
      duration_minutes: duration
    });
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ success: false, message: 'Gagal mencatat absensi pulang: ' + err.message });
  }
});

// GET /api/absensi/history - Riwayat absensi user (atau semua jika admin)
router.get('/history', requireAuth, (req, res) => {
  try {
    const { user_id, month, year, status } = req.query;
    const targetUserId = (req.session.user.role === 'admin' && user_id) ? user_id : req.session.user.id;

    let query = `
      SELECT a.*, u.name as user_name, u.nip, d.name as department_name, s.name as shift_name
      FROM attendances a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE 1=1
    `;
    const params = [];

    // Non-admin can only see their own attendance
    if (req.session.user.role !== 'admin') {
      query += ` AND a.user_id = ?`;
      params.push(req.session.user.id);
    } else if (user_id) {
      query += ` AND a.user_id = ?`;
      params.push(user_id);
    }

    if (month && year) {
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
      query += ` AND a.date LIKE ?`;
      params.push(`${monthPrefix}%`);
    } else if (year) {
      query += ` AND a.date LIKE ?`;
      params.push(`${year}%`);
    }

    if (status) {
      query += ` AND a.check_in_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY a.date DESC, a.check_in_time DESC`;

    const records = db.prepare(query).all(...params);

    // Calculate user summary
    const summary = {
      total: records.length,
      tepat_waktu: records.filter(r => r.check_in_status === 'Tepat Waktu').length,
      terlambat: records.filter(r => r.check_in_status === 'Terlambat').length,
      izin: records.filter(r => r.check_in_status === 'Izin').length,
      sakit: records.filter(r => r.check_in_status === 'Sakit').length,
      cuti: records.filter(r => r.check_in_status === 'Cuti').length,
      alpha: records.filter(r => r.check_in_status === 'Alpha').length
    };

    res.json({ success: true, records, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/absensi/manual - Penyesuaian manual absensi oleh Admin
router.post('/manual', requireAdmin, (req, res) => {
  try {
    const { user_id, date, check_in_time, check_out_time, check_in_status, check_in_notes } = req.body;

    if (!user_id || !date || !check_in_status) {
      return res.status(400).json({ success: false, message: 'Karyawan, Tanggal, dan Status wajib diisi' });
    }

    const existing = db.prepare(`SELECT * FROM attendances WHERE user_id = ? AND date = ?`).get(user_id, date);

    if (existing) {
      db.prepare(`
        UPDATE attendances
        SET check_in_time = ?, check_out_time = ?, check_in_status = ?, check_in_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(check_in_time || null, check_out_time || null, check_in_status, check_in_notes || 'Manual Entry oleh Admin', existing.id);
    } else {
      db.prepare(`
        INSERT INTO attendances (user_id, date, check_in_time, check_out_time, check_in_status, check_in_notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user_id, date, check_in_time || null, check_out_time || null, check_in_status, check_in_notes || 'Manual Entry oleh Admin');
    }

    logActivity(req.session.user.id, req.session.user.name, `Koreksi absensi manual: User #${user_id} (${date}) -> ${check_in_status}`, 'ABSENSI', { user_id, date, status: check_in_status }, req.ip);

    res.json({ success: true, message: 'Data absensi berhasil disimpan/disesuaikan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
