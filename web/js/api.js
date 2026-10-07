import { CONFIG } from '../config.js';
import { getToken, clearSession } from './auth.js';

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * Panggil Apps Script. Content-Type text/plain supaya tidak kena CORS preflight.
 * Retry 1x hanya untuk error jaringan (server menolak duplikat, jadi aman).
 */
export async function api(action, data = {}, { retries = 1 } = {}) {
  const body = JSON.stringify({ action, idToken: getToken(), data });
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
      });
      if (!res.ok) throw new ApiError(`Server error (${res.status}).`, 'NETWORK');
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
      lastErr = err instanceof ApiError && err.code !== 'NETWORK'
        ? err
        : new ApiError('Koneksi bermasalah. Cek sinyal lalu coba lagi.', 'NETWORK');
      if (lastErr.code !== 'NETWORK') throw lastErr;
    }
  }
  throw lastErr;
}
