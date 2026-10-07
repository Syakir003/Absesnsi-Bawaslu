import { CONFIG } from '../config.js';

const KEY = 'presensi_id_token';
const SKEW_KEY = 'presensi_id_token_skew';
let memToken = null;
let memSkew = 0;

export function decodeJwt(token) {
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Apakah token masih berlaku ≥ 1 menit menurut jam perangkat?
 * skewSec = iat(server) − jam perangkat saat token diterima; exp dikonversi ke jam perangkat dengan `exp − skew`.
 */
export function isTokenFresh(payload, skewSec, nowMs) {
  if (!payload || typeof payload.exp !== 'number') return false;
  return (payload.exp - (skewSec || 0)) * 1000 >= nowMs + 60_000;
}

function store(token) {
  memToken = token;
  memSkew = 0;
  if (token) {
    try {
      const { iat } = decodeJwt(token);
      if (typeof iat === 'number') memSkew = iat - Math.floor(Date.now() / 1000);
    } catch { /* token rusak: getToken akan membuangnya */ }
  }
  try {
    if (token) {
      sessionStorage.setItem(KEY, token);
      sessionStorage.setItem(SKEW_KEY, String(memSkew));
    } else {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(SKEW_KEY);
    }
  } catch { /* storage diblokir: cukup simpan di memori */ }
}

/** Token yang masih berlaku ≥ 1 menit (dikoreksi selisih jam perangkat), atau null. */
export function getToken() {
  let token = memToken;
  let skew = memSkew;
  if (!token) {
    try {
      token = sessionStorage.getItem(KEY);
      skew = Number(sessionStorage.getItem(SKEW_KEY)) || 0;
    } catch { token = null; }
  }
  if (!token) return null;
  try {
    if (!isTokenFresh(decodeJwt(token), skew, Date.now())) { store(null); return null; }
  } catch {
    store(null);
    return null;
  }
  memToken = token;
  memSkew = skew;
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

let gsiInitialized = false;
let loginHandler = null;

/** initialize() hanya sekali; pemanggilan berikutnya hanya mengganti callback dan menggambar ulang tombol. */
export function renderLogin(container, onLogin) {
  loginHandler = onLogin;
  if (!gsiInitialized) {
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: (resp) => { store(resp.credential); loginHandler?.(); },
      auto_select: true,
      cancel_on_tap_outside: false,
    });
    gsiInitialized = true;
  }
  google.accounts.id.renderButton(container, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with' });
  google.accounts.id.prompt();
}

export function logout() {
  store(null);
  window.google?.accounts?.id?.disableAutoSelect();
}
