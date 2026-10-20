const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { db, logActivity } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Upload setup for logo
const uploadDir = path.join(__dirname, '../public/uploads/logo');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'company-logo' + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }
});

// GET /api/pengaturan - Ambil semua pengaturan
router.get('/', requireAuth, (req, res) => {
  try {
    const settings = db.prepare(`SELECT key, value FROM settings`).all();
    const config = {};
    settings.forEach(s => {
      config[s.key] = s.value;
    });

    // Strip sensitive Telegram & WA tokens if non-admin
    if (req.session.user.role !== 'admin') {
      delete config.wa_api_token;
      delete config.telegram_bot_token;
    }

    res.json({ success: true, settings: config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pengaturan/public - Ambil data publik perusahaan (logo, nama, koordinat kantor, qr token)
router.get('/public', (req, res) => {
  try {
    const publicKeys = ['company_name', 'company_address', 'company_phone', 'company_email', 'company_logo', 'office_lat', 'office_lng', 'office_radius', 'qr_secret_token'];
    const placeholders = publicKeys.map(() => '?').join(',');
    const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`).all(...publicKeys);

    const config = {};
    rows.forEach(r => {
      config[r.key] = r.value;
    });

    const offices = db.prepare(`SELECT id, name, address, latitude, longitude, radius, is_primary FROM office_locations ORDER BY is_primary DESC, name ASC`).all();
    config.offices = offices;

    res.json({ success: true, settings: config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pengaturan - Simpan pengaturan umum & lokasi kantor (Admin only)
router.post('/', requireAdmin, (req, res) => {
  try {
    const updateSetting = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);

    const allowedFields = [
      'company_name',
      'company_address',
      'company_phone',
      'company_email',
      'office_lat',
      'office_lng',
      'office_radius',
      'default_work_start',
      'default_work_end',
      'default_tolerance',
      'qr_refresh_interval',
      'wa_enabled',
      'wa_api_url',
      'wa_api_token',
      'telegram_enabled',
      'telegram_bot_token',
      'telegram_chat_id'
    ];

    db.transaction(() => {
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateSetting.run(field, String(req.body[field]));
        }
      }
    })();

    logActivity(req.session.user.id, req.session.user.name, 'Memperbarui konfigurasi sistem & kantor', 'PENGATURAN', req.body, req.ip);

    res.json({ success: true, message: 'Pengaturan sistem berhasil diperbarui!' });
  } catch (err) {
    console.error('Save settings error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pengaturan/logo - Upload logo perusahaan (Admin only)
router.post('/logo', requireAdmin, upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Pilih file logo untuk diunggah' });
    }

    const logoUrl = `/uploads/logo/${req.file.filename}?t=${Date.now()}`;
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('company_logo', ?)`).run(logoUrl);

    logActivity(req.session.user.id, req.session.user.name, 'Mengunggah logo baru perusahaan', 'PENGATURAN', { logoUrl }, req.ip);

    res.json({ success: true, message: 'Logo perusahaan berhasil diunggah!', logoUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/pengaturan/qr - Generate QR Code image for the office
router.get('/qr', async (req, res) => {
  try {
    const token = db.prepare(`SELECT value FROM settings WHERE key='qr_secret_token'`).get()?.value || 'QR-ABSEN-NSD-2026-X99';
    const qrDataUrl = await QRCode.toDataURL(token, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1E293B',
        light: '#FFFFFF'
      }
    });

    res.json({
      success: true,
      token,
      qr_image: qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pengaturan/qr/regenerate - Buat kode QR baru untuk kantor (Admin only)
router.post('/qr/regenerate', requireAdmin, (req, res) => {
  try {
    const newToken = 'QR-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('qr_secret_token', ?)`).run(newToken);

    logActivity(req.session.user.id, req.session.user.name, `Membuat ulang (Regenerate) QR Code kantor: ${newToken}`, 'PENGATURAN', { newToken }, req.ip);

    res.json({ success: true, message: 'QR Code kantor berhasil diperbarui!', token: newToken });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// CRUD MULTI-LOKASI KANTOR (OFFICE LOCATIONS)
// ==========================================

// GET /api/pengaturan/offices - Ambil semua titik kantor
router.get('/offices', requireAuth, (req, res) => {
  try {
    const offices = db.prepare(`SELECT * FROM office_locations ORDER BY is_primary DESC, name ASC`).all();
    res.json({ success: true, offices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pengaturan/offices - Tambah titik kantor baru (Admin only)
router.post('/offices', requireAdmin, (req, res) => {
  try {
    const { name, address, latitude, longitude, radius, is_primary } = req.body;

    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'Nama kantor, latitude, dan longitude wajib diisi' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseInt(radius) || 100;
    const isPrimary = is_primary ? 1 : 0;

    let result;
    db.transaction(() => {
      if (isPrimary === 1) {
        db.prepare(`UPDATE office_locations SET is_primary = 0`).run();
        db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_lat', ?)`).run(String(lat));
        db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_lng', ?)`).run(String(lng));
        db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_radius', ?)`).run(String(rad));
      }

      const stmt = db.prepare(`
        INSERT INTO office_locations (name, address, latitude, longitude, radius, is_primary)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      result = stmt.run(name.trim(), address || '', lat, lng, rad, isPrimary);
    })();

    logActivity(
      req.session.user.id,
      req.session.user.name,
      `Menambah titik kantor baru: ${name} (Lat: ${lat}, Lng: ${lng}, Rad: ${rad}m)`,
      'PENGATURAN',
      { name, address, latitude: lat, longitude: lng, radius: rad, is_primary: isPrimary },
      req.ip
    );

    res.json({
      success: true,
      message: `Titik kantor "${name}" berhasil ditambahkan!`,
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('Error adding office:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/pengaturan/offices/:id - Edit titik kantor (Admin only)
router.put('/offices/:id', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const { name, address, latitude, longitude, radius, is_primary } = req.body;

    const office = db.prepare(`SELECT * FROM office_locations WHERE id = ?`).get(id);
    if (!office) {
      return res.status(404).json({ success: false, message: 'Titik kantor tidak ditemukan' });
    }

    const officeName = (name !== undefined && name !== null) ? String(name).trim() : office.name;
    const officeAddress = (address !== undefined && address !== null) ? address : office.address;
    const lat = (latitude !== undefined && latitude !== null) ? parseFloat(latitude) : office.latitude;
    const lng = (longitude !== undefined && longitude !== null) ? parseFloat(longitude) : office.longitude;
    const rad = (radius !== undefined && radius !== null) ? (parseInt(radius) || 100) : office.radius;
    const isPrimary = (is_primary !== undefined && is_primary !== null) ? (is_primary ? 1 : 0) : office.is_primary;

    if (!officeName) {
      return res.status(400).json({ success: false, message: 'Nama kantor tidak boleh kosong' });
    }

    db.transaction(() => {
      if (isPrimary === 1) {
        db.prepare(`UPDATE office_locations SET is_primary = 0`).run();
        db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_lat', ?)`).run(String(lat));
        db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_lng', ?)`).run(String(lng));
        db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_radius', ?)`).run(String(rad));
      }

      db.prepare(`
        UPDATE office_locations
        SET name = ?, address = ?, latitude = ?, longitude = ?, radius = ?, is_primary = ?
        WHERE id = ?
      `).run(officeName, officeAddress || '', lat, lng, rad, isPrimary, id);
    })();

    logActivity(
      req.session.user.id,
      req.session.user.name,
      `Memperbarui titik kantor: ${officeName}`,
      'PENGATURAN',
      { id, name: officeName, latitude: lat, longitude: lng, radius: rad },
      req.ip
    );

    res.json({ success: true, message: `Titik kantor "${officeName}" berhasil diperbarui!` });
  } catch (err) {
    console.error('Error updating office:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/pengaturan/offices/:id - Hapus titik kantor (Admin only)
router.delete('/offices/:id', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const totalOffices = db.prepare(`SELECT count(*) as count FROM office_locations`).get().count;

    if (totalOffices <= 1) {
      return res.status(400).json({ success: false, message: 'Minimal harus ada 1 titik kantor aktif di sistem!' });
    }

    const office = db.prepare(`SELECT * FROM office_locations WHERE id = ?`).get(id);
    if (!office) {
      return res.status(404).json({ success: false, message: 'Titik kantor tidak ditemukan' });
    }

    db.transaction(() => {
      db.prepare(`DELETE FROM office_locations WHERE id = ?`).run(id);

      if (office.is_primary === 1) {
        const nextOffice = db.prepare(`SELECT * FROM office_locations ORDER BY id ASC LIMIT 1`).get();
        if (nextOffice) {
          db.prepare(`UPDATE office_locations SET is_primary = 1 WHERE id = ?`).run(nextOffice.id);
          db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_lat', ?)`).run(String(nextOffice.latitude));
          db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_lng', ?)`).run(String(nextOffice.longitude));
          db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_radius', ?)`).run(String(nextOffice.radius));
        }
      }
    })();

    logActivity(req.session.user.id, req.session.user.name, `Menghapus titik kantor: ${office.name}`, 'PENGATURAN', { id, name: office.name }, req.ip);

    res.json({ success: true, message: `Titik kantor "${office.name}" berhasil dihapus!` });
  } catch (err) {
    console.error('Error deleting office:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/pengaturan/offices/:id/primary - Jadikan titik kantor utama (Admin only)
router.post('/offices/:id/primary', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const office = db.prepare(`SELECT * FROM office_locations WHERE id = ?`).get(id);
    if (!office) {
      return res.status(404).json({ success: false, message: 'Titik kantor tidak ditemukan' });
    }

    db.transaction(() => {
      db.prepare(`UPDATE office_locations SET is_primary = 0`).run();
      db.prepare(`UPDATE office_locations SET is_primary = 1 WHERE id = ?`).run(id);

      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_lat', ?)`).run(String(office.latitude));
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_lng', ?)`).run(String(office.longitude));
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('office_radius', ?)`).run(String(office.radius));
    })();

    logActivity(req.session.user.id, req.session.user.name, `Menetapkan ${office.name} sebagai titik kantor utama`, 'PENGATURAN', { id, name: office.name }, req.ip);

    res.json({ success: true, message: `"${office.name}" kini menjadi titik kantor utama!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
