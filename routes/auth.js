const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, logActivity } = require('../database');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { emailOrNip, password } = req.body;

    if (!emailOrNip || !password) {
      return res.status(400).json({ success: false, message: 'Email/NIP dan password wajib diisi' });
    }

    const user = db.prepare(`
      SELECT u.*, d.name as department_name, s.name as shift_name, s.start_time, s.end_time
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE (u.email = ? OR u.nip = ?)
    `).get(emailOrNip.trim(), emailOrNip.trim());

    if (!user) {
      return res.status(401).json({ success: false, message: 'Akun tidak ditemukan. Periksa kembali NIP/Email.' });
    }

    if (user.status !== 'aktif') {
      return res.status(403).json({ success: false, message: 'Akun ini dinonaktifkan oleh administrator.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Password salah!' });
    }

    // Save session
    req.session.user = {
      id: user.id,
      nip: user.nip,
      name: user.name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
      department_name: user.department_name || 'Umum',
      shift_id: user.shift_id,
      shift_name: user.shift_name,
      start_time: user.start_time,
      end_time: user.end_time,
      avatar: user.avatar
    };

    logActivity(user.id, user.name, 'Login ke sistem', 'AUTH', `User logged in from IP ${req.ip}`, req.ip);

    res.json({
      success: true,
      message: 'Login berhasil!',
      user: req.session.user
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan internal server: ' + err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  const user = req.session.user;
  if (user) {
    logActivity(user.id, user.name, 'Logout dari sistem', 'AUTH', 'User signed out', req.ip);
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Gagal logout' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Berhasil logout' });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, message: 'Belum login' });
  }

  // Fetch fresh user data
  const user = db.prepare(`
    SELECT u.id, u.nip, u.name, u.email, u.phone, u.address, u.role, u.avatar, u.status,
           d.name as department_name, s.name as shift_name, s.start_time, s.end_time, s.tolerance_minutes
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN shifts s ON u.shift_id = s.id
    WHERE u.id = ?
  `).get(req.session.user.id);

  if (!user) {
    req.session.destroy();
    return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
  }

  res.json({ success: true, user });
});

// POST /api/auth/profile (Update personal data & password)
router.post('/profile', requireAuth, (req, res) => {
  try {
    const { name, phone, address, current_password, new_password } = req.body;
    const userId = req.session.user.id;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }

    let passwordHash = user.password;
    if (new_password) {
      if (!current_password) {
        return res.status(400).json({ success: false, message: 'Password saat ini wajib diisi jika ingin mengubah password' });
      }
      if (!bcrypt.compareSync(current_password, user.password)) {
        return res.status(400).json({ success: false, message: 'Password saat ini tidak sesuai' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter' });
      }
      passwordHash = bcrypt.hashSync(new_password, 10);
    }

    db.prepare(`
      UPDATE users
      SET name = ?, phone = ?, address = ?, password = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name || user.name, phone || user.phone, address || user.address, passwordHash, userId);

    req.session.user.name = name || user.name;
    logActivity(userId, req.session.user.name, 'Memperbarui profil mandiri', 'AUTH', 'Updated personal profile', req.ip);

    res.json({ success: true, message: 'Profil berhasil diperbarui' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui profil: ' + err.message });
  }
});

module.exports = router;
