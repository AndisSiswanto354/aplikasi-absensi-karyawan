const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');

// GET /api/laporan/rekap - Rekap data absensi dengan filter
router.get('/rekap', requireAuth, (req, res) => {
  try {
    const { start_date, end_date, department_id, user_id, status } = req.query;

    let query = `
      SELECT a.*, u.name as user_name, u.nip, d.name as department_name, s.name as shift_name
      FROM attendances a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE 1=1
    `;
    const params = [];

    // Filter date range
    if (start_date && end_date) {
      query += ` AND a.date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    } else if (start_date) {
      query += ` AND a.date >= ?`;
      params.push(start_date);
    } else if (end_date) {
      query += ` AND a.date <= ?`;
      params.push(end_date);
    }

    if (department_id) {
      query += ` AND u.department_id = ?`;
      params.push(department_id);
    }

    if (user_id) {
      query += ` AND a.user_id = ?`;
      params.push(user_id);
    }

    if (status) {
      query += ` AND a.check_in_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY a.date DESC, u.name ASC`;

    const records = db.prepare(query).all(...params);

    // Summary calculation
    const summary = {
      total: records.length,
      tepat_waktu: records.filter(r => r.check_in_status === 'Tepat Waktu').length,
      terlambat: records.filter(r => r.check_in_status === 'Terlambat').length,
      izin: records.filter(r => r.check_in_status === 'Izin').length,
      sakit: records.filter(r => r.check_in_status === 'Sakit').length,
      cuti: records.filter(r => r.check_in_status === 'Cuti').length,
      alpha: records.filter(r => r.check_in_status === 'Alpha').length
    };

    res.json({ success: true, records, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/laporan/export/excel - Download Rekap Absensi dalam format Excel (.xlsx)
router.get('/export/excel', requireAuth, async (req, res) => {
  try {
    const { start_date, end_date, department_id, user_id, status } = req.query;

    let query = `
      SELECT a.*, u.name as user_name, u.nip, d.name as department_name, s.name as shift_name
      FROM attendances a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date && end_date) {
      query += ` AND a.date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }
    if (department_id) {
      query += ` AND u.department_id = ?`;
      params.push(department_id);
    }
    if (user_id) {
      query += ` AND a.user_id = ?`;
      params.push(user_id);
    }
    if (status) {
      query += ` AND a.check_in_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY a.date DESC, u.name ASC`;
    const records = db.prepare(query).all(...params);

    const companyName = db.prepare(`SELECT value FROM settings WHERE key='company_name'`).get()?.value || 'PT Nusantara Solusi Digital';

    // Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sistem Absensi Karyawan';
    workbook.lastModifiedBy = req.session.user.name;
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Rekap Absensi', {
      views: [{ showGridLines: true }]
    });

    // Title Rows
    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = companyName.toUpperCase();
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:K2');
    const subTitle = sheet.getCell('A2');
    subTitle.value = `LAPORAN REKAPITULASI ABSENSI KARYAWAN (${start_date || 'Semua'} s/d ${end_date || 'Hari Ini'})`;
    subTitle.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF475569' } };
    subTitle.alignment = { horizontal: 'center' };

    sheet.addRow([]); // Blank line

    // Table Header
    const headers = [
      'No',
      'Tanggal',
      'NIP',
      'Nama Karyawan',
      'Departemen',
      'Shift',
      'Lokasi Kantor',
      'Jam Masuk',
      'Status Kehadiran',
      'Jarak GPS (m)',
      'Jam Pulang',
      'Durasi Kerja'
    ];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }
      };
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Data Rows
    records.forEach((row, idx) => {
      const durasiFormatted = row.work_duration_minutes
        ? `${Math.floor(row.work_duration_minutes / 60)}j ${row.work_duration_minutes % 60}m`
        : '-';

      const dataRow = sheet.addRow([
        idx + 1,
        row.date,
        row.nip,
        row.user_name,
        row.department_name || '-',
        row.shift_name || '-',
        row.office_name || 'Kantor Pusat',
        row.check_in_time || '-',
        row.check_in_status || 'Alpha',
        row.check_in_distance != null ? Math.round(row.check_in_distance) : '-',
        row.check_out_time || '-',
        durasiFormatted
      ]);

      dataRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };

        if ([1, 2, 3, 7, 8, 10, 11, 12].includes(colNumber)) {
          cell.alignment = { horizontal: 'center' };
        }

        // Highlight status cell
        if (colNumber === 9) {
          cell.alignment = { horizontal: 'center' };
          if (row.check_in_status === 'Tepat Waktu') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Light Green
            cell.font = { bold: true, color: { argb: 'FF166534' } };
          } else if (row.check_in_status === 'Terlambat') {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light Amber
            cell.font = { bold: true, color: { argb: 'FF92400E' } };
          } else if (['Izin', 'Sakit', 'Cuti'].includes(row.check_in_status)) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }; // Light Sky
            cell.font = { bold: true, color: { argb: 'FF0369A1' } };
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Light Red
            cell.font = { bold: true, color: { argb: 'FF991B1B' } };
          }
        }
      });
    });

    // Auto-fit column widths
    sheet.columns.forEach((col, index) => {
      let maxLen = 12;
      col.eachCell({ includeEmpty: false }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 0;
        if (len > maxLen) maxLen = Math.min(len + 3, 35);
      });
      col.width = maxLen;
    });

    // Write buffer and send
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Laporan_Absensi_${dayjs().format('YYYYMMDD_HHmm')}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export Excel error:', err);
    res.status(500).json({ success: false, message: 'Gagal mengekspor laporan: ' + err.message });
  }
});

// GET /api/laporan/export/csv - Download format CSV
router.get('/export/csv', requireAuth, (req, res) => {
  try {
    const { start_date, end_date, department_id, user_id, status } = req.query;

    let query = `
      SELECT a.*, u.name as user_name, u.nip, d.name as department_name, s.name as shift_name
      FROM attendances a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date && end_date) {
      query += ` AND a.date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }
    if (department_id) {
      query += ` AND u.department_id = ?`;
      params.push(department_id);
    }
    if (user_id) {
      query += ` AND a.user_id = ?`;
      params.push(user_id);
    }
    if (status) {
      query += ` AND a.check_in_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY a.date DESC, u.name ASC`;
    const records = db.prepare(query).all(...params);

    let csv = 'No,Tanggal,NIP,Nama Karyawan,Departemen,Shift,Lokasi Kantor,Jam Masuk,Status,Jarak (m),Jam Pulang,Durasi Menit\n';
    records.forEach((r, idx) => {
      csv += `"${idx + 1}","${r.date}","${r.nip}","${r.user_name}","${r.department_name || ''}","${r.shift_name || ''}","${r.office_name || 'Kantor Pusat'}","${r.check_in_time || ''}","${r.check_in_status || 'Alpha'}","${r.check_in_distance != null ? Math.round(r.check_in_distance) : ''}","${r.check_out_time || ''}","${r.work_duration_minutes || 0}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Laporan_Absensi_${dayjs().format('YYYYMMDD')}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
