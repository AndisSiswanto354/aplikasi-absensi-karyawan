/**
 * Aplikasi Absensi Karyawan - Client App Controller
 */

// Initialize Day.js Indonesian Locale
dayjs.locale('id');

// Global App State
let currentUser = null;
let currentView = 'dashboard';
let officeSettings = {
  lat: -6.225014,
  lng: 106.809756,
  radius: 100,
  token: 'QR-ABSEN-NSD-2026-X99'
};

let officesCache = [];
let selectedAttendanceOfficeId = 'auto';
let activeSettingsOfficeId = null;

let userCoordinates = {
  lat: -6.225014,
  lng: 106.809756,
  distance: 0,
  isValid: true,
  matchedOffice: null
};

let attendanceAction = 'in'; // 'in' or 'out'
let qrScannerInstance = null;
let isScannerActive = false;

// Leaflet Map Instances & Layers
let attendanceMap = null;
let attendanceOfficeCircle = null;
let attendanceUserMarker = null;
let attendanceOfficeLayers = [];

let settingsMap = null;
let settingsOfficeMarker = null;
let settingsOfficeCircle = null;
let settingsOfficeLayers = [];

// Chart Instances
let doughnutChartInstance = null;
let trendChartInstance = null;

// ==============================================================
// 1. INITIALIZATION & AUTHENTICATION
// ==============================================================

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  initEventListeners();
  checkAuthSession();
});

// Live Clock for Header
function initLiveClock() {
  function updateTime() {
    const now = dayjs();
    const timeEl = document.getElementById('headerLiveClock');
    const dateEl = document.getElementById('headerLiveDate');
    if (timeEl) timeEl.innerText = now.format('HH:mm:ss') + ' WIB';
    if (dateEl) dateEl.innerText = now.format('dddd, DD MMMM YYYY');
  }
  setInterval(updateTime, 1000);
  updateTime();
}

// Event Listeners
function initEventListeners() {
  // Login Form
  const formLogin = document.getElementById('formLogin');
  if (formLogin) {
    formLogin.addEventListener('submit', handleLogin);
  }

  // User Dropdown toggle
  const btnUserMenu = document.getElementById('btnUserMenu');
  const userDropdown = document.getElementById('userDropdown');
  if (btnUserMenu && userDropdown) {
    btnUserMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => userDropdown.classList.add('hidden'));
  }

  // Mobile sidebar toggle
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  if (btnToggleSidebar && sidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      sidebar.classList.toggle('-translate-x-full');
      sidebarBackdrop.classList.toggle('hidden');
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      sidebar.classList.add('-translate-x-full');
      sidebarBackdrop.classList.add('hidden');
    });
  }
}

// Check session on load
async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (data.success && data.user) {
      currentUser = data.user;
      showAppShell();
      await loadPublicSettings();
      switchView('dashboard');
    } else {
      showLoginView();
      loadPublicSettings();
    }
  } catch (err) {
    console.error('Session check failed:', err);
    showLoginView();
    loadPublicSettings();
  }
}

// Handle Login
async function handleLogin(e) {
  e.preventDefault();
  const emailOrNip = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btnSubmit = document.getElementById('btnLoginSubmit');

  if (!emailOrNip || !password) {
    Swal.fire({ icon: 'warning', title: 'Data Kurang', text: 'Masukkan Email/NIP dan password!' });
    return;
  }

  try {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="animate-spin mr-2">⌛</span> Memeriksa kredensial...`;

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrNip, password })
    });
    const data = await res.json();

    if (data.success && data.user) {
      currentUser = data.user;
      Swal.fire({
        icon: 'success',
        title: 'Login Berhasil',
        text: `Selamat datang kembali, ${data.user.name}!`,
        timer: 1500,
        showConfirmButton: false
      });
      showAppShell();
      await loadPublicSettings();
      switchView('dashboard');
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal Masuk', text: data.message || 'Periksa kembali NIP/Email dan kata sandi Anda.' });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = `<i data-lucide="log-in" class="w-4 h-4 mr-2"></i><span>Masuk ke Akun</span>`;
    lucide.createIcons();
  }
}

// Quick demo login fill
function fillLogin(email, password) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = password;
}

// Toggle password visibility
function togglePasswordVisibility(id) {
  const input = document.getElementById(id);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

// Handle Logout
async function handleLogout() {
  const result = await Swal.fire({
    title: 'Konfirmasi Logout',
    text: 'Apakah Anda yakin ingin keluar dari sistem absensi?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Keluar',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      currentUser = null;
      stopQrScanner();
      showLoginView();
      Swal.fire({ icon: 'success', title: 'Sampai Jumpa', text: 'Anda telah berhasil logout.', timer: 1200, showConfirmButton: false });
    } catch (err) {
      console.error('Logout error:', err);
    }
  }
}

// UI Switch between Login View and App Shell
function showLoginView() {
  document.getElementById('view-login').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  lucide.createIcons();
}

function showAppShell() {
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  // Update profile details in top header
  document.getElementById('userNameDisplay').innerText = currentUser.name;
  document.getElementById('userRoleBadge').innerText = currentUser.role === 'admin' ? 'Administrator' : 'Karyawan';
  document.getElementById('dropdownNip').innerText = `NIP: ${currentUser.nip}`;
  document.getElementById('dropdownEmail').innerText = currentUser.email;

  if (currentUser.avatar) {
    document.getElementById('userAvatarImg').src = currentUser.avatar;
  } else {
    document.getElementById('userAvatarImg').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name)}&background=2563eb&color=fff`;
  }

  // Role visibility control
  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    if (currentUser.role === 'admin') {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  lucide.createIcons();
}

// Load company public settings (branding, coordinates, etc.)
async function loadPublicSettings() {
  try {
    const res = await fetch('/api/pengaturan/public');
    const data = await res.json();
    if (data.success && data.settings) {
      const s = data.settings;
      if (s.company_name) {
        document.getElementById('headerCompanyName').innerText = s.company_name;
        document.getElementById('loginCompanyName').innerText = s.company_name;
        document.getElementById('printCompanyName').innerText = s.company_name.toUpperCase();
      }
      if (s.company_address) {
        document.getElementById('printCompanyAddress').innerText = s.company_address;
      }
      if (s.company_phone || s.company_email) {
        document.getElementById('printCompanyContact').innerText = `Telp: ${s.company_phone || '-'} • Email: ${s.company_email || '-'}`;
      }
      if (s.company_logo) {
        document.getElementById('headerLogo').innerHTML = `<img src="${s.company_logo}" alt="Logo" class="w-full h-full object-contain rounded-lg">`;
        document.getElementById('loginLogoContainer').innerHTML = `<img src="${s.company_logo}" alt="Logo" class="w-full h-full object-contain">`;
      }
      if (s.office_lat && s.office_lng) {
        officeSettings.lat = parseFloat(s.office_lat);
        officeSettings.lng = parseFloat(s.office_lng);
        officeSettings.radius = parseInt(s.office_radius) || 100;
        officeSettings.token = s.qr_secret_token || 'QR-ABSEN-NSD-2026-X99';
        
        // Update metric on attendance tab
        const radEl = document.getElementById('metricOfficeRadius');
        if (radEl) radEl.innerText = officeSettings.radius + ' m';
      }
      if (s.offices && s.offices.length > 0) {
        officesCache = s.offices;
        renderAttendanceOfficeOptions(officesCache);
      }
    }
  } catch (err) {
    console.error('Error loading public settings:', err);
  }
}

// Render Office Options for Employee Attendance Selection
function renderAttendanceOfficeOptions(offices) {
  const select = document.getElementById('selectAttendanceOffice');
  if (!select) return;
  const currentVal = selectedAttendanceOfficeId;
  let optionsHtml = `<option value="auto">[Auto] Deteksi Kantor Terdekat</option>`;
  if (offices && offices.length > 0) {
    optionsHtml += offices.map(o => `
      <option value="${o.id}">
        ${o.is_primary ? '[Utama] ' : ''}${o.name} - Radius: ${o.radius}m
      </option>
    `).join('');
  }
  select.innerHTML = optionsHtml;
  if (currentVal && Array.from(select.options).some(opt => opt.value == currentVal)) {
    select.value = currentVal;
  } else {
    select.value = 'auto';
    selectedAttendanceOfficeId = 'auto';
  }
  updateActiveOfficeBadge();
}

// Update Active Office Badge in Attendance Tab
function updateActiveOfficeBadge() {
  const badge = document.getElementById('activeOfficeBadge');
  if (!badge) return;
  if (selectedAttendanceOfficeId === 'auto') {
    badge.innerText = 'Otomatis Terdekat';
    badge.className = 'text-[10px] text-brand-600 font-semibold bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200';
  } else {
    const found = officesCache.find(o => o.id == selectedAttendanceOfficeId);
    badge.innerText = found ? found.name : 'Dipilih';
    badge.className = 'text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200';
  }
}

// Handler when employee switches office dropdown
function onAttendanceOfficeChange(officeId) {
  selectedAttendanceOfficeId = officeId;
  updateActiveOfficeBadge();
  recalculateAttendanceGeofence();
  if (officeId !== 'auto') {
    const target = officesCache.find(o => o.id == officeId);
    if (target && attendanceMap) {
      attendanceMap.panTo([target.latitude, target.longitude]);
    }
  }
}



// ==============================================================
// 2. VIEW SWITCHER & NAVIGATION
// ==============================================================

function switchView(viewName) {
  // If non-admin tries to switch to admin-only views, redirect to dashboard
  const adminOnlyViews = ['karyawan', 'jabatan-shift', 'laporan', 'pengaturan', 'backup', 'notifikasi', 'logs'];
  if (currentUser && currentUser.role !== 'admin' && adminOnlyViews.includes(viewName)) {
    viewName = 'dashboard';
  }

  currentView = viewName;

  // Hide all panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.add('hidden');
  });

  // Remove active state from sidebar buttons
  document.querySelectorAll('.sidebar-btn').forEach(btn => {
    btn.classList.remove('bg-brand-600', 'text-white', 'shadow');
    btn.classList.add('text-slate-300', 'hover:bg-slate-800');
  });

  // Show target panel
  const targetPanel = document.getElementById(`view-${viewName}`);
  if (targetPanel) {
    targetPanel.classList.remove('hidden');
  }

  // Activate sidebar button
  const targetBtn = document.getElementById(`nav-${viewName}`);
  if (targetBtn) {
    targetBtn.classList.remove('text-slate-300', 'hover:bg-slate-800');
    targetBtn.classList.add('bg-brand-600', 'text-white', 'shadow');
  }

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
    sidebar.classList.add('-translate-x-full');
    sidebarBackdrop.classList.add('hidden');
  }

  // View specific loaders
  if (viewName === 'dashboard') {
    loadDashboardData();
  } else if (viewName === 'absensi') {
    initAttendanceView();
  } else if (viewName === 'riwayat') {
    loadAttendanceHistory();
  } else if (viewName === 'karyawan') {
    loadEmployeeList();
  } else if (viewName === 'jabatan-shift') {
    loadDepartmentsAndShifts();
  } else if (viewName === 'cuti') {
    loadLeavesList();
  } else if (viewName === 'lembur') {
    loadOvertimeList();
  } else if (viewName === 'laporan') {
    initReportView();
  } else if (viewName === 'pengaturan') {
    initSettingsView();
  } else if (viewName === 'notifikasi') {
    loadNotificationLogs();
  } else if (viewName === 'logs') {
    loadActivityLogs();
  }

  lucide.createIcons();
}


