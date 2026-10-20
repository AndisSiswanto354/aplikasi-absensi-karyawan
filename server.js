const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./database');

// Initialize database schema and seeds
initDb();

const app = express();
const PORT = process.env.PORT || 3050;

// Trust reverse proxies (Render, Railway, Cloudflare, etc.)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Session configuration
app.use(session({
  name: 'absensi_sid',
  secret: 'absensi-karyawan-super-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to true if running under HTTPS in production
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/karyawan', require('./routes/karyawan'));
app.use('/api/absensi', require('./routes/absensi'));
app.use('/api/jadwal', require('./routes/jadwal'));
app.use('/api/lembur', require('./routes/lembur'));
app.use('/api/laporan', require('./routes/laporan'));
app.use('/api/pengaturan', require('./routes/pengaturan'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/notifikasi', require('./routes/notifikasi'));
app.use('/api/logs', require('./routes/logs'));

// Dedicated Lobby / Front-desk QR Code Screen
app.get('/qr-display', (req, res) => {
  res.sendFile('qr-display.html', { root: path.join(__dirname, 'public') });
});

// Fallback to index.html for SPA routing
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile('index.html', { root: path.join(__dirname, 'public') });
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Terjadi kesalahan internal pada server'
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Aplikasi Absensi Karyawan berjalan aktif!`);
  console.log(`📡 URL Utama: http://localhost:${PORT}`);
  console.log(`📺 Layar QR Kantor (Display): http://localhost:${PORT}/qr-display`);
  console.log(`👤 Akun Demo Admin: admin@perusahaan.com | admin123`);
  console.log(`👤 Akun Demo Karyawan: budi@perusahaan.com | karyawan123`);
  console.log(`====================================================`);
});
