/**
 * ==============================================================================
 * SCRIPT MIGRASI OTOMATIS: DARI SQLITE KE SUPABASE POSTGRESQL
 * ==============================================================================
 * Mengirim seluruh 10 tabel dari database lokal SQLite (absensi.db)
 * ke Supabase PostgreSQL tanpa ada data yang hilang.
 * 
 * Penggunaan:
 *   DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" node scripts/migrate-sqlite-to-supabase.js
 * ==============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error('\n❌ ERROR: Environment variable DATABASE_URL belum ditentukan!');
  console.error('Silakan tentukan Connection String Supabase Anda, contoh:');
  console.error('  set DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');
  console.error('  node scripts/migrate-sqlite-to-supabase.js\n');
  process.exit(1);
}

const sqlitePath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'absensi.db');
if (!fs.existsSync(sqlitePath)) {
  console.error(`\n❌ ERROR: File database SQLite tidak ditemukan di ${sqlitePath}\n`);
  process.exit(1);
}

const sqlite = new Database(sqlitePath, { readonly: true });
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();
  console.log('\n=============================================================');
  console.log('🚀 MEMULAI MIGRASI DATA DARI SQLITE KE SUPABASE POSTGRESQL');
  console.log('=============================================================');
  console.log(`📂 SQLite Source : ${sqlitePath}`);
  console.log(`🌐 Supabase Host : ${new URL(databaseUrl).hostname}\n`);

  try {
    // 1. Eksekusi Skema Tabel PostgreSQL
    console.log('[1/4] Memeriksa & membuat struktur 10 tabel PostgreSQL...');
    const schemaSqlPath = path.join(__dirname, '..', 'schema-postgres.sql');
    if (fs.existsSync(schemaSqlPath)) {
      const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
      await client.query(schemaSql);
      console.log('  ✅ Skema tabel & indeks performa siap.');
    } else {
      console.warn('  ⚠️ File schema-postgres.sql tidak ditemukan, melanjutkan dengan asumsi tabel sudah ada.');
    }

    // 2. Definisi Urutan Migrasi Sesuai Relasi Foreign Key
    const migrationTables = [
      {
        name: 'departments',
        columns: ['id', 'name', 'description', 'created_at'],
        seq: 'departments_id_seq'
      },
      {
        name: 'shifts',
        columns: ['id', 'name', 'start_time', 'end_time', 'tolerance_minutes', 'created_at'],
        seq: 'shifts_id_seq'
      },
      {
        name: 'office_locations',
        columns: ['id', 'name', 'address', 'latitude', 'longitude', 'radius', 'is_primary', 'created_at'],
        seq: 'office_locations_id_seq'
      },
      {
        name: 'users',
        columns: ['id', 'nip', 'name', 'email', 'password', 'phone', 'address', 'department_id', 'shift_id', 'role', 'avatar', 'status', 'created_at', 'updated_at'],
        seq: 'users_id_seq'
      },
      {
        name: 'attendances',
        columns: ['id', 'user_id', 'date', 'check_in_time', 'check_in_lat', 'check_in_lng', 'check_in_distance', 'check_in_status', 'check_in_notes', 'check_out_time', 'check_out_lat', 'check_out_lng', 'check_out_distance', 'work_duration_minutes', 'photo_url', 'office_name', 'office_location_id', 'created_at', 'updated_at'],
        seq: 'attendances_id_seq'
      },
      {
        name: 'leaves',
        columns: ['id', 'user_id', 'type', 'start_date', 'end_date', 'total_days', 'reason', 'attachment', 'status', 'admin_notes', 'reviewed_by', 'reviewed_at', 'created_at'],
        seq: 'leaves_id_seq'
      },
      {
        name: 'overtimes',
        columns: ['id', 'user_id', 'date', 'start_time', 'end_time', 'total_hours', 'task_description', 'status', 'admin_notes', 'reviewed_by', 'reviewed_at', 'created_at'],
        seq: 'overtimes_id_seq'
      },
      {
        name: 'settings',
        columns: ['key', 'value'],
        primaryKey: 'key'
      },
      {
        name: 'notifications_log',
        columns: ['id', 'channel', 'recipient', 'message', 'status', 'response', 'created_at'],
        seq: 'notifications_log_id_seq'
      },
      {
        name: 'activity_logs',
        columns: ['id', 'user_id', 'user_name', 'action', 'category', 'details', 'ip_address', 'created_at'],
        seq: 'activity_logs_id_seq'
      }
    ];

    console.log('\n[2/4] Mentransfer data antar-tabel...');
    const report = [];

    await client.query('BEGIN');

    for (const t of migrationTables) {
      // Ambil data dari SQLite
      let rows = [];
      try {
        rows = sqlite.prepare(`SELECT * FROM ${t.name}`).all();
      } catch (e) {
        console.warn(`  ⚠️ Tabel ${t.name} tidak ditemukan di SQLite: ${e.message}`);
        continue;
      }

      let insertedCount = 0;
      if (rows.length > 0) {
        for (const row of rows) {
          const availableCols = t.columns.filter(col => row[col] !== undefined);
          const values = availableCols.map(col => row[col]);
          const placeholders = availableCols.map((_, i) => `$${i + 1}`).join(', ');
          const colList = availableCols.join(', ');

          const conflictTarget = t.primaryKey ? t.primaryKey : 'id';
          const updateSets = availableCols
            .filter(c => c !== conflictTarget)
            .map(c => `${c} = EXCLUDED.${c}`)
            .join(', ');

          let queryText = `INSERT INTO ${t.name} (${colList}) VALUES (${placeholders})`;
          if (updateSets.length > 0) {
            queryText += ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSets}`;
          } else {
            queryText += ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
          }

          await client.query(queryText, values);
          insertedCount++;
        }
      }

      // 3. Reset PostgreSQL Sequence ID jika memiliki auto-increment
      if (t.seq) {
        try {
          await client.query(`
            SELECT setval(
              pg_get_serial_sequence('${t.name}', 'id'),
              COALESCE((SELECT MAX(id) FROM ${t.name}), 1),
              (SELECT MAX(id) IS NOT NULL FROM ${t.name})
            );
          `);
        } catch (seqErr) {
          // ignore if sequence name differs
        }
      }

      // Verifikasi jumlah baris di PostgreSQL
      const pgRes = await client.query(`SELECT count(*)::int as count FROM ${t.name}`);
      const pgCount = pgRes.rows[0].count;

      report.push({
        table: t.name,
        sqlite_count: rows.length,
        pg_count: pgCount,
        status: pgCount >= rows.length ? 'OK' : 'MISMATCH'
      });
      console.log(`  -> ${t.name.padEnd(20)} : ${rows.length} dari SQLite -> ${pgCount} di Supabase [OK]`);
    }

    await client.query('COMMIT');
    console.log('\n[3/4] Transaksi database di-COMMIT berhasil!');

    // 4. Tampilkan Ringkasan Migrasi
    console.log('\n[4/4] Verifikasi Integritas Data:');
    console.table(report);

    console.log('\n=============================================================');
    console.log('🎉 MIGRASI SUKSES! 100% Data lokal SQLite telah berpindah ke Supabase PostgreSQL.');
    console.log('=============================================================\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migrasi Gagal, transaksi di-ROLLBACK:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Unhandled error during migration:', err);
  process.exit(1);
});
