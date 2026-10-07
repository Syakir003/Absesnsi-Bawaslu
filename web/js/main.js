import { renderLogin, getToken, logout, waitForGsi } from './auth.js';
import { api } from './api.js';
import { h, clear } from './ui.js';
import { mountPeserta } from './app-peserta.js';
import { mountAdmin } from './app-admin.js';

const root = document.getElementById('app');
let disposeApp = null; // matikan kamera/cleanup tab aktif sebelum layar diganti

function teardown() {
  const fn = disposeApp;
  disposeApp = null;
  if (typeof fn === 'function') fn();
}

function showLogin(message) {
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

function showFatal(message) {
  clear(root);
  root.append(h('section', { class: 'card center', style: 'margin-top:15vh' },
    h('p', { class: 'error' }, message),
    h('button', { class: 'btn', type: 'button', onclick: loadApp }, 'Coba lagi')));
}

async function loadApp() {
  teardown();
  clear(root);
  root.append(h('p', { class: 'muted center', style: 'margin-top:15vh' }, 'Memuat...'));
  try {
    const me = await api('me');
    clear(root);
    root.append(h('header', { class: 'topbar' },
      h('div', {}, h('strong', {}, me.nama), h('span', { class: 'muted' }, me.role === 'admin' ? ' · Admin' : ' · Peserta')),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { logout(); showLogin(); } }, 'Keluar')));
    const main = h('main');
    root.append(main);
    disposeApp = me.role === 'admin' ? mountAdmin(main, me) : mountPeserta(main, me);
  } catch (e) {
    if (e.code === 'AUTH') {
      return; // api() sudah membersihkan sesi dan memicu 'auth-expired' (showLogin lewat listener)
    }
    if (e.code === 'FORBIDDEN') {
      logout();
      showLogin(e.message);
    } else {
      showFatal(e.message);
    }
  }
}

window.addEventListener('auth-expired', (ev) => showLogin(ev.detail || 'Sesi habis, silakan login lagi.'));

(async function boot() {
  try {
    await waitForGsi();
  } catch (e) {
    showFatal(e.message);
    return;
  }
  if (getToken()) loadApp();
  else showLogin();
})();
