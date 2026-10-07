import { CONFIG } from '../config.js';
import { getToken, clearSession } from './auth.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 1000;

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Panggil Apps Script. Content-Type text/plain supaya tidak kena CORS preflight.
 * Timeout default 60 dtk (opsi timeoutMs, mis. untuk upload foto). Retry 1x (setelah jeda 1 dtk) hanya untuk error jaringan/timeout
 * (server menolak duplikat, jadi aman).
 */
export async function api(action, data = {}, { retries = 1, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const body = JSON.stringify({ action, idToken: getToken(), data });
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
        signal: ctrl.signal,
      });
      if (!res.ok) throw new ApiError(`Server error (${res.status}). Coba lagi.`, 'NETWORK');
      const json = await res.json();
      if (!json.ok) {
        if (json.code === 'AUTH') {
          clearSession();
          window.dispatchEvent(new CustomEvent('auth-expired', { detail: json.error }));
        }
        throw new ApiError(json.error, json.code);
      }
      return json.data;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code !== 'NETWORK') throw err;
        lastErr = err;
      } else if (err?.name === 'AbortError') {
        lastErr = new ApiError('Koneksi lambat atau terputus. Coba lagi.', 'NETWORK');
      } else {
        lastErr = new ApiError('Koneksi bermasalah. Cek sinyal lalu coba lagi.', 'NETWORK');
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
