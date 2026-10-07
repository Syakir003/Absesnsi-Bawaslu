/**
 * Core.js — logika murni (tanpa SpreadsheetApp/DriveApp/UrlFetchApp).
 * Dipakai Apps Script (global scope) dan dites di Node lewat vm.
 * Aturan: pakai `var`/`function` (bukan const/let di top level), jangan pakai instanceof Array.
 */

var CORE_STATUS = ['Masuk', 'Izin', 'Sakit'];
var CORE_MODE = ['WFO', 'WFH'];
var CORE_UPLOAD_RULES = {
  selfie: { mimes: ['image/jpeg'], maxBytes: 1.5 * 1024 * 1024 },
  surat: { mimes: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 2 * 1024 * 1024 },
  lampiran: { mimes: ['image/jpeg', 'image/png', 'application/pdf'], maxBytes: 2 * 1024 * 1024 }
};
var CORE_CONFIG_KEYS = [
  'kantor_lat', 'kantor_lng', 'radius_meter', 'jam_masuk', 'batas_telat',
  'batas_edit_logbook_hari', 'max_akurasi_meter', 'folder_id', 'google_client_id'
];

function fail_(message) {
  return { ok: false, error: message };
}

function isFiniteNum_(v) {
  return typeof v === 'number' && isFinite(v);
}

/* ---------- Geo & Config ---------- */

function haversineMeters(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toRad = function (d) { return d * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseConfig(pairs) {
  var raw = {};
  pairs.forEach(function (p) {
    var key = String(p[0] == null ? '' : p[0]).trim();
    if (key) raw[key] = String(p[1] == null ? '' : p[1]).trim();
  });
  var missing = CORE_CONFIG_KEYS.filter(function (k) { return !raw[k]; });
  if (missing.length) throw new Error('Config belum lengkap: ' + missing.join(', '));

  var num = function (k) {
    var n = Number(raw[k]);
    if (!isFinite(n)) throw new Error('Config ' + k + ' harus angka, sekarang: "' + raw[k] + '"');
    return n;
  };
  ['jam_masuk', 'batas_telat'].forEach(function (k) {
    if (!/^\d{2}:\d{2}$/.test(raw[k])) throw new Error('Config ' + k + ' harus format HH:mm, sekarang: "' + raw[k] + '"');
  });

  return {
    kantorLat: num('kantor_lat'),
    kantorLng: num('kantor_lng'),
    radiusMeter: num('radius_meter'),
    jamMasuk: raw.jam_masuk,
    batasTelat: raw.batas_telat,
    batasEditLogbookHari: num('batas_edit_logbook_hari'),
    maxAkurasiMeter: num('max_akurasi_meter'),
    folderId: raw.folder_id,
    googleClientId: raw.google_client_id
  };
}

/* ---------- Auth & role ---------- */

function checkTokenClaims(info, clientId, nowSec) {
  if (!info || info.aud !== clientId) return fail_('Token bukan untuk aplikasi ini.');
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') return fail_('Penerbit token tidak valid.');
  if (String(info.email_verified) !== 'true') return fail_('Email Google belum terverifikasi.');
  var exp = Number(info.exp);
  if (!isFinite(exp) || exp <= nowSec) return fail_('Sesi login kedaluwarsa. Silakan login ulang.');
  return { ok: true, email: String(info.email).toLowerCase().trim(), name: info.name || '', exp: exp };
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  var p = String(s).split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
}

function isValidMonth(s) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s));
}

function isPesertaActive(p, today) {
  if (!p || String(p.aktif).toUpperCase() !== 'Y') return false;
  if (p.tanggal_mulai && today < p.tanggal_mulai) return false;
  if (p.tanggal_selesai && today > p.tanggal_selesai) return false;
  return true;
}

function resolveRole(email, admins, pesertaList, today) {
  var e = String(email).toLowerCase().trim();
  var same = function (row) { return String(row.email).toLowerCase().trim() === e; };
  var admin = admins.filter(same)[0];
  if (admin) return { ok: true, role: 'admin', email: e, nama: admin.nama || e };
  var p = pesertaList.filter(same)[0];
  if (!p) return fail_('Email ' + e + ' belum terdaftar. Hubungi admin.');
  if (!isPesertaActive(p, today)) return fail_('Akun kamu tidak aktif atau di luar periode magang.');
  return { ok: true, role: 'peserta', email: e, nama: p.nama || e, instansi: p.instansi || '' };
}
