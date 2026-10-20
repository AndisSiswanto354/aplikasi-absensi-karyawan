const express = require('express');
const router = express.Router();
const { db, logActivity } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendNotification } = require('../notification');

// GET /api/notifikasi/logs - Ambil log riwayat pengiriman notifikasi
router.get('/logs', requireAdmin, (req, res) => {
  try {
    const { channel, status, limit = 50 } = req.query;

    let query = `SELECT * FROM notifications_log WHERE 1=1`;
    const params = [];

    if (channel) {
      query += ` AND channel = ?`;
      params.push(channel);
    }
    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit) || 50);

    const logs = db.prepare(query).all(...params);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/notifikasi/test - Test kirim notifikasi manual
router.post('/test', requireAdmin, async (req, res) => {
  try {
    const { channel, recipient, message } = req.body;

    if (!channel || !message) {
      return res.status(400).json({ success: false, message: 'Channel dan pesan wajib diisi' });
    }

    const result = await sendNotification({
      channel,
      recipient: recipient || 'Admin Test',
      message
    });

    logActivity(
      req.session.user.id,
      req.session.user.name,
      `Uji coba pengiriman notifikasi via ${channel}`,
      'PENGATURAN',
      { channel, recipient, success: result.success },
      req.ip
    );

    res.json({
      success: result.success,
      message: result.success
        ? `Notifikasi tes berhasil dikirim ke ${channel}!`
        : `Gagal mengirim notifikasi: ${result.response}`,
      details: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/notifikasi/logs - Bersihkan riwayat log notifikasi
router.delete('/logs', requireAdmin, (req, res) => {
  try {
    db.prepare(`DELETE FROM notifications_log`).run();
    logActivity(req.session.user.id, req.session.user.name, 'Membersihkan log riwayat notifikasi', 'PENGATURAN', null, req.ip);
    res.json({ success: true, message: 'Log riwayat notifikasi berhasil dikosongkan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
