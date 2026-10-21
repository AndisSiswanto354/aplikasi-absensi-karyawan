-- ==============================================================================
-- Schema Database PostgreSQL Enterprise (Supabase / Neon / Managed PG)
-- Aplikasi Absensi Karyawan
-- ==============================================================================

-- 1. Tabel Departemen / Divisi
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Master Shift Kerja
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  tolerance_minutes INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel Master Pengguna (Admin & Karyawan)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  nip VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(32),
  address TEXT,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'karyawan',
  avatar TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'aktif',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Master Kantor / Cabang Geofencing
CREATE TABLE IF NOT EXISTS office_locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius INTEGER NOT NULL DEFAULT 100,
  is_primary INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabel Kehadiran (Attendances)
CREATE TABLE IF NOT EXISTS attendances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date VARCHAR(16) NOT NULL,
  check_in_time VARCHAR(16),
  check_in_lat DOUBLE PRECISION,
  check_in_lng DOUBLE PRECISION,
  check_in_distance DOUBLE PRECISION,
  check_in_status VARCHAR(64),
  check_in_notes TEXT,
  check_out_time VARCHAR(16),
  check_out_lat DOUBLE PRECISION,
  check_out_lng DOUBLE PRECISION,
  check_out_distance DOUBLE PRECISION,
  work_duration_minutes INTEGER DEFAULT 0,
  photo_url TEXT,
  office_name VARCHAR(255),
  office_location_id INTEGER REFERENCES office_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_user_date UNIQUE(user_id, date)
);

-- 6. Tabel Pengajuan Cuti / Izin / Sakit (Leaves)
CREATE TABLE IF NOT EXISTS leaves (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  start_date VARCHAR(16) NOT NULL,
  end_date VARCHAR(16) NOT NULL,
  total_days INTEGER DEFAULT 1,
  reason TEXT NOT NULL,
  attachment TEXT,
  status VARCHAR(32) DEFAULT 'menunggu',
  admin_notes TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabel Pengajuan Lembur (Overtimes)
CREATE TABLE IF NOT EXISTS overtimes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date VARCHAR(16) NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  total_hours DOUBLE PRECISION NOT NULL,
  task_description TEXT NOT NULL,
  status VARCHAR(32) DEFAULT 'menunggu',
  admin_notes TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabel Pengaturan Sistem Global
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(128) PRIMARY KEY,
  value TEXT
);

-- 9. Tabel Log Notifikasi (WhatsApp / Telegram)
CREATE TABLE IF NOT EXISTS notifications_log (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(64) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Tabel Log Audit Aktivitas (Audit Trail)
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  user_name VARCHAR(255),
  action VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  details TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- INDEKS OPTIMASI PERFORMA TINGGI (COMPOSITE INDEXES)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_attendances_user_date ON attendances(user_id, date);
CREATE INDEX IF NOT EXISTS idx_attendances_date_status ON attendances(date, check_in_status);
CREATE INDEX IF NOT EXISTS idx_users_nip ON users(nip);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_leaves_user_status ON leaves(user_id, status);
CREATE INDEX IF NOT EXISTS idx_overtimes_user_status ON overtimes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_office_primary ON office_locations(is_primary);
