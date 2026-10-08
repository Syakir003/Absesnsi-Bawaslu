/**
 * Core.js — logika murni (tanpa SpreadsheetApp/DriveApp/UrlFetchApp).
 * Dipakai Apps Script (global scope) dan dites di Node lewat vm.
 * Aturan: pakai `var`/`function` (bukan const/let di top level), jangan pakai instanceof Array.
 */

var CORE_STATUS = ['Masuk', 'Izin', 'Sakit'];
var CORE_MODE = ['WFO', 'WFH'];
var CORE_UPLOAD_RULES = {
  selfie: { mimes: ['image/jpeg'], minBytes: 1024, maxBytes: 1.5 * 1024 * 1024 },
  surat: { mimes: ['image/jpeg', 'image/png', 'application/pdf'], minBytes: 100, maxBytes: 2 * 1024 * 1024 },
  lampiran: { mimes: ['image/jpeg', 'image/png', 'application/pdf'], minBytes: 100, maxBytes: 2 * 1024 * 1024 }
};
// Awalan base64 dari magic bytes tiap format (JPEG FF D8 FF, PNG 89 50 4E 47 0D 0A 1A 0A, PDF "%PDF-").
var CORE_MAGIC_PREFIX = {
  'image/jpeg': '/9j/',
  'image/png': 'iVBORw0KGgo',
  'application/pdf': 'JVBERi0'
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
    if (Number(raw[k].slice(0, 2)) > 23 || Number(raw[k].slice(3, 5)) > 59) {
      throw new Error('Config ' + k + ' tidak valid: "' + raw[k] + '"');
    }
  });
  var positive = function (k) {
    var n = num(k);
    if (!(n > 0)) throw new Error('Config ' + k + ' harus > 0, sekarang: "' + raw[k] + '"');
    return n;
  };
  var inRange = function (k, min, max) {
    var n = num(k);
    if (n < min || n > max) throw new Error('Config ' + k + ' harus antara ' + min + ' dan ' + max + ', sekarang: "' + raw[k] + '"');
    return n;
  };
  var nonNegInt = function (k) {
    var n = num(k);
    if (n < 0 || Math.floor(n) !== n) throw new Error('Config ' + k + ' harus bilangan bulat >= 0, sekarang: "' + raw[k] + '"');
    return n;
  };

  return {
    kantorLat: inRange('kantor_lat', -90, 90),
    kantorLng: inRange('kantor_lng', -180, 180),
    radiusMeter: positive('radius_meter'),
    jamMasuk: raw.jam_masuk,
    batasTelat: raw.batas_telat,
    batasEditLogbookHari: nonNegInt('batas_edit_logbook_hari'),
    maxAkurasiMeter: positive('max_akurasi_meter'),
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
  var email = String(info.email == null ? '' : info.email).toLowerCase().trim();
  if (!email) return fail_('Token tidak berisi email.');
  return { ok: true, email: email, name: info.name || '', exp: exp };
}

/** Email untuk pencocokan: huruf kecil + tanpa spasi di pinggir. */
function normEmail_(s) {
  return String(s == null ? '' : s).toLowerCase().trim();
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

/* ---------- Waktu, teks & upload ---------- */

function toSeconds(hms) {
  var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hms));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59 || Number(m[3] || 0) > 59) {
    throw new Error('Format jam tidak valid: ' + hms);
  }
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

function isLate(jamMasuk, batasTelat) {
  if (!jamMasuk) return false;
  var masuk;
  try {
    masuk = toSeconds(jamMasuk);
  } catch (e) {
    return false; // data sheet berantakan (mis. "1899-12-30") bukan alasan crash
  }
  return masuk > toSeconds(batasTelat);
}

function sanitizeText(s, maxLen) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLen);
}

/**
 * Cegah formula injection di Sheets: string yang diawali = + - @ TAB CR diberi apostrof,
 * KECUALI seluruh string adalah angka polos (mis. -7.9666), karena itu bukan rumus.
 */
function sheetSafeValue(v) {
  var s = v === null || v === undefined ? '' : String(v);
  return (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) ? "'" + s : s;
}

/** Kebalikan sheetSafeValue: buang SATU apostrof awal bila diikuti = + @ - TAB CR (jaga-jaga apostrof tersimpan literal). */
function stripSheetEscape(s) {
  s = String(s);
  return /^'[=+@\-\t\r]/.test(s) ? s.slice(1) : s;
}