// ==============================================================
// 3. DASHBOARD LOGIC & METRICS
// ==============================================================

async function loadDashboardData() {
  const welcomeEl = document.getElementById('dashWelcomeName');
  if (welcomeEl && currentUser) {
    welcomeEl.innerText = currentUser.name;
  }

  try {
    // 1. Fetch Today Status for User
    const statusRes = await fetch('/api/absensi/today-status');
    const statusData = await statusRes.json();

    if (statusData.success) {
      const att = statusData.attendance;
      const shift = statusData.shift;

      const titleEl = document.getElementById('dashTodayStatusText');
      const detailEl = document.getElementById('dashTodayTimeDetail');
      const iconEl = document.getElementById('dashTodayStatusIcon');
      const btnText = document.getElementById('dashTodayBtnText');

      if (detailEl) {
        if (shift) {
          detailEl.innerText = `Shift: ${shift.name} (${shift.start_time} - ${shift.end_time}, Tol: ${shift.tolerance_minutes}m)`;
        } else {
          detailEl.innerText = 'Shift Reguler (08:00 - 17:00)';
        }
      }

      if (!att || !att.check_in_time) {
        if (titleEl) {
          titleEl.innerText = 'Belum Melakukan Absensi Masuk';
          titleEl.className = 'text-lg font-bold text-amber-600';
        }
        if (iconEl) iconEl.className = 'w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center';
        if (btnText) btnText.innerText = 'Absen Masuk Sekarang';
        setAttendanceAction('in');
      } else if (att.check_in_time && !att.check_out_time) {
        if (titleEl) {
          titleEl.innerText = `Sudah Masuk: ${att.check_in_time} (${att.check_in_status})`;
          titleEl.className = 'text-lg font-bold text-blue-600';
        }
        if (iconEl) iconEl.className = 'w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center';
        if (btnText) btnText.innerText = 'Absen Pulang Sekarang';
        setAttendanceAction('out');
      } else {
        const durHours = Math.floor((att.work_duration_minutes || 0) / 60);
        const durMins = (att.work_duration_minutes || 0) % 60;
        if (titleEl) {
          titleEl.innerText = `Selesai: Masuk ${att.check_in_time} • Pulang ${att.check_out_time} (${durHours}j ${durMins}m)`;
          titleEl.className = 'text-lg font-bold text-emerald-600';
        }
        if (iconEl) iconEl.className = 'w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center';
        if (btnText) btnText.innerText = 'Lihat Riwayat Presensi';
      }
    }

    // 2. Fetch Month Summary & History
    const nowMonth = dayjs().month() + 1;
    const nowYear = dayjs().year();

    const histRes = await fetch(`/api/absensi/history?month=${nowMonth}&year=${nowYear}`);
    const histData = await histRes.json();

    if (histData.success && histData.summary) {
      const summary = histData.summary;
      const elTepat = document.getElementById('metricTepatWaktu');
      const elTerlambat = document.getElementById('metricTerlambat');
      const elIzin = document.getElementById('metricIzinSakit');
      if (elTepat) elTepat.innerText = summary.tepat_waktu ?? 0;
      if (elTerlambat) elTerlambat.innerText = summary.terlambat ?? 0;
      if (elIzin) elIzin.innerText = (summary.izin || 0) + (summary.sakit || 0) + (summary.cuti || 0);

      // Populate Recent Activity Table
      const recentTbody = document.getElementById('dashRecentTableBody');
      const recentList = (histData.records || []).slice(0, 5);

      if (recentTbody) {
        if (recentList.length === 0) {
          recentTbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">Belum ada riwayat presensi bulan ini.</td></tr>`;
        } else {
          recentTbody.innerHTML = recentList.map(r => `
            <tr class="hover:bg-slate-50 transition">
              <td class="py-2.5 px-3 font-medium text-slate-800">${r.date}</td>
              <td class="py-2.5 px-3 font-semibold text-slate-900">${r.user_name}</td>
              <td class="py-2.5 px-3 font-mono">${r.check_in_time || '-'}</td>
              <td class="py-2.5 px-3 font-mono">${r.check_out_time || '-'}</td>
              <td class="py-2.5 px-3">${renderStatusBadge(r.check_in_status)}</td>
              <td class="py-2.5 px-3 text-slate-500">${r.check_in_distance != null ? Math.round(r.check_in_distance) + 'm' : '-'}</td>
            </tr>
          `).join('');
        }
      }

      // Render Charts
      renderDashboardCharts(summary, histData.records || []);
    }

    // 3. Employee total count (for metric card)
    const empRes = await fetch('/api/karyawan');
    const empData = await empRes.json();
    const elTotal = document.getElementById('metricTotalKaryawan');
    if (elTotal && empData.success && empData.employees) {
      elTotal.innerText = empData.employees.length;
    }

  } catch (err) {
    console.error('Error loading dashboard data:', err);
  }
}

// Render Status Badge HTML
function renderStatusBadge(status) {
  if (status === 'Tepat Waktu') {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Tepat Waktu</span>`;
  } else if (status === 'Terlambat') {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Terlambat</span>`;
  } else if (['Izin', 'Sakit', 'Cuti'].includes(status)) {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">${status}</span>`;
  } else {
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">${status || 'Alpha'}</span>`;
  }
}

// Chart.js Visualizations
function renderDashboardCharts(summary, records) {
  // 1. Doughnut Chart
  const doughnutCtx = document.getElementById('chartAttendanceDoughnut');
  if (doughnutCtx) {
    if (doughnutChartInstance) doughnutChartInstance.destroy();

    const dataValues = [
      summary.tepat_waktu || 0,
      summary.terlambat || 0,
      (summary.izin || 0) + (summary.sakit || 0) + (summary.cuti || 0)
    ];

    const hasData = dataValues.some(v => v > 0);

    doughnutChartInstance = new Chart(doughnutCtx, {
      type: 'doughnut',
      data: {
        labels: ['Tepat Waktu', 'Terlambat', 'Izin/Sakit/Cuti'],
        datasets: [{
          data: hasData ? dataValues : [1],
          backgroundColor: hasData ? ['#10b981', '#f59e0b', '#0284c7'] : ['#e2e8f0'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        cutout: '72%'
      }
    });
  }

  // 2. Bar Chart: Daily Trend
  const trendCtx = document.getElementById('chartAttendanceTrend');
  if (trendCtx) {
    if (trendChartInstance) trendChartInstance.destroy();

    // Group last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      last7Days.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
    }

    const tepatCounts = [];
    const lambatCounts = [];

    last7Days.forEach(dateStr => {
      const dayRecs = records.filter(r => r.date === dateStr);
      tepatCounts.push(dayRecs.filter(r => r.check_in_status === 'Tepat Waktu').length);
      lambatCounts.push(dayRecs.filter(r => r.check_in_status === 'Terlambat').length);
    });

    trendChartInstance = new Chart(trendCtx, {
      type: 'bar',
      data: {
        labels: last7Days.map(d => dayjs(d).format('DD MMM')),
        datasets: [
          {
            label: 'Tepat Waktu',
            data: tepatCounts,
            backgroundColor: '#10b981',
            borderRadius: 6
          },
          {
            label: 'Terlambat',
            data: lambatCounts,
            backgroundColor: '#f59e0b',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } }
        },
        plugins: {
          legend: { position: 'top' }
        }
      }
    });
  }
}


// ==============================================================
// 4. ATTENDANCE SCANNER & GPS VALIDATION
// ==============================================================

function setAttendanceAction(action) {
  attendanceAction = action;
  const tabIn = document.getElementById('btnTabCheckIn');
  const tabOut = document.getElementById('btnTabCheckOut');
  const btnSubmit = document.getElementById('btnSubmitAttendance');
  const btnSubmitText = document.getElementById('btnSubmitAttendanceText');
  const notesContainer = document.getElementById('inputNotesContainer');

  if (action === 'in') {
    if (tabIn) {
      tabIn.classList.add('bg-white', 'text-brand-700', 'shadow-sm');
      tabIn.classList.remove('text-slate-600');
    }
    if (tabOut) {
      tabOut.classList.remove('bg-white', 'text-brand-700', 'shadow-sm');
      tabOut.classList.add('text-slate-600');
    }
    if (btnSubmitText) {
      btnSubmitText.innerText = 'Kirim Absensi Masuk';
    } else if (btnSubmit) {
      btnSubmit.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i><span id="btnSubmitAttendanceText">Kirim Absensi Masuk</span>`;
      if (window.lucide) lucide.createIcons();
    }
    if (notesContainer) notesContainer.classList.remove('hidden');
  } else {
    if (tabOut) {
      tabOut.classList.add('bg-white', 'text-brand-700', 'shadow-sm');
      tabOut.classList.remove('text-slate-600');
    }
    if (tabIn) {
      tabIn.classList.remove('bg-white', 'text-brand-700', 'shadow-sm');
      tabIn.classList.add('text-slate-600');
    }
    if (btnSubmitText) {
      btnSubmitText.innerText = 'Kirim Absensi Pulang';
    } else if (btnSubmit) {
      btnSubmit.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i><span id="btnSubmitAttendanceText">Kirim Absensi Pulang</span>`;
      if (window.lucide) lucide.createIcons();
    }
    if (notesContainer) notesContainer.classList.add('hidden');
  }
}

async function initAttendanceView() {
  // Load today status
  try {
    const res = await fetch('/api/absensi/today-status');
    const data = await res.json();
    if (data.success) {
      if (data.offices && data.offices.length > 0) {
        officesCache = data.offices;
        renderAttendanceOfficeOptions(officesCache);
      }
      if (data.office) {
        officeSettings.lat = data.office.lat;
        officeSettings.lng = data.office.lng;
        officeSettings.radius = data.office.radius;
        const radEl = document.getElementById('metricOfficeRadius');
        if (radEl) radEl.innerText = officeSettings.radius + ' m';
      }
      if (data.shift) {
        const sName = document.getElementById('shiftBadgeName');
        const sStart = document.getElementById('shiftStartTime');
        const sEnd = document.getElementById('shiftEndTime');
        const sTol = document.getElementById('shiftToleranceMinutes');
        if (sName) sName.innerText = data.shift.name;
        if (sStart) sStart.innerText = data.shift.start_time;
        if (sEnd) sEnd.innerText = data.shift.end_time;
        if (sTol) sTol.innerText = data.shift.tolerance_minutes;
      }
    }
  } catch (e) {
    console.error('Error loading today status:', e);
  }

  // Initialize interactive Leaflet map for attendance
  initAttendanceMap();

  // Automatically detect user location or fallback to office point
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userCoordinates.lat = pos.coords.latitude;
        userCoordinates.lng = pos.coords.longitude;
        recalculateAttendanceGeofence();
      },
      (err) => {
        applyGpsSimulation('office');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  } else {
    applyGpsSimulation('office');
  }
}

