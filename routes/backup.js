const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dayjs = require('dayjs');
const { generateSqlDump, restoreSqlDump, logActivity } = require('../database');
const { requireAdmin } = require('../middleware/auth');

const upload = multer({
  dest: path.join(__dirname, '../data/temp_restore'),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Ensure temp dir exists
const tempDir = path.join(__dirname, '../data/temp_restore');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// GET /api/backup/export - Download SQL Backup File
router.get('/export', requireAdmin, (req, res) => {
  try {
    const dump = generateSqlDump();
    const filename = `backup_absensi_${dayjs().format('YYYY-MM-DD_HHmmss')}.sql`;

    logActivity(req.session.user.id, req.session.user.name, `Mengunduh file backup database SQL (${filename})`, 'BACKUP', { filename }, req.ip);

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(dump);
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ success: false, message: 'Gagal membuat backup database: ' + err.message });
  }
});

// POST /api/backup/restore - Upload & Restore Database from SQL File
router.post('/restore', requireAdmin, upload.single('sql_file'), (req, res) => {
  let tempFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Harap pilih file .sql untuk di-restore' });
    }

    tempFilePath = req.file.path;
    const sqlContent = fs.readFileSync(tempFilePath, 'utf8');

    if (!sqlContent || (!sqlContent.includes('CREATE TABLE') && !sqlContent.includes('INSERT INTO'))) {
      return res.status(400).json({ success: false, message: 'File SQL tidak valid atau kosong!' });
    }

    // Execute restore
    restoreSqlDump(sqlContent);

    logActivity(
      req.session.user.id,
      req.session.user.name,
      `Merestore database dari file: ${req.file.originalname}`,
      'BACKUP',
      { original_filename: req.file.originalname, size: req.file.size },
      req.ip
    );

    res.json({
      success: true,
      message: 'Database berhasil dipulihkan (restore) dari file SQL!'
    });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ success: false, message: 'Gagal memulihkan database: ' + err.message });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}
    }
  }
});

module.exports = router;
