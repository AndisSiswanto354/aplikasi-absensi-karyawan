const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
const { db, logActivity } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendNotification } = require('../notification');

// File upload for leave attachments (surat dokter, formulir izin)
const uploadDir = path.join(__dirname, '../public/uploads/dokumen');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'dokumen-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ==========================================
// 1. SHIFTS MANAGEMENT (CRUD)
// ==========================================

// GET /api/jadwal/shifts
router.get('/shifts', requireAuth, (req, res) => {
  try {
    const shifts = db.prepare(`
      SELECT s.*, COUNT(u.id) as employee_count
      FROM shifts s
      LEFT JOIN users u ON u.shift_id = s.id
      GROUP BY s.id
      ORDER BY s.start_time ASC
    `).all();
    res.json({ success: true, shifts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/jadwal/shifts (Admin only)
router.post('/shifts', requireAdmin, (req, res) => {
  try {
    const { name, start_time, end_time, tolerance_minutes } = req.body;
    if (!name || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: 'Nama shift, jam masuk, dan jam pulang wajib diisi' });
    }

    const result = db.prepare(`
      INSERT INTO shifts (name, start_time, end_time, tolerance_minutes)
      VALUES (?, ?, ?, ?)
    `).run(name.trim(), start_time, end_time, parseInt(tolerance_minutes) || 15);

    logActivity(req.session.user.id, req.session.user.name, `Membuat shift kerja baru: ${name} (${start_time} - ${end_time})`, 'SHIFT', { id: result.lastInsertRowid, name }, req.ip);

    res.json({ success: true, message: 'Shift baru berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/jadwal/shifts/:id (Admin only)
router.put('/shifts/:id', requireAdmin, (req, res) => {
  try {
    const { name, start_time, end_time, tolerance_minutes } = req.body;
    const id = req.params.id;

    db.prepare(`
      UPDATE shifts
      SET name = ?, start_time = ?, end_time = ?, tolerance_minutes = ?
      WHERE id = ?
    `).run(name.trim(), start_time, end_time, parseInt(tolerance_minutes) || 15, id);

    logActivity(req.session.user.id, req.session.user.name, `Memperbarui shift kerja: ${name}`, 'SHIFT', { id, name }, req.ip);

    res.json({ success: true, message: 'Shift berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/jadwal/shifts/:id (Admin only)
router.delete('/shifts/:id', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(id);
    if (!shift) {
      return res.status(404).json({ success: false, message: 'Shift tidak ditemukan' });
    }

    db.prepare(`DELETE FROM shifts WHERE id = ?`).run(id);

    logActivity(req.session.user.id, req.session.user.name, `Menghapus shift kerja: ${shift.name}`, 'SHIFT', { id }, req.ip);

    res.json({ success: true, message: 'Shift berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/jadwal/assign - Assign shift ke karyawan (Admin only)
router.post('/assign', requireAdmin, (req, res) => {
  try {
    const { user_id, shift_id } = req.body;
    if (!user_id || !shift_id) {
      return res.status(400).json({ success: false, message: 'Pilih karyawan dan shift' });
    }

    db.prepare(`UPDATE users SET shift_id = ? WHERE id = ?`).run(shift_id, user_id);

    const user = db.prepare(`SELECT name, nip FROM users WHERE id = ?`).get(user_id);
    const shift = db.prepare(`SELECT name FROM shifts WHERE id = ?`).get(shift_id);

    logActivity(req.session.user.id, req.session.user.name, `Menetapkan shift ${shift?.name} untuk ${user?.name}`, 'SHIFT', { user_id, shift_id }, req.ip);

    res.json({ success: true, message: `Shift berhasil ditetapkan untuk ${user?.name}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 2. PENGAJUAN CUTI, IZIN, SAKIT
// ==========================================

// GET /api/jadwal/leaves - List pengajuan cuti/izin/sakit
router.get('/leaves', requireAuth, (req, res) => {
  try {
    const { status, user_id, type } = req.query;

    let query = `
      SELECT l.*, u.name as user_name, u.nip, d.name as department_name,
             reviewer.name as reviewer_name
      FROM leaves l
      JOIN users u ON l.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users reviewer ON l.reviewed_by = reviewer.id
      WHERE 1=1
    `;
    const params = [];

    // If employee, only view personal leaves
    if (req.session.user.role !== 'admin') {
      query += ` AND l.user_id = ?`;
      params.push(req.session.user.id);
    } else if (user_id) {
      query += ` AND l.user_id = ?`;
      params.push(user_id);
    }

    if (status) {
      query += ` AND l.status = ?`;
      params.push(status);
    }

    if (type) {
      query += ` AND l.type = ?`;
      params.push(type);
    }

    query += ` ORDER BY l.created_at DESC`;

    const leaves = db.prepare(query).all(...params);
    res.json({ success: true, leaves });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/jadwal/leaves - Ajukan Cuti/Izin/Sakit (Karyawan & Admin)
router.post('/leaves', requireAuth, upload.single('attachment'), (req, res) => {
  try {
    const userId = req.session.user.id;
    const { type, start_date, end_date, reason } = req.body;

    if (!type || !start_date || !end_date || !reason) {
      return res.status(400).json({ success: false, message: 'Jenis permohonan, tanggal mulai, tanggal selesai, dan alasan wajib diisi' });
    }

    const start = dayjs(start_date);
    const end = dayjs(end_date);
    if (end.isBefore(start)) {
      return res.status(400).json({ success: false, message: 'Tanggal selesai tidak boleh sebelum tanggal mulai' });
    }

    const totalDays = end.diff(start, 'day') + 1;
    const attachmentUrl = req.file ? `/uploads/dokumen/${req.file.filename}` : null;

    const result = db.prepare(`
      INSERT INTO leaves (user_id, type, start_date, end_date, total_days, reason, attachment, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'menunggu')
    `).run(userId, type, start_date, end_date, totalDays, reason, attachmentUrl);

    logActivity(
      userId,
      req.session.user.name,
      `Mengajukan ${type.toUpperCase()}: ${start_date} s/d ${end_date} (${totalDays} hari)`,
      'CUTI',
      { type, start_date, end_date, totalDays, reason },
      req.ip
    );

    // Send notification to Admin
    sendNotification({
      channel: 'Telegram',
      recipient: '',
      message: `📋 <b>Pengajuan Permohonan Baru:</b>\nKaryawan: ${req.session.user.name} (${req.session.user.nip})\nJenis: ${type.toUpperCase()}\nPeriode: ${start_date} s/d ${end_date} (${totalDays} hari)\nAlasan: ${reason}`,
      autoOnly: true
    });

    res.json({
      success: true,
      message: `Pengajuan ${type} berhasil dikirim! Menunggu persetujuan manajemen/HRD.`,
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Leave submission error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/jadwal/leaves/:id/review - Setujui atau Tolak Permohonan (Admin only)
router.post('/leaves/:id/review', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const { status, admin_notes } = req.body; // status: 'disetujui' | 'ditolak'
    const adminId = req.session.user.id;

    if (!['disetujui', 'ditolak'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status harus "disetujui" atau "ditolak"' });
    }

    const leave = db.prepare(`SELECT l.*, u.name as user_name FROM leaves l JOIN users u ON l.user_id = u.id WHERE l.id = ?`).get(id);
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan' });
    }

    db.prepare(`
      UPDATE leaves
      SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, admin_notes || null, adminId, id);

    // If approved, automatically populate attendance table with corresponding status
    if (status === 'disetujui') {
      const start = dayjs(leave.start_date);
      const end = dayjs(leave.end_date);
      const leaveTypeTitle = leave.type === 'cuti' ? 'Cuti' : (leave.type === 'sakit' ? 'Sakit' : 'Izin');

      const insertOrUpdateAttendance = db.prepare(`
        INSERT INTO attendances (user_id, date, check_in_status, check_in_notes)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          check_in_status = excluded.check_in_status,
          check_in_notes = excluded.check_in_notes,
          updated_at = CURRENT_TIMESTAMP
      `);

      let cur = start;
      while (cur.isBefore(end) || cur.isSame(end, 'day')) {
        const curDate = cur.format('YYYY-MM-DD');
        insertOrUpdateAttendance.run(leave.user_id, curDate, leaveTypeTitle, `Persetujuan ${leaveTypeTitle}: ${leave.reason}`);
        cur = cur.add(1, 'day');
      }
    }

    logActivity(
      adminId,
      req.session.user.name,
      `Persetujuan Permohonan: #${id} ${leave.type} ${leave.user_name} -> ${status.toUpperCase()}`,
      'CUTI',
      { leave_id: id, status, admin_notes },
      req.ip
    );

    res.json({
      success: true,
      message: `Pengajuan ${leave.type} karyawan ${leave.user_name} telah ${status === 'disetujui' ? 'DISETUJUI' : 'DITOLAK'}.`
    });
  } catch (err) {
    console.error('Leave review error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
