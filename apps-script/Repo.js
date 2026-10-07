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
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v).trim();
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

function insert_(def, obj) {
  sheet_(def).appendRow(toRow_(def, obj));
}

function update_(def, rowNumber, obj) {
  sheet_(def).getRange(rowNumber, 1, 1, def.headers.length).setValues([toRow_(def, obj)]);
}

function readConfig_() {
  var values = sheet_(SHEETS.CONFIG).getDataRange().getValues().slice(1);
  return parseConfig(values);
}

function findAbsensi_(email, tanggal) {
  return readAll_(SHEETS.ABSENSI).filter(function (r) {
    return r.email === email && r.tanggal === tanggal;
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
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function stripRow_(row) {
  var out = {};
  Object.keys(row).forEach(function (k) { if (k !== '_row') out[k] = row[k]; });
  return out;
}
