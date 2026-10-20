const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = process.env.DB_PATH || path.join(dataDir, 'absensi.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema and seeds
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      tolerance_minutes INTEGER DEFAULT 15,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nip TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      role TEXT NOT NULL DEFAULT 'karyawan',
      avatar TEXT,
      status TEXT NOT NULL DEFAULT 'aktif',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      check_in_time TEXT,
      check_in_lat REAL,
      check_in_lng REAL,
      check_in_distance REAL,
      check_in_status TEXT,
      check_in_notes TEXT,
      check_out_time TEXT,
      check_out_lat REAL,
      check_out_lng REAL,
      check_out_distance REAL,
      work_duration_minutes INTEGER DEFAULT 0,
      photo_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_days INTEGER DEFAULT 1,
      reason TEXT NOT NULL,
      attachment TEXT,
      status TEXT DEFAULT 'menunggu',
      admin_notes TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS overtimes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_hours REAL NOT NULL,
      task_description TEXT NOT NULL,
      status TEXT DEFAULT 'menunggu',
      admin_notes TEXT,
      reviewed_by INTEGER REFERENCES users(id),
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT,
      action TEXT NOT NULL,
      category TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS office_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius INTEGER NOT NULL DEFAULT 100,
      is_primary INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Ensure office_name column exists in attendances
  try {
    const colCheck = db.prepare(`PRAGMA table_info(attendances)`).all();
    if (!colCheck.some(c => c.name === 'office_name')) {
      db.exec(`ALTER TABLE attendances ADD COLUMN office_name TEXT`);
    }
    if (!colCheck.some(c => c.name === 'office_location_id')) {
      db.exec(`ALTER TABLE attendances ADD COLUMN office_location_id INTEGER`);
    }
  } catch (migErr) {
    console.error('Migration error on attendances:', migErr);
  }

  // Seed default office locations if empty
  const officeCount = db.prepare('SELECT count(*) as count FROM office_locations').get().count;
  if (officeCount === 0) {
    const insertOffice = db.prepare(`
      INSERT INTO office_locations (name, address, latitude, longitude, radius, is_primary)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertOffice.run('Kantor Pusat (SCBD Jakarta)', 'Jl. Jend. Sudirman Kav. 52-53, SCBD, Jakarta Selatan', -6.225014, 106.809756, 100, 1);
    insertOffice.run('Kantor Cabang Bandung', 'Jl. Asia Afrika No. 100, Bandung, Jawa Barat', -6.917464, 107.619123, 150, 0);
    insertOffice.run('Kantor Operasional Surabaya', 'Jl. Pemuda No. 45, Surabaya, Jawa Timur', -7.257472, 112.752088, 120, 0);
  }

  // Seed default settings
  const defaultSettings = [
    ['company_name', 'PT Nusantara Solusi Digital'],
    ['company_address', 'Jl. Jend. Sudirman Kav. 52-53, SCBD, Jakarta Selatan'],
    ['company_phone', '(021) 555-0199'],
    ['company_email', 'hrd@nusantara-solusi.id'],
    ['company_logo', ''],
    ['office_lat', '-6.225014'],
    ['office_lng', '106.809756'],
    ['office_radius', '100'],
    ['qr_secret_token', 'QR-ABSEN-NSD-2026-X99'],
    ['qr_refresh_interval', '60'],
    ['default_work_start', '08:00'],
    ['default_work_end', '17:00'],
    ['default_tolerance', '15'],
    ['wa_enabled', 'false'],
    ['wa_api_url', 'https://api.fonnte.com/send'],
    ['wa_api_token', 'demo-wa-token-12345'],
    ['telegram_enabled', 'false'],
    ['telegram_bot_token', '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11'],
    ['telegram_chat_id', '-100123456789']
  ];

  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [key, val] of defaultSettings) {
    insertSetting.run(key, val);
  }

  // Seed default departments
  const defaultDepartments = [
    ['Teknologi & Informasi', 'Pengembangan sistem, software engineering, IT support'],
    ['Human Resources', 'Rekrutmen, hubungan industrial, absensi & payroll'],
    ['Keuangan & Akuntansi', 'Pembukuan, pajak, anggaran, cash flow'],
    ['Pemasaran & Sales', 'Digital marketing, client relationship, business development'],
    ['Operasional', 'Logistik, administrasi umum, fasilitas kantor']
  ];

  const deptCount = db.prepare('SELECT count(*) as count FROM departments').get().count;
  if (deptCount === 0) {
    const insertDept = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
    for (const [name, desc] of defaultDepartments) {
      insertDept.run(name, desc);
    }
  }

  // Seed default shifts
  const defaultShifts = [
    ['Shift Reguler / Kantor', '08:00', '17:00', 15],
    ['Shift Pagi (Early)', '07:00', '15:30', 10],
    ['Shift Siang', '13:00', '21:00', 15],
    ['Shift Malam', '21:00', '06:00', 15]
  ];

  const shiftCount = db.prepare('SELECT count(*) as count FROM shifts').get().count;
  if (shiftCount === 0) {
    const insertShift = db.prepare('INSERT INTO shifts (name, start_time, end_time, tolerance_minutes) VALUES (?, ?, ?, ?)');
    for (const [name, start, end, tol] of defaultShifts) {
      insertShift.run(name, start, end, tol);
    }
  }

  // Seed default users (Admin & Karyawan)
  const userCount = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (userCount === 0) {
    const adminPass = bcrypt.hashSync('admin123', 10);
    const userPass = bcrypt.hashSync('karyawan123', 10);

    const insertUser = db.prepare(`
      INSERT INTO users (nip, name, email, password, phone, address, department_id, shift_id, role, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. Admin
    insertUser.run(
      'ADM001',
      'Administrator Utama',
      'admin@perusahaan.com',
      adminPass,
      '081234567890',
      'Jl. Sudirman No. 1, Jakarta Pusat',
      2, // HR
      1, // Reguler
      'admin',
      'aktif'
    );

    // 2. Karyawan 1: Budi Santoso
    insertUser.run(
      'EMP001',
      'Budi Santoso',
      'budi@perusahaan.com',
      userPass,
      '081298765432',
      'Jl. Kebon Jeruk No. 14, Jakarta Barat',
      1, // IT
      1, // Reguler
      'karyawan',
      'aktif'
    );

    // 3. Karyawan 2: Siti Rahmawati
    insertUser.run(
      'EMP002',
      'Siti Rahmawati',
      'siti@perusahaan.com',
      userPass,
      '085611223344',
      'Jl. Tebet Raya No. 45, Jakarta Selatan',
      2, // HR
      1, // Reguler
      'karyawan',
      'aktif'
    );

    // 4. Karyawan 3: Dimas Aditya
    insertUser.run(
      'EMP003',
      'Dimas Aditya',
      'dimas@perusahaan.com',
      userPass,
      '087812349988',
      'Jl. Margonda No. 88, Depok',
      4, // Pemasaran
      1, // Reguler
      'karyawan',
      'aktif'
    );

    // Seed sample attendances for the current month so charts & reports have realistic data
    const today = new Date();
    const insertAttendance = db.prepare(`
      INSERT OR IGNORE INTO attendances (user_id, date, check_in_time, check_in_lat, check_in_lng, check_in_distance, check_in_status, check_in_notes, check_out_time, check_out_lat, check_out_lng, check_out_distance, work_duration_minutes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 7; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekend

      const dateStr = d.toISOString().split('T')[0];

      // Budi - mostly on time, one late
      const budiStatus = i === 2 ? 'Terlambat' : 'Tepat Waktu';
      const budiInTime = i === 2 ? '08:24' : '07:50';
      insertAttendance.run(2, dateStr, budiInTime, -6.225020, 106.809760, 12, budiStatus, 'Absen via QR', '17:05', -6.225020, 106.809760, 15, 555);

      // Siti - on time
      insertAttendance.run(3, dateStr, '07:55', -6.225010, 106.809750, 18, 'Tepat Waktu', 'Absen via QR', '17:02', -6.225010, 106.809750, 20, 547);

      // Dimas - one izin
      if (i === 3) {
        insertAttendance.run(4, dateStr, null, null, null, null, 'Izin', 'Izin urusan keluarga mendesak', null, null, null, null, 0);
      } else {
        insertAttendance.run(4, dateStr, '08:02', -6.225018, 106.809755, 14, 'Tepat Waktu', 'Absen via QR', '17:15', -6.225018, 106.809755, 16, 553);
      }
    }
  }
}

// Activity Log Helper
function logActivity(userId, userName, action, category, details, ipAddress = '127.0.0.1') {
  try {
    const stmt = db.prepare(`
      INSERT INTO activity_logs (user_id, user_name, action, category, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(userId || null, userName || 'Sistem', action, category, typeof details === 'object' ? JSON.stringify(details) : String(details), ipAddress);
  } catch (err) {
    console.error('Error logging activity:', err);
  }
}

// SQL Dump Helper for Backup
function generateSqlDump() {
  const tables = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();
  let dump = `-- Database Backup Aplikasi Absensi Karyawan\n`;
  dump += `-- Generated at: ${new Date().toISOString()}\n\n`;
  dump += `PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n`;

  for (const table of tables) {
    dump += `-- Table: ${table.name}\n`;
    dump += `DROP TABLE IF EXISTS "${table.name}";\n`;
    dump += `${table.sql};\n\n`;

    const rows = db.prepare(`SELECT * FROM "${table.name}"`).all();
    if (rows.length > 0) {
      for (const row of rows) {
        const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
        const values = Object.values(row).map(val => {
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return val;
          return `'${String(val).replace(/'/g, "''")}'`;
        }).join(', ');
        dump += `INSERT INTO "${table.name}" (${columns}) VALUES (${values});\n`;
      }
      dump += `\n`;
    }
  }

  dump += `COMMIT;\nPRAGMA foreign_keys=ON;\n`;
  return dump;
}

// SQL Restore Helper
function restoreSqlDump(sqlContent) {
  const transaction = db.transaction(() => {
    db.exec(sqlContent);
  });
  transaction();
}

module.exports = {
  db,
  initDb,
  logActivity,
  generateSqlDump,
  restoreSqlDump
};