// Leaflet Map for Attendance
function initAttendanceMap() {
  const mapContainer = document.getElementById('attendanceMap');
  if (!mapContainer) return;

  if (!attendanceMap) {
    attendanceMap = L.map('attendanceMap').setView([officeSettings.lat, officeSettings.lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(attendanceMap);

    // User Marker
    attendanceUserMarker = L.marker([officeSettings.lat, officeSettings.lng], {
      title: 'Lokasi Anda'
    }).addTo(attendanceMap);
  }

  // Clear previous office layers
  attendanceOfficeLayers.forEach(l => attendanceMap.removeLayer(l));
  attendanceOfficeLayers = [];

  const officesToRender = officesCache.length > 0 ? officesCache : [{
    id: 1,
    name: 'Kantor Pusat',
    latitude: officeSettings.lat,
    longitude: officeSettings.lng,
    radius: officeSettings.radius,
    is_primary: 1
  }];

  officesToRender.forEach(off => {
    const isPri = !!off.is_primary;
    const circle = L.circle([off.latitude, off.longitude], {
      color: isPri ? '#2563eb' : '#059669',
      fillColor: isPri ? '#3b82f6' : '#10b981',
      fillOpacity: 0.15,
      radius: off.radius
    }).addTo(attendanceMap);

    circle.bindPopup(`<b>${off.name}</b><br>Radius: ${off.radius}m<br><span class="text-xs text-slate-500">${off.address || ''}</span>`);
    attendanceOfficeLayers.push(circle);

    const marker = L.marker([off.latitude, off.longitude], {
      opacity: 0.85
    }).addTo(attendanceMap);
    marker.bindPopup(`<b>${off.name}</b><br>Batas Radius: ${off.radius}m`);
    attendanceOfficeLayers.push(marker);
  });

  attendanceMap.invalidateSize();
}

// Recalculate Haversine geofence against selected or closest office
function recalculateAttendanceGeofence() {
  const lat = userCoordinates.lat;
  const lng = userCoordinates.lng;

  let matchedOffice = null;
  let distance = 0;
  let isValid = false;

  const offices = officesCache.length > 0 ? officesCache : [{
    id: 1,
    name: 'Kantor Pusat',
    latitude: officeSettings.lat,
    longitude: officeSettings.lng,
    radius: officeSettings.radius,
    is_primary: 1
  }];

  if (selectedAttendanceOfficeId === 'auto') {
    // 1. Try to find any office where distance <= radius
    for (const off of offices) {
      const d = calcHaversine(lat, lng, off.latitude, off.longitude);
      if (d <= off.radius) {
        matchedOffice = off;
        distance = d;
        isValid = true;
        break;
      }
    }
    // 2. If outside all, pick the closest office
    if (!matchedOffice) {
      let minD = Infinity;
      for (const off of offices) {
        const d = calcHaversine(lat, lng, off.latitude, off.longitude);
        if (d < minD) {
          minD = d;
          matchedOffice = off;
          distance = d;
        }
      }
      isValid = false;
    }
  } else {
    // Specific office selected
    const target = offices.find(o => o.id == selectedAttendanceOfficeId) || offices[0];
    matchedOffice = target;
    distance = calcHaversine(lat, lng, target.latitude, target.longitude);
    isValid = distance <= target.radius;
  }

  updateUserMapPosition(lat, lng, distance, isValid, matchedOffice);
}

// Update User Marker on Map & Status Banners
function updateUserMapPosition(lat, lng, distance, isValid, matchedOffice) {
  userCoordinates.lat = lat;
  userCoordinates.lng = lng;
  userCoordinates.distance = distance;
  userCoordinates.isValid = isValid;
  userCoordinates.matchedOffice = matchedOffice;

  const targetRadius = matchedOffice ? matchedOffice.radius : officeSettings.radius;
  const officeName = matchedOffice ? matchedOffice.name : 'Kantor';

  const elDistance = document.getElementById('metricGpsDistance');
  const elRadius = document.getElementById('metricOfficeRadius');
  if (elDistance) elDistance.innerText = distance + ' m';
  if (elRadius) elRadius.innerText = targetRadius + ' m';

  const banner = document.getElementById('gpsStatusBanner');
  const title = document.getElementById('gpsStatusTitle');
  const desc = document.getElementById('gpsStatusDesc');
  const icon = document.getElementById('gpsStatusIcon');

  if (isValid) {
    if (banner) banner.className = 'p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center space-x-3 text-emerald-800';
    if (title) title.innerText = `Lokasi Terverifikasi (${officeName})`;
    if (desc) desc.innerText = `Jarak Anda ${distance} meter dari ${officeName} (Batas: ${targetRadius}m). Presensi diizinkan!`;
    if (icon) {
      icon.className = 'w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0';
      icon.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i>`;
    }
  } else {
    if (banner) banner.className = 'p-3 rounded-xl bg-red-50 border border-red-200 text-xs flex items-center space-x-3 text-red-800';
    if (title) title.innerText = `Di Luar Radius ${officeName}!`;
    if (desc) desc.innerText = `Jarak Anda ${distance} meter dari ${officeName} (Maksimal: ${targetRadius}m). Presensi ditolak geofence.`;
    if (icon) {
      icon.className = 'w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0';
      icon.innerHTML = `<i data-lucide="alert-triangle" class="w-4 h-4"></i>`;
    }
  }

  if (window.lucide) lucide.createIcons();

  if (attendanceMap && attendanceUserMarker) {
    attendanceUserMarker.setLatLng([lat, lng]);
    attendanceUserMarker.bindPopup(`<b>Lokasi Anda</b><br>Kantor: ${officeName}<br>Jarak: ${distance} m`).openPopup();
    attendanceMap.panTo([lat, lng]);
  }
}

// Calculate Haversine Distance in Client JS
function calcHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// GPS Simulation Selector (For desktop ease of testing)
function applyGpsSimulation(type) {
  let baseOffice = officesCache.find(o => o.id == selectedAttendanceOfficeId) ||
                   officesCache.find(o => o.is_primary) ||
                   officesCache[0] ||
                   { latitude: officeSettings.lat, longitude: officeSettings.lng, radius: officeSettings.radius };

  let lat = baseOffice.latitude;
  let lng = baseOffice.longitude;

  if (type === 'office') {
    lat = baseOffice.latitude;
    lng = baseOffice.longitude;
  } else if (type === 'near') {
    // Offset ~25 meters
    lat = baseOffice.latitude + 0.0002;
    lng = baseOffice.longitude + 0.0001;
  } else if (type === 'outside') {
    // Offset ~450 meters
    lat = baseOffice.latitude + 0.0040;
    lng = baseOffice.longitude + 0.0035;
  } else if (type === 'real') {
    detectUserLocation();
    return;
  }

  userCoordinates.lat = lat;
  userCoordinates.lng = lng;
  recalculateAttendanceGeofence();
}

// Real Browser Geolocation
function detectUserLocation() {
  if (!navigator.geolocation) {
    Swal.fire({ icon: 'error', title: 'GPS Tidak Didukung', text: 'Browser Anda tidak mendukung Geolocation API.' });
    return;
  }

  Swal.fire({
    title: 'Mendeteksi Lokasi GPS...',
    text: 'Mohon izinkan akses lokasi pada browser/ponsel Anda.',
    didOpen: () => Swal.showLoading(),
    allowOutsideClick: false
  });

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      Swal.close();
      userCoordinates.lat = pos.coords.latitude;
      userCoordinates.lng = pos.coords.longitude;
      recalculateAttendanceGeofence();
    },
    (err) => {
      Swal.close();
      Swal.fire({
        icon: 'warning',
        title: 'Izin Lokasi Ditolak',
        text: 'Tidak dapat mengakses GPS asli. Pastikan Anda mengaktifkan izin akses lokasi pada browser/ponsel Anda.'
      });
      const simSelect = document.getElementById('selectGpsSimulation');
      if (simSelect) simSelect.value = 'office';
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// State for Camera Selection
let selectedCameraId = null;
let availableCamerasList = [];

// Start HTML5 QR Scanner with HD Quality Constraints
async function startQrScanner(targetCameraId = null) {
  if (isScannerActive) return;

  const qrBox = document.getElementById('qr-reader');
  if (!qrBox) return;
  qrBox.innerHTML = '';

  // Initialize Html5Qrcode with hardware-accelerated BarcodeDetector if supported
  try {
    qrScannerInstance = new Html5Qrcode("qr-reader", {
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    });
  } catch (e) {
    qrScannerInstance = new Html5Qrcode("qr-reader");
  }

  // Camera track constraints for HD (1080p ideal, 720p min, up to 4K)
  const hdVideoConstraints = {
    facingMode: { ideal: "environment" },
    width: { min: 640, ideal: 1920 },
    height: { min: 480, ideal: 1080 },
    advanced: [{ focusMode: "continuous" }]
  };

  const config = {
    fps: 25, // High frame rate for ultra-smooth preview and instant QR capture
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      const boxSize = Math.max(220, Math.floor(minEdge * 0.72));
      return { width: boxSize, height: boxSize };
    },
    aspectRatio: 1.333333,
    videoConstraints: hdVideoConstraints
  };

  // Enumerate cameras if multiple exist
  try {
    const devices = await Html5Qrcode.getCameras();
    if (devices && devices.length > 0) {
      availableCamerasList = devices;
      populateCameraDeviceOptions(devices, targetCameraId);
    }
  } catch (e) {
    console.warn('Could not enumerate cameras prior to start:', e);
  }

  // Pick camera source: specific deviceId or HD back camera or HD constraints
  let cameraSource = targetCameraId || selectedCameraId;
  if (!cameraSource) {
    const backCam = availableCamerasList.find(d => 
      /back|rear|environment|belakang/i.test(d.label)
    );
    if (backCam) {
      cameraSource = backCam.id;
      selectedCameraId = backCam.id;
    } else {
      cameraSource = hdVideoConstraints;
    }
  }

  function onScanSuccess(decodedText) {
    const tokenInput = document.getElementById('inputQrToken');
    if (tokenInput) tokenInput.value = decodedText;
    stopQrScanner();
    Swal.fire({
      icon: 'success',
      title: 'QR Code Terdeteksi!',
      text: 'Token absensi berhasil dipindai dengan kualitas HD.',
      timer: 1500,
      showConfirmButton: false
    });
  }

  function startWithSource(source) {
    return qrScannerInstance.start(
      source,
      config,
      onScanSuccess,
      () => { /* frame without QR, ignore */ }
    );
  }

  startWithSource(cameraSource)
    .catch((err) => {
      console.warn('HD camera start error, attempting standard fallback:', err);
      // Fallback: try standard environment facingMode if strict HD constraint was rejected
      return startWithSource({ facingMode: "environment" });
    })
    .catch((err) => {
      console.warn('Second attempt error, attempting default camera:', err);
      // Final fallback: try with whatever default camera is available
      return startWithSource(true);
    })
    .then(() => {
      isScannerActive = true;
      const btnStart = document.getElementById('btnStartScanner');
      const btnStop = document.getElementById('btnStopScanner');
      const statusInd = document.getElementById('cameraStatusIndicator');
      if (btnStart) btnStart.classList.add('hidden');
      if (btnStop) btnStop.classList.remove('hidden');
      if (statusInd) statusInd.classList.remove('hidden');
    })
    .catch((err) => {
      console.error('Final camera failure:', err);
      Swal.fire({
        icon: 'error',
        title: 'Kamera Gagal Dibuka',
        text: 'Pastikan Anda memberikan izin akses kamera pada browser, atau gunakan tombol "Gunakan Token Kantor".'
      });
    });
}

// Stop QR Scanner
function stopQrScanner() {
  if (qrScannerInstance && isScannerActive) {
    qrScannerInstance.stop().then(() => {
      isScannerActive = false;
      const btnStart = document.getElementById('btnStartScanner');
      const btnStop = document.getElementById('btnStopScanner');
      const statusInd = document.getElementById('cameraStatusIndicator');
      if (btnStart) btnStart.classList.remove('hidden');
      if (btnStop) btnStop.classList.add('hidden');
      if (statusInd) statusInd.classList.add('hidden');
      const qrBox = document.getElementById('qr-reader');
      if (qrBox) qrBox.innerHTML = '';
    }).catch(err => console.error(err));
  }
}

// Populate Camera Selector Dropdown
function populateCameraDeviceOptions(devices, activeId) {
  const container = document.getElementById('cameraDeviceContainer');
  const select = document.getElementById('selectCameraDevice');
  if (!container || !select) return;

  if (devices.length > 1) {
    container.classList.remove('hidden');
    select.innerHTML = devices.map((d, idx) => {
      const isBack = /back|rear|environment|belakang/i.test(d.label);
      const isSelected = activeId ? d.id === activeId : (isBack || idx === 0);
      return `<option value="${d.id}" ${isSelected ? 'selected' : ''}>${d.label || 'Kamera ' + (idx + 1)} ${isBack ? '(HD Belakang)' : ''}</option>`;
    }).join('');
  } else {
    container.classList.add('hidden');
  }
}

// Switch Camera Device
async function onCameraDeviceSelected(deviceId) {
  selectedCameraId = deviceId;
  if (isScannerActive) {
    await qrScannerInstance.stop();
    isScannerActive = false;
    startQrScanner(deviceId);
  }
}

// Paste Office QR Token shortcut
function pasteOfficeQrToken() {
  document.getElementById('inputQrToken').value = officeSettings.token;
  Swal.fire({
    icon: 'info',
    title: 'Token Kantor Diterapkan',
    text: `Kode token ${officeSettings.token} berhasil dimasukkan.`,
    timer: 1200,
    showConfirmButton: false
  });
}

// Submit Attendance
async function submitAttendance() {
  const qrInput = document.getElementById('inputQrToken');
  const qrToken = qrInput ? qrInput.value.trim() : '';
  const notesInput = document.getElementById('inputAttendanceNotes');
  const notes = notesInput ? notesInput.value.trim() : '';
  const btnSubmit = document.getElementById('btnSubmitAttendance');

  if (!qrToken) {
    Swal.fire({
      icon: 'warning',
      title: 'QR Code Diperlukan',
      text: 'Silakan pindai QR Code kantor atau masukkan token absensi terlebih dahulu!'
    });
    return;
  }

  // Geofence check
  if (!userCoordinates.isValid) {
    const offName = userCoordinates.matchedOffice ? userCoordinates.matchedOffice.name : 'kantor';
    const maxRad = userCoordinates.matchedOffice ? userCoordinates.matchedOffice.radius : officeSettings.radius;
    Swal.fire({
      icon: 'error',
      title: 'Di Luar Radius Kantor!',
      text: `Jarak Anda: ${userCoordinates.distance} meter dari ${offName} (Batas: ${maxRad} meter). Anda harus berada di area kantor untuk melakukan absensi!`
    });
    return;
  }

  const endpoint = attendanceAction === 'in' ? '/api/absensi/check-in' : '/api/absensi/check-out';

  try {
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<span class="animate-spin mr-2">⌛</span> Memproses presensi...`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qr_token: qrToken,
        latitude: userCoordinates.lat,
        longitude: userCoordinates.lng,
        office_id: selectedAttendanceOfficeId,
        notes: notes
      })
    });

    const data = await res.json();

    if (data.success) {
      const officeName = data.office_name || data.record?.office_name || (userCoordinates.matchedOffice ? userCoordinates.matchedOffice.name : null);
      const officeLabel = officeName ? `<br><small class="text-emerald-700 font-semibold inline-flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 inline"></i> Lokasi Kantor: ${officeName}</small>` : '';
      Swal.fire({
        icon: 'success',
        title: 'Absensi Berhasil!',
        html: `<b>${data.message}</b>${officeLabel}<br><small class="text-slate-500">Jarak tercatat: ${userCoordinates.distance}m</small>`,
        didOpen: () => { if (window.lucide) lucide.createIcons(); }
      });

      // Clear input and reload dashboard
      if (qrInput) qrInput.value = '';
      if (notesInput) notesInput.value = '';
      stopQrScanner();

      // Reset button state before switching action
      const nextAction = attendanceAction === 'in' ? 'out' : 'in';
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i><span id="btnSubmitAttendanceText">${nextAction === 'in' ? 'Kirim Absensi Masuk' : 'Kirim Absensi Pulang'}</span>`;
        if (window.lucide) lucide.createIcons();
      }

      // Switch to next action
      setAttendanceAction(nextAction);
      loadDashboardData();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Presensi Gagal',
        text: data.message
      });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i><span id="btnSubmitAttendanceText">${attendanceAction === 'in' ? 'Kirim Absensi Masuk' : 'Kirim Absensi Pulang'}</span>`;
      if (window.lucide) lucide.createIcons();
    }
  }
}



