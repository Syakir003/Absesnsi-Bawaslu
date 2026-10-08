/** Repo.js — akses Google Sheets. Semua kolom di-set plain text oleh setupSheets(). */
var SHEETS = {
  PESERTA: { name: 'Peserta', headers: ['email', 'nama', 'instansi', 'aktif', 'tanggal_mulai', 'tanggal_selesai'] },
  ABSENSI: {
    name: 'Absensi',
    headers: ['id', 'email', 'tanggal', 'jam_masuk', 'jam_pulang', 'mode', 'status',
      'lat_masuk', 'lng_masuk', 'akurasi_masuk', 'jarak_masuk',
      'lat_pulang', 'lng_pulang', 'akurasi_pulang', 'jarak_pulang',
      'flags', 'link_selfie_masuk', 'link_selfie_pulang', 'link_surat', 'catatan']
  },
  LOGBOOK: { name: 'Logbook', headers: ['id', 'email', 'tanggal', 'kegiatan', 'link_lampiran', 'dibuat', 'diubah'] },
  CONFIG: { name: 'Config', headers: ['key', 'value'] },
  ADMIN: { name: 'Admin', headers: ['email', 'nama'] }
};

function sheet_(def) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.name);
  if (!sh) throw new Error('Sheet "' + def.name + '" tidak ada. Jalankan setupSheets() dulu.');
  return sh;
}

function normalizeCell_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    // Sheets mengirim sel waktu-saja sebagai Date tahun 1899 (epoch Sheets), bukan tanggal.
    return Utilities.formatDate(v, TZ, v.getFullYear() < 1900 ? 'HH:mm:ss' : 'yyyy-MM-dd');
  }
  return v === null || v === undefined ? '' : stripSheetEscape(String(v).trim());
}

/** Semua baris sebagai object {header: value, _row: nomorBarisSheet}. */
function readAll_(def) {
  var values = sheet_(def).getDataRange().getValues();
  var headers = values[0].map(String);
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var obj = { _row: i + 1 };
    var empty = true;
    headers.forEach(function (h, j) {
      obj[h] = normalizeCell_(values[i][j]);
      if (obj[h] !== '') empty = false;
    });
    if (!empty) out.push(obj);
  }
  return out;
}

function toRow_(def, obj) {
  return def.headers.map(function (h) {
    var v = obj[h];
    return sheetSafeValue(v);
  });
}

/** Tulis baris baru dengan format teks eksplisit (tidak bergantung pada format awal 1000 baris). */
function insert_(def, obj) {
  var sh = sheet_(def);
  var row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
  sh.getRange(row, 1, 1, def.headers.length).setNumberFormat('@').setValues([toRow_(def, obj)]);
}

function update_(def, rowNumber, obj) {
  sheet_(def).getRange(rowNumber, 1, 1, def.headers.length).setNumberFormat('@').setValues([toRow_(def, obj)]);
}

/** Bentuk respons satu baris: semua header, nilai string seperti saat dibaca ulang, tanpa _row. */
function rowOut_(def, obj) {
  var out = {};
  def.headers.forEach(function (h) { out[h] = normalizeCell_(obj[h]); });
  return out;
}

function readConfig_() {
  var values = sheet_(SHEETS.CONFIG).getDataRange().getValues().slice(1);
  return parseConfig(values);
}

function findAbsensi_(email, tanggal) {
  return readAll_(SHEETS.ABSENSI).filter(function (r) {
    return normEmail_(r.email) === normEmail_(email) && r.tanggal === tanggal;
  })[0] || null;
}

function nowParts_() {
  var d = new Date();
  return { tanggal: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), jam: Utilities.formatDate(d, TZ, 'HH:mm:ss'), iso: d.toISOString() };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw userError_('Server sedang sibuk, coba lagi sebentar.');
  try {
    var result = fn();
    SpreadsheetApp.flush(); // Sheets mem-buffer tulisan; paksa tersimpan sebelum lock dilepas
    return result;
  } finally {
    lock.releaseLock();
  }
}

function stripRow_(row) {
  var out = {};
  Object.keys(row).forEach(function (k) { if (k !== '_row') out[k] = row[k]; });
  return out;
}
