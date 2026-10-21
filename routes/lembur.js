const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');
const { db, logActivity } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendNotification } = require('../notification');

// GET /api/lembur - List pengajuan lembur
router.get('/', requireAuth, (req, res) => {
  try {
    const { status, user_id, month, year } = req.query;

    let query = `
      SELECT o.*, u.name as user_name, u.nip, d.name as department_name,
             reviewer.name as reviewer_name
      FROM overtimes o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN users reviewer ON o.reviewed_by = reviewer.id
      WHERE 1=1
    `;
    const params = [];

    if (req.session.user.role !== 'admin') {
      query += ` AND o.user_id = ?`;
      params.push(req.session.user.id);
    } else if (user_id) {
      query += ` AND o.user_id = ?`;
      params.push(user_id);
    }

    if (status) {
      query += ` AND o.status = ?`;
      params.push(status);
    }

    if (month && year) {
      const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
      query += ` AND o.date LIKE ?`;
      params.push(`${monthPrefix}%`);
    }

    query += ` ORDER BY o.date DESC, o.start_time DESC`;

    const overtimes = db.prepare(query).all(...params);

    // Calculate total hours
    const totalHours = overtimes.reduce((sum, item) => sum + (item.status === 'disetujui' ? item.total_hours : 0), 0);

    res.json({
      success: true,
      overtimes,
      total_approved_hours: Math.round(totalHours * 10) / 10
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/lembur - Ajukan Lembur (Karyawan)
router.post('/', requireAuth, (req, res) => {
  try {
    const userId = req.session.user.id;
    const { date, start_time, end_time, task_description } = req.body;

    if (!date || !start_time || !end_time || !task_description) {
      return res.status(400).json({ success: false, message: 'Tanggal, jam mulai, jam selesai, dan uraian tugas lembur wajib diisi' });
    }

    // Calculate total hours
    const [sH, sM] = start_time.split(':').map(Number);
    const [eH, eM] = end_time.split(':').map(Number);
    let totalMinutes = (eH * 60 + eM) - (sH * 60 + sM);
    if (totalMinutes <= 0) {
      // Overtime passing midnight
      totalMinutes += 24 * 60;
    }
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    const result = db.prepare(`
      INSERT INTO overtimes (user_id, date, start_time, end_time, total_hours, task_description, status)
      VALUES (?, ?, ?, ?, ?, ?, 'menunggu')
    `).run(userId, date, start_time, end_time, totalHours, task_description);

    logActivity(
      userId,
      req.session.user.name,
      `Mengajukan lembur: ${date} (${start_time} - ${end_time}, ${totalHours} jam)`,
      'LEMBUR',
      { date, start_time, end_time, totalHours, task_description },
      req.ip
    );

    // Notify Admin
    sendNotification({
      channel: 'Telegram',
      recipient: '',
      message: `<b>[Pengajuan Lembur Baru]</b>\nKaryawan: ${req.session.user.name} (${req.session.user.nip})\nTanggal: ${date} (${start_time} - ${end_time})\nDurasi: ${totalHours} Jam\nUraian: ${task_description}`,
      autoOnly: true
    });

    res.json({
      success: true,
      message: `Pengajuan lembur sebesar ${totalHours} jam berhasil dikirim untuk diverifikasi!`,
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Overtime error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/lembur/:id/review - Verifikasi Lembur (Admin only)
router.post('/:id/review', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const { status, admin_notes } = req.body; // 'disetujui' | 'ditolak'
    const adminId = req.session.user.id;

    if (!['disetujui', 'ditolak'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status harus "disetujui" atau "ditolak"' });
    }

    const ot = db.prepare(`SELECT o.*, u.name as user_name FROM overtimes o JOIN users u ON o.user_id = u.id WHERE o.id = ?`).get(id);
    if (!ot) {
      return res.status(404).json({ success: false, message: 'Data lembur tidak ditemukan' });
    }

    db.prepare(`
      UPDATE overtimes
      SET status = ?, admin_notes = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, admin_notes || null, adminId, id);

    logActivity(
      adminId,
      req.session.user.name,
      `Persetujuan Lembur #${id}: ${ot.user_name} (${ot.total_hours} Jam) -> ${status.toUpperCase()}`,
      'LEMBUR',
      { overtime_id: id, status, admin_notes },
      req.ip
    );

    res.json({
      success: true,
      message: `Pengajuan lembur ${ot.user_name} telah ${status === 'disetujui' ? 'DISETUJUI' : 'DITOLAK'}.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