// ==============================================================
// 5. ATTENDANCE HISTORY
// ==============================================================

async function loadAttendanceHistory() {
  const month = document.getElementById('filterHistoryMonth').value || (dayjs().month() + 1);
  const year = document.getElementById('filterHistoryYear').value || dayjs().year();
  const status = document.getElementById('filterHistoryStatus').value;
  const employeeId = document.getElementById('filterHistoryEmployee')?.value || '';

  // Set default filter select if empty
  document.getElementById('filterHistoryMonth').value = month;
  document.getElementById('filterHistoryYear').value = year;

  let url = `/api/absensi/history?month=${month}&year=${year}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (employeeId) url += `&user_id=${employeeId}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      const s = data.summary;
      document.getElementById('sumHistoryTotal').innerText = s.total;
      document.getElementById('sumHistoryTepat').innerText = s.tepat_waktu;
      document.getElementById('sumHistoryTerlambat').innerText = s.terlambat;
      document.getElementById('sumHistoryIzin').innerText = s.izin;
      document.getElementById('sumHistorySakit').innerText = s.sakit;
      document.getElementById('sumHistoryCuti').innerText = s.cuti;

      const tbody = document.getElementById('historyTableBody');
      if (data.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">Tidak ada riwayat absensi untuk periode ini.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.records.map(r => {
        const durHours = r.work_duration_minutes ? Math.floor(r.work_duration_minutes / 60) : 0;
        const durMins = r.work_duration_minutes ? (r.work_duration_minutes % 60) : 0;
        const durFormatted = r.work_duration_minutes ? `${durHours}j ${durMins}m` : '-';

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4 font-medium text-slate-900">${dayjs(r.date).format('DD/MM/YYYY')}</td>
            <td class="py-3 px-4">
              <div class="font-bold text-slate-900">${r.user_name}</div>
              <div class="text-[10px] text-slate-500 font-mono">${r.nip} • ${r.department_name || '-'}</div>
            </td>
            <td class="py-3 px-4 font-mono font-semibold">${r.check_in_time || '-'}</td>
            <td class="py-3 px-4">${renderStatusBadge(r.check_in_status)}</td>
            <td class="py-3 px-4 text-slate-600">${r.check_in_distance != null ? Math.round(r.check_in_distance) + ' m' : '-'}</td>
            <td class="py-3 px-4 font-mono font-semibold">${r.check_out_time || '-'}</td>
            <td class="py-3 px-4 text-slate-700">${durFormatted}</td>
            <td class="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">${r.check_in_notes || '-'}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading history:', err);
  }
}


// ==============================================================
// 6. EMPLOYEE MANAGEMENT (CRUD - Admin)
// ==============================================================

let employeesCache = [];

async function loadEmployeeList() {
  try {
    const res = await fetch('/api/karyawan');
    const data = await res.json();

    if (data.success) {
      employeesCache = data.employees;
      renderEmployeeTable(employeesCache);
      populateEmployeeFilterOptions(employeesCache);
    }
  } catch (err) {
    console.error('Error loading employees:', err);
  }
}

function renderEmployeeTable(list) {
  const tbody = document.getElementById('employeeTableBody');
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">Data karyawan tidak ditemukan.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(e => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-4">
        <div class="flex items-center space-x-3">
          <img src="${e.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(e.name)}&background=2563eb&color=fff`}"
            class="w-8 h-8 rounded-full object-cover border border-slate-200" alt="avatar">
          <div>
            <div class="font-bold text-slate-900">${e.name}</div>
            <div class="text-[10px] text-slate-500">${e.email}</div>
          </div>
        </div>
      </td>
      <td class="py-3 px-4 font-mono font-semibold text-slate-800">${e.nip}</td>
      <td class="py-3 px-4 text-slate-600">${e.phone || '-'}</td>
      <td class="py-3 px-4">
        <span class="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
          ${e.department_name || 'Umum'}
        </span>
      </td>
      <td class="py-3 px-4 text-slate-700">
        ${e.shift_name ? `<span class="font-medium">${e.shift_name}</span> <span class="text-[10px] text-slate-400 font-mono">(${e.start_time}-${e.end_time})</span>` : '-'}
      </td>
      <td class="py-3 px-4">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${e.role === 'admin' ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-slate-100 text-slate-700'}">
          ${e.role.toUpperCase()}
        </span>
      </td>
      <td class="py-3 px-4">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${e.status === 'aktif' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}">
          ${e.status}
        </span>
      </td>
      <td class="py-3 px-4 text-right">
        <div class="flex items-center justify-end space-x-2">
          <button onclick="editEmployee(${e.id})" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteEmployee(${e.id}, '${e.name}')" class="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition" title="Hapus">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function filterEmployeeList() {
  const query = document.getElementById('searchEmployeeInput').value.toLowerCase();
  const deptId = document.getElementById('filterEmployeeDept').value;
  const status = document.getElementById('filterEmployeeStatus').value;

  const filtered = employeesCache.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(query) || e.nip.toLowerCase().includes(query) || e.email.toLowerCase().includes(query);
    const matchDept = !deptId || String(e.department_id) === String(deptId);
    const matchStatus = !status || e.status === status;
    return matchSearch && matchDept && matchStatus;
  });

  renderEmployeeTable(filtered);
}