/** Ambil id file dari URL Drive (/d/<ID>... atau open?id=<ID>); '' bila bukan URL Drive. */
function driveFileIdFromUrl(url) {
  var s = String(url == null ? '' : url);
  var m = /^https:\/\/(?:drive|docs)\.google\.com\/(?:[^?#]*\/)?d\/([A-Za-z0-9_-]+)/.exec(s) ||
    /^https:\/\/drive\.google\.com\/open\?(?:[^#]*&)?id=([A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1] : '';
}

function stripDataUrl(b64) {
  return String(b64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
}

function base64Bytes(b64) {
  var s = stripDataUrl(b64);
  if (!s) return 0;
  var padding = s.slice(-2) === '==' ? 2 : (s.slice(-1) === '=' ? 1 : 0);
  return Math.floor(s.length * 3 / 4) - padding;
}

function validateUpload(file, kind) {
  var rule = CORE_UPLOAD_RULES[kind];
  if (!rule) return fail_('Jenis upload tidak dikenal.');
  if (!file || !stripDataUrl(file.base64)) return fail_('File belum dipilih.');
  if (rule.mimes.indexOf(file.mime) < 0) return fail_('Format file tidak didukung (' + file.mime + ').');
  var b64 = stripDataUrl(file.base64);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0) return fail_('Isi file rusak.');
  var magic = CORE_MAGIC_PREFIX[file.mime];
  if (!magic || b64.indexOf(magic) !== 0) return fail_('Isi file tidak sesuai format ' + file.mime + '.');
  var bytes = base64Bytes(file.base64);
  if (bytes < rule.minBytes) return fail_('File terlalu kecil atau rusak.');
  if (bytes > rule.maxBytes) return fail_('Ukuran file maksimal ' + (rule.maxBytes / 1024 / 1024) + ' MB.');
  return { ok: true, bytes: bytes };
}

/* ---------- Presensi ---------- */

function checkLocation_(input, mode, config) {
  if (!isFiniteNum_(input.lat) || !isFiniteNum_(input.lng) || !isFiniteNum_(input.accuracy)) {
    return fail_('Lokasi GPS tidak terbaca. Aktifkan GPS lalu coba lagi.');
  }
  if (Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180 || input.accuracy < 0) {
    return fail_('Lokasi GPS tidak valid.');
  }
  var distance = Math.round(haversineMeters(input.lat, input.lng, config.kantorLat, config.kantorLng));
  var flags = [];
  if (input.accuracy > config.maxAkurasiMeter) flags.push('AKURASI_RENDAH');
  if (mode === 'WFO' && distance > config.radiusMeter) {
    return fail_('Kamu berada ' + distance + ' m dari kantor (maks ' + config.radiusMeter +
      ' m). Kalau memang kerja dari rumah, pilih WFH.');
  }
  return { ok: true, distance: distance, flags: flags };
}

function validateCheckIn(input, existing, config) {
  if (existing) return fail_('Kamu sudah mengisi presensi hari ini (' + existing.status + ').');
  if (CORE_STATUS.indexOf(input.status) < 0) return fail_('Status tidak valid.');
  if (input.status === 'Masuk') {
    if (CORE_MODE.indexOf(input.mode) < 0) return fail_('Pilih mode WFO atau WFH.');
    if (!input.hasSelfie) return fail_('Selfie wajib untuk absen masuk.');
    return checkLocation_(input, input.mode, config);
  }
  if (!input.hasSurat) return fail_('Izin/Sakit wajib melampirkan surat (foto atau PDF).');
  return { ok: true, distance: null, flags: [] };
}

function validateCheckOut(input, existing, config) {
  if (!existing) return fail_('Kamu belum absen masuk hari ini.');
  if (existing.status !== 'Masuk') return fail_('Hari ini kamu tercatat ' + existing.status + ', tidak perlu absen pulang.');
  if (existing.jam_pulang) return fail_('Kamu sudah absen pulang hari ini.');
  if (!input.hasSelfie) return fail_('Selfie wajib untuk absen pulang.');
  // Default-deny: radius berlaku kecuali mode tercatat persis WFH (mode kosong/rusak dianggap WFO).
  return checkLocation_(input, existing.mode === 'WFH' ? 'WFH' : 'WFO', config);
}

/* ---------- Logbook & peserta ---------- */

function daysBetween(from, to) {
  var a = from.split('-').map(Number);
  var b = to.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

function validateLogbook(input, today, batasHari) {
  if (!isValidDate(input.tanggal)) return fail_('Tanggal logbook tidak valid.');
  var age = daysBetween(input.tanggal, today);
  if (age < 0) return fail_('Logbook tidak bisa diisi untuk tanggal yang akan datang.');
  if (age > batasHari) return fail_('Logbook tanggal ' + input.tanggal + ' sudah lewat batas edit (' + batasHari + ' hari).');
  var kegiatan = sanitizeText(input.kegiatan, 2000);
  if (kegiatan.length < 5) return fail_('Uraian kegiatan minimal 5 karakter.');
  return { ok: true, kegiatan: kegiatan };
}

function validatePeserta(input) {
  var email = String(input.email || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail_('Email tidak valid.');
  var nama = sanitizeText(input.nama, 100);
  if (!nama) return fail_('Nama wajib diisi.');
  var aktif = String(input.aktif || '').toUpperCase();
  if (aktif !== 'Y' && aktif !== 'N') return fail_('Status aktif harus Y atau N.');
  if (!isValidDate(input.tanggal_mulai)) return fail_('Tanggal mulai tidak valid.');
  if (!isValidDate(input.tanggal_selesai)) return fail_('Tanggal selesai tidak valid.');
  if (input.tanggal_selesai < input.tanggal_mulai) return fail_('Tanggal selesai harus setelah tanggal mulai.');
  return {
    ok: true,
    peserta: {
      email: email, nama: nama, instansi: sanitizeText(input.instansi, 150), aktif: aktif,
      tanggal_mulai: input.tanggal_mulai, tanggal_selesai: input.tanggal_selesai
    }
  };
}

/* ---------- Rekap ---------- */

function monthBounds(bulan) {
  var p = bulan.split('-').map(Number);
  var last = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  return { first: bulan + '-01', last: bulan + '-' + (last < 10 ? '0' : '') + last };
}

function workdaysInRange(start, end) {
  var out = [];
  if (end < start) return out;
  var s = start.split('-').map(Number);
  var d = new Date(Date.UTC(s[0], s[1] - 1, s[2]));
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  for (var i = 0; i < 400; i++) {
    var key = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    if (key > end) break;
    var dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(key);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function buildRekap(pesertaList, absensiRows, bulan, today, batasTelat) {
  var b = monthBounds(bulan);
  // Kelompokkan baris absensi per email (huruf kecil) sekali saja, bukan filter per peserta.
  var byEmail = {};
  absensiRows.forEach(function (row) {
    var key = String(row.email == null ? '' : row.email).toLowerCase().trim();
    if (!byEmail[key]) byEmail[key] = [];
    byEmail[key].push(row);
  });
  return pesertaList
    .filter(function (p) {
      return (!p.tanggal_mulai || p.tanggal_mulai <= b.last) && (!p.tanggal_selesai || p.tanggal_selesai >= b.first);
    })
    .map(function (p) {
      var email = String(p.email).toLowerCase().trim();
      var start = [b.first, p.tanggal_mulai || b.first].sort()[1];
      var end = [b.last, p.tanggal_selesai || b.last, today].sort()[0];
      var hariKerja = workdaysInRange(start, end);
      var tercatat = {};
      var r = { email: email, nama: p.nama, instansi: p.instansi || '', hariKerja: hariKerja.length,
        hadir: 0, wfo: 0, wfh: 0, izin: 0, sakit: 0, telat: 0, tanpaKeterangan: 0 };
      (byEmail[email] || []).forEach(function (row) {
        // Hanya baris dalam rentang efektif (bulan ∩ periode magang ∩ ≤ hari ini).
        // Baris di akhir pekan tetap dihitung (hadir boleh kerja di akhir pekan), hanya tidak menambah hariKerja.
        if (row.tanggal < start || row.tanggal > end) return;
        if (tercatat[row.tanggal]) return; // satu tanggal dihitung sekali; baris pertama menang
        tercatat[row.tanggal] = true;
        if (row.status === 'Masuk') {
          r.hadir++;
          if (row.mode === 'WFO') r.wfo++;
          if (row.mode === 'WFH') r.wfh++;
          if (isLate(row.jam_masuk, batasTelat)) r.telat++;
        } else if (row.status === 'Izin') {
          r.izin++;
        } else if (row.status === 'Sakit') {
          r.sakit++;
        }
      });
      // Hari ini belum dianggap alpa (peserta masih bisa absen), jadi tidak dihitung.
      r.tanpaKeterangan = hariKerja.filter(function (d) { return d !== today && !tercatat[d]; }).length;
      // Peserta nonaktif (aktif !== 'Y') hanya tampil bila punya minimal satu baris absensi dalam rentang efektif.
      var aktif = String(p.aktif == null ? '' : p.aktif).toUpperCase().trim() === 'Y';
      return aktif || Object.keys(tercatat).length > 0 ? r : null;
    })
    .filter(function (r) { return r !== null; });
}
