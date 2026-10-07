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