// Populate Dept and Shift dropdowns for employee modal & filters
async function populateEmployeeFormOptions() {
  // Departments
  const deptRes = await fetch('/api/karyawan/departments/all');
  const deptData = await deptRes.json();
  const deptSelect = document.getElementById('empDepartment');
  const filterDept = document.getElementById('filterEmployeeDept');
  const filterReportDept = document.getElementById('filterReportDept');

  if (deptData.success) {
    const options = deptData.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    if (deptSelect) deptSelect.innerHTML = `<option value="">Pilih Departemen</option>` + options;
    if (filterDept) filterDept.innerHTML = `<option value="">Semua Departemen</option>` + options;
    if (filterReportDept) filterReportDept.innerHTML = `<option value="">Semua Departemen</option>` + options;
  }

  // Shifts
  const shiftRes = await fetch('/api/jadwal/shifts');
  const shiftData = await shiftRes.json();
  const shiftSelect = document.getElementById('empShift');
  if (shiftData.success) {
    const shiftOptions = shiftData.shifts.map(s => `<option value="${s.id}">${s.name} (${s.start_time} - ${s.end_time})</option>`).join('');
    if (shiftSelect) shiftSelect.innerHTML = `<option value="">Pilih Shift</option>` + shiftOptions;
  }
}

function populateEmployeeFilterOptions(employees) {
  const filterEmp = document.getElementById('filterHistoryEmployee');
  if (filterEmp) {
    filterEmp.innerHTML = `<option value="">Semua Karyawan</option>` +
      employees.map(e => `<option value="${e.id}">${e.name} (${e.nip})</option>`).join('');
  }
}

// Open Employee Modal
async function openEmployeeModal(empId = null) {
  await populateEmployeeFormOptions();
  document.getElementById('formEmployee').reset();
  document.getElementById('empId').value = '';
  document.getElementById('empPassword').required = true;
  document.getElementById('empPasswordHint').innerText = '(Wajib untuk karyawan baru)';
  document.getElementById('modalEmployeeTitle').innerText = 'Tambah Data Karyawan Baru';

  if (empId) {
    const emp = employeesCache.find(e => e.id === empId);
    if (emp) {
      document.getElementById('empId').value = emp.id;
      document.getElementById('empNip').value = emp.nip;
      document.getElementById('empName').value = emp.name;
      document.getElementById('empEmail').value = emp.email;
      document.getElementById('empPhone').value = emp.phone || '';
      document.getElementById('empAddress').value = emp.address || '';
      document.getElementById('empDepartment').value = emp.department_id || '';
      document.getElementById('empShift').value = emp.shift_id || '';
      document.getElementById('empRole').value = emp.role;
      document.getElementById('empStatus').value = emp.status;

      document.getElementById('empPassword').required = false;
      document.getElementById('empPasswordHint').innerText = '(Kosongkan jika tidak ingin mengubah password)';
      document.getElementById('modalEmployeeTitle').innerText = `Edit Data Karyawan: ${emp.name}`;
    }
  }

  openModal('modalEmployee');
}

function editEmployee(id) {
  openEmployeeModal(id);
}

// Save Employee Form
async function saveEmployee(e) {
  e.preventDefault();

  const id = document.getElementById('empId').value;
  const formData = new FormData();
  formData.append('nip', document.getElementById('empNip').value);
  formData.append('name', document.getElementById('empName').value);
  formData.append('email', document.getElementById('empEmail').value);
  formData.append('password', document.getElementById('empPassword').value);
  formData.append('phone', document.getElementById('empPhone').value);
  formData.append('address', document.getElementById('empAddress').value);
  formData.append('department_id', document.getElementById('empDepartment').value);
  formData.append('shift_id', document.getElementById('empShift').value);
  formData.append('role', document.getElementById('empRole').value);
  formData.append('status', document.getElementById('empStatus').value);

  const avatarFile = document.getElementById('empAvatarFile').files[0];
  if (avatarFile) {
    formData.append('avatar', avatarFile);
  }

  const url = id ? `/api/karyawan/${id}` : '/api/karyawan';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, { method, body: formData });
    const data = await res.json();

    if (data.success) {
      closeModal('modalEmployee');
      Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message });
      loadEmployeeList();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}

// Delete Employee
async function deleteEmployee(id, name) {
  const result = await Swal.fire({
    title: `Hapus Karyawan?`,
    text: `Anda akan menghapus data ${name}. Tindakan ini tidak dapat dibatalkan!`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Ya, Hapus',
    cancelButtonText: 'Batal'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/karyawan/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ icon: 'success', title: 'Terhapus', text: data.message });
        loadEmployeeList();
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: data.message });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
    }
  }
}


// ==============================================================
// 7. JABATAN & SHIFT MANAGEMENT (Admin)
// ==============================================================

async function loadDepartmentsAndShifts() {
  loadDepartments();
  loadShifts();
}

async function loadDepartments() {
  try {
    const res = await fetch('/api/karyawan/departments/all');
    const data = await res.json();
    const tbody = document.getElementById('deptTableBody');

    if (data.success) {
      if (data.departments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-slate-400">Belum ada departemen.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.departments.map(d => `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 font-bold text-slate-800">${d.name}</td>
          <td class="py-2.5 px-3 text-slate-500">${d.description || '-'}</td>
          <td class="py-2.5 px-3 font-semibold text-brand-600">${d.employee_count} Karyawan</td>
          <td class="py-2.5 px-3 text-right">
            <button onclick="editDepartment(${d.id}, '${d.name}', '${d.description || ''}')" class="p-1 text-blue-600 hover:bg-blue-50 rounded">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteDepartment(${d.id}, '${d.name}')" class="p-1 text-red-600 hover:bg-red-50 rounded">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `).join('');
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Error loading depts:', err);
  }
}

function openDepartmentModal() {
  document.getElementById('formDepartment').reset();
  document.getElementById('deptId').value = '';
  document.getElementById('modalDeptTitle').innerText = 'Tambah Jabatan / Departemen';
  openModal('modalDepartment');
}

function editDepartment(id, name, desc) {
  document.getElementById('deptId').value = id;
  document.getElementById('deptName').value = name;
  document.getElementById('deptDescription').value = desc;
  document.getElementById('modalDeptTitle').innerText = `Edit Jabatan: ${name}`;
  openModal('modalDepartment');
}

async function saveDepartment(e) {
  e.preventDefault();
  const id = document.getElementById('deptId').value;
  const name = document.getElementById('deptName').value;
  const description = document.getElementById('deptDescription').value;

  const url = id ? `/api/karyawan/departments/${id}` : '/api/karyawan/departments';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalDepartment');
      Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message });
      loadDepartments();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}

async function deleteDepartment(id, name) {
  const result = await Swal.fire({
    title: `Hapus Jabatan?`,
    text: `Hapus departemen ${name}? Karyawan yang terhubung akan dilepas jabatannya.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Hapus'
  });

  if (result.isConfirmed) {
    await fetch(`/api/karyawan/departments/${id}`, { method: 'DELETE' });
    loadDepartments();
  }
}

// Shifts
async function loadShifts() {
  try {
    const res = await fetch('/api/jadwal/shifts');
    const data = await res.json();
    const tbody = document.getElementById('shiftTableBody');

    if (data.success) {
      if (data.shifts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-slate-400">Belum ada shift.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.shifts.map(s => `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 font-bold text-slate-800">${s.name}</td>
          <td class="py-2.5 px-3 font-mono font-semibold text-slate-700">${s.start_time} - ${s.end_time}</td>
          <td class="py-2.5 px-3 font-semibold text-amber-600">${s.tolerance_minutes} Menit</td>
          <td class="py-2.5 px-3 text-slate-600 font-semibold">${s.employee_count} Org</td>
          <td class="py-2.5 px-3 text-right">
            <button onclick="editShift(${s.id}, '${s.name}', '${s.start_time}', '${s.end_time}', ${s.tolerance_minutes})" class="p-1 text-blue-600 hover:bg-blue-50 rounded">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deleteShift(${s.id}, '${s.name}')" class="p-1 text-red-600 hover:bg-red-50 rounded">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </td>
        </tr>
      `).join('');
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Error loading shifts:', err);
  }
}

function openShiftModal() {
  document.getElementById('formShift').reset();
  document.getElementById('shiftId').value = '';
  document.getElementById('shiftToleranceInput').value = '15';
  document.getElementById('modalShiftTitle').innerText = 'Tambah Shift Kerja Baru';
  openModal('modalShift');
}

function editShift(id, name, start, end, tol) {
  document.getElementById('shiftId').value = id;
  document.getElementById('shiftNameInput').value = name;
  document.getElementById('shiftStartTimeInput').value = start;
  document.getElementById('shiftEndTimeInput').value = end;
  document.getElementById('shiftToleranceInput').value = tol;
  document.getElementById('modalShiftTitle').innerText = `Edit Shift: ${name}`;
  openModal('modalShift');
}

async function saveShift(e) {
  e.preventDefault();
  const id = document.getElementById('shiftId').value;
  const name = document.getElementById('shiftNameInput').value;
  const start_time = document.getElementById('shiftStartTimeInput').value;
  const end_time = document.getElementById('shiftEndTimeInput').value;
  const tolerance_minutes = document.getElementById('shiftToleranceInput').value;

  const url = id ? `/api/jadwal/shifts/${id}` : '/api/jadwal/shifts';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, start_time, end_time, tolerance_minutes })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalShift');
      Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message });
      loadShifts();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}

async function deleteShift(id, name) {
  const result = await Swal.fire({
    title: `Hapus Shift?`,
    text: `Hapus master shift ${name}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Hapus'
  });

  if (result.isConfirmed) {
    await fetch(`/api/jadwal/shifts/${id}`, { method: 'DELETE' });
    loadShifts();
  }
}


// ==============================================================
// 8. LEAVE (CUTI, IZIN, SAKIT) MANAGEMENT
// ==============================================================

