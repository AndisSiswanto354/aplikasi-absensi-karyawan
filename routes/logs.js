const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/logs - Ambil log audit aktivitas sistem
router.get('/', requireAdmin, (req, res) => {
  try {
    const { category, search, start_date, end_date, limit = 100 } = req.query;

    let query = `SELECT * FROM activity_logs WHERE 1=1`;
    const params = [];

    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }

    if (search) {
      query += ` AND (action LIKE ? OR user_name LIKE ? OR details LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (start_date && end_date) {
      query += ` AND DATE(created_at) BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ` AND DATE(created_at) >= ?`;
      params.push(start_date);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit) || 100);

    const logs = db.prepare(query).all(...params);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/logs/clear - Bersihkan log aktivitas lama (Admin only)
router.delete('/clear', requireAdmin, (req, res) => {
  try {
    db.prepare(`DELETE FROM activity_logs`).run();
    res.json({ success: true, message: 'Semua log aktivitas telah dibersihkan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
