import { CONFIG } from '../config.js';

const KEY = 'presensi_id_token';
let memToken = null;

export function decodeJwt(token) {
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function store(token) {
  memToken = token;
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch { /* storage diblokir: cukup simpan di memori */ }
}

/** Token yang masih berlaku ≥ 1 menit, atau null. */
export function getToken() {
  let token = memToken;
  if (!token) {
    try { token = sessionStorage.getItem(KEY); } catch { token = null; }
  }
  if (!token) return null;
  try {
    if (decodeJwt(token).exp * 1000 < Date.now() + 60_000) { store(null); return null; }
  } catch {
    store(null);
    return null;
  }
  memToken = token;
  return token;
}

export function clearSession() {
  store(null);
}

export function waitForGsi(timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      if (window.google?.accounts?.id) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('Gagal memuat Google Sign-In. Cek koneksi lalu muat ulang halaman.'));
      setTimeout(poll, 100);
    })();
  });
}

export function renderLogin(container, onLogin) {
  google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: (resp) => { store(resp.credential); onLogin(); },
    auto_select: true,
    cancel_on_tap_outside: false,
  });
  google.accounts.id.renderButton(container, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with' });
  google.accounts.id.prompt();
}

export function logout() {
  store(null);
  window.google?.accounts?.id?.disableAutoSelect();
}