async function loadLeavesList() {
  const status = document.getElementById('filterLeaveStatus').value;
  const type = document.getElementById('filterLeaveType').value;

  let url = '/api/jadwal/leaves?';
  if (status) url += `&status=${status}`;
  if (type) url += `&type=${type}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const tbody = document.getElementById('leavesTableBody');

    if (data.success) {
      if (data.leaves.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">Tidak ada pengajuan cuti/izin.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.leaves.map(l => {
        let badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
        if (l.status === 'disetujui') badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        if (l.status === 'ditolak') badgeColor = 'bg-red-100 text-red-800 border-red-200';

        const canReview = currentUser.role === 'admin' && l.status === 'menunggu';

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4">
              <div class="font-bold text-slate-900">${l.user_name}</div>
              <div class="text-[10px] text-slate-500 font-mono">${l.nip}</div>
            </td>
            <td class="py-3 px-4 font-semibold uppercase text-brand-700">${l.type}</td>
            <td class="py-3 px-4 font-mono text-slate-700">${l.start_date} s/d ${l.end_date}</td>
            <td class="py-3 px-4 font-semibold text-slate-800">${l.total_days} Hari</td>
            <td class="py-3 px-4 text-slate-600 max-w-xs truncate">${l.reason}</td>
            <td class="py-3 px-4">
              ${l.attachment ? `<a href="${l.attachment}" target="_blank" class="text-brand-600 font-semibold hover:underline flex items-center"><i data-lucide="paperclip" class="w-3.5 h-3.5 mr-1"></i> Lampiran</a>` : '-'}
            </td>
            <td class="py-3 px-4">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${badgeColor}">
                ${l.status}
              </span>
            </td>
            <td class="py-3 px-4 text-right">
              ${canReview ? `
                <button onclick="openReviewLeaveModal(${l.id}, '${l.user_name}', '${l.type}', '${l.start_date} s/d ${l.end_date}', '${l.reason}')"
                  class="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
                  Review
                </button>
              ` : (l.admin_notes ? `<span class="text-[10px] text-slate-500 italic" title="${l.admin_notes}">Catatan: ${l.admin_notes}</span>` : '-')}
            </td>
          </tr>
        `;
      }).join('');
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Error loading leaves:', err);
  }
}

function openLeaveModal() {
  document.getElementById('formLeave').reset();
  const todayStr = dayjs().format('YYYY-MM-DD');
  document.getElementById('leaveStartDate').value = todayStr;
  document.getElementById('leaveEndDate').value = todayStr;
  openModal('modalLeave');
}

