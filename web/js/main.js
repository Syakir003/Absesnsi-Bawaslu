import { renderLogin, getToken, logout, waitForGsi } from './auth.js';
import { api } from './api.js';
import { h, clear } from './ui.js';
import { isBusy } from './busy.js';
import { mountPeserta } from './app-peserta.js';
import { mountAdmin } from './app-admin.js';

const root = document.getElementById('app');
let disposeApp = null; // matikan kamera/cleanup tab aktif sebelum layar diganti
let loadGen = 0; // nomor generasi: hanya loadApp() terbaru yang boleh mount (cegah mount ganda/kamera bocor)
let mounted = false; // aplikasi (bukan layar login/loading/error) sedang tampil
let loadedAt = 0;
let loadedDay = '';

const REFRESH_AFTER_MS = 5 * 60 * 1000;
const todayJakarta = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

function teardown() {
  const fn = disposeApp;
  disposeApp = null;
  if (typeof fn === 'function') fn();
}

function showLogin(message) {
  loadGen += 1; // batalkan loadApp() yang masih menunggu
  mounted = false;
  teardown();
  clear(root);
  const btn = h('div', { id: 'gsi-btn', class: 'row', style: 'justify-content:center' });
  root.append(h('section', { class: 'card center', style: 'margin-top:15vh' },
    h('h1', {}, 'Presensi Magang'),
    h('p', { class: 'muted' }, 'Bawaslu Malang'),
    message ? h('p', { class: 'error' }, message) : null,
    btn));
  renderLogin(btn, loadApp);
}

function showFatal(message, onRetry = loadApp) {
  mounted = false;
  clear(root);
  root.append(h('section', { class: 'card center', style: 'margin-top:15vh' },
    h('p', { class: 'error' }, message),
    h('button', { class: 'btn', type: 'button', onclick: onRetry }, 'Coba lagi')));
}

async function loadApp() {
  const gen = ++loadGen;
  mounted = false;
  teardown();
  clear(root);
  root.append(h('p', { class: 'muted center', style: 'margin-top:15vh' }, 'Memuat...'));
  try {
    const me = await api('me');
    if (gen !== loadGen) return; // ada loadApp()/showLogin() yang lebih baru
    clear(root);
    root.append(h('header', { class: 'topbar' },
      h('div', {}, h('strong', {}, me.nama), h('span', { class: 'muted' }, me.role === 'admin' ? ' · Admin' : ' · Peserta')),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { logout(); showLogin(); } }, 'Keluar')));
    const main = h('main');
    root.append(main);
    disposeApp = me.role === 'admin' ? mountAdmin(main, me) : mountPeserta(main, me);
    mounted = true;
    loadedAt = Date.now();
    loadedDay = todayJakarta();
  } catch (e) {
    if (e.code === 'AUTH') {
      return; // api() sudah membersihkan sesi dan memicu 'auth-expired' (showLogin lewat listener)
    }
    if (gen !== loadGen) return;
    if (e.code === 'FORBIDDEN') {
      logout();
      showLogin(e.message);
    } else {
      showFatal(e.message);
    }
  }
}

// Kembali ke aplikasi setelah di background: sesi habis → login; data lama (≥5 menit atau ganti hari) → muat ulang.
// Tidak memuat ulang saat ada submit berjalan (busy.js) supaya form yang sedang mengirim tidak hilang.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !mounted) return;
  if (!getToken()) return showLogin('Sesi habis, silakan login lagi.');
  if (isBusy()) return;
  if (Date.now() - loadedAt >= REFRESH_AFTER_MS || todayJakarta() !== loadedDay) loadApp();
});

window.addEventListener('auth-expired', (ev) => showLogin(ev.detail || 'Sesi habis, silakan login lagi.'));

(async function boot() {
  try {
    await waitForGsi();
  } catch (e) {
    showFatal(e.message, () => location.reload()); // skrip Google gagal dimuat: muat ulang halaman, bukan sekadar ulang 'me'
    return;
  }
  if (getToken()) loadApp();
  else showLogin();
})();
