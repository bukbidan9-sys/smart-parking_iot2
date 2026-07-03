// ================= AUTH GUARD =================
let CURRENT_USER = null;
try { CURRENT_USER = JSON.parse(localStorage.getItem('sp_user') || 'null'); } catch {}

async function ensureAuth(requiredRole) {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) throw new Error();
    const json = await res.json();
    CURRENT_USER = json.user;
    localStorage.setItem('sp_user', JSON.stringify(CURRENT_USER));
    if (requiredRole && CURRENT_USER.role !== requiredRole) {
      window.location.href = CURRENT_USER.role === 'petugas' ? '/admin.html' : '/dashboard.html';
    }
    return CURRENT_USER;
  } catch {
    window.location.href = '/index.html';
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  localStorage.removeItem('sp_user');
  window.location.href = '/index.html';
}

// ================= SIDEBAR =================
const NAV_MAHASISWA = [
  { href: '/dashboard.html', label: 'Monitoring & Peta', ic: '01' },
  { href: '/booking.html', label: 'Booking Slot', ic: '02' },
  { href: '/qrcode.html', label: 'QR Akses Saya', ic: '03' },
  { href: '/riwayat.html', label: 'Riwayat Parkir', ic: '04' },
];
const NAV_PETUGAS = [
  { href: '/admin.html', label: 'Dashboard Admin', ic: '01' },
  { href: '/admin-scan.html', label: 'Portal / Scan QR', ic: '02' },
  { href: '/admin-users.html', label: 'Kelola Pengguna', ic: '03' },
  { href: '/admin-laporan.html', label: 'Laporan & Statistik', ic: '04' },
];

function renderSidebar() {
  const isAdmin = CURRENT_USER?.role === 'petugas';
  const nav = isAdmin ? NAV_PETUGAS : NAV_MAHASISWA;
  const path = window.location.pathname;
  const initials = (CURRENT_USER?.nama || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return `
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">SP</div>
      <div class="brand-text">Smart Parking<span>Kampus · IoT</span></div>
    </div>
    <div class="nav-group">
      <div class="nav-label">${isAdmin ? 'Panel Petugas' : 'Menu Mahasiswa'}</div>
      ${nav.map(n => `<a class="nav-link ${path === n.href ? 'active' : ''}" href="${n.href}"><span class="ic">${n.ic}</span>${n.label}</a>`).join('')}
    </div>
    <div class="sidebar-foot">
      <div class="user-chip">
        <div class="user-avatar">${initials}</div>
        <div class="user-meta"><b>${CURRENT_USER?.nama || ''}</b><span>${isAdmin ? 'PETUGAS' : (CURRENT_USER?.nim_nip || '')}</span></div>
      </div>
      <button class="logout-btn" onclick="logout()">Keluar Akun</button>
    </div>
  </aside>`;
}

function renderTopbar(title, sub) {
  return `
  <div class="topbar">
    <div><h1>${title}</h1><div class="sub">${sub || ''}</div></div>
    <div style="display:flex;align-items:center;gap:12px;position:relative;">
      <div class="notif-bell" id="notifBell">🔔<span class="notif-dot" id="notifDot" style="display:none;"></span></div>
      <div class="notif-panel" id="notifPanel"></div>
    </div>
  </div>`;
}

function mountShell(title, sub, contentHtml) {
  document.getElementById('app').innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <div class="main">
        ${renderTopbar(title, sub)}
        <div class="content">${contentHtml}</div>
      </div>
    </div>
    <div class="toast-wrap" id="toastWrap"></div>
  `;
  document.getElementById('notifBell').addEventListener('click', toggleNotifPanel);
  loadNotifications();
}

// ================= SOCKET.IO REALTIME =================
let socket = null;
function initSocket(onSlotUpdate) {
  socket = io();
  if (onSlotUpdate) socket.on('slot_update', onSlotUpdate);
  socket.on('notification', (n) => {
    showToast(n.judul, n.pesan, n.tipe);
    loadNotifications();
  });
  socket.on('gate_open', (g) => {
    if (window.onGateOpen) window.onGateOpen(g);
  });
  return socket;
}

// ================= TOAST =================
function showToast(judul, pesan, tipe = 'info') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${tipe}`;
  el.innerHTML = `<b>${judul}</b>${pesan}`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// ================= NOTIFICATIONS PANEL =================
async function loadNotifications() {
  try {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    const json = await res.json();
    const panel = document.getElementById('notifPanel');
    const dot = document.getElementById('notifDot');
    if (!panel) return;
    const belumBaca = json.notifications.filter(n => !n.dibaca).length;
    dot.style.display = belumBaca > 0 ? 'block' : 'none';
    panel.innerHTML = json.notifications.length ? json.notifications.map(n => `
      <div class="notif-item">
        <b>${n.judul}</b>
        <p>${n.pesan}</p>
        <span class="t">${new Date(n.created_at).toLocaleString('id-ID')}</span>
      </div>`).join('') : `<div class="empty-state" style="padding:24px;"><div class="glyph">∅</div>Belum ada notifikasi</div>`;
  } catch {}
}

function toggleNotifPanel() {
  document.getElementById('notifPanel').classList.toggle('show');
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('notifPanel');
  const bell = document.getElementById('notifBell');
  if (panel && !panel.contains(e.target) && e.target !== bell) panel.classList.remove('show');
});

// ================= HELPERS =================
function statusLabel(s) {
  return { kosong: 'Kosong', terisi: 'Terisi', booked: 'Dibooking', maintenance: 'Maintenance' }[s] || s;
}
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d.replace(' ', 'T') + 'Z').toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}