async function submitLeave(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('type', document.getElementById('leaveType').value);
  formData.append('start_date', document.getElementById('leaveStartDate').value);
  formData.append('end_date', document.getElementById('leaveEndDate').value);
  formData.append('reason', document.getElementById('leaveReason').value);

  const file = document.getElementById('leaveAttachment').files[0];
  if (file) formData.append('attachment', file);

  try {
    const res = await fetch('/api/jadwal/leaves', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      closeModal('modalLeave');
      Swal.fire({ icon: 'success', title: 'Terkirim', text: data.message });
      loadLeavesList();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}

function openReviewLeaveModal(id, userName, type, dates, reason) {
  document.getElementById('reviewTargetType').value = 'leave';
  document.getElementById('reviewTargetId').value = id;
  document.getElementById('modalReviewTitle').innerText = 'Verifikasi Permohonan Cuti/Izin';
  document.getElementById('reviewTargetDetails').innerHTML = `
    <p class="font-bold text-slate-800">${userName} - ${type.toUpperCase()}</p>
    <p class="text-slate-600">Periode: ${dates}</p>
    <p class="text-slate-500 italic mt-1">Alasan: "${reason}"</p>
  `;
  document.getElementById('reviewAdminNotes').value = '';
  openModal('modalReviewAction');
}


// ==============================================================
// 9. OVERTIME (LEMBUR) MANAGEMENT
// ==============================================================

async function loadOvertimeList() {
  try {
    const res = await fetch('/api/lembur');
    const data = await res.json();
    const tbody = document.getElementById('overtimeTableBody');

    if (data.success) {
      document.getElementById('dashTotalOvertimeHours').innerText = data.total_approved_hours + ' Jam';

      if (data.overtimes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">Belum ada pengajuan jam lembur.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.overtimes.map(ot => {
        let badgeColor = 'bg-amber-100 text-amber-800 border-amber-200';
        if (ot.status === 'disetujui') badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        if (ot.status === 'ditolak') badgeColor = 'bg-red-100 text-red-800 border-red-200';

        const canReview = currentUser.role === 'admin' && ot.status === 'menunggu';

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-3 px-4">
              <div class="font-bold text-slate-900">${ot.user_name}</div>
              <div class="text-[10px] text-slate-500 font-mono">${ot.nip}</div>
            </td>
            <td class="py-3 px-4 font-medium text-slate-800">${ot.date}</td>
            <td class="py-3 px-4 font-mono font-semibold text-slate-700">${ot.start_time} - ${ot.end_time}</td>
            <td class="py-3 px-4 font-bold text-amber-700">${ot.total_hours} Jam</td>
            <td class="py-3 px-4 text-slate-600 max-w-xs truncate">${ot.task_description}</td>
            <td class="py-3 px-4">
              <span class="px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase ${badgeColor}">
                ${ot.status}
              </span>
            </td>
            <td class="py-3 px-4 text-slate-500 text-[11px] italic">${ot.admin_notes || '-'}</td>
            <td class="py-3 px-4 text-right">
              ${canReview ? `
                <button onclick="openReviewOvertimeModal(${ot.id}, '${ot.user_name}', '${ot.date}', '${ot.start_time}-${ot.end_time}', ${ot.total_hours}, '${ot.task_description}')"
                  class="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
                  Review
                </button>
              ` : '-'}
            </td>
          </tr>
        `;
      }).join('');
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Error loading overtimes:', err);
  }
}

function openOvertimeModal() {
  document.getElementById('formOvertime').reset();
  document.getElementById('otDate').value = dayjs().format('YYYY-MM-DD');
  document.getElementById('otStartTime').value = '17:00';
  document.getElementById('otEndTime').value = '20:00';
  openModal('modalOvertime');
}

async function submitOvertime(e) {
  e.preventDefault();
  const payload = {
    date: document.getElementById('otDate').value,
    start_time: document.getElementById('otStartTime').value,
    end_time: document.getElementById('otEndTime').value,
    task_description: document.getElementById('otDescription').value
  };

  try {
    const res = await fetch('/api/lembur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalOvertime');
      Swal.fire({ icon: 'success', title: 'Terkirim', text: data.message });
      loadOvertimeList();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}

function openReviewOvertimeModal(id, userName, date, times, hours, desc) {
  document.getElementById('reviewTargetType').value = 'overtime';
  document.getElementById('reviewTargetId').value = id;
  document.getElementById('modalReviewTitle').innerText = 'Verifikasi Pengajuan Jam Lembur';
  document.getElementById('reviewTargetDetails').innerHTML = `
    <p class="font-bold text-slate-800">${userName} - Lembur ${hours} Jam</p>
    <p class="text-slate-600">Tanggal: ${date} (${times})</p>
    <p class="text-slate-500 italic mt-1">Tugas: "${desc}"</p>
  `;
  document.getElementById('reviewAdminNotes').value = '';
  openModal('modalReviewAction');
}

// Unified Review Submit for Leave & Overtime
async function submitReview(e) {
  e.preventDefault();
  const type = document.getElementById('reviewTargetType').value;
  const id = document.getElementById('reviewTargetId').value;
  const status = document.getElementById('reviewDecision').value;
  const admin_notes = document.getElementById('reviewAdminNotes').value;

  const url = type === 'leave' ? `/api/jadwal/leaves/${id}/review` : `/api/lembur/${id}/review`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, admin_notes })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalReviewAction');
      Swal.fire({ icon: 'success', title: 'Disimpan', text: data.message });
      if (type === 'leave') loadLeavesList();
      else loadOvertimeList();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}


// ==============================================================
// 10. ATTENDANCE REPORTS & EXPORT
// ==============================================================

function initReportView() {
  const start = dayjs().startOf('month').format('YYYY-MM-DD');
  const end = dayjs().format('YYYY-MM-DD');

  document.getElementById('filterReportStartDate').value = start;
  document.getElementById('filterReportEndDate').value = end;
  document.getElementById('printPlaceDate').innerText = `Jakarta, ${dayjs().format('DD MMMM YYYY')}`;

  populateEmployeeFormOptions();
  loadReportData();
}

async function loadReportData() {
  const start = document.getElementById('filterReportStartDate').value;
  const end = document.getElementById('filterReportEndDate').value;
  const dept = document.getElementById('filterReportDept').value;

  let url = `/api/laporan/rekap?start_date=${start}&end_date=${end}`;
  if (dept) url += `&department_id=${dept}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      const s = data.summary;
      document.getElementById('sumReportTotal').innerText = s.total;
      document.getElementById('sumReportTepat').innerText = s.tepat_waktu;
      document.getElementById('sumReportTerlambat').innerText = s.terlambat;
      document.getElementById('sumReportIzin').innerText = s.izin;
      document.getElementById('sumReportSakit').innerText = s.sakit;
      document.getElementById('sumReportCuti').innerText = s.cuti;

      const tbody = document.getElementById('reportTableBody');
      if (data.records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center py-6 text-slate-400">Tidak ada catatan absensi untuk kriteria filter ini.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.records.map((r, idx) => {
        const durHours = r.work_duration_minutes ? Math.floor(r.work_duration_minutes / 60) : 0;
        const durMins = r.work_duration_minutes ? (r.work_duration_minutes % 60) : 0;
        const durFormatted = r.work_duration_minutes ? `${durHours}j ${durMins}m` : '-';

        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-4 text-center">${idx + 1}</td>
            <td class="py-2.5 px-4 font-medium text-slate-900">${r.date}</td>
            <td class="py-2.5 px-4 font-mono font-semibold">${r.nip}</td>
            <td class="py-2.5 px-4 font-bold text-slate-900">${r.user_name}</td>
            <td class="py-2.5 px-4 text-slate-600">${r.department_name || '-'}</td>
            <td class="py-2.5 px-4 text-slate-500">${r.shift_name || '-'}</td>
            <td class="py-2.5 px-4 font-semibold text-brand-700">${r.office_name || 'Kantor Pusat'}</td>
            <td class="py-2.5 px-4 font-mono font-semibold">${r.check_in_time || '-'}</td>
            <td class="py-2.5 px-4 text-center">${renderStatusBadge(r.check_in_status)}</td>
            <td class="py-2.5 px-4 text-center text-slate-600">${r.check_in_distance != null ? Math.round(r.check_in_distance) : '-'}</td>
            <td class="py-2.5 px-4 font-mono font-semibold">${r.check_out_time || '-'}</td>
            <td class="py-2.5 px-4 font-semibold text-slate-800">${durFormatted}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading report:', err);
  }
}

// Download Report (Excel or CSV)
function exportReport(format) {
  const start = document.getElementById('filterReportStartDate').value;
  const end = document.getElementById('filterReportEndDate').value;
  const dept = document.getElementById('filterReportDept').value;

  let url = format === 'excel' ? '/api/laporan/export/excel?' : '/api/laporan/export/csv?';
  url += `start_date=${start}&end_date=${end}`;
  if (dept) url += `&department_id=${dept}`;

  window.open(url, '_blank');
}


// ==============================================================
// 11. SYSTEM SETTINGS & GEOFENCING MAP
// ==============================================================

async function initSettingsView() {
  try {
    const res = await fetch('/api/pengaturan');
    const data = await res.json();

    if (data.success && data.settings) {
      const s = data.settings;
      document.getElementById('setCompanyName').value = s.company_name || '';
      document.getElementById('setCompanyAddress').value = s.company_address || '';
      document.getElementById('setCompanyPhone').value = s.company_phone || '';
      document.getElementById('setCompanyEmail').value = s.company_email || '';

      document.getElementById('setWaEnabled').checked = s.wa_enabled === 'true';
      document.getElementById('setWaApiUrl').value = s.wa_api_url || '';
      document.getElementById('setWaApiToken').value = s.wa_api_token || '';

      document.getElementById('setTgEnabled').checked = s.telegram_enabled === 'true';
      document.getElementById('setTgBotToken').value = s.telegram_bot_token || '';
      document.getElementById('setTgChatId').value = s.telegram_chat_id || '';

      if (s.company_logo) {
        document.getElementById('settingsLogoPreview').innerHTML = `<img src="${s.company_logo}" alt="Logo" class="w-full h-full object-contain">`;
      }

      // Load QR
      loadSettingsQr();

      // Load Multi-Office Locations
      await loadSettingsOffices();
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// Fetch and render multi-office list in settings
async function loadSettingsOffices() {
  try {
    const res = await fetch('/api/pengaturan/offices');
    const data = await res.json();

    if (data.success && data.offices) {
      officesCache = data.offices;
      renderOfficeTable(officesCache);

      // Select active office to edit
      if (!activeSettingsOfficeId || !officesCache.some(o => o.id == activeSettingsOfficeId)) {
        const primary = officesCache.find(o => o.is_primary) || officesCache[0];
        if (primary) activeSettingsOfficeId = primary.id;
      }

      if (activeSettingsOfficeId) {
        selectActiveOfficeForEditing(activeSettingsOfficeId);
      }
    }
  } catch (err) {
    console.error('Error loading offices:', err);
  }
}

// Render Office Table in Settings View
function renderOfficeTable(offices) {
  const tbody = document.getElementById('officeTableBody');
  if (!tbody) return;

  if (!offices || offices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-slate-400">Belum ada titik kantor terdaftar.</td></tr>`;
    return;
  }

  tbody.innerHTML = offices.map(o => {
    const isPri = !!o.is_primary;
    const isAct = o.id == activeSettingsOfficeId;
    return `
      <tr class="hover:bg-slate-50 transition cursor-pointer ${isAct ? 'bg-emerald-50/50 font-semibold' : ''}" onclick="selectActiveOfficeForEditing(${o.id})">
        <td class="py-2.5 px-3">
          <div class="flex items-center space-x-2">
            <i data-lucide="building-2" class="w-4 h-4 ${isPri ? 'text-brand-600' : 'text-slate-400'} shrink-0"></i>
            <div>
              <div class="font-bold text-slate-900">${o.name}</div>
              <div class="text-[10px] text-slate-500 max-w-xs truncate">${o.address || '-'}</div>
            </div>
          </div>
        </td>
        <td class="py-2.5 px-3 font-mono text-[11px] text-slate-600">
          ${parseFloat(o.latitude).toFixed(5)}, ${parseFloat(o.longitude).toFixed(5)}
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            ${o.radius} meter
          </span>
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isPri ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'}">
            ${isPri ? 'UTAMA' : 'CABANG'}
          </span>
        </td>
        <td class="py-2.5 px-3 text-right" onclick="event.stopPropagation()">
          <div class="flex items-center justify-end space-x-1">
            <button type="button" onclick="selectActiveOfficeForEditing(${o.id})" class="p-1 text-slate-500 hover:text-brand-600 rounded" title="Fokus Peta & Koordinat">
              <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" onclick="openEditOfficeModal(${o.id})" class="p-1 text-blue-600 hover:text-blue-800 rounded" title="Edit Data Kantor">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            ${!isPri ? `
              <button type="button" onclick="setPrimaryOffice(${o.id})" class="p-1 text-amber-600 hover:text-amber-800 rounded" title="Jadikan Kantor Utama">
                <i data-lucide="star" class="w-3.5 h-3.5"></i>
              </button>
              ${offices.length > 1 ? `
                <button type="button" onclick="deleteOffice(${o.id}, '${o.name}')" class="p-1 text-red-600 hover:text-red-800 rounded" title="Hapus Kantor">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

// Select an office to edit on the map & form
function selectActiveOfficeForEditing(officeId) {
  activeSettingsOfficeId = officeId;
  const o = officesCache.find(x => x.id == officeId);
  if (!o) return;

  // Update form inputs
  const actIdInput = document.getElementById('activeOfficeId');
  if (actIdInput) actIdInput.value = o.id;

  const nameEl = document.getElementById('activeEditingOfficeName');
  if (nameEl) nameEl.innerText = o.name;

  const badgeEl = document.getElementById('activeEditingOfficeBadge');
  if (badgeEl) {
    badgeEl.innerText = o.is_primary ? 'Utama' : 'Cabang';
    badgeEl.className = o.is_primary ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800' : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700';
  }

  document.getElementById('setOfficeLat').value = parseFloat(o.latitude).toFixed(6);
  document.getElementById('setOfficeLng').value = parseFloat(o.longitude).toFixed(6);
  document.getElementById('setOfficeRadius').value = o.radius;

  // Update map view & markers
  initSettingsMap(parseFloat(o.latitude), parseFloat(o.longitude), parseInt(o.radius));

  // Re-render table active row highlighting
  renderOfficeTable(officesCache);
}

// Leaflet Multi-Office Settings Map Picker
function initSettingsMap(activeLat, activeLng, activeRadius) {
  const container = document.getElementById('settingsMap');
  if (!container) return;

  if (!settingsMap) {
    settingsMap = L.map('settingsMap').setView([activeLat, activeLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(settingsMap);

    // Marker & Circle for actively edited office
    settingsOfficeMarker = L.marker([activeLat, activeLng], { draggable: true }).addTo(settingsMap);
    settingsOfficeCircle = L.circle([activeLat, activeLng], {
      color: '#059669',
      fillColor: '#10b981',
      fillOpacity: 0.2,
      radius: activeRadius
    }).addTo(settingsMap);

    // Drag marker event
    settingsOfficeMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      document.getElementById('setOfficeLat').value = pos.lat.toFixed(6);
      document.getElementById('setOfficeLng').value = pos.lng.toFixed(6);
      settingsOfficeCircle.setLatLng(pos);
    });

    // Map click event
    settingsMap.on('click', (e) => {
      const pos = e.latlng;
      document.getElementById('setOfficeLat').value = pos.lat.toFixed(6);
      document.getElementById('setOfficeLng').value = pos.lng.toFixed(6);
      settingsOfficeMarker.setLatLng(pos);
      settingsOfficeCircle.setLatLng(pos);
    });
  } else {
    settingsMap.setView([activeLat, activeLng], 15);
    settingsOfficeMarker.setLatLng([activeLat, activeLng]);
    settingsOfficeCircle.setLatLng([activeLat, activeLng]);
    settingsOfficeCircle.setRadius(activeRadius);
  }

  // Clear secondary layers
  settingsOfficeLayers.forEach(l => settingsMap.removeLayer(l));
  settingsOfficeLayers = [];

  // Render non-active offices in muted color
  officesCache.forEach(o => {
    if (o.id != activeSettingsOfficeId) {
      const c = L.circle([o.latitude, o.longitude], {
        color: '#64748b',
        fillColor: '#94a3b8',
        fillOpacity: 0.1,
        radius: o.radius
      }).addTo(settingsMap);
      c.bindPopup(`<b>${o.name}</b><br>Radius: ${o.radius}m<br><button onclick="selectActiveOfficeForEditing(${o.id})" class="text-xs text-blue-600 underline font-semibold mt-1">Pilih Kantor Ini</button>`);
      settingsOfficeLayers.push(c);

      const m = L.marker([o.latitude, o.longitude], { opacity: 0.7 }).addTo(settingsMap);
      m.bindPopup(`<b>${o.name}</b><br><button onclick="selectActiveOfficeForEditing(${o.id})" class="text-xs text-blue-600 underline font-semibold mt-1">Pilih Kantor Ini</button>`);
      settingsOfficeLayers.push(m);
    }
  });

  settingsMap.invalidateSize();
}

function updateSettingsActiveCircle() {
  const rad = parseInt(document.getElementById('setOfficeRadius').value) || 100;
  if (settingsOfficeCircle) {
    settingsOfficeCircle.setRadius(rad);
  }
}

function detectCurrentLocationForOffice() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      document.getElementById('setOfficeLat').value = lat.toFixed(6);
      document.getElementById('setOfficeLng').value = lng.toFixed(6);
      if (settingsMap && settingsOfficeMarker && settingsOfficeCircle) {
        settingsMap.setView([lat, lng], 16);
        settingsOfficeMarker.setLatLng([lat, lng]);
        settingsOfficeCircle.setLatLng([lat, lng]);
      }
    });
  }
}

// Save Active Office Coordinates & Radius
async function saveActiveOfficeLocation(e) {
  e.preventDefault();
  if (!activeSettingsOfficeId) return;

  const currentOffice = officesCache.find(o => o.id == activeSettingsOfficeId);

  const payload = {
    name: currentOffice ? currentOffice.name : undefined,
    address: currentOffice ? currentOffice.address : undefined,
    latitude: parseFloat(document.getElementById('setOfficeLat').value),
    longitude: parseFloat(document.getElementById('setOfficeLng').value),
    radius: parseInt(document.getElementById('setOfficeRadius').value) || 100,
    is_primary: currentOffice ? currentOffice.is_primary : undefined
  };

  try {
    const res = await fetch(`/api/pengaturan/offices/${activeSettingsOfficeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Koordinat Disimpan', text: 'Titik kantor dan radius absensi berhasil diperbarui.' });
      await loadSettingsOffices();
      await loadPublicSettings();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Gagal', text: err.message });
  }
}

// Office Modal Handlers (Add/Edit)
function openAddOfficeModal() {
  document.getElementById('formOffice').reset();
  document.getElementById('officeModalId').value = '';
  document.getElementById('modalOfficeTitle').innerText = 'Tambah Titik Kantor Baru';
  document.getElementById('officeModalLat').value = userCoordinates.lat || '-6.225014';
  document.getElementById('officeModalLng').value = userCoordinates.lng || '106.809756';
  document.getElementById('officeModalRadius').value = '100';
  document.getElementById('officeModalIsPrimary').checked = false;
  openModal('modalOffice');
}

function openEditOfficeModal(id) {
  const o = officesCache.find(x => x.id == id);
  if (!o) return;

  document.getElementById('officeModalId').value = o.id;
  document.getElementById('modalOfficeTitle').innerText = `Edit Titik Kantor: ${o.name}`;
  document.getElementById('officeModalName').value = o.name;
  document.getElementById('officeModalAddress').value = o.address || '';
  document.getElementById('officeModalLat').value = o.latitude;
  document.getElementById('officeModalLng').value = o.longitude;
  document.getElementById('officeModalRadius').value = o.radius;
  document.getElementById('officeModalIsPrimary').checked = !!o.is_primary;
  openModal('modalOffice');
}

async function saveOfficeLocation(e) {
  e.preventDefault();
  const id = document.getElementById('officeModalId').value;
  const payload = {
    name: document.getElementById('officeModalName').value,
    address: document.getElementById('officeModalAddress').value,
    latitude: parseFloat(document.getElementById('officeModalLat').value),
    longitude: parseFloat(document.getElementById('officeModalLng').value),
    radius: parseInt(document.getElementById('officeModalRadius').value) || 100,
    is_primary: document.getElementById('officeModalIsPrimary').checked ? 1 : 0
  };

  const url = id ? `/api/pengaturan/offices/${id}` : '/api/pengaturan/offices';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeModal('modalOffice');
      Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message });
      if (id) activeSettingsOfficeId = id;
      await loadSettingsOffices();
      await loadPublicSettings();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}

async function setPrimaryOffice(id) {
  try {
    const res = await fetch(`/api/pengaturan/offices/${id}/primary`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Kantor Utama Diperbarui', text: data.message });
      activeSettingsOfficeId = id;
      await loadSettingsOffices();
      await loadPublicSettings();
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}

async function deleteOffice(id, name) {
  const confirm = await Swal.fire({
    title: 'Hapus Titik Kantor?',
    text: `Apakah Anda yakin ingin menghapus "${name}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'Ya, Hapus Kantor'
  });

  if (confirm.isConfirmed) {
    try {
      const res = await fetch(`/api/pengaturan/offices/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ icon: 'success', title: 'Dihapus', text: data.message });
        activeSettingsOfficeId = null;
        await loadSettingsOffices();
        await loadPublicSettings();
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal Menghapus', text: data.message });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
    }
  }
}

async function saveCompanySettings(e) {
  e.preventDefault();
  const payload = {
    company_name: document.getElementById('setCompanyName').value,
    company_address: document.getElementById('setCompanyAddress').value,
    company_phone: document.getElementById('setCompanyPhone').value,
    company_email: document.getElementById('setCompanyEmail').value
  };

  try {
    const res = await fetch('/api/pengaturan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Tersimpan', text: data.message });
      loadPublicSettings();
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Gagal', text: err.message });
  }
}

async function uploadCompanyLogo() {
  const fileInput = document.getElementById('inputCompanyLogo');
  if (!fileInput.files || !fileInput.files[0]) {
    Swal.fire({ icon: 'warning', title: 'Pilih File', text: 'Silakan pilih gambar logo terlebih dahulu!' });
    return;
  }

  const formData = new FormData();
  formData.append('logo', fileInput.files[0]);

  try {
    const res = await fetch('/api/pengaturan/logo', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Logo Terunggah', text: data.message });
      document.getElementById('settingsLogoPreview').innerHTML = `<img src="${data.logoUrl}" alt="Logo" class="w-full h-full object-contain">`;
      loadPublicSettings();
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Gagal', text: err.message });
  }
}

// QR Code Management
async function loadSettingsQr() {
  try {
    const res = await fetch('/api/pengaturan/qr');
    const data = await res.json();
    if (data.success) {
      document.getElementById('settingsQrImage').src = data.qr_image;
      document.getElementById('settingsQrTokenText').innerText = `TOKEN: ${data.token}`;
      officeSettings.token = data.token;
    }
  } catch (e) {}
}

async function regenerateQrCode() {
  const confirm = await Swal.fire({
    title: 'Buat Token QR Baru?',
    text: 'Kode QR lama akan tidak berlaku untuk absensi berikutnya.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Regenerate'
  });

  if (confirm.isConfirmed) {
    try {
      const res = await fetch('/api/pengaturan/qr/regenerate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message });
        loadSettingsQr();
      }
    } catch (e) {}
  }
}

function downloadQrCodeImage() {
  const img = document.getElementById('settingsQrImage');
  if (img && img.src) {
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `QR_Absensi_${dayjs().format('YYYYMMDD')}.png`;
    a.click();
  }
}


// ==============================================================
// 12. BACKUP & RESTORE
// ==============================================================

async function handleRestoreDatabase(e) {
  e.preventDefault();
  const fileInput = document.getElementById('inputRestoreSqlFile');
  if (!fileInput.files || !fileInput.files[0]) {
    Swal.fire({ icon: 'warning', title: 'Pilih File .SQL', text: 'Pilih file backup database terlebih dahulu!' });
    return;
  }

  const result = await Swal.fire({
    title: 'PERINGATAN RESTORE!',
    text: 'Memulihkan database akan menimpa seluruh data yang ada dengan data dari file cadangan. Lanjutkan?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'Ya, Pulihkan Database'
  });

  if (result.isConfirmed) {
    const formData = new FormData();
    formData.append('sql_file', fileInput.files[0]);

    Swal.fire({
      title: 'Memulihkan Database...',
      text: 'Mohon tunggu beberapa saat...',
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false
    });

    try {
      const res = await fetch('/api/backup/restore', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        Swal.fire({
          icon: 'success',
          title: 'Restore Berhasil!',
          text: data.message
        }).then(() => {
          window.location.reload();
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal Restore', text: data.message });
      }
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
    }
  }
}


// ==============================================================
// 13. NOTIFICATIONS & BOT LOGS
// ==============================================================

async function saveNotificationSettings() {
  const payload = {
    wa_enabled: document.getElementById('setWaEnabled').checked ? 'true' : 'false',
    wa_api_url: document.getElementById('setWaApiUrl').value,
    wa_api_token: document.getElementById('setWaApiToken').value,
    telegram_enabled: document.getElementById('setTgEnabled').checked ? 'true' : 'false',
    telegram_bot_token: document.getElementById('setTgBotToken').value,
    telegram_chat_id: document.getElementById('setTgChatId').value
  };

  try {
    const res = await fetch('/api/pengaturan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Konfigurasi Disimpan', text: 'Pengaturan notifikasi berhasil diperbarui.' });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Gagal', text: err.message });
  }
}

async function loadNotificationLogs() {
  try {
    const res = await fetch('/api/notifikasi/logs');
    const data = await res.json();
    const tbody = document.getElementById('notificationLogsTableBody');

    if (data.success) {
      if (data.logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">Belum ada riwayat pengiriman notifikasi.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.logs.map(l => `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 font-mono text-[11px] text-slate-500">${dayjs(l.created_at).format('DD/MM HH:mm')}</td>
          <td class="py-2.5 px-3">
            <span class="font-bold ${l.channel === 'WhatsApp' ? 'text-emerald-600' : 'text-sky-600'}">${l.channel}</span>
          </td>
          <td class="py-2.5 px-3 font-mono font-semibold text-slate-700">${l.recipient}</td>
          <td class="py-2.5 px-3 max-w-xs truncate text-slate-600">${l.message}</td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${l.status === 'sukses' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
              ${l.status}
            </span>
          </td>
          <td class="py-2.5 px-3 text-[11px] text-slate-500 max-w-xs truncate">${l.response || '-'}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading notif logs:', err);
  }
}

function openTestNotificationModal() {
  openModal('modalTestNotif');
}

async function handleSendTestNotification(e) {
  e.preventDefault();
  const payload = {
    channel: document.getElementById('testNotifChannel').value,
    recipient: document.getElementById('testNotifRecipient').value,
    message: document.getElementById('testNotifMessage').value
  };

  try {
    const res = await fetch('/api/notifikasi/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    closeModal('modalTestNotif');
    if (data.success) {
      Swal.fire({ icon: 'success', title: 'Berhasil Terkirim', text: data.message });
      loadNotificationLogs();
    } else {
      Swal.fire({ icon: 'warning', title: 'Hasil Pengujian', text: data.message });
      loadNotificationLogs();
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}

async function clearNotificationLogs() {
  const confirm = await Swal.fire({
    title: 'Bersihkan Log Notifikasi?',
    text: 'Semua riwayat log pengiriman notifikasi akan dihapus.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Bersihkan'
  });

  if (confirm.isConfirmed) {
    await fetch('/api/notifikasi/logs', { method: 'DELETE' });
    loadNotificationLogs();
  }
}


// ==============================================================
// 14. ACTIVITY AUDIT LOGS
// ==============================================================

async function loadActivityLogs() {
  const category = document.getElementById('filterLogCategory')?.value || '';
  const search = document.getElementById('searchLogInput')?.value || '';

  let url = `/api/logs?`;
  if (category) url += `&category=${category}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    const tbody = document.getElementById('activityLogsTableBody');

    if (data.success) {
      if (data.logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">Belum ada log aktivitas yang cocok.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.logs.map(log => `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-3 px-4 font-mono text-[11px] text-slate-500">${dayjs(log.created_at).format('DD/MM/YYYY HH:mm:ss')}</td>
          <td class="py-3 px-4 font-semibold text-slate-900">${log.user_name || 'Sistem'}</td>
          <td class="py-3 px-4">
            <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
              ${log.category}
            </span>
          </td>
          <td class="py-3 px-4 font-medium text-slate-800">${log.action}</td>
          <td class="py-3 px-4 font-mono text-[11px] text-slate-500 max-w-xs truncate" title="${log.details || ''}">
            ${log.details || '-'}
          </td>
          <td class="py-3 px-4 font-mono text-[11px] text-slate-400">${log.ip_address || '-'}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading logs:', err);
  }
}

async function clearActivityLogs() {
  const confirm = await Swal.fire({
    title: 'Bersihkan Semua Log Audit?',
    text: 'Tindakan ini akan menghapus seluruh catatan jejak audit aktivitas sistem.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'Ya, Bersihkan Semua'
  });

  if (confirm.isConfirmed) {
    await fetch('/api/logs/clear', { method: 'DELETE' });
    loadActivityLogs();
  }
}


// ==============================================================
// 15. PROFILE MANAGEMENT (User Self-Service)
// ==============================================================

function openProfileModal() {
  document.getElementById('profName').value = currentUser.name;
  document.getElementById('profPhone').value = currentUser.phone || '';
  document.getElementById('profAddress').value = currentUser.address || '';
  document.getElementById('profCurrentPass').value = '';
  document.getElementById('profNewPass').value = '';
  openModal('modalProfile');
}

async function saveProfile(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('profName').value,
    phone: document.getElementById('profPhone').value,
    address: document.getElementById('profAddress').value,
    current_password: document.getElementById('profCurrentPass').value,
    new_password: document.getElementById('profNewPass').value
  };

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      closeModal('modalProfile');
      Swal.fire({ icon: 'success', title: 'Berhasil', text: data.message });
      currentUser.name = payload.name;
      document.getElementById('userNameDisplay').innerText = payload.name;
      document.getElementById('dashWelcomeName').innerText = payload.name;
    } else {
      Swal.fire({ icon: 'error', title: 'Gagal', text: data.message });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Kesalahan Sistem', text: err.message });
  }
}


// ==============================================================
// 16. MODAL UTILITIES
// ==============================================================

function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) {
    m.classList.remove('hidden');
    lucide.createIcons();
  }
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('hidden');
}
