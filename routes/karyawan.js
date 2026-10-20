const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { db, logActivity } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Setup multer for avatar uploads
const uploadDir = path.join(__dirname, '../public/uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar yang diizinkan'));
    }
  }
});

// GET /api/karyawan - List all employees (Admin & Karyawan can view directory)
router.get('/', requireAuth, (req, res) => {
  try {
    const { search, department_id, status } = req.query;

    let query = `
      SELECT u.id, u.nip, u.name, u.email, u.phone, u.address, u.role, u.avatar, u.status, u.created_at,
             d.id as department_id, d.name as department_name,
             s.id as shift_id, s.name as shift_name, s.start_time, s.end_time
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (u.name LIKE ? OR u.nip LIKE ? OR u.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (department_id) {
      query += ` AND u.department_id = ?`;
      params.push(department_id);
    }

    if (status) {
      query += ` AND u.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY u.role ASC, u.name ASC`;

    const employees = db.prepare(query).all(...params);
    res.json({ success: true, employees });
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/karyawan/:id - Detail employee
router.get('/:id', requireAuth, (req, res) => {
  try {
    const employee = db.prepare(`
      SELECT u.id, u.nip, u.name, u.email, u.phone, u.address, u.role, u.avatar, u.status, u.created_at,
             d.id as department_id, d.name as department_name,
             s.id as shift_id, s.name as shift_name, s.start_time, s.end_time
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE u.id = ?
    `).get(req.params.id);

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Karyawan tidak ditemukan' });
    }

    res.json({ success: true, employee });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/karyawan - Tambah Karyawan baru (Admin only)
router.post('/', requireAdmin, upload.single('avatar'), (req, res) => {
  try {
    const { nip, name, email, password, phone, address, department_id, shift_id, role, status } = req.body;

    if (!nip || !name || !email || !password) {
      return res.status(400).json({ success: false, message: 'NIP, Nama, Email, dan Password wajib diisi' });
    }

    // Check duplicate NIP / Email
    const existing = db.prepare(`SELECT id, nip, email FROM users WHERE nip = ? OR email = ?`).get(nip.trim(), email.trim());
    if (existing) {
      if (existing.nip === nip.trim()) {
        return res.status(400).json({ success: false, message: `NIP ${nip} sudah terdaftar!` });
      }
      return res.status(400).json({ success: false, message: `Email ${email} sudah terdaftar!` });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : null;

    const stmt = db.prepare(`
      INSERT INTO users (nip, name, email, password, phone, address, department_id, shift_id, role, avatar, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      nip.trim(),
      name.trim(),
      email.trim(),
      hashedPassword,
      phone || null,
      address || null,
      department_id || null,
      shift_id || null,
      role || 'karyawan',
      avatarUrl,
      status || 'aktif'
    );

    logActivity(req.session.user.id, req.session.user.name, `Menambah karyawan baru: ${name} (NIP: ${nip})`, 'KARYAWAN', { new_id: result.lastInsertRowid, nip, name }, req.ip);

    res.json({ success: true, message: 'Data karyawan berhasil ditambahkan', id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error adding employee:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/karyawan/:id - Edit Karyawan (Admin only)
router.put('/:id', requireAdmin, upload.single('avatar'), (req, res) => {
  try {
    const id = req.params.id;
    const { nip, name, email, password, phone, address, department_id, shift_id, role, status } = req.body;

    const current = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!current) {
      return res.status(404).json({ success: false, message: 'Data karyawan tidak ditemukan' });
    }

    // Check duplicate NIP or email with other users
    const duplicate = db.prepare(`SELECT id FROM users WHERE (nip = ? OR email = ?) AND id != ?`).get(nip.trim(), email.trim(), id);
    if (duplicate) {
      return res.status(400).json({ success: false, message: 'NIP atau Email sudah digunakan karyawan lain' });
    }

    let passwordHash = current.password;
    if (password && password.trim() !== '') {
      passwordHash = bcrypt.hashSync(password.trim(), 10);
    }

    let avatarUrl = current.avatar;
    if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    db.prepare(`
      UPDATE users
      SET nip = ?, name = ?, email = ?, password = ?, phone = ?, address = ?,
          department_id = ?, shift_id = ?, role = ?, avatar = ?, status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nip.trim(),
      name.trim(),
      email.trim(),
      passwordHash,
      phone || null,
      address || null,
      department_id || null,
      shift_id || null,
      role || current.role,
      avatarUrl,
      status || current.status,
      id
    );

    logActivity(req.session.user.id, req.session.user.name, `Memperbarui data karyawan: ${name} (NIP: ${nip})`, 'KARYAWAN', { id, nip, name }, req.ip);

    res.json({ success: true, message: 'Data karyawan berhasil diperbarui' });
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/karyawan/:id - Hapus Karyawan (Admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;

    if (parseInt(id) === req.session.user.id) {
      return res.status(400).json({ success: false, message: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang login!' });
    }

    const current = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!current) {
      return res.status(404).json({ success: false, message: 'Karyawan tidak ditemukan' });
    }

    db.prepare(`DELETE FROM users WHERE id = ?`).run(id);

    logActivity(req.session.user.id, req.session.user.name, `Menghapus karyawan: ${current.name} (NIP: ${current.nip})`, 'KARYAWAN', { deleted_id: id, name: current.name }, req.ip);

    res.json({ success: true, message: `Karyawan ${current.name} berhasil dihapus` });
  } catch (err) {
    console.error('Error deleting employee:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// CRUD JABATAN / DEPARTEMEN
// ==========================================

// GET /api/karyawan/departments/all
router.get('/departments/all', requireAuth, (req, res) => {
  try {
    const departments = db.prepare(`
      SELECT d.*, COUNT(u.id) as employee_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id
      GROUP BY d.id
      ORDER BY d.name ASC
    `).all();
    res.json({ success: true, departments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/karyawan/departments (Admin only)
router.post('/departments', requireAdmin, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Nama jabatan/departemen wajib diisi' });
    }

    const result = db.prepare(`INSERT INTO departments (name, description) VALUES (?, ?)`).run(name.trim(), description || null);

    logActivity(req.session.user.id, req.session.user.name, `Menambah departemen/jabatan baru: ${name}`, 'KARYAWAN', { id: result.lastInsertRowid, name }, req.ip);

    res.json({ success: true, message: 'Jabatan/Departemen berhasil ditambahkan', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/karyawan/departments/:id (Admin only)
router.put('/departments/:id', requireAdmin, (req, res) => {
  try {
    const { name, description } = req.body;
    const id = req.params.id;

    db.prepare(`UPDATE departments SET name = ?, description = ? WHERE id = ?`).run(name.trim(), description || null, id);

    logActivity(req.session.user.id, req.session.user.name, `Memperbarui departemen/jabatan: ${name}`, 'KARYAWAN', { id, name }, req.ip);

    res.json({ success: true, message: 'Jabatan/Departemen berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/karyawan/departments/:id (Admin only)
router.delete('/departments/:id', requireAdmin, (req, res) => {
  try {
    const id = req.params.id;
    const dept = db.prepare(`SELECT * FROM departments WHERE id = ?`).get(id);
    if (!dept) {
      return res.status(404).json({ success: false, message: 'Jabatan tidak ditemukan' });
    }

    db.prepare(`DELETE FROM departments WHERE id = ?`).run(id);

    logActivity(req.session.user.id, req.session.user.name, `Menghapus departemen/jabatan: ${dept.name}`, 'KARYAWAN', { id, name: dept.name }, req.ip);

    res.json({ success: true, message: 'Jabatan/Departemen berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
