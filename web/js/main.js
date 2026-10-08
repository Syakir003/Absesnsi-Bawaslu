import { renderLogin, getToken, logout, waitForGsi } from './auth.js';
import { api } from './api.js';
import { h, clear, toast } from './ui.js';
import { isBusy, isDirty, clearDirty, onIdle } from './busy.js';
import { mountPeserta } from './app-peserta.js';
import { mountAdmin } from './app-admin.js';

const root = document.getElementById('app');
let disposeApp = null; // matikan kamera/cleanup tab aktif sebelum layar diganti
let loadGen = 0; // nomor generasi: hanya loadApp() terbaru yang boleh mount (cegah mount ganda/kamera bocor)
let mounted = false; // aplikasi (bukan layar login/loading/error) sedang tampil
let loadedDay = '';
let refreshPending = false; // muat ulang sudah jatuh tempo tapi ditunda karena sibuk/kotor; jalan otomatis saat idle
let keepTab = null; // { role, id }: tab aktif yang dibuka kembali setelah muat ulang di latar (hanya tab, bukan filter)
let currentRole = null;
let hiddenAt = null; // kapan aplikasi terakhir masuk background (null = sedang tampil)

const REFRESH_AFTER_MS = 5 * 60 * 1000;
const todayJakarta = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(Date.now()));

function teardown() {
  const fn = disposeApp;
  disposeApp = null;
  if (typeof fn === 'function') fn();
  clearDirty(); // jaring pengaman: tidak ada penanda form kotor yang bocor ke mount berikutnya
}

function showLogin(message) {
  loadGen += 1; // batalkan loadApp() yang masih menunggu
  mounted = false;
  refreshPending = false;
  keepTab = null;
  teardown();
  clear(root);
  const btn = h('div', { id: 'gsi-btn', class: 'row', style: 'justify-content:center' });
  root.append(h('section', { class: 'card center login' },
    h('div', { class: 'logo', 'aria-hidden': 'true' }, 'B'),
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
  refreshPending = false;
  teardown();
  clear(root);
  root.append(h('p', { class: 'muted center', style: 'margin-top:15vh' }, 'Memuat...'));
  try {
    const me = await api('me');
    if (gen !== loadGen) return; // ada loadApp()/showLogin() yang lebih baru
    clear(root);
    root.append(h('header', { class: 'topbar' },
      h('div', { class: 'who' },
        h('div', { class: 'avatar', 'aria-hidden': 'true' }, (me.nama || '?').trim().charAt(0).toUpperCase()),
        h('div', {}, h('strong', {}, me.nama), h('div', { class: 'muted small' }, `${me.role === 'admin' ? 'Admin' : 'Peserta'} · Bawaslu Malang`))),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { logout(); showLogin(); } }, 'Keluar')));
    const main = h('main');
    root.append(main);
    const initialTab = keepTab?.role === me.role ? keepTab.id : undefined;
    keepTab = null;
    disposeApp = me.role === 'admin' ? mountAdmin(main, me, initialTab) : mountPeserta(main, me, initialTab);
    currentRole = me.role;
    mounted = true;
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

// Muat ulang di latar (bukan login ulang): ingat tab aktif supaya pengguna kembali ke tempat yang sama.
function refreshApp() {
  keepTab = { role: currentRole, id: disposeApp?.current?.() };
  loadApp();
}

// Jalankan muat ulang yang tertunda bila sudah aman: aplikasi tampil, tidak sibuk, tidak ada form kotor.
function runPendingRefresh() {
  if (!refreshPending || !mounted || document.visibilityState !== 'visible' || isBusy() || isDirty()) return;
  refreshPending = false;
  refreshApp();
}
onIdle(runPendingRefresh);

// Kembali ke aplikasi setelah di background:
// - sesi habis → login;
// - muat ulang data jatuh tempo bila sempat di background ≥5 menit ATAU hari (Asia/Jakarta) berganti sejak dimuat;
// - muat ulang tidak pernah jalan saat ada submit berjalan atau form berisi isian belum tersimpan (busy.js):
//   ditandai refreshPending dan dijalankan otomatis begitu semuanya idle (onIdle). Bila hari berganti,
//   pengguna diberi tahu lewat toast.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    return;
  }
  if (document.visibilityState !== 'visible') return;
  const awayMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
  hiddenAt = null;
  if (!mounted) return;
  if (!getToken()) return showLogin('Sesi habis, silakan login lagi.');
  const dateChanged = todayJakarta() !== loadedDay;
  if (awayMs >= REFRESH_AFTER_MS || dateChanged) {
    refreshPending = true;
    if (dateChanged && (isBusy() || isDirty())) toast('Data belum disimpan — muat ulang setelah selesai.', 'info');
  }
  runPendingRefresh();
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
