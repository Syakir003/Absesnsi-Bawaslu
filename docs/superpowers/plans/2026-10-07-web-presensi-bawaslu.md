# Web Presensi Magang Bawaslu Malang — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web presensi peserta magang (WFO/WFH, selfie + GPS, Masuk/Izin/Sakit dengan surat, logbook harian, panel admin dengan rekap dan export) tanpa server sendiri.

**Architecture:** Frontend statis (HTML + ES modules, tanpa build step) di GitHub Pages memanggil Google Apps Script Web App lewat `fetch` POST (`text/plain`, jadi tidak ada CORS preflight). Apps Script memverifikasi Google ID token, menyimpan data di Google Sheets dan file di Google Drive. Semua aturan bisnis ada di `apps-script/Core.js` yang murni (tanpa API Google), sehingga bisa dites unit di Node. Handler dites end-to-end lewat fake Google services.

**Tech Stack:** Google Apps Script (V8), Google Sheets, Google Drive, Google Identity Services, vanilla JS (ES modules), CSS; test: `node:test` (Node 22) dan Playwright (smoke e2e); CI/CD: GitHub Actions ke GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-04-web-presensi-bawaslu-design.md`

**Perubahan kecil dari spec (sudah dipertimbangkan):**
- Sheet `Absensi` menyimpan `akurasi_masuk/pulang`, `jarak_masuk/pulang`, dan `flags`, bukan satu kolom `akurasi`. Kolom ini dibutuhkan untuk fitur "flag akurasi GPS mencurigakan".
- Logbook dibatasi satu entri per peserta per tanggal. Simpan ulang di tanggal yang sama = update.
- Export PDF memakai `window.print()` dengan CSS print, jadi tidak perlu library tambahan.
- Folder `web/` di-deploy lewat GitHub Actions, karena GitHub Pages bawaan hanya bisa serve root atau `/docs`.

**Status validasi plan:** seluruh kode di plan ini sudah dijalankan di sandbox. Hasilnya `npm test` → 59 test lulus, dan `npm run test:e2e` → smoke test Chromium headless lulus tanpa error JS.

---

## Struktur File

```
presensi-bawaslu/
├── package.json                 # script test, test:e2e, dev
├── .gitignore
├── README.md                    # panduan deploy
├── .github/workflows/pages.yml  # CI: npm test → deploy web/ ke Pages
├── docs/TESTING.md              # checklist test manual di HP
├── apps-script/                 # BACKEND (copy ke editor Apps Script)
│   ├── appsscript.json          # manifest: timezone, scope, webapp
│   ├── Core.js                  # logika murni: validasi, jarak, rekap (dites unit)
│   ├── Errors.js                # userError_/authError_ + konstanta TZ
│   ├── Repo.js                  # baca/tulis Sheets, lock, waktu server
│   ├── Setup.js                 # setupSheets(), checkSetup()
│   ├── Auth.js                  # verifikasi ID token (+cache) & resolve role
│   ├── Files.js                 # simpan upload base64 ke Drive
│   ├── Api.js                   # doGet/doPost + router + guard role
│   ├── HandlersPeserta.js       # me, checkin, checkout, riwayat, logbook
│   └── HandlersAdmin.js         # harian, rekap, peserta, logbook admin
├── web/                         # FRONTEND (GitHub Pages)
│   ├── package.json             # {"type":"module"} supaya Node bisa import untuk test
│   ├── index.html
│   ├── config.js                # API_URL + GOOGLE_CLIENT_ID
│   ├── css/style.css
│   └── js/
│       ├── ui.js                # helper DOM aman (textContent), tabs, table, toast
│       ├── csv.js               # toCsv + anti formula injection
│       ├── auth.js              # Google Sign-In, token di sessionStorage
│       ├── api.js               # fetch ke Apps Script + retry jaringan
│       ├── geo.js               # GPS
│       ├── camera.js            # kamera depan + capture JPEG
│       ├── file.js              # kompres gambar / baca PDF
│       ├── main.js              # boot, login, routing role
│       ├── app-peserta.js       # Presensi, Riwayat, Logbook
│       └── app-admin.js         # Harian, Rekap, Peserta, Logbook
└── tests/
    ├── helpers/load-core.js     # muat Core.js via node:vm (mirip global scope GAS)
    ├── helpers/gas-fakes.js     # fake SpreadsheetApp, DriveApp, dst.
    ├── helpers/fixtures.js      # setup data test API
    ├── core-*.test.js           # unit test Core
    ├── setup.test.js, api-*.test.js   # integration test doPost
    ├── web-*.test.mjs           # unit test modul web murni
    └── e2e/smoke.cjs            # smoke UI di Chromium
```

Konvensi penting:
- **Apps Script tidak punya module system.** Semua file berbagi satu global scope. Di file `.js` dalam `apps-script/`, pakai `var`/`function` di top level (jangan `const`/`let`/`import`). Fungsi privat diberi akhiran `_`.
- **Jangan pakai `instanceof Array`/`instanceof Date` di Core.js**, karena test memuatnya di realm `vm` yang berbeda. Pakai `Array.isArray` atau `Object.prototype.toString`.
- **Semua kolom Sheets diformat plain text** oleh `setupSheets()`, supaya `2026-10-07` dan `07:30` tidak berubah jadi objek Date.
- **Frontend tidak pernah memakai `innerHTML` untuk data.** Semua teks lewat `h()` → `textContent`, dan URL lewat `safeUrl()` (hanya `https:`).

---

### Task 1: Scaffold repo & test harness

**Files:**
- Create: `package.json`, `.gitignore`, `tests/helpers/load-core.js`

- [ ] **Step 1: Init repo dan folder**

```bash
mkdir presensi-bawaslu && cd presensi-bawaslu
git init -b main
mkdir -p apps-script web/css web/js tests/helpers tests/e2e docs/superpowers/specs docs/superpowers/plans .github/workflows
```

Salin spec dan plan ini ke `docs/superpowers/specs/` dan `docs/superpowers/plans/`.

- [ ] **Step 2: Buat `package.json`**

```json
{
  "name": "presensi-bawaslu",
  "private": true,
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\" \"tests/**/*.test.mjs\"",
    "test:e2e": "node tests/e2e/smoke.cjs",
    "dev": "npx --yes http-server web -p 5500 -c-1"
  },
  "devDependencies": {
    "playwright": "^1.63.0"
  }
}
```

- [ ] **Step 3: Buat `.gitignore`**

```gitignore
node_modules/
tests/e2e/out/
.clasp.json
.DS_Store
```

- [ ] **Step 4: Buat loader Core untuk test**

`Core.js` ditulis sebagai script Apps Script biasa (tanpa `module.exports`). Loader ini menjalankannya di `node:vm`, sehingga semua `function`/`var` top-level terbaca persis seperti di Apps Script.

```js
// Muat apps-script/Core.js seperti Apps Script (global scope) lewat node:vm.
// Hasil fungsi di-structuredClone supaya assert.deepStrictEqual tidak gagal karena beda realm.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCore() {
  const ctx = vm.createContext({});
  const file = path.join(__dirname, '..', '..', 'apps-script', 'Core.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: 'Core.js' });
  const api = {};
  for (const key of Object.keys(ctx)) {
    const v = ctx[key];
    api[key] = typeof v === 'function'
      ? (...args) => toLocal(v(...args))
      : toLocal(v);
  }
  return api;
}

function toLocal(v) {
  return v === undefined ? undefined : structuredClone(v);
}

module.exports = { loadCore };
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold repo, test harness, spec & plan"
```

---

### Task 2: Core — jarak (Haversine) & parsing Config

**Files:**
- Create: `apps-script/Core.js`
- Test: `tests/core-geo-config.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

const VALID_PAIRS = [
  ['kantor_lat', '-7.9666'], ['kantor_lng', '112.6326'], ['radius_meter', '100'],
  ['jam_masuk', '07:30'], ['batas_telat', '08:00'], ['batas_edit_logbook_hari', '1'],
  ['max_akurasi_meter', '100'], ['folder_id', 'abc123'], ['google_client_id', 'cid.apps.googleusercontent.com'],
];

test('haversineMeters: titik sama = 0', () => {
  assert.equal(core.haversineMeters(-7.9666, 112.6326, -7.9666, 112.6326), 0);
});

test('haversineMeters: 0.001 derajat lintang ≈ 111 m', () => {
  const d = core.haversineMeters(-7.9666, 112.6326, -7.9676, 112.6326);
  assert.ok(d > 110 && d < 112, `dapat ${d}`);
});

test('parseConfig: nilai valid di-parse ke tipe yang benar', () => {
  assert.deepEqual(core.parseConfig(VALID_PAIRS), {
    kantorLat: -7.9666, kantorLng: 112.6326, radiusMeter: 100, jamMasuk: '07:30', batasTelat: '08:00',
    batasEditLogbookHari: 1, maxAkurasiMeter: 100, folderId: 'abc123', googleClientId: 'cid.apps.googleusercontent.com',
  });
});

test('parseConfig: key kosong dilaporkan', () => {
  const pairs = VALID_PAIRS.filter(([k]) => k !== 'folder_id');
  assert.throws(() => core.parseConfig(pairs), /Config belum lengkap: folder_id/);
});

test('parseConfig: angka tidak valid ditolak', () => {
  const pairs = VALID_PAIRS.map(([k, v]) => [k, k === 'kantor_lat' ? 'ISI_LATITUDE' : v]);
  assert.throws(() => core.parseConfig(pairs), /kantor_lat harus angka/);
});

test('parseConfig: format jam salah ditolak', () => {
  const pairs = VALID_PAIRS.map(([k, v]) => [k, k === 'batas_telat' ? '8.00' : v]);
  assert.throws(() => core.parseConfig(pairs), /batas_telat harus format HH:mm/);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/core-geo-config.test.js`
Expected: FAIL dengan `ENOENT: no such file or directory ... apps-script/Core.js`

- [ ] **Step 3: Buat `apps-script/Core.js` (header, konstanta, helper, Geo & Config)**

```js
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
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `node --test tests/core-geo-config.test.js`
Expected: `# pass 6`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add apps-script/Core.js tests/core-geo-config.test.js
git commit -m "feat(core): haversine distance & config parsing"
```

---

### Task 3: Core — verifikasi klaim token, validasi tanggal, role

**Files:**
- Modify: `apps-script/Core.js` (tambah di akhir file)
- Test: `tests/core-auth.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

const CID = 'cid.apps.googleusercontent.com';
const NOW = 1_800_000_000;
const goodInfo = { aud: CID, iss: 'https://accounts.google.com', email_verified: 'true', exp: String(NOW + 600), email: 'Budi@Gmail.com', name: 'Budi' };

test('checkTokenClaims: token valid → email lowercase', () => {
  assert.deepEqual(core.checkTokenClaims(goodInfo, CID, NOW), { ok: true, email: 'budi@gmail.com', name: 'Budi', exp: NOW + 600 });
});

test('checkTokenClaims: aud beda ditolak', () => {
  assert.equal(core.checkTokenClaims({ ...goodInfo, aud: 'lain' }, CID, NOW).ok, false);
});

test('checkTokenClaims: iss asing ditolak', () => {
  assert.equal(core.checkTokenClaims({ ...goodInfo, iss: 'evil.com' }, CID, NOW).ok, false);
});

test('checkTokenClaims: email belum verified ditolak', () => {
  assert.equal(core.checkTokenClaims({ ...goodInfo, email_verified: 'false' }, CID, NOW).ok, false);
});

test('checkTokenClaims: token expired ditolak', () => {
  const r = core.checkTokenClaims({ ...goodInfo, exp: String(NOW - 1) }, CID, NOW);
  assert.deepEqual(r, { ok: false, error: 'Sesi login kedaluwarsa. Silakan login ulang.' });
});

test('isValidDate & isValidMonth', () => {
  assert.equal(core.isValidDate('2026-02-28'), true);
  assert.equal(core.isValidDate('2026-02-30'), false);
  assert.equal(core.isValidDate('2026-2-3'), false);
  assert.equal(core.isValidMonth('2026-10'), true);
  assert.equal(core.isValidMonth('2026-13'), false);
});

const peserta = [
  { email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', aktif: 'Y', tanggal_mulai: '2026-09-01', tanggal_selesai: '2026-12-31' },
  { email: 'dodi@gmail.com', nama: 'Dodi', instansi: 'UM', aktif: 'N', tanggal_mulai: '2026-09-01', tanggal_selesai: '2026-12-31' },
];
const admins = [{ email: 'admin@gmail.com', nama: 'Pak Admin' }];

test('isPesertaActive: cek flag aktif dan periode', () => {
  assert.equal(core.isPesertaActive(peserta[0], '2026-10-07'), true);
  assert.equal(core.isPesertaActive(peserta[0], '2026-08-31'), false);
  assert.equal(core.isPesertaActive(peserta[0], '2027-01-01'), false);
  assert.equal(core.isPesertaActive(peserta[1], '2026-10-07'), false);
});

test('resolveRole: admin menang duluan', () => {
  assert.deepEqual(core.resolveRole('ADMIN@gmail.com', admins, peserta, '2026-10-07'), { ok: true, role: 'admin', email: 'admin@gmail.com', nama: 'Pak Admin' });
});

test('resolveRole: peserta aktif', () => {
  assert.deepEqual(core.resolveRole('ani@gmail.com', admins, peserta, '2026-10-07'), { ok: true, role: 'peserta', email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB' });
});

test('resolveRole: peserta nonaktif & email asing ditolak', () => {
  assert.match(core.resolveRole('dodi@gmail.com', admins, peserta, '2026-10-07').error, /tidak aktif/);
  assert.match(core.resolveRole('x@gmail.com', admins, peserta, '2026-10-07').error, /belum terdaftar/);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/core-auth.test.js`
Expected: FAIL dengan `TypeError: core.checkTokenClaims is not a function`

- [ ] **Step 3: Tambahkan di akhir `apps-script/Core.js`**

```js
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
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `node --test tests/core-auth.test.js`
Expected: `# pass 10`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add apps-script/Core.js tests/core-auth.test.js
git commit -m "feat(core): token claim checks, date validation, role resolution"
```

---

### Task 4: Core — jam, telat, sanitasi teks, validasi upload

**Files:**
- Modify: `apps-script/Core.js` (tambah di akhir file)
- Test: `tests/core-time-upload.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

test('toSeconds: HH:mm dan HH:mm:ss', () => {
  assert.equal(core.toSeconds('07:30'), 27000);
  assert.equal(core.toSeconds('07:30:15'), 27015);
  assert.throws(() => core.toSeconds('7.30'), /Format jam tidak valid/);
});

test('isLate: lewat batas = telat, pas batas = tidak', () => {
  assert.equal(core.isLate('08:00:00', '08:00'), false);
  assert.equal(core.isLate('08:00:01', '08:00'), true);
  assert.equal(core.isLate('', '08:00'), false);
});

test('sanitizeText: buang control char, trim, potong', () => {
  assert.equal(core.sanitizeText('  halo\u0000 dunia  ', 100), 'halo dunia');
  assert.equal(core.sanitizeText('abcdef', 3), 'abc');
  assert.equal(core.sanitizeText(null, 10), '');
});

test('stripDataUrl & base64Bytes', () => {
  assert.equal(core.stripDataUrl('data:image/jpeg;base64,QUJD'), 'QUJD');
  assert.equal(core.base64Bytes('QUJD'), 3);
  assert.equal(core.base64Bytes('QUI='), 2);
  assert.equal(core.base64Bytes('QQ=='), 1);
  assert.equal(core.base64Bytes(''), 0);
});

test('validateUpload: selfie jpeg valid', () => {
  assert.deepEqual(core.validateUpload({ mime: 'image/jpeg', base64: 'QUJD' }, 'selfie'), { ok: true, bytes: 3 });
});

test('validateUpload: mime salah, kosong, rusak, kebesaran', () => {
  assert.match(core.validateUpload({ mime: 'image/png', base64: 'QUJD' }, 'selfie').error, /Format file/);
  assert.match(core.validateUpload({ mime: 'image/jpeg', base64: '' }, 'selfie').error, /belum dipilih/);
  assert.match(core.validateUpload({ mime: 'application/pdf', base64: 'QU$D' }, 'surat').error, /rusak/);
  const big = 'A'.repeat(Math.ceil((2 * 1024 * 1024 + 3) / 3) * 4);
  assert.match(core.validateUpload({ mime: 'application/pdf', base64: big }, 'surat').error, /maksimal 2 MB/);
  assert.match(core.validateUpload({ mime: 'image/jpeg', base64: 'QUJD' }, 'foto').error, /tidak dikenal/);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/core-time-upload.test.js`
Expected: FAIL dengan `TypeError: core.toSeconds is not a function`

- [ ] **Step 3: Tambahkan di akhir `apps-script/Core.js`**

```js
/* ---------- Waktu, teks & upload ---------- */

function toSeconds(hms) {
  var m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(hms));
  if (!m) throw new Error('Format jam tidak valid: ' + hms);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

function isLate(jamMasuk, batasTelat) {
  if (!jamMasuk) return false;
  return toSeconds(jamMasuk) > toSeconds(batasTelat);
}

function sanitizeText(s, maxLen) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLen);
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
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(stripDataUrl(file.base64))) return fail_('Isi file rusak.');
  var bytes = base64Bytes(file.base64);
  if (bytes > rule.maxBytes) return fail_('Ukuran file maksimal ' + (rule.maxBytes / 1024 / 1024) + ' MB.');
  return { ok: true, bytes: bytes };
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `node --test tests/core-time-upload.test.js`
Expected: `# pass 6`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add apps-script/Core.js tests/core-time-upload.test.js
git commit -m "feat(core): time helpers, late check, upload validation"
```

---

### Task 5: Core — validasi absen masuk & pulang

**Files:**
- Modify: `apps-script/Core.js` (tambah di akhir file)
- Test: `tests/core-presensi.test.js`

Aturannya:
- Satu presensi per hari.
- Masuk wajib mode, selfie, dan GPS. WFO wajib berada dalam radius, sedangkan WFH bebas lokasi.
- Akurasi GPS di atas `max_akurasi_meter` diberi flag `AKURASI_RENDAH` (tetap diterima).
- Izin/Sakit wajib surat, tanpa GPS.
- Pulang wajib selfie dan GPS, dengan mode yang sama seperti saat masuk.

- [ ] **Step 1: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

const config = { kantorLat: -7.9666, kantorLng: 112.6326, radiusMeter: 100, maxAkurasiMeter: 50 };
const diKantor = { lat: -7.9667, lng: 112.6326, accuracy: 10 };   // ±11 m
const jauh = { lat: -7.9766, lng: 112.6326, accuracy: 10 };       // ±1,1 km

test('checkIn Masuk WFO dalam radius → ok + jarak', () => {
  const r = core.validateCheckIn({ status: 'Masuk', mode: 'WFO', hasSelfie: true, ...diKantor }, null, config);
  assert.equal(r.ok, true);
  assert.equal(r.distance, 11);
  assert.deepEqual(r.flags, []);
});

test('checkIn WFO di luar radius → ditolak dengan info jarak', () => {
  const r = core.validateCheckIn({ status: 'Masuk', mode: 'WFO', hasSelfie: true, ...jauh }, null, config);
  assert.equal(r.ok, false);
  assert.match(r.error, /1112 m dari kantor \(maks 100 m\)/);
});

test('checkIn WFH jauh tetap ok, akurasi jelek di-flag', () => {
  const r = core.validateCheckIn({ status: 'Masuk', mode: 'WFH', hasSelfie: true, ...jauh, accuracy: 300 }, null, config);
  assert.equal(r.ok, true);
  assert.deepEqual(r.flags, ['AKURASI_RENDAH']);
});

test('checkIn Masuk tanpa selfie / mode / GPS ditolak', () => {
  assert.match(core.validateCheckIn({ status: 'Masuk', mode: 'WFO', hasSelfie: false, ...diKantor }, null, config).error, /Selfie wajib/);
  assert.match(core.validateCheckIn({ status: 'Masuk', mode: 'X', hasSelfie: true, ...diKantor }, null, config).error, /WFO atau WFH/);
  assert.match(core.validateCheckIn({ status: 'Masuk', mode: 'WFO', hasSelfie: true, lat: null, lng: null, accuracy: null }, null, config).error, /GPS tidak terbaca/);
});

test('checkIn Izin/Sakit wajib surat, tanpa GPS', () => {
  assert.deepEqual(core.validateCheckIn({ status: 'Sakit', hasSurat: true }, null, config), { ok: true, distance: null, flags: [] });
  assert.match(core.validateCheckIn({ status: 'Izin', hasSurat: false }, null, config).error, /wajib melampirkan surat/);
});

test('checkIn dobel / status asing ditolak', () => {
  assert.match(core.validateCheckIn({ status: 'Izin', hasSurat: true }, { status: 'Masuk' }, config).error, /sudah mengisi presensi hari ini \(Masuk\)/);
  assert.match(core.validateCheckIn({ status: 'Alpa' }, null, config).error, /Status tidak valid/);
});

test('checkOut: alur normal pakai mode saat masuk', () => {
  const existing = { status: 'Masuk', mode: 'WFO', jam_pulang: '' };
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...diKantor }, existing, config).ok, true);
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...jauh }, existing, config).ok, false);
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...jauh }, { ...existing, mode: 'WFH' }, config).ok, true);
});

test('checkOut: belum masuk / izin / sudah pulang / tanpa selfie', () => {
  assert.match(core.validateCheckOut({ hasSelfie: true, ...diKantor }, null, config).error, /belum absen masuk/);
  assert.match(core.validateCheckOut({ hasSelfie: true, ...diKantor }, { status: 'Izin' }, config).error, /tercatat Izin/);
  assert.match(core.validateCheckOut({ hasSelfie: true, ...diKantor }, { status: 'Masuk', mode: 'WFO', jam_pulang: '16:00:00' }, config).error, /sudah absen pulang/);
  assert.match(core.validateCheckOut({ hasSelfie: false, ...diKantor }, { status: 'Masuk', mode: 'WFO', jam_pulang: '' }, config).error, /Selfie wajib/);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/core-presensi.test.js`
Expected: FAIL dengan `TypeError: core.validateCheckIn is not a function`

- [ ] **Step 3: Tambahkan di akhir `apps-script/Core.js`**

```js
/* ---------- Presensi ---------- */

function checkLocation_(input, mode, config) {
  if (!isFiniteNum_(input.lat) || !isFiniteNum_(input.lng) || !isFiniteNum_(input.accuracy)) {
    return fail_('Lokasi GPS tidak terbaca. Aktifkan GPS lalu coba lagi.');
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
  return checkLocation_(input, existing.mode, config);
}
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `node --test tests/core-presensi.test.js`
Expected: `# pass 8`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add apps-script/Core.js tests/core-presensi.test.js
git commit -m "feat(core): check-in/check-out validation with radius & accuracy flags"
```

---

### Task 6: Core — validasi logbook & data peserta

**Files:**
- Modify: `apps-script/Core.js` (tambah di akhir file)
- Test: `tests/core-logbook-peserta.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

test('daysBetween', () => {
  assert.equal(core.daysBetween('2026-10-06', '2026-10-07'), 1);
  assert.equal(core.daysBetween('2026-10-07', '2026-10-07'), 0);
  assert.equal(core.daysBetween('2026-10-08', '2026-10-07'), -1);
  assert.equal(core.daysBetween('2026-09-30', '2026-10-01'), 1);
});

test('validateLogbook: hari ini & kemarin (batas 1) ok', () => {
  assert.deepEqual(core.validateLogbook({ tanggal: '2026-10-07', kegiatan: '  Input data pemilih  ' }, '2026-10-07', 1), { ok: true, kegiatan: 'Input data pemilih' });
  assert.equal(core.validateLogbook({ tanggal: '2026-10-06', kegiatan: 'Rapat koordinasi' }, '2026-10-07', 1).ok, true);
});

test('validateLogbook: lewat batas, masa depan, terlalu pendek, tanggal rusak', () => {
  assert.match(core.validateLogbook({ tanggal: '2026-10-05', kegiatan: 'Rapat koordinasi' }, '2026-10-07', 1).error, /lewat batas edit/);
  assert.match(core.validateLogbook({ tanggal: '2026-10-08', kegiatan: 'Rapat koordinasi' }, '2026-10-07', 1).error, /akan datang/);
  assert.match(core.validateLogbook({ tanggal: '2026-10-07', kegiatan: 'abc' }, '2026-10-07', 1).error, /minimal 5/);
  assert.match(core.validateLogbook({ tanggal: '07-10-2026', kegiatan: 'Rapat koordinasi' }, '2026-10-07', 1).error, /tidak valid/);
});

const baseP = { email: ' Ani@Gmail.com ', nama: 'Ani', instansi: 'UB', aktif: 'y', tanggal_mulai: '2026-09-01', tanggal_selesai: '2026-12-31' };

test('validatePeserta: normalisasi email & aktif', () => {
  assert.deepEqual(core.validatePeserta(baseP), {
    ok: true,
    peserta: { email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', aktif: 'Y', tanggal_mulai: '2026-09-01', tanggal_selesai: '2026-12-31' },
  });
});

test('validatePeserta: field salah ditolak', () => {
  assert.match(core.validatePeserta({ ...baseP, email: 'ani' }).error, /Email tidak valid/);
  assert.match(core.validatePeserta({ ...baseP, nama: '' }).error, /Nama wajib/);
  assert.match(core.validatePeserta({ ...baseP, aktif: 'ya' }).error, /Y atau N/);
  assert.match(core.validatePeserta({ ...baseP, tanggal_mulai: '2026-13-01' }).error, /Tanggal mulai/);
  assert.match(core.validatePeserta({ ...baseP, tanggal_selesai: '2026-08-01' }).error, /setelah tanggal mulai/);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/core-logbook-peserta.test.js`
Expected: FAIL dengan `TypeError: core.daysBetween is not a function`

- [ ] **Step 3: Tambahkan di akhir `apps-script/Core.js`**

```js
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
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `node --test tests/core-logbook-peserta.test.js`
Expected: `# pass 5`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add apps-script/Core.js tests/core-logbook-peserta.test.js
git commit -m "feat(core): logbook edit window & peserta validation"
```

---

### Task 7: Core — rekap bulanan

**Files:**
- Modify: `apps-script/Core.js` (tambah di akhir file)
- Test: `tests/core-rekap.test.js`

Definisi rekap:
- Hari kerja = Senin–Jumat dalam irisan (bulan ∩ periode magang ∩ ≤ hari ini).
- Tanpa keterangan = hari kerja yang tidak punya baris presensi.
- Telat = `jam_masuk` > `batas_telat`.

- [ ] **Step 1: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

test('monthBounds: termasuk Februari kabisat', () => {
  assert.deepEqual(core.monthBounds('2026-10'), { first: '2026-10-01', last: '2026-10-31' });
  assert.deepEqual(core.monthBounds('2028-02'), { first: '2028-02-01', last: '2028-02-29' });
});

test('workdaysInRange: Senin–Jumat saja', () => {
  // 2026-10-03 Sabtu, 2026-10-04 Minggu, 2026-10-05 Senin
  assert.deepEqual(core.workdaysInRange('2026-10-02', '2026-10-06'), ['2026-10-02', '2026-10-05', '2026-10-06']);
  assert.deepEqual(core.workdaysInRange('2026-10-06', '2026-10-05'), []);
});

test('buildRekap: hitung hadir/wfo/wfh/izin/sakit/telat/tanpa keterangan', () => {
  const peserta = [
    { email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', aktif: 'Y', tanggal_mulai: '2026-10-01', tanggal_selesai: '2026-12-31' },
    { email: 'lama@gmail.com', nama: 'Lama', instansi: 'UM', aktif: 'N', tanggal_mulai: '2026-01-01', tanggal_selesai: '2026-06-30' },
  ];
  const absensi = [
    { email: 'ani@gmail.com', tanggal: '2026-10-01', status: 'Masuk', mode: 'WFO', jam_masuk: '07:45:00' },
    { email: 'ani@gmail.com', tanggal: '2026-10-02', status: 'Masuk', mode: 'WFH', jam_masuk: '08:10:00' },
    { email: 'ani@gmail.com', tanggal: '2026-10-05', status: 'Sakit', mode: '', jam_masuk: '' },
    { email: 'ani@gmail.com', tanggal: '2026-09-30', status: 'Masuk', mode: 'WFO', jam_masuk: '07:00:00' },
  ];
  // Hari kerja 1–7 Okt: 1,2,5,6,7 = 5 hari; tercatat 1,2,5 → tanpa keterangan 2
  assert.deepEqual(core.buildRekap(peserta, absensi, '2026-10', '2026-10-07', '08:00'), [
    { email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', hariKerja: 5, hadir: 2, wfo: 1, wfh: 1, izin: 0, sakit: 1, telat: 1, tanpaKeterangan: 2 },
  ]);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/core-rekap.test.js`
Expected: FAIL dengan `TypeError: core.monthBounds is not a function`

- [ ] **Step 3: Tambahkan di akhir `apps-script/Core.js`**

```js
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
  return pesertaList
    .filter(function (p) {
      return (!p.tanggal_mulai || p.tanggal_mulai <= b.last) && (!p.tanggal_selesai || p.tanggal_selesai >= b.first);
    })
    .map(function (p) {
      var email = String(p.email).toLowerCase().trim();
      var start = [b.first, p.tanggal_mulai || b.first].sort()[1];
      var end = [b.last, p.tanggal_selesai || b.last, today].sort()[0];
      var hariKerja = workdaysInRange(start, end);
      var rows = absensiRows.filter(function (r) {
        return String(r.email).toLowerCase().trim() === email && r.tanggal >= b.first && r.tanggal <= b.last;
      });
      var tercatat = {};
      var r = { email: email, nama: p.nama, instansi: p.instansi || '', hariKerja: hariKerja.length,
        hadir: 0, wfo: 0, wfh: 0, izin: 0, sakit: 0, telat: 0, tanpaKeterangan: 0 };
      rows.forEach(function (row) {
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
      r.tanpaKeterangan = hariKerja.filter(function (d) { return !tercatat[d]; }).length;
      return r;
    });
}
```

- [ ] **Step 4: Jalankan semua test Core**

Run: `npm test`
Expected: `# pass 38`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add apps-script/Core.js tests/core-rekap.test.js
git commit -m "feat(core): monthly recap with workdays & late count"
```

---

### Task 8: Apps Script infra — manifest, errors, repo Sheets, setup + fake GAS

**Files:**
- Create: `apps-script/appsscript.json`, `apps-script/Errors.js`, `apps-script/Repo.js`, `apps-script/Setup.js`
- Create: `tests/helpers/gas-fakes.js`
- Test: `tests/setup.test.js`

Fake ini meniru *minimal* API Google yang kita pakai. Timezone di fake di-hardcode UTC+7, karena Asia/Jakarta tidak punya DST. File Apps Script yang belum ada dilewati, supaya task berikutnya bisa ditest bertahap.

- [ ] **Step 1: Buat fake Google services**

```js
// Fake minimal Google Apps Script services untuk integration test doPost di Node.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const GAS_FILES = ['Core.js', 'Errors.js', 'Repo.js', 'Setup.js', 'Auth.js', 'Files.js', 'Api.js', 'HandlersPeserta.js', 'HandlersAdmin.js'];

function fakeSheet(name) {
  const rows = [];
  const sheet = {
    name,
    rows,
    getDataRange: () => ({ getValues: () => (rows.length ? rows.map((r) => r.slice()) : [[]]) }),
    getRange: (a, col, numRows, numCols) => {
      if (typeof a === 'string') return { setNumberFormat: () => ({}) };
      return {
        setValues(values) {
          values.forEach((v, i) => { rows[a - 1 + i] = Array.from(v, String); });
          return { setFontWeight: () => ({}) };
        },
      };
    },
    appendRow: (r) => rows.push(Array.from(r, String)),
    getLastRow: () => rows.length,
    setFrozenRows: () => {},
  };
  return sheet;
}

function createGas({ tokenInfo = {}, now = new Date('2026-10-07T00:15:00Z') } = {}) {
  const sheets = {};
  const files = {};
  const cache = {};
  let fileSeq = 0;
  const fetchCalls = [];

  const spreadsheet = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = fakeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: (s) => delete sheets[s.name],
  };

  const pad = (n) => String(n).padStart(2, '0');
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    Utilities: {
      formatDate(d, tz, fmt) {
        const j = new Date(d.getTime() + 7 * 3600 * 1000); // Asia/Jakarta = UTC+7
        const map = { yyyy: j.getUTCFullYear(), MM: pad(j.getUTCMonth() + 1), dd: pad(j.getUTCDate()), HH: pad(j.getUTCHours()), mm: pad(j.getUTCMinutes()), ss: pad(j.getUTCSeconds()) };
        return fmt.replace(/yyyy|MM|dd|HH|mm|ss/g, (k) => map[k]);
      },
      getUuid: () => crypto.randomUUID(),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      computeDigest: (_alg, s) => Array.from(crypto.createHash('sha256').update(s).digest()),
      base64EncodeWebSafe: (bytes) => Buffer.from(bytes).toString('base64url'),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
    },
    DriveApp: {
      getFolderById: (id) => ({
        getName: () => 'folder-' + id,
        createFile: (blob) => {
          const fid = 'f' + ++fileSeq;
          files[fid] = { ...blob, trashed: false };
          return { getUrl: () => 'https://drive.google.com/file/d/' + fid, getId: () => fid };
        },
      }),
      getFileById: (id) => ({ setTrashed: (t) => { files[id].trashed = t; } }),
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    UrlFetchApp: {
      fetch(url) {
        fetchCalls.push(url);
        const token = decodeURIComponent(url.split('id_token=')[1]);
        const info = tokenInfo[token];
        return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || { error: 'invalid_token' }) };
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
      static now() { return now.getTime(); }
    },
  };
  vm.createContext(ctx);
  for (const f of GAS_FILES) {
    const file = path.join(__dirname, '..', '..', 'apps-script', f);
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f }); // file yang belum dibuat dilewati
  }

  function call(action, idToken, data) {
    const res = ctx.doPost({ postData: { contents: JSON.stringify({ action, idToken, data }) } });
    return JSON.parse(res.text);
  }

  function rowsOf(name) {
    const [headers, ...rest] = sheets[name].rows;
    return rest.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  }

  return { ctx, sheets, files, fetchCalls, call, rowsOf, setNow: (d) => { now = d; } };
}

module.exports = { createGas };
```

- [ ] **Step 2: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas-fakes');

test('setupSheets membuat semua sheet + config default', () => {
  const gas = createGas();
  gas.ctx.setupSheets();
  assert.deepEqual(Object.keys(gas.sheets).sort(), ['Absensi', 'Admin', 'Config', 'Logbook', 'Peserta']);
  assert.deepEqual(gas.sheets.Absensi.rows[0].slice(0, 3), ['id', 'email', 'tanggal']);
  assert.equal(gas.sheets.Config.rows.length, 10);
});

test('setupSheets aman dijalankan ulang (config tidak ditimpa)', () => {
  const gas = createGas();
  gas.ctx.setupSheets();
  gas.sheets.Config.rows[1][1] = '-7.9666';
  gas.ctx.setupSheets();
  assert.equal(gas.sheets.Config.rows[1][1], '-7.9666');
});

test('readConfig_ menolak config default yang belum diisi', () => {
  const gas = createGas();
  gas.ctx.setupSheets();
  assert.throws(() => gas.ctx.readConfig_(), /kantor_lat harus angka/);
});
```

- [ ] **Step 3: Jalankan dan pastikan gagal**

Run: `node --test tests/setup.test.js`
Expected: FAIL dengan `TypeError: gas.ctx.setupSheets is not a function`

- [ ] **Step 4: Buat manifest `apps-script/appsscript.json`**

Isi `access: ANYONE_ANONYMOUS` itu wajib. Kalau tidak, `fetch` dari GitHub Pages akan di-redirect ke halaman login Google dan gagal. Autentikasi dilakukan sendiri lewat ID token.

```json
{
  "timeZone": "Asia/Jakarta",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request"
  ],
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- [ ] **Step 5: Buat `apps-script/Errors.js`**

```js
/** Errors.js — error yang pesannya aman ditampilkan ke user. */
var TZ = 'Asia/Jakarta';

function userError_(message, code) {
  var err = new Error(message);
  err.userMessage = message;
  err.code = code || 'USER';
  return err;
}

function authError_(message) {
  return userError_(message, 'AUTH');
}
```

- [ ] **Step 6: Buat `apps-script/Repo.js`**

```js
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
    return v === null || v === undefined ? '' : String(v);
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
```

- [ ] **Step 7: Buat `apps-script/Setup.js`**

```js
/** Setup.js — jalankan setupSheets() SEKALI dari editor Apps Script. */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (k) {
    var def = SHEETS[k];
    var sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    sh.getRange('A:Z').setNumberFormat('@'); // plain text: cegah tanggal/jam berubah jadi Date
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });

  var cfg = ss.getSheetByName(SHEETS.CONFIG.name);
  if (cfg.getLastRow() < 2) {
    cfg.getRange(2, 1, 9, 2).setValues([
      ['kantor_lat', 'ISI_LATITUDE_KANTOR'],
      ['kantor_lng', 'ISI_LONGITUDE_KANTOR'],
      ['radius_meter', '100'],
      ['jam_masuk', '07:30'],
      ['batas_telat', '08:00'],
      ['batas_edit_logbook_hari', '1'],
      ['max_akurasi_meter', '100'],
      ['folder_id', 'ISI_ID_FOLDER_DRIVE'],
      ['google_client_id', 'ISI_CLIENT_ID.apps.googleusercontent.com']
    ]);
  }

  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);
}

/** Cek cepat dari editor: Config valid & sheet lengkap. Lihat hasilnya di Execution log. */
function checkSetup() {
  var cfg = readConfig_();
  DriveApp.getFolderById(cfg.folderId).getName();
  Object.keys(SHEETS).forEach(function (k) { sheet_(SHEETS[k]); });
  console.log('Setup OK', JSON.stringify(cfg));
}
```

- [ ] **Step 8: Jalankan dan pastikan lulus**

Run: `node --test tests/setup.test.js`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 9: Commit**

```bash
git add apps-script tests/helpers/gas-fakes.js tests/setup.test.js
git commit -m "feat(gas): manifest, sheet repository, setup script + GAS fakes"
```

---

### Task 9: Apps Script — auth, upload Drive, router, handler peserta

**Files:**
- Create: `apps-script/Auth.js`, `apps-script/Files.js`, `apps-script/Api.js`, `apps-script/HandlersPeserta.js`
- Create: `tests/helpers/fixtures.js`
- Test: `tests/api-peserta.test.js`

Hal penting di task ini:
- **Verifikasi token** lewat endpoint `oauth2.googleapis.com/tokeninfo`, lalu hasilnya di-cache di `CacheService` (key = SHA-256 token) sampai token expired. Jadi verifikasi hanya 1 fetch per sesi.
- **Urutan check-in/out:** validasi cepat → upload ke Drive (di luar lock, karena lambat) → masuk `LockService` → validasi ulang → tulis Sheet. Kalau validasi ulang gagal (misalnya dua tab submit bersamaan), file yang sudah diupload di-trash.
- **Waktu** selalu dari server (`nowParts_()`), jam di HP diabaikan.
- **Error** yang punya `userMessage` dikirim ke client. Error lain dicatat di log dan client hanya menerima pesan generik.

- [ ] **Step 1: Buat fixtures test**

```js
// Fixture bersama untuk test API: sheet sudah di-setup, config terisi, 1 admin + 1 peserta.
const { createGas } = require('./gas-fakes');

const CID = 'cid.apps.googleusercontent.com';
const EXP = String(Math.floor(new Date('2026-10-07T12:00:00Z').getTime() / 1000));
const info = (email) => ({ aud: CID, iss: 'accounts.google.com', email_verified: 'true', exp: EXP, email, name: email });
const SELFIE = { mime: 'image/jpeg', base64: 'QUJD' };
const SURAT = { mime: 'application/pdf', base64: 'JVBERi0=' };
const KANTOR = { lat: -7.9666, lng: 112.6326, accuracy: 10 };

function setupGas() {
  const gas = createGas({ tokenInfo: { 'tok-ani': info('ani@gmail.com'), 'tok-admin': info('admin@gmail.com'), 'tok-asing': info('asing@gmail.com') } });
  gas.ctx.setupSheets();
  const cfg = gas.sheets.Config;
  const set = (k, v) => { cfg.rows.find((r) => r[0] === k)[1] = v; };
  set('kantor_lat', '-7.9666');
  set('kantor_lng', '112.6326');
  set('folder_id', 'FOLDER');
  set('google_client_id', CID);
  gas.sheets.Admin.appendRow(['admin@gmail.com', 'Pak Admin']);
  gas.sheets.Peserta.appendRow(['Ani@Gmail.com', 'Ani', 'UB', 'Y', '2026-09-01', '2026-12-31']);
  return gas;
}

module.exports = { CID, info, SELFIE, SURAT, KANTOR, setupGas };
```

- [ ] **Step 2: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas-fakes');
const { info, SELFIE, SURAT, KANTOR, setupGas } = require('./helpers/fixtures');

test('doGet health check', () => {
  const gas = setupGas();
  assert.deepEqual(JSON.parse(gas.ctx.doGet().text), { ok: true, data: 'presensi-api' });
});

test('tanpa token → AUTH, token palsu → AUTH, email asing → FORBIDDEN, aksi asing ditolak', () => {
  const gas = setupGas();
  assert.equal(gas.call('me', '', {}).code, 'AUTH');
  assert.equal(gas.call('me', 'tok-palsu', {}).code, 'AUTH');
  assert.equal(gas.call('me', 'tok-asing', {}).code, 'FORBIDDEN');
  assert.match(gas.call('hapus.semua', 'tok-ani', {}).error, /Aksi tidak dikenal/);
});

test('config belum diisi → error SERVER generik (detail hanya di log)', () => {
  const gas = createGas({ tokenInfo: { t: info('ani@gmail.com') } });
  gas.ctx.setupSheets();
  assert.deepEqual(gas.call('me', 't', {}), { ok: false, error: 'Terjadi kesalahan di server. Coba lagi.', code: 'SERVER' });
});

test('me: peserta dapat role + absensiHariIni null', () => {
  const gas = setupGas();
  const res = gas.call('me', 'tok-ani', {});
  assert.equal(res.ok, true);
  assert.equal(res.data.role, 'peserta');
  assert.equal(res.data.today, '2026-10-07');
  assert.equal(res.data.absensiHariIni, null);
});

test('token di-cache: request kedua tidak fetch tokeninfo lagi', () => {
  const gas = setupGas();
  gas.call('me', 'tok-ani', {});
  gas.call('me', 'tok-ani', {});
  assert.equal(gas.fetchCalls.length, 1);
});

test('checkin WFO → checkout → baris lengkap, 2 file tersimpan', () => {
  const gas = setupGas();
  const masuk = gas.call('absen.checkin', 'tok-ani', { status: 'Masuk', mode: 'WFO', selfie: SELFIE, ...KANTOR });
  assert.equal(masuk.ok, true, masuk.error);
  assert.equal(masuk.data.jam_masuk, '07:15:00');

  assert.match(gas.call('absen.checkin', 'tok-ani', { status: 'Izin', surat: SURAT }).error, /sudah mengisi presensi/);

  gas.setNow(new Date('2026-10-07T09:00:00Z'));
  const pulang = gas.call('absen.checkout', 'tok-ani', { selfie: SELFIE, ...KANTOR });
  assert.equal(pulang.ok, true, pulang.error);

  const [row] = gas.rowsOf('Absensi');
  assert.equal(row.email, 'ani@gmail.com');
  assert.equal(row.jam_pulang, '16:00:00');
  assert.equal(row.jarak_masuk, '0');
  assert.ok(row.link_selfie_masuk.includes('drive.google.com'));
  assert.ok(row.link_selfie_pulang.includes('drive.google.com'));
  assert.equal(Object.keys(gas.files).length, 2);
});

test('checkin WFO di luar radius ditolak sebelum upload', () => {
  const gas = setupGas();
  const res = gas.call('absen.checkin', 'tok-ani', { status: 'Masuk', mode: 'WFO', selfie: SELFIE, lat: -7.98, lng: 112.6326, accuracy: 10 });
  assert.match(res.error, /dari kantor/);
  assert.equal(Object.keys(gas.files).length, 0);
});

test('izin dengan surat → tersimpan, checkout ditolak', () => {
  const gas = setupGas();
  const res = gas.call('absen.checkin', 'tok-ani', { status: 'Izin', surat: SURAT, catatan: 'Ujian' });
  assert.equal(res.ok, true, res.error);
  assert.equal(gas.rowsOf('Absensi')[0].status, 'Izin');
  assert.match(gas.call('absen.checkout', 'tok-ani', { selfie: SELFIE, ...KANTOR }).error, /tercatat Izin/);
});

test('riwayat: validasi bulan & data milik sendiri', () => {
  const gas = setupGas();
  gas.call('absen.checkin', 'tok-ani', { status: 'Sakit', surat: SURAT });
  assert.match(gas.call('absen.riwayat', 'tok-ani', { bulan: 'okt' }).error, /YYYY-MM/);
  assert.equal(gas.call('absen.riwayat', 'tok-ani', { bulan: '2026-10' }).data.length, 1);
});

test('logbook: upsert per tanggal + flag bisaEdit + batas edit', () => {
  const gas = setupGas();
  assert.equal(gas.call('logbook.save', 'tok-ani', { tanggal: '2026-10-07', kegiatan: 'Input data pemilih' }).ok, true);
  assert.equal(gas.call('logbook.save', 'tok-ani', { tanggal: '2026-10-07', kegiatan: 'Input data pemilih + rapat' }).ok, true);
  const list = gas.call('logbook.list', 'tok-ani', { bulan: '2026-10' }).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].kegiatan, 'Input data pemilih + rapat');
  assert.equal(list[0].bisaEdit, true);
  assert.match(gas.call('logbook.save', 'tok-ani', { tanggal: '2026-10-01', kegiatan: 'Telat isi logbook' }).error, /lewat batas/);
});
```

- [ ] **Step 3: Jalankan dan pastikan gagal**

Run: `node --test tests/api-peserta.test.js`
Expected: FAIL dengan `TypeError: gas.ctx.doGet is not a function`

- [ ] **Step 4: Buat `apps-script/Auth.js`**

```js
/** Auth.js — verifikasi Google ID token & tentukan role. */
function verifyIdToken_(idToken, clientId) {
  if (!idToken) throw authError_('Kamu belum login.');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var cached = cache.get(key);
  if (cached) {
    var c = JSON.parse(cached);
    if (c.exp > Date.now() / 1000) return c;
  }

  var res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw authError_('Sesi login kedaluwarsa. Silakan login ulang.');

  var claims = checkTokenClaims(JSON.parse(res.getContentText()), clientId, Date.now() / 1000);
  if (!claims.ok) throw authError_(claims.error);

  var ttl = Math.floor(claims.exp - Date.now() / 1000) - 30;
  if (ttl > 0) cache.put(key, JSON.stringify(claims), Math.min(ttl, 21600));
  return claims;
}

function resolveUserOrThrow_(email, today) {
  var r = resolveRole(email, readAll_(SHEETS.ADMIN), readAll_(SHEETS.PESERTA), today);
  if (!r.ok) throw userError_(r.error, 'FORBIDDEN');
  return r;
}
```

- [ ] **Step 5: Buat `apps-script/Files.js`**

```js
/** Files.js — simpan upload base64 ke folder Drive. */
var MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };

/** @return {{url: string, id: string}} */
function saveUpload_(file, kind, folderId, baseName) {
  var v = validateUpload(file, kind);
  if (!v.ok) throw userError_(v.error);
  var bytes = Utilities.base64Decode(stripDataUrl(file.base64));
  var blob = Utilities.newBlob(bytes, file.mime, baseName + MIME_EXT[file.mime]);
  var f = DriveApp.getFolderById(folderId).createFile(blob);
  return { url: f.getUrl(), id: f.getId() };
}

function trashFile_(id) {
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { console.warn('Gagal hapus file ' + id, e); }
}
```

- [ ] **Step 6: Buat `apps-script/Api.js` (sementara hanya handler peserta)**

```js
/** Api.js — entry point Web App. Semua request: POST {action, idToken, data}. */
function doGet() {
  return json_({ ok: true, data: 'presensi-api' });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { ok: true, data: route_(req) };
  } catch (err) {
    if (!err.userMessage) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: err.userMessage || 'Terjadi kesalahan di server. Coba lagi.', code: err.code || 'SERVER' };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handlers_() {
  return {
    'me': { role: 'any', fn: handleMe_ },
    'absen.checkin': { role: 'peserta', fn: handleCheckIn_ },
    'absen.checkout': { role: 'peserta', fn: handleCheckOut_ },
    'absen.riwayat': { role: 'peserta', fn: handleRiwayat_ },
    'logbook.list': { role: 'peserta', fn: handleLogbookList_ },
    'logbook.save': { role: 'peserta', fn: handleLogbookSave_ }
  };
}

function route_(req) {
  var handler = handlers_()[req.action];
  if (!handler) throw userError_('Aksi tidak dikenal: ' + req.action);
  var config = readConfig_();
  var claims = verifyIdToken_(req.idToken, config.googleClientId);
  var now = nowParts_();
  var user = resolveUserOrThrow_(claims.email, now.tanggal);
  if (handler.role !== 'any' && handler.role !== user.role) throw userError_('Kamu tidak punya akses ke fitur ini.', 'FORBIDDEN');
  return handler.fn({ user: user, data: req.data || {}, config: config, now: now });
}

function requireMonth_(bulan) {
  if (!isValidMonth(bulan)) throw userError_('Format bulan harus YYYY-MM.');
  return monthBounds(bulan);
}

function num_(v) {
  return v === null || v === undefined || v === '' ? NaN : Number(v);
}
```

- [ ] **Step 7: Buat `apps-script/HandlersPeserta.js`**

```js
/** HandlersPeserta.js — me, absen masuk/pulang, riwayat, logbook. */
function handleMe_(ctx) {
  var c = ctx.config;
  var out = {
    email: ctx.user.email, nama: ctx.user.nama, role: ctx.user.role,
    today: ctx.now.tanggal, jam: ctx.now.jam,
    config: { jamMasuk: c.jamMasuk, batasTelat: c.batasTelat, radiusMeter: c.radiusMeter, batasEditLogbookHari: c.batasEditLogbookHari }
  };
  if (ctx.user.role === 'peserta') {
    var row = findAbsensi_(ctx.user.email, ctx.now.tanggal);
    out.absensiHariIni = row ? stripRow_(row) : null;
  }
  return out;
}

function handleCheckIn_(ctx) {
  var d = ctx.data, u = ctx.user, c = ctx.config, now = ctx.now;
  var input = {
    status: d.status, mode: d.mode, lat: num_(d.lat), lng: num_(d.lng), accuracy: num_(d.accuracy),
    hasSelfie: !!(d.selfie && d.selfie.base64), hasSurat: !!(d.surat && d.surat.base64)
  };
  // Validasi cepat di luar lock (gagal cepat tanpa upload).
  var v = validateCheckIn(input, findAbsensi_(u.email, now.tanggal), c);
  if (!v.ok) throw userError_(v.error);

  var base = now.tanggal + '_' + u.email;
  var file = input.status === 'Masuk'
    ? saveUpload_(d.selfie, 'selfie', c.folderId, base + '_masuk')
    : saveUpload_(d.surat, 'surat', c.folderId, base + '_' + input.status.toLowerCase());

  return withLock_(function () {
    var recheck = validateCheckIn(input, findAbsensi_(u.email, now.tanggal), c);
    if (!recheck.ok) { trashFile_(file.id); throw userError_(recheck.error); }
    var row = { id: Utilities.getUuid(), email: u.email, tanggal: now.tanggal, status: input.status, catatan: sanitizeText(d.catatan, 500) };
    if (input.status === 'Masuk') {
      row.jam_masuk = now.jam;
      row.mode = input.mode;
      row.lat_masuk = input.lat; row.lng_masuk = input.lng;
      row.akurasi_masuk = Math.round(input.accuracy); row.jarak_masuk = recheck.distance;
      row.flags = recheck.flags.join(',');
      row.link_selfie_masuk = file.url;
    } else {
      row.link_surat = file.url;
    }
    insert_(SHEETS.ABSENSI, row);
    return row;
  });
}

function handleCheckOut_(ctx) {
  var d = ctx.data, u = ctx.user, c = ctx.config, now = ctx.now;
  var input = { lat: num_(d.lat), lng: num_(d.lng), accuracy: num_(d.accuracy), hasSelfie: !!(d.selfie && d.selfie.base64) };
  var v = validateCheckOut(input, findAbsensi_(u.email, now.tanggal), c);
  if (!v.ok) throw userError_(v.error);

  var file = saveUpload_(d.selfie, 'selfie', c.folderId, now.tanggal + '_' + u.email + '_pulang');

  return withLock_(function () {
    var existing = findAbsensi_(u.email, now.tanggal);
    var recheck = validateCheckOut(input, existing, c);
    if (!recheck.ok) { trashFile_(file.id); throw userError_(recheck.error); }
    existing.jam_pulang = now.jam;
    existing.lat_pulang = input.lat; existing.lng_pulang = input.lng;
    existing.akurasi_pulang = Math.round(input.accuracy); existing.jarak_pulang = recheck.distance;
    var flags = existing.flags ? existing.flags.split(',') : [];
    recheck.flags.forEach(function (f) { if (flags.indexOf(f + '_PULANG') < 0) flags.push(f + '_PULANG'); });
    existing.flags = flags.join(',');
    existing.link_selfie_pulang = file.url;
    update_(SHEETS.ABSENSI, existing._row, existing);
    return stripRow_(existing);
  });
}

function handleRiwayat_(ctx) {
  var b = requireMonth_(ctx.data.bulan);
  return readAll_(SHEETS.ABSENSI)
    .filter(function (r) { return r.email === ctx.user.email && r.tanggal >= b.first && r.tanggal <= b.last; })
    .sort(function (a, z) { return a.tanggal < z.tanggal ? 1 : -1; })
    .map(stripRow_);
}

function handleLogbookList_(ctx) {
  var b = requireMonth_(ctx.data.bulan);
  var batas = ctx.config.batasEditLogbookHari;
  return readAll_(SHEETS.LOGBOOK)
    .filter(function (r) { return r.email === ctx.user.email && r.tanggal >= b.first && r.tanggal <= b.last; })
    .sort(function (a, z) { return a.tanggal < z.tanggal ? 1 : -1; })
    .map(function (r) {
      var out = stripRow_(r);
      var age = daysBetween(r.tanggal, ctx.now.tanggal);
      out.bisaEdit = age >= 0 && age <= batas;
      return out;
    });
}

function handleLogbookSave_(ctx) {
  var d = ctx.data, u = ctx.user, c = ctx.config, now = ctx.now;
  var v = validateLogbook({ tanggal: d.tanggal, kegiatan: d.kegiatan }, now.tanggal, c.batasEditLogbookHari);
  if (!v.ok) throw userError_(v.error);

  var file = null;
  if (d.lampiran && d.lampiran.base64) {
    file = saveUpload_(d.lampiran, 'lampiran', c.folderId, d.tanggal + '_' + u.email + '_logbook');
  }

  return withLock_(function () {
    var existing = readAll_(SHEETS.LOGBOOK).filter(function (r) { return r.email === u.email && r.tanggal === d.tanggal; })[0];
    if (existing) {
      existing.kegiatan = v.kegiatan;
      if (file) existing.link_lampiran = file.url;
      existing.diubah = now.iso;
      update_(SHEETS.LOGBOOK, existing._row, existing);
      return stripRow_(existing);
    }
    var row = { id: Utilities.getUuid(), email: u.email, tanggal: d.tanggal, kegiatan: v.kegiatan,
      link_lampiran: file ? file.url : '', dibuat: now.iso, diubah: now.iso };
    insert_(SHEETS.LOGBOOK, row);
    return row;
  });
}
```

- [ ] **Step 8: Jalankan dan pastikan lulus**

Run: `node --test tests/setup.test.js tests/api-peserta.test.js`
Expected: `# pass 13`, `# fail 0`. Log `Error: Config kantor_lat harus angka...` di output itu memang disengaja, karena berasal dari test "config belum diisi".

- [ ] **Step 9: Commit**

```bash
git add apps-script tests/helpers/fixtures.js tests/api-peserta.test.js
git commit -m "feat(gas): token auth, drive upload, API router & peserta handlers"
```

---

### Task 10: Apps Script — handler admin

**Files:**
- Create: `apps-script/HandlersAdmin.js`
- Modify: `apps-script/Api.js` (fungsi `handlers_`)
- Test: `tests/api-admin.test.js`

- [ ] **Step 1: Tulis test yang gagal**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { SELFIE, setupGas } = require('./helpers/fixtures');

test('peserta tidak bisa akses aksi admin', () => {
  const gas = setupGas();
  assert.equal(gas.call('admin.rekap', 'tok-ani', { bulan: '2026-10' }).code, 'FORBIDDEN');
});

test('admin.harian & admin.rekap', () => {
  const gas = setupGas();
  gas.call('absen.checkin', 'tok-ani', { status: 'Masuk', mode: 'WFH', selfie: SELFIE, lat: -8.1, lng: 112.7, accuracy: 20 });
  const harian = gas.call('admin.harian', 'tok-admin', { tanggal: '2026-10-07' }).data;
  assert.equal(harian.length, 1);
  assert.equal(harian[0].absensi.mode, 'WFH');
  const rekap = gas.call('admin.rekap', 'tok-admin', { bulan: '2026-10' }).data;
  assert.equal(rekap[0].hadir, 1);
  assert.equal(rekap[0].wfh, 1);
  assert.match(gas.call('admin.harian', 'tok-admin', { tanggal: 'kemarin' }).error, /Tanggal tidak valid/);
});

test('admin.peserta.save insert lalu update (email case-insensitive)', () => {
  const gas = setupGas();
  const saved = gas.call('admin.peserta.save', 'tok-admin', { email: 'Budi@gmail.com', nama: 'Budi', instansi: 'UM', aktif: 'Y', tanggal_mulai: '2026-10-01', tanggal_selesai: '2026-12-31' });
  assert.equal(saved.ok, true, saved.error);
  gas.call('admin.peserta.save', 'tok-admin', { email: 'budi@gmail.com', nama: 'Budi S', instansi: 'UM', aktif: 'N', tanggal_mulai: '2026-10-01', tanggal_selesai: '2026-12-31' });
  const list = gas.call('admin.peserta.list', 'tok-admin', {}).data;
  assert.deepEqual(list.map((p) => [p.nama, p.aktif]), [['Ani', 'Y'], ['Budi S', 'N']]);
  assert.match(gas.call('admin.peserta.save', 'tok-admin', { email: 'x' }).error, /Email tidak valid/);
});

test('admin.logbook menyertakan nama peserta & filter email', () => {
  const gas = setupGas();
  gas.call('logbook.save', 'tok-ani', { tanggal: '2026-10-07', kegiatan: 'Input data pemilih' });
  assert.equal(gas.call('admin.logbook', 'tok-admin', { bulan: '2026-10' }).data[0].nama, 'Ani');
  assert.equal(gas.call('admin.logbook', 'tok-admin', { bulan: '2026-10', email: 'lain@gmail.com' }).data.length, 0);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/api-admin.test.js`
Expected: FAIL 4 test. Contohnya test pertama mendapat code `USER` (pesan "Aksi tidak dikenal: admin.rekap"), padahal yang diharapkan `FORBIDDEN`.

- [ ] **Step 3: Buat `apps-script/HandlersAdmin.js`**

```js
/** HandlersAdmin.js — harian, rekap, kelola peserta, logbook semua peserta. */
function handleAdminHarian_(ctx) {
  var tanggal = ctx.data.tanggal || ctx.now.tanggal;
  if (!isValidDate(tanggal)) throw userError_('Tanggal tidak valid.');
  var absensi = readAll_(SHEETS.ABSENSI).filter(function (r) { return r.tanggal === tanggal; });
  var byEmail = {};
  absensi.forEach(function (r) { byEmail[r.email] = stripRow_(r); });
  var peserta = readAll_(SHEETS.PESERTA).filter(function (p) {
    return isPesertaActive(p, tanggal) || byEmail[String(p.email).toLowerCase()];
  });
  return peserta.map(function (p) {
    var email = String(p.email).toLowerCase();
    return { email: email, nama: p.nama, instansi: p.instansi, absensi: byEmail[email] || null };
  }).sort(function (a, z) { return a.nama.localeCompare(z.nama); });
}

function handleAdminRekap_(ctx) {
  requireMonth_(ctx.data.bulan);
  return buildRekap(readAll_(SHEETS.PESERTA), readAll_(SHEETS.ABSENSI), ctx.data.bulan, ctx.now.tanggal, ctx.config.batasTelat)
    .sort(function (a, z) { return a.nama.localeCompare(z.nama); });
}

function handleAdminPesertaList_() {
  return readAll_(SHEETS.PESERTA).map(stripRow_).sort(function (a, z) { return a.nama.localeCompare(z.nama); });
}

function handleAdminPesertaSave_(ctx) {
  var v = validatePeserta(ctx.data);
  if (!v.ok) throw userError_(v.error);
  return withLock_(function () {
    var existing = readAll_(SHEETS.PESERTA).filter(function (p) { return String(p.email).toLowerCase() === v.peserta.email; })[0];
    if (existing) update_(SHEETS.PESERTA, existing._row, v.peserta);
    else insert_(SHEETS.PESERTA, v.peserta);
    return v.peserta;
  });
}

function handleAdminLogbook_(ctx) {
  var b = requireMonth_(ctx.data.bulan);
  var email = ctx.data.email ? String(ctx.data.email).toLowerCase() : '';
  var nama = {};
  readAll_(SHEETS.PESERTA).forEach(function (p) { nama[String(p.email).toLowerCase()] = p.nama; });
  return readAll_(SHEETS.LOGBOOK)
    .filter(function (r) { return r.tanggal >= b.first && r.tanggal <= b.last && (!email || r.email === email); })
    .sort(function (a, z) { return a.tanggal === z.tanggal ? a.email.localeCompare(z.email) : (a.tanggal < z.tanggal ? 1 : -1); })
    .map(function (r) { var o = stripRow_(r); o.nama = nama[r.email] || r.email; return o; });
}
```

- [ ] **Step 4: Daftarkan aksi admin di `apps-script/Api.js`**

Ganti fungsi `handlers_` dengan:

```js
function handlers_() {
  return {
    'me': { role: 'any', fn: handleMe_ },
    'absen.checkin': { role: 'peserta', fn: handleCheckIn_ },
    'absen.checkout': { role: 'peserta', fn: handleCheckOut_ },
    'absen.riwayat': { role: 'peserta', fn: handleRiwayat_ },
    'logbook.list': { role: 'peserta', fn: handleLogbookList_ },
    'logbook.save': { role: 'peserta', fn: handleLogbookSave_ },
    'admin.harian': { role: 'admin', fn: handleAdminHarian_ },
    'admin.rekap': { role: 'admin', fn: handleAdminRekap_ },
    'admin.peserta.list': { role: 'admin', fn: handleAdminPesertaList_ },
    'admin.peserta.save': { role: 'admin', fn: handleAdminPesertaSave_ },
    'admin.logbook': { role: 'admin', fn: handleAdminLogbook_ }
  };
}
```

- [ ] **Step 5: Jalankan semua test**

Run: `npm test`
Expected: `# pass 55`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add apps-script tests/api-admin.test.js
git commit -m "feat(gas): admin handlers (harian, rekap, peserta, logbook)"
```

---

### Task 11: Deploy backend ke Google & smoke test API

**Files:**
- Create: `README.md`

Task ini manual di akun Google kantor. Tidak ada kode baru selain README.

- [ ] **Step 1: Buat `README.md`**

````markdown
# Presensi Magang — Bawaslu Malang

Web presensi peserta magang tanpa server sendiri.

- **Frontend**: HTML/JS statis di `web/`, di-host di GitHub Pages.
- **Backend**: Google Apps Script di `apps-script/` sebagai API (Web App).
- **Data**: Google Sheets (Peserta, Absensi, Logbook, Config, Admin).
- **File**: selfie dan surat disimpan di satu folder Google Drive.
- **Login**: Google Sign-In; ID token diverifikasi di Apps Script lalu email dicocokkan ke sheet `Peserta`/`Admin`.

## Development

```bash
npm test                 # unit + integration test (Node 22, tanpa install)
npm install              # hanya untuk e2e
npx playwright install chromium
npm run test:e2e         # smoke test UI di Chromium headless (semua API dipalsukan)
npm run dev              # serve web/ di http://localhost:5500
```

## Deploy backend (sekali)

Pakai akun Google milik kantor/admin (bukan akun pribadi peserta), karena semua data dan file disimpan atas nama akun ini.

1. Buat Google Sheet baru, misalnya "Presensi Magang Bawaslu".
2. Di Sheet: **Extensions → Apps Script**. Buat file dengan nama dan isi yang sama seperti di `apps-script/`: `Core`, `Errors`, `Repo`, `Setup`, `Auth`, `Files`, `Api`, `HandlersPeserta`, `HandlersAdmin`. Hapus `Code.gs` bawaan.
3. **Project Settings → centang "Show appsscript.json"**, lalu ganti isinya dengan `apps-script/appsscript.json`.
4. Pilih fungsi `setupSheets` lalu **Run**. Setujui izin akses. Sheet `Peserta`, `Absensi`, `Logbook`, `Config`, dan `Admin` akan terbentuk.
5. Buat folder di Google Drive, misalnya "Presensi - Bukti". Ambil ID-nya dari URL (`drive.google.com/drive/folders/<ID>`). **Share folder ini ke email admin (Viewer)** supaya admin bisa membuka selfie dan surat.
6. Buat OAuth Client ID:
   1. Buka https://console.cloud.google.com/ lalu buat project baru.
   2. Masuk ke **APIs & Services → OAuth consent screen**. Pilih External, isi nama aplikasi dan email. Scope cukup default (email, profile, openid). Lalu **Publish app**. Kalau masih mode Testing, hanya test user yang bisa login.
   3. Masuk ke **Credentials → Create credentials → OAuth client ID → Web application**.
   4. Isi **Authorized JavaScript origins** dengan `https://<username>.github.io` dan `http://localhost:5500`.
   5. Salin Client ID-nya.
7. Isi sheet `Config`:
   - `kantor_lat` dan `kantor_lng`: di Google Maps, klik kanan titik kantor, lalu klik koordinatnya untuk menyalin.
   - `radius_meter`, `jam_masuk`, `batas_telat`, `batas_edit_logbook_hari`, `max_akurasi_meter`.
   - `folder_id`: dari langkah 5.
   - `google_client_id`: dari langkah 6.
8. Isi sheet `Admin` (email, nama). Peserta bisa ditambahkan nanti dari menu Admin → Peserta.
9. Jalankan fungsi `checkSetup` dan pastikan log menampilkan `Setup OK`.
10. **Deploy → New deployment → Web app**. Isi Execute as: **Me**, Who has access: **Anyone**. Salin URL `/exec`-nya.
11. Cek dari terminal:
    ```bash
    curl -sL "<URL_EXEC>"
    # {"ok":true,"data":"presensi-api"}
    curl -sL -H 'Content-Type: text/plain' -d '{"action":"me"}' "<URL_EXEC>"
    # {"ok":false,"error":"Kamu belum login.","code":"AUTH"}
    ```

**Update kode backend:** tempel perubahan di editor, lalu buka **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Dengan cara ini URL-nya tetap sama. Jangan pakai "New deployment", karena URL-nya akan berubah.

## Deploy frontend

1. Isi `web/config.js` dengan `API_URL` (dari langkah 10) dan `GOOGLE_CLIENT_ID` (dari langkah 6).
2. Push repo ke GitHub, lalu buka **Settings → Pages → Source: GitHub Actions**.
3. Setiap push ke `main` akan menjalankan `npm test` lalu deploy folder `web/` ke `https://<username>.github.io/<repo>/`.

Kedua nilai di `web/config.js` bukan rahasia: Client ID memang publik, dan API selalu memverifikasi token.

## Batasan yang diketahui

- Fake GPS tidak bisa dideteksi 100% tanpa server sendiri. Mitigasinya: selfie live (bukan dari galeri), jam dari server, dan flag `AKURASI_RENDAH`.
- Kuota Apps Script cukup untuk puluhan peserta. Kalau sudah ratusan, pertimbangkan pindah ke backend sendiri.
- Hari kerja di rekap = Senin–Jumat. Hari libur nasional belum dikecualikan.
````

- [ ] **Step 2: Jalankan langkah "Deploy backend" nomor 1–10 di README**

Checklist: Sheet dibuat → semua file `apps-script/` ditempel → `setupSheets` dijalankan → folder Drive dibuat dan di-share ke admin → OAuth Client ID dibuat (origin `http://localhost:5500` + `https://<username>.github.io`) → `Config` dan `Admin` diisi → `checkSetup` menampilkan `Setup OK` → Web App di-deploy.

- [ ] **Step 3: Smoke test API**

Run:
```bash
curl -sL "<URL_EXEC>"
curl -sL -H 'Content-Type: text/plain' -d '{"action":"me"}' "<URL_EXEC>"
```
Expected:
```
{"ok":true,"data":"presensi-api"}
{"ok":false,"error":"Kamu belum login.","code":"AUTH"}
```
Kalau yang muncul HTML halaman login Google, berarti deployment belum di-set **Who has access: Anyone**.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: deploy guide"
```

---

### Task 12: Frontend — shell HTML, CSS, helper UI, CSV

**Files:**
- Create: `web/package.json`, `web/index.html`, `web/config.js`, `web/css/style.css`, `web/js/ui.js`, `web/js/csv.js`
- Test: `tests/web-csv.test.mjs`

- [ ] **Step 1: Tulis test yang gagal**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../web/js/csv.js';

test('csvCell: escape koma, kutip, newline', () => {
  assert.equal(csvCell('biasa'), 'biasa');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('kata "kutip"'), '"kata ""kutip"""');
  assert.equal(csvCell('baris1\nbaris2'), '"baris1\nbaris2"');
  assert.equal(csvCell(null), '');
});

test('csvCell: cegah formula injection, angka negatif aman', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+62812'), "'+62812");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('-7.9666'), '-7.9666');
});

test('toCsv: header + baris pakai CRLF', () => {
  const csv = toCsv([{ nama: 'Ani', hadir: 3 }], [{ label: 'Nama', key: 'nama' }, { label: 'Hadir', key: 'hadir' }]);
  assert.equal(csv, 'Nama,Hadir\r\nAni,3');
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/web-csv.test.mjs`
Expected: FAIL dengan `ERR_MODULE_NOT_FOUND` untuk `web/js/csv.js`

- [ ] **Step 3: Buat `web/package.json`**

File ini membuat Node memperlakukan `web/**/*.js` sebagai ES module, jadi test bisa `import`. GitHub Pages mengabaikannya.

```json
{ "type": "module" }
```

- [ ] **Step 4: Buat `web/js/csv.js`**

```js
// CSV aman: escape kutip/koma/newline + cegah formula injection (=, +, @, -teks).
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+@\t\r]/.test(s) || /^-[^\d.]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ label, key }] */
export function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(','));
  return [head, ...body].join('\r\n');
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM biar Excel baca UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 5: Jalankan dan pastikan lulus**

Run: `node --test tests/web-csv.test.mjs`
Expected: `# pass 3`, `# fail 0`

- [ ] **Step 6: Buat `web/config.js`**

Nilainya diisi di Task 17.

```js
// Isi setelah deploy (lihat README bagian Deploy).
export const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/GANTI_DEPLOYMENT_ID/exec',
  GOOGLE_CLIENT_ID: 'GANTI_CLIENT_ID.apps.googleusercontent.com',
};
```

- [ ] **Step 7: Buat `web/index.html`**

```html
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>Presensi Magang · Bawaslu Malang</title>
  <link rel="stylesheet" href="css/style.css">
  <script src="https://accounts.google.com/gsi/client" async></script>
  <script type="module" src="js/main.js"></script>
</head>
<body>
  <div id="app" class="container"></div>
  <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
  <noscript>Aktifkan JavaScript untuk memakai aplikasi ini.</noscript>
</body>
</html>
```

- [ ] **Step 8: Buat `web/css/style.css`**

```css
:root {
  --bg: #f4f6f9; --card: #ffffff; --text: #1d2433; --muted: #667085; --border: #e3e7ee;
  --primary: #b3261e; --primary-text: #ffffff; --success: #1a7f37; --error: #c62828; --warn: #b26a00;
  --radius: 12px;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.container { max-width: 960px; margin: 0 auto; padding: 0 16px 48px; }
h1 { font-size: 1.5rem; margin: .5rem 0; } h3 { font-size: 1rem; margin: 0 0 .5rem; }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
.tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 12px; }
.tabs button { border: 0; background: transparent; padding: 8px 14px; border-radius: 999px; font: inherit; color: var(--muted); cursor: pointer; white-space: nowrap; }
.tabs button.active { background: var(--primary); color: var(--primary-text); }
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 12px; }
.center { text-align: center; } .muted { color: var(--muted); } .small { font-size: .85rem; }
.error { color: var(--error); } .success { color: var(--success); } .warn { color: var(--warn); }
.hidden { display: none !important; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.btn { border: 1px solid var(--border); background: var(--card); color: var(--text); padding: 10px 16px; border-radius: 10px; font: inherit; cursor: pointer; min-height: 44px; }
.btn.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
.btn.ghost { background: transparent; } .btn.small { min-height: 32px; padding: 4px 10px; font-size: .85rem; }
.btn.block { width: 100%; } .btn:disabled { opacity: .5; cursor: not-allowed; }
.seg { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.seg button { flex: 1; border: 0; background: var(--card); padding: 10px; font: inherit; cursor: pointer; min-height: 44px; }
.seg button.active { background: var(--primary); color: var(--primary-text); }
input, textarea, select { width: 100%; font: inherit; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: #fff; }
label { display: block; margin-bottom: 8px; }
.cam { width: 100%; max-width: 360px; border-radius: 10px; background: #000; display: block; margin: 0 auto 8px; transform: scaleX(-1); }
img.cam { transform: none; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: var(--card); font-size: .9rem; }
th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { background: #f0f2f6; white-space: nowrap; }
.badge { display: inline-block; white-space: nowrap; padding: 2px 8px; border-radius: 999px; font-size: .8rem; background: #eef1f6; }
.badge.Masuk { background: #e6f4ea; color: var(--success); } .badge.Izin { background: #fff4e5; color: var(--warn); }
.badge.Sakit { background: #fdecea; color: var(--error); } .badge.Belum { background: #eef1f6; color: var(--muted); }
.toast { position: fixed; left: 16px; right: 16px; bottom: 16px; max-width: 480px; margin: 0 auto; padding: 12px 16px; border-radius: 10px; background: #1d2433; color: #fff; z-index: 10; }
.toast.error { background: var(--error); } .toast.success { background: var(--success); }
@media print {
  .topbar, .tabs, .no-print, .toast { display: none !important; }
  body { background: #fff; } .card { border: 0; padding: 0; }
}
```

- [ ] **Step 9: Buat `web/js/ui.js`**

```js
// Helper DOM kecil. Selalu pakai textContent (lewat h) → aman dari XSS.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
}

let toastTimer = null;
export function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), type === 'error' ? 6000 : 3000);
}

export function setBusy(btn, busy, busyLabel = 'Memproses...') {
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.textContent = busyLabel;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
  }
}

export function safeUrl(url) {
  return /^https:\/\//.test(String(url || '')) ? url : null;
}

export function link(url, label) {
  const href = safeUrl(url);
  return href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label) : '';
}

export function monthOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function formatTanggal(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return String(dateStr);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[dow]}, ${String(d).padStart(2, '0')} ${BULAN[m - 1]} ${y}`;
}

export function segmented(options, initial, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
  options.forEach((opt) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(opt === initial), class: opt === initial ? 'active' : '' }, opt);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => { x.classList.remove('active'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('active');
      b.setAttribute('aria-checked', 'true');
      onChange(opt);
    });
    wrap.append(b);
  });
  return wrap;
}

/** columns: [{ label, key } | { label, render: (row) => Node|string }] */
export function table(columns, rows) {
  return h('div', { class: 'table-wrap' },
    h('table', {},
      h('thead', {}, h('tr', {}, columns.map((c) => h('th', {}, c.label)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, columns.map((c) => h('td', {}, c.render ? c.render(r) : (r[c.key] ?? '')))))),
    ));
}

export function badge(status) {
  return h('span', { class: `badge ${status || 'Belum'}` }, status || 'Belum absen');
}

/** Tab sederhana. render(el) boleh mengembalikan fungsi cleanup (mis. matikan kamera). */
export function tabs(container, defs) {
  const nav = h('nav', { class: 'tabs' });
  const body = h('div');
  let cleanup = null;
  const show = (id) => {
    if (typeof cleanup === 'function') cleanup();
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    clear(body);
    cleanup = defs.find((d) => d.id === id).render(body);
  };
  defs.forEach((d) => nav.append(h('button', { type: 'button', 'data-tab': d.id, onclick: () => show(d.id) }, d.label)));
  container.append(nav, body);
  show(defs[0].id);
}

/** Muat data async ke dalam `out` dengan state loading/error. */
export async function loadInto(out, loader, renderRows) {
  out.replaceChildren(h('p', { class: 'muted' }, 'Memuat...'));
  try {
    const data = await loader();
    out.replaceChildren(renderRows(data));
  } catch (e) {
    out.replaceChildren(h('p', { class: 'error' }, e.message));
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add web tests/web-csv.test.mjs
git commit -m "feat(web): html shell, styles, ui helpers, safe csv export"
```

---

### Task 13: Frontend — auth, API client, GPS, kamera, file

**Files:**
- Create: `web/js/auth.js`, `web/js/api.js`, `web/js/geo.js`, `web/js/camera.js`, `web/js/file.js`
- Test: `tests/web-auth.test.mjs`

Hal penting di task ini:
- **Token** disimpan di `sessionStorage` (hilang saat tab ditutup), dengan fallback ke memori kalau storage diblokir. Token dianggap habis 1 menit sebelum `exp`.
- **Response `AUTH`** dari server memicu event `auth-expired`, lalu `main.js` menampilkan halaman login lagi.
- **`fetch`** memakai `Content-Type: text/plain`. Ini sengaja: dengan `application/json` browser akan mengirim preflight OPTIONS yang tidak didukung Apps Script.

- [ ] **Step 1: Tulis test yang gagal**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt } from '../web/js/auth.js';

test('decodeJwt: payload base64url + UTF-8', () => {
  const payload = { email: 'ani@gmail.com', name: 'Ani Sêtya', exp: 123 };
  const b64url = Buffer.from(JSON.stringify(payload)).toString('base64url');
  assert.deepEqual(decodeJwt(`xx.${b64url}.yy`), payload);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Run: `node --test tests/web-auth.test.mjs`
Expected: FAIL dengan `ERR_MODULE_NOT_FOUND` untuk `web/js/auth.js`

- [ ] **Step 3: Buat `web/js/auth.js`**

```js
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
```

- [ ] **Step 4: Jalankan dan pastikan lulus**

Run: `node --test tests/web-auth.test.mjs`
Expected: `# pass 1`, `# fail 0`

- [ ] **Step 5: Buat `web/js/api.js`**

```js
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
```

- [ ] **Step 6: Buat `web/js/geo.js`**

```js
const GEO_MESSAGES = {
  1: 'Izin lokasi ditolak. Buka pengaturan browser → Izin situs → Lokasi → Izinkan, lalu muat ulang halaman.',
  2: 'Lokasi tidak tersedia. Nyalakan GPS/Lokasi di HP kamu lalu coba lagi.',
  3: 'Membaca lokasi terlalu lama. Pastikan GPS aktif lalu coba lagi.',
};

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Browser ini tidak mendukung GPS.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (err) => reject(new Error(GEO_MESSAGES[err.code] || 'Gagal membaca lokasi.')),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}
```

- [ ] **Step 7: Buat `web/js/camera.js`**

Kamera hanya bisa diakses lewat HTTPS atau localhost. GitHub Pages sudah HTTPS.

```js
export async function openCamera(videoEl) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser tidak mendukung kamera. Pakai Chrome atau Safari versi terbaru.');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false });
    videoEl.muted = true;
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('Izin kamera ditolak. Buka pengaturan browser → Izin situs → Kamera → Izinkan, lalu muat ulang.');
    if (e.name === 'NotFoundError') throw new Error('Kamera tidak ditemukan di perangkat ini.');
    throw new Error(`Kamera gagal dibuka: ${e.message}`);
  }
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Ambil frame video → JPEG base64 (tanpa prefix data URL), lebar maks 640px. */
export function captureFrame(videoEl, maxWidth = 640, quality = 0.7) {
  const scale = Math.min(1, maxWidth / videoEl.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(videoEl.videoWidth * scale);
  canvas.height = Math.round(videoEl.videoHeight * scale);
  canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return { mime: 'image/jpeg', base64: canvas.toDataURL('image/jpeg', quality).split(',')[1] };
}
```

- [ ] **Step 8: Buat `web/js/file.js`**

```js
const MAX_BYTES = 2 * 1024 * 1024;

function readBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Gagal membaca file.'));
    r.readAsDataURL(blob);
  });
}

async function compressImage(file, maxWidth = 1280, quality = 0.75) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
  if (base64.length * 0.75 > MAX_BYTES) throw new Error('Gambar terlalu besar walau sudah dikompres. Coba foto ulang.');
  return { mime: 'image/jpeg', name: file.name, base64 };
}

/** File input → { mime, name, base64 }. Gambar dikompres, PDF maks 2 MB. */
export async function prepareUpload(file) {
  if (!file) throw new Error('Pilih file dulu.');
  if (file.type === 'application/pdf') {
    if (file.size > MAX_BYTES) throw new Error('PDF maksimal 2 MB.');
    return { mime: file.type, name: file.name, base64: await readBase64(file) };
  }
  if (file.type === 'image/jpeg' || file.type === 'image/png') return compressImage(file);
  throw new Error('Format harus JPG, PNG, atau PDF.');
}
```

- [ ] **Step 9: Jalankan semua test**

Run: `npm test`
Expected: `# pass 59`, `# fail 0`

- [ ] **Step 10: Commit**

```bash
git add web/js tests/web-auth.test.mjs
git commit -m "feat(web): google sign-in, api client, gps, camera, upload prep"
```

---

### Task 14: Frontend — boot & aplikasi peserta (+ smoke test e2e)

**Files:**
- Create: `tests/e2e/smoke.cjs`, `web/js/main.js`, `web/js/app-peserta.js`, `web/js/app-admin.js` (stub sementara)

Smoke test menjalankan web di Chromium headless dengan Google Sign-In, Apps Script, GPS, dan kamera yang dipalsukan. Test ini juga gagal kalau ada error JS di console.

- [ ] **Step 1: Install Playwright (sekali)**

```bash
npm install
npx playwright install chromium
```

- [ ] **Step 2: Tulis smoke test**

```js
// Smoke test UI: Chromium headless + Google Sign-In, API Apps Script, GPS & kamera dipalsukan.
// Jalankan: npm run test:e2e  (butuh devDependency playwright; set CHROMIUM_PATH kalau pakai Chromium sistem)
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(__dirname, '..', '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64u({ alg: 'none' })}.${b64u({ email: 'x@gmail.com', exp: 4102444800 })}.sig`;
const FAKE_GSI = `window.google={accounts:{id:{initialize(o){window.__gsi=o},renderButton(el){const b=document.createElement('button');b.id='fake-google';b.textContent='Login Google';b.onclick=()=>window.__gsi.callback({credential:${JSON.stringify(TOKEN)}});el.append(b)},prompt(){},disableAutoSelect(){}}}};`;

let role = 'peserta';
let absensi = null;
const logbook = [];
const cfg = { jamMasuk: '07:30', batasTelat: '08:00', radiusMeter: 100, batasEditLogbookHari: 1 };
function handle(action, data) {
  switch (action) {
    case 'me': return { email: 'x@gmail.com', nama: role === 'admin' ? 'Pak Admin' : 'Ani', role, today: '2026-10-07', jam: '07:15:00', config: cfg, absensiHariIni: role === 'peserta' ? absensi : undefined };
    case 'absen.checkin':
      if (!data.selfie?.base64 || typeof data.lat !== 'number') throw new Error('payload checkin tidak lengkap');
      absensi = { status: data.status, mode: data.mode, jam_masuk: '07:15:00', jam_pulang: '' }; return absensi;
    case 'absen.checkout': absensi = { ...absensi, jam_pulang: '16:00:00' }; return absensi;
    case 'absen.riwayat': return absensi ? [{ tanggal: '2026-10-07', ...absensi }] : [];
    case 'logbook.save': logbook.push({ tanggal: data.tanggal, kegiatan: data.kegiatan, bisaEdit: true, link_lampiran: '' }); return logbook.at(-1);
    case 'logbook.list': return logbook;
    case 'admin.harian': return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', absensi: { status: 'Masuk', mode: 'WFO', jam_masuk: '07:15:00', jarak_masuk: '11', flags: 'AKURASI_RENDAH', lat_masuk: '-7.9667', lng_masuk: '112.6326', link_selfie_masuk: 'https://drive.google.com/file/d/1' } }, { email: 'b@gmail.com', nama: 'Budi', instansi: 'UM', absensi: null }];
    case 'admin.rekap': return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', hariKerja: 5, hadir: 4, wfo: 3, wfh: 1, izin: 0, sakit: 1, telat: 1, tanpaKeterangan: 0 }];
    case 'admin.peserta.list': return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', aktif: 'Y', tanggal_mulai: '2026-09-01', tanggal_selesai: '2026-12-31' }];
    case 'admin.peserta.save': return data;
    case 'admin.logbook': return [{ tanggal: '2026-10-07', nama: 'Ani', email: 'ani@gmail.com', kegiatan: '=cmd', link_lampiran: '' }];
    default: throw new Error('aksi ' + action);
  }
}

(async () => {
  await new Promise((r) => server.listen(5500, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['geolocation', 'camera'], geolocation: { latitude: -7.9666, longitude: 112.6326, accuracy: 12 }, acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_GSI }));
  await page.route('https://script.google.com/**', async (r) => {
    const req = JSON.parse(r.request().postData());
    if (req.idToken !== TOKEN) return r.fulfill({ json: { ok: false, error: 'no token', code: 'AUTH' } });
    try { r.fulfill({ json: { ok: true, data: handle(req.action, req.data) } }); }
    catch (e) { errors.push('mock: ' + e.message); r.fulfill({ json: { ok: false, error: e.message, code: 'USER' } }); }
  });

  const step = (s) => console.log('✓', s);
  await page.goto('http://localhost:5500/');
  await page.click('#fake-google'); step('login');
  await page.getByText('Lokasi terbaca').waitFor(); step('gps terbaca');
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0); step('kamera aktif');
  await page.screenshot({ path: path.join(OUT, 'shot-checkin.png'), fullPage: true });
  await page.click('text=Ambil Foto');
  await page.click('text=Kirim Absen Masuk');
  await page.getByRole('heading', { name: 'Absen Pulang' }).waitFor(); step('checkin → form pulang');
  await page.getByText('Lokasi terbaca').waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  await page.click('text=Ambil Foto');
  await page.click('text=Kirim Absen Pulang');
  await page.getByText('Presensi hari ini sudah lengkap').waitFor(); step('checkout selesai');
  await page.click('nav >> text=Riwayat');
  await page.getByText('Rab, 07 Okt 2026').waitFor(); step('riwayat');
  await page.click('nav >> text=Logbook');
  await page.fill('textarea', 'Input data pemilih di sistem');
  await page.click('text=Simpan Logbook');
  await page.getByRole('cell', { name: 'Input data pemilih di sistem' }).waitFor(); step('logbook simpan');
  // Izin flow on fresh state
  absensi = null; await page.reload(); await page.click('.seg >> text=Izin');
  await page.getByText('Surat / bukti').waitFor(); step('form izin tampil');
  await page.screenshot({ path: path.join(OUT, 'shot-izin.png'), fullPage: true });

  role = 'admin'; await page.click('text=Keluar'); await page.click('#fake-google');
  await page.getByText('1 hadir dari 2 peserta').waitFor(); step('admin harian');
  if (!(await page.getAttribute('a:text("Lokasi")', 'href')).includes('maps?q=-7.9667')) throw new Error('link lokasi salah');
  await page.screenshot({ path: path.join(OUT, 'shot-admin.png'), fullPage: true });
  const dl = page.waitForEvent('download'); await page.click('text=Export CSV'); const d = await dl;
  const csv = fs.readFileSync(await d.path(), 'utf8'); if (!csv.includes('AKURASI_RENDAH')) throw new Error('csv kosong'); step('export csv ' + d.suggestedFilename());
  await page.click('nav >> text=Rekap Bulanan'); await page.getByRole('cell', { name: 'Ani' }).waitFor(); step('rekap');
  await page.click('nav >> text=Peserta'); await page.getByRole('button', { name: 'Edit' }).click();
  if ((await page.inputValue('input[type=email]')) !== 'ani@gmail.com') throw new Error('edit tidak isi form'); 
  await page.click('text=Simpan Peserta'); await page.getByText('Peserta tersimpan.').waitFor(); step('peserta edit+simpan');
  await page.click('nav >> text=Logbook'); await page.getByRole('cell', { name: '=cmd' }).waitFor(); step('admin logbook (teks tidak dieksekusi)');

  await browser.close(); server.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK, tanpa error JS');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
```

- [ ] **Step 3: Jalankan dan pastikan gagal**

Run: `npm run test:e2e`
Expected: `FAIL` di langkah login (timeout menunggu `#fake-google`), karena `main.js` belum ada.

- [ ] **Step 4: Buat `web/js/main.js`**

```js
import { renderLogin, getToken, logout, waitForGsi } from './auth.js';
import { api } from './api.js';
import { h, clear } from './ui.js';
import { mountPeserta } from './app-peserta.js';
import { mountAdmin } from './app-admin.js';

const root = document.getElementById('app');

function showLogin(message) {
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
    if (me.role === 'admin') mountAdmin(main, me);
    else mountPeserta(main, me);
  } catch (e) {
    if (e.code === 'AUTH' || e.code === 'FORBIDDEN') {
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
```

- [ ] **Step 5: Buat stub `web/js/app-admin.js`**

Diganti versi lengkap di Task 15.

```js
export function mountAdmin(main) {
  main.append('Menu admin menyusul.');
}
```

- [ ] **Step 6: Buat `web/js/app-peserta.js`**

```js
import { api } from './api.js';
import { h, clear, toast, setBusy, link, monthOf, formatTanggal, segmented, table, badge, tabs, loadInto } from './ui.js';
import { getPosition } from './geo.js';
import { openCamera, stopCamera, captureFrame } from './camera.js';
import { prepareUpload } from './file.js';

export function mountPeserta(main, me) {
  tabs(main, [
    { id: 'presensi', label: 'Presensi', render: (el) => renderPresensi(el, me) },
    { id: 'riwayat', label: 'Riwayat', render: (el) => renderRiwayat(el, me) },
    { id: 'logbook', label: 'Logbook', render: (el) => renderLogbook(el, me) },
  ]);
}

/* ---------------- Presensi ---------------- */

function renderPresensi(el, me) {
  let cleanup = null;
  const rerender = () => {
    cleanup?.();
    clear(el);
    cleanup = draw();
  };
  const draw = () => {
    el.append(h('p', { class: 'muted' }, `${formatTanggal(me.today)} · Jam masuk ${me.config.jamMasuk}, batas telat ${me.config.batasTelat}`));
    const row = me.absensiHariIni;
    if (!row) return checkInForm(el, me, rerender);
    el.append(statusCard(row));
    if (row.status === 'Masuk' && !row.jam_pulang) {
      el.append(h('h3', {}, 'Absen Pulang'));
      return captureFlow(el, {
        submitLabel: 'Kirim Absen Pulang',
        onSubmit: async (payload) => {
          me.absensiHariIni = await api('absen.checkout', payload);
          toast('Absen pulang tercatat. Hati-hati di jalan!', 'success');
          rerender();
        },
      });
    }
    el.append(h('p', { class: 'success' }, 'Presensi hari ini sudah lengkap. Jangan lupa isi logbook!'));
    return null;
  };
  cleanup = draw();
  return () => cleanup?.();
}

function statusCard(row) {
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, badge(row.status), row.mode ? h('span', { class: 'badge' }, row.mode) : null),
    row.status === 'Masuk'
      ? h('p', {}, `Masuk ${row.jam_masuk || '-'} · Pulang ${row.jam_pulang || '-'}`)
      : h('p', {}, 'Surat: ', link(row.link_surat, 'lihat file')),
    row.catatan ? h('p', { class: 'muted small' }, row.catatan) : null);
}

function checkInForm(el, me, done) {
  let status = 'Masuk';
  let mode = 'WFO';
  let flowCleanup = null;
  const area = h('div');
  const catatan = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Catatan (opsional)' });

  el.append(h('div', { class: 'card' }, h('h3', {}, 'Keterangan'),
    segmented(['Masuk', 'Izin', 'Sakit'], status, (v) => { status = v; drawArea(); })), area);

  function drawArea() {
    flowCleanup?.();
    flowCleanup = null;
    clear(area);
    if (status === 'Masuk') {
      area.append(
        h('div', { class: 'card' }, h('h3', {}, 'Mode kerja'),
          segmented(['WFO', 'WFH'], mode, (v) => { mode = v; }),
          h('p', { class: 'muted small' }, `WFO wajib dalam radius ${me.config.radiusMeter} m dari kantor.`)),
        h('div', { class: 'card' }, catatan));
      flowCleanup = captureFlow(area, {
        submitLabel: 'Kirim Absen Masuk',
        getExtra: () => ({ status, mode, catatan: catatan.value }),
        onSubmit: async (payload) => {
          me.absensiHariIni = await api('absen.checkin', payload);
          toast('Absen masuk tercatat.', 'success');
          done();
        },
      });
      return;
    }
    const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf' });
    const btn = h('button', { class: 'btn primary block', type: 'button' }, `Kirim ${status}`);
    btn.addEventListener('click', async () => {
      setBusy(btn, true, 'Mengunggah...');
      try {
        const surat = await prepareUpload(fileInput.files[0]);
        me.absensiHariIni = await api('absen.checkin', { status, surat, catatan: catatan.value });
        toast(`${status} tercatat.`, 'success');
        done();
      } catch (e) {
        toast(e.message, 'error');
        setBusy(btn, false);
      }
    });
    area.append(
      h('div', { class: 'card' }, h('h3', {}, 'Surat / bukti'), h('p', { class: 'muted small' }, 'JPG, PNG, atau PDF maks 2 MB.'), fileInput),
      h('div', { class: 'card' }, catatan),
      btn);
  }

  drawArea();
  return () => flowCleanup?.();
}

/** Lokasi + selfie live + tombol kirim. Return cleanup (matikan kamera). */
function captureFlow(container, { submitLabel, getExtra, onSubmit }) {
  let pos = null;
  let photo = null;
  let stream = null;
  let disposed = false;

  const locText = h('p', { class: 'muted' }, 'Mengambil lokasi...');
  const locBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Perbarui lokasi');
  const video = h('video', { class: 'cam', playsinline: true, autoplay: true, muted: true });
  const preview = h('img', { class: 'cam hidden', alt: 'Preview selfie' });
  const camMsg = h('p', { class: 'error hidden' });
  const shotBtn = h('button', { class: 'btn', type: 'button' }, 'Ambil Foto');
  const retakeBtn = h('button', { class: 'btn ghost hidden', type: 'button' }, 'Ulangi Foto');
  const submitBtn = h('button', { class: 'btn primary block', type: 'button', disabled: true }, submitLabel);

  container.append(
    h('div', { class: 'card' }, h('h3', {}, 'Lokasi'), locText, locBtn),
    h('div', { class: 'card' }, h('h3', {}, 'Selfie'), video, preview, camMsg, h('div', { class: 'row' }, shotBtn, retakeBtn)),
    submitBtn);

  const refresh = () => { submitBtn.disabled = !(pos && photo); };

  async function readLocation() {
    pos = null;
    refresh();
    locText.className = 'muted';
    locText.textContent = 'Mengambil lokasi...';
    try {
      pos = await getPosition();
      locText.textContent = `Lokasi terbaca (akurasi ±${pos.accuracy} m)`;
    } catch (e) {
      locText.className = 'error';
      locText.textContent = e.message;
    }
    refresh();
  }

  async function startCamera() {
    try {
      const s = await openCamera(video);
      if (disposed) return stopCamera(s);
      stream = s;
    } catch (e) {
      camMsg.textContent = e.message;
      camMsg.classList.remove('hidden');
      shotBtn.disabled = true;
    }
  }

  shotBtn.addEventListener('click', () => {
    if (!video.videoWidth) return toast('Kamera belum siap.', 'error');
    photo = captureFrame(video);
    preview.src = `data:image/jpeg;base64,${photo.base64}`;
    video.classList.add('hidden');
    preview.classList.remove('hidden');
    shotBtn.classList.add('hidden');
    retakeBtn.classList.remove('hidden');
    refresh();
  });

  retakeBtn.addEventListener('click', () => {
    photo = null;
    preview.classList.add('hidden');
    video.classList.remove('hidden');
    shotBtn.classList.remove('hidden');
    retakeBtn.classList.add('hidden');
    refresh();
  });

  locBtn.addEventListener('click', readLocation);

  submitBtn.addEventListener('click', async () => {
    setBusy(submitBtn, true, 'Mengirim...');
    try {
      await onSubmit({ ...pos, selfie: photo, ...(getExtra ? getExtra() : {}) });
    } catch (e) {
      toast(e.message, 'error');
      setBusy(submitBtn, false);
    }
  });

  readLocation();
  startCamera();
  return () => {
    disposed = true;
    stopCamera(stream);
  };
}

/* ---------------- Riwayat ---------------- */

function renderRiwayat(el, me) {
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const out = h('div');
  const load = () => loadInto(out, () => api('absen.riwayat', { bulan: month.value }), (rows) => (rows.length
    ? table([
      { label: 'Tanggal', render: (r) => formatTanggal(r.tanggal) },
      { label: 'Status', render: (r) => badge(r.status) },
      { label: 'Mode', key: 'mode' },
      { label: 'Masuk', key: 'jam_masuk' },
      { label: 'Pulang', key: 'jam_pulang' },
    ], rows)
    : h('p', { class: 'muted' }, 'Belum ada data bulan ini.')));
  month.addEventListener('change', load);
  el.append(h('div', { class: 'card' }, h('label', {}, 'Bulan', month)), out);
  load();
}

/* ---------------- Logbook ---------------- */

function renderLogbook(el, me) {
  const tanggal = h('input', { type: 'date', value: me.today, max: me.today });
  const kegiatan = h('textarea', { rows: 4, maxlength: 2000, placeholder: 'Apa saja yang kamu kerjakan hari ini?' });
  const lampiran = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf' });
  const saveBtn = h('button', { class: 'btn primary block', type: 'button' }, 'Simpan Logbook');
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const out = h('div');

  const load = () => loadInto(out, () => api('logbook.list', { bulan: month.value }), (rows) => (rows.length
    ? table([
      { label: 'Tanggal', render: (r) => formatTanggal(r.tanggal) },
      { label: 'Kegiatan', key: 'kegiatan' },
      { label: 'Lampiran', render: (r) => link(r.link_lampiran, 'lihat') },
      { label: '', render: (r) => (r.bisaEdit ? h('button', { class: 'btn small', type: 'button', onclick: () => { tanggal.value = r.tanggal; kegiatan.value = r.kegiatan; kegiatan.focus(); } }, 'Edit') : '') },
    ], rows)
    : h('p', { class: 'muted' }, 'Belum ada logbook bulan ini.')));

  saveBtn.addEventListener('click', async () => {
    setBusy(saveBtn, true, 'Menyimpan...');
    try {
      const file = lampiran.files[0] ? await prepareUpload(lampiran.files[0]) : null;
      await api('logbook.save', { tanggal: tanggal.value, kegiatan: kegiatan.value, lampiran: file });
      toast('Logbook tersimpan.', 'success');
      kegiatan.value = '';
      lampiran.value = '';
      month.value = monthOf(tanggal.value);
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(saveBtn, false);
    }
  });
  month.addEventListener('change', load);

  el.append(
    h('div', { class: 'card' },
      h('label', {}, 'Tanggal', tanggal),
      h('label', {}, 'Kegiatan', kegiatan),
      h('label', {}, 'Lampiran (opsional)', lampiran),
      h('p', { class: 'muted small' }, `Logbook bisa diubah sampai ${me.config.batasEditLogbookHari} hari setelah tanggalnya. Simpan di tanggal yang sama = update.`),
      saveBtn),
    h('div', { class: 'card' }, h('label', {}, 'Bulan', month)),
    out);
  load();
}
```

- [ ] **Step 7: Jalankan smoke test**

Run: `npm run test:e2e`
Expected: langkah `✓ login` sampai `✓ form izin tampil` lulus, lalu `FAIL` di langkah admin (menunggu teks "1 hadir dari 2 peserta").

- [ ] **Step 8: Cek tampilan**

Buka `tests/e2e/out/shot-checkin.png` dan `shot-izin.png`. Pastikan layout HP (390px) rapi: tidak ada scroll horizontal dan tombol tidak terpotong.

- [ ] **Step 9: Commit**

```bash
git add web/js tests/e2e/smoke.cjs package-lock.json
git commit -m "feat(web): app boot, peserta presensi/riwayat/logbook + e2e smoke"
```

---

### Task 15: Frontend — aplikasi admin

**Files:**
- Modify (ganti total): `web/js/app-admin.js`

- [ ] **Step 1: Ganti `web/js/app-admin.js`**

```js
import { api } from './api.js';
import { h, toast, setBusy, link, monthOf, formatTanggal, table, badge, tabs, loadInto } from './ui.js';
import { toCsv, downloadCsv } from './csv.js';

export function mountAdmin(main, me) {
  tabs(main, [
    { id: 'harian', label: 'Harian', render: (el) => renderHarian(el, me) },
    { id: 'rekap', label: 'Rekap Bulanan', render: (el) => renderRekap(el, me) },
    { id: 'peserta', label: 'Peserta', render: (el) => renderPeserta(el) },
    { id: 'logbook', label: 'Logbook', render: (el) => renderLogbook(el, me) },
  ]);
}

function toolbar(...children) {
  return h('div', { class: 'card row no-print' }, ...children);
}

function exportButton(getRows, columns, filename) {
  return h('button', { class: 'btn', type: 'button', onclick: () => {
    const rows = getRows();
    if (!rows.length) return toast('Tidak ada data untuk diekspor.', 'error');
    downloadCsv(filename(), toCsv(rows, columns));
  } }, 'Export CSV');
}

/* ---------------- Harian ---------------- */

const HARIAN_CSV = [
  { label: 'Nama', key: 'nama' }, { label: 'Instansi', key: 'instansi' }, { label: 'Email', key: 'email' },
  { label: 'Status', key: 'status' }, { label: 'Mode', key: 'mode' }, { label: 'Jam Masuk', key: 'jam_masuk' },
  { label: 'Jam Pulang', key: 'jam_pulang' }, { label: 'Lat Masuk', key: 'lat_masuk' }, { label: 'Lng Masuk', key: 'lng_masuk' },
  { label: 'Jarak Masuk (m)', key: 'jarak_masuk' }, { label: 'Jarak Pulang (m)', key: 'jarak_pulang' },
  { label: 'Flags', key: 'flags' }, { label: 'Selfie Masuk', key: 'link_selfie_masuk' },
  { label: 'Selfie Pulang', key: 'link_selfie_pulang' }, { label: 'Surat', key: 'link_surat' }, { label: 'Catatan', key: 'catatan' },
];

function mapsUrl(lat, lng) {
  return lat && lng ? `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}` : null;
}

function renderHarian(el, me) {
  const tanggal = h('input', { type: 'date', value: me.today, max: me.today });
  const out = h('div');
  let flat = [];
  const load = () => loadInto(out, () => api('admin.harian', { tanggal: tanggal.value }), (rows) => {
    flat = rows.map((r) => ({ nama: r.nama, instansi: r.instansi, email: r.email, ...(r.absensi || { status: 'Belum absen' }) }));
    const hadir = rows.filter((r) => r.absensi?.status === 'Masuk').length;
    return h('div', {},
      h('p', { class: 'muted' }, `${formatTanggal(tanggal.value)} · ${hadir} hadir dari ${rows.length} peserta`),
      table([
        { label: 'Nama', render: (r) => h('div', {}, r.nama, h('div', { class: 'muted small' }, r.instansi)) },
        { label: 'Status', render: (r) => badge(r.absensi?.status) },
        { label: 'Mode', render: (r) => r.absensi?.mode || '' },
        { label: 'Masuk', render: (r) => r.absensi?.jam_masuk || '' },
        { label: 'Pulang', render: (r) => r.absensi?.jam_pulang || '' },
        { label: 'Jarak', render: (r) => (r.absensi?.jarak_masuk ? `${r.absensi.jarak_masuk} m` : '') },
        { label: 'Flag', render: (r) => (r.absensi?.flags ? h('span', { class: 'warn small' }, r.absensi.flags) : '') },
        { label: 'Bukti', render: (r) => h('div', { class: 'row' },
          link(r.absensi?.link_selfie_masuk, 'Selfie masuk'), link(r.absensi?.link_selfie_pulang, 'Selfie pulang'),
          link(r.absensi?.link_surat, 'Surat'), link(mapsUrl(r.absensi?.lat_masuk, r.absensi?.lng_masuk), 'Lokasi')) },
      ], rows));
  });
  tanggal.addEventListener('change', load);
  el.append(toolbar(h('label', {}, 'Tanggal', tanggal),
    exportButton(() => flat, HARIAN_CSV, () => `presensi-${tanggal.value}.csv`)), out);
  load();
}

/* ---------------- Rekap ---------------- */

const REKAP_COLS = [
  { label: 'Nama', key: 'nama' }, { label: 'Instansi', key: 'instansi' }, { label: 'Hari Kerja', key: 'hariKerja' },
  { label: 'Hadir', key: 'hadir' }, { label: 'WFO', key: 'wfo' }, { label: 'WFH', key: 'wfh' }, { label: 'Izin', key: 'izin' },
  { label: 'Sakit', key: 'sakit' }, { label: 'Telat', key: 'telat' }, { label: 'Tanpa Ket.', key: 'tanpaKeterangan' },
];

function renderRekap(el, me) {
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const out = h('div');
  let rows = [];
  const load = () => loadInto(out, () => api('admin.rekap', { bulan: month.value }), (data) => {
    rows = data;
    return h('div', {},
      h('h3', {}, `Rekap Presensi Magang Bawaslu Malang — ${month.value}`),
      h('p', { class: 'muted small' }, 'Hari kerja = Senin–Jumat dalam periode magang sampai hari ini. Tanpa Ket. = hari kerja tanpa catatan presensi.'),
      table(REKAP_COLS, data));
  });
  month.addEventListener('change', load);
  el.append(toolbar(h('label', {}, 'Bulan', month),
    exportButton(() => rows, REKAP_COLS, () => `rekap-${month.value}.csv`),
    h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Cetak / PDF')), out);
  load();
}

/* ---------------- Peserta ---------------- */

function renderPeserta(el) {
  const f = {
    email: h('input', { type: 'email', placeholder: 'nama@gmail.com' }),
    nama: h('input', { type: 'text', maxlength: 100 }),
    instansi: h('input', { type: 'text', maxlength: 150, placeholder: 'Kampus / sekolah' }),
    aktif: h('select', {}, h('option', { value: 'Y' }, 'Aktif'), h('option', { value: 'N' }, 'Nonaktif')),
    tanggal_mulai: h('input', { type: 'date' }),
    tanggal_selesai: h('input', { type: 'date' }),
  };
  const saveBtn = h('button', { class: 'btn primary', type: 'button' }, 'Simpan Peserta');
  const resetBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => fill({}) }, 'Kosongkan');
  const out = h('div');

  function fill(p) {
    Object.entries(f).forEach(([k, input]) => { input.value = p[k] || (k === 'aktif' ? 'Y' : ''); });
    f.email.readOnly = Boolean(p.email);
  }

  const load = () => loadInto(out, () => api('admin.peserta.list'), (rows) => (rows.length
    ? table([
      { label: 'Nama', key: 'nama' }, { label: 'Email', key: 'email' }, { label: 'Instansi', key: 'instansi' },
      { label: 'Periode', render: (p) => `${p.tanggal_mulai} s/d ${p.tanggal_selesai}` },
      { label: 'Status', render: (p) => (p.aktif === 'Y' ? 'Aktif' : 'Nonaktif') },
      { label: '', render: (p) => h('button', { class: 'btn small', type: 'button', onclick: () => { fill(p); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Edit') },
    ], rows)
    : h('p', { class: 'muted' }, 'Belum ada peserta.')));

  saveBtn.addEventListener('click', async () => {
    setBusy(saveBtn, true, 'Menyimpan...');
    try {
      const data = Object.fromEntries(Object.entries(f).map(([k, input]) => [k, input.value]));
      await api('admin.peserta.save', data);
      toast('Peserta tersimpan.', 'success');
      fill({});
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(saveBtn, false);
    }
  });

  el.append(h('div', { class: 'card' },
    h('h3', {}, 'Tambah / Edit Peserta'),
    h('label', {}, 'Email Google', f.email), h('label', {}, 'Nama', f.nama), h('label', {}, 'Instansi', f.instansi),
    h('label', {}, 'Status', f.aktif), h('label', {}, 'Tanggal mulai', f.tanggal_mulai), h('label', {}, 'Tanggal selesai', f.tanggal_selesai),
    h('div', { class: 'row' }, saveBtn, resetBtn)), out);
  fill({});
  load();
}

/* ---------------- Logbook ---------------- */

const LOGBOOK_CSV = [
  { label: 'Tanggal', key: 'tanggal' }, { label: 'Nama', key: 'nama' }, { label: 'Email', key: 'email' },
  { label: 'Kegiatan', key: 'kegiatan' }, { label: 'Lampiran', key: 'link_lampiran' },
];

function renderLogbook(el, me) {
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const who = h('select', {}, h('option', { value: '' }, 'Semua peserta'));
  const out = h('div');
  let rows = [];

  api('admin.peserta.list')
    .then((list) => list.forEach((p) => who.append(h('option', { value: p.email }, p.nama))))
    .catch((e) => toast(e.message, 'error'));

  const load = () => loadInto(out, () => api('admin.logbook', { bulan: month.value, email: who.value }), (data) => {
    rows = data;
    return data.length
      ? table([
        { label: 'Tanggal', render: (r) => formatTanggal(r.tanggal) }, { label: 'Nama', key: 'nama' },
        { label: 'Kegiatan', key: 'kegiatan' }, { label: 'Lampiran', render: (r) => link(r.link_lampiran, 'lihat') },
      ], data)
      : h('p', { class: 'muted' }, 'Belum ada logbook.');
  });
  month.addEventListener('change', load);
  who.addEventListener('change', load);
  el.append(toolbar(h('label', {}, 'Bulan', month), h('label', {}, 'Peserta', who),
    exportButton(() => rows, LOGBOOK_CSV, () => `logbook-${month.value}.csv`)), out);
  load();
}
```

- [ ] **Step 2: Jalankan smoke test**

Run: `npm run test:e2e`
Expected: semua langkah `✓`, lalu baris terakhir `SMOKE OK, tanpa error JS`

- [ ] **Step 3: Jalankan semua unit test**

Run: `npm test`
Expected: `# pass 59`, `# fail 0`

- [ ] **Step 4: Commit**

```bash
git add web/js/app-admin.js
git commit -m "feat(web): admin harian, rekap + print, kelola peserta, logbook export"
```

---

### Task 16: CI/CD — test & deploy GitHub Pages

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Buat workflow**

```yaml
name: Test & Deploy Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: web
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Push ke GitHub**

```bash
gh repo create presensi-bawaslu --private --source=. --push
```

Lalu buka **Settings → Pages → Build and deployment → Source: GitHub Actions**. GitHub Pages untuk repo private butuh akun Pro/organisasi. Kalau tidak ada, buat repo-nya public. Repo ini tidak menyimpan rahasia apa pun.

- [ ] **Step 3: Pastikan workflow hijau**

Run: `gh run watch`
Expected: job `test` dan `deploy` sukses. URL Pages ditampilkan di job `deploy`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: run tests and deploy web/ to GitHub Pages"
git push
```

---

### Task 17: Sambungkan frontend ke backend & uji di HP asli

**Files:**
- Modify: `web/config.js`
- Create: `docs/TESTING.md`

- [ ] **Step 1: Isi `web/config.js`**

```js
export const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec',   // dari Task 11
  GOOGLE_CLIENT_ID: '<CLIENT_ID>.apps.googleusercontent.com',            // dari Task 11
};
```

- [ ] **Step 2: Pastikan origin Pages terdaftar**

Di Google Cloud Console → Credentials → OAuth client, isi **Authorized JavaScript origins** dengan `https://<username>.github.io` (tanpa path dan tanpa slash di akhir).

- [ ] **Step 3: Tes lokal dulu**

Run: `npm run dev`, lalu buka `http://localhost:5500`, login dengan email admin, dan pastikan tab Harian tampil. Kamera dan GPS juga jalan di `localhost`.

- [ ] **Step 4: Buat `docs/TESTING.md`**

```markdown
# Checklist Test Manual (HP asli)

Jalankan setelah deploy backend dan frontend. Pakai minimal 1 HP Android (Chrome) dan 1 iPhone (Safari) kalau ada.

## Persiapan
- [ ] Sheet `Admin` berisi email kamu, dan sheet `Peserta` berisi 1 akun test (aktif, periode mencakup hari ini).
- [ ] `radius_meter` sementara diisi 100.

## Login
- [ ] Email yang tidak terdaftar ditolak dengan pesan "belum terdaftar".
- [ ] Peserta nonaktif (`aktif` = N) ditolak dengan pesan "tidak aktif".
- [ ] Peserta masuk ke tab Presensi, admin masuk ke tab Harian.
- [ ] Tombol Keluar lalu login lagi berjalan normal.

## Peserta — Presensi
- [ ] Izin lokasi ditolak: muncul pesan cara mengaktifkan, tombol kirim tetap nonaktif.
- [ ] Izin kamera ditolak: muncul pesan cara mengaktifkan.
- [ ] WFO di kantor (dalam radius): absen masuk berhasil, baris muncul di sheet `Absensi`, selfie ada di folder Drive.
- [ ] WFO dari luar kantor: ditolak dengan info jarak (m).
- [ ] WFH dari rumah: berhasil, `jarak_masuk` tercatat.
- [ ] Absen pulang berhasil dan `jam_pulang` terisi.
- [ ] Mencoba absen lagi di hari yang sama ditolak.
- [ ] Izin dengan foto surat (JPG) berhasil, dan Sakit dengan PDF berhasil (pakai akun lain atau hari lain).
- [ ] Mengirim PDF di atas 2 MB ditolak.
- [ ] Mode pesawat lalu klik kirim: muncul pesan koneksi, dan setelah online lagi bisa dikirim ulang.

## Peserta — Riwayat & Logbook
- [ ] Riwayat bulan ini tampil sesuai data.
- [ ] Simpan logbook hari ini, lalu simpan lagi di tanggal yang sama: data ter-update, tidak dobel.
- [ ] Logbook untuk tanggal yang sudah lewat batas edit ditolak.

## Admin
- [ ] Harian: status semua peserta tampil, link selfie bisa dibuka (folder sudah di-share ke admin).
- [ ] Export CSV harian bisa dibuka di Excel dengan huruf tetap rapi (UTF-8).
- [ ] Rekap bulanan: angka hadir, izin, sakit, telat, dan tanpa keterangan cocok dengan sheet.
- [ ] Cetak / PDF menampilkan tabel rekap tanpa tombol dan menu.
- [ ] Tambah peserta baru lalu login dengan akun itu berhasil. Edit menjadi nonaktif lalu login lagi ditolak.
- [ ] Logbook: filter per peserta berjalan, dan Export CSV berjalan.

## Konkurensi
- [ ] Dua HP absen bersamaan (beda akun): dua-duanya tercatat dan tidak ada baris yang hilang.
```

- [ ] **Step 5: Commit, push, lalu jalankan checklist di HP asli**

```bash
git add web/config.js docs/TESTING.md
git commit -m "chore: connect frontend to deployed Apps Script; manual test checklist"
git push
```

Jalankan semua item `docs/TESTING.md` di URL GitHub Pages. Bug yang ditemukan diperbaiki dengan alur TDD yang sama: tambahkan test di `tests/` dulu, baru perbaiki. Kalau yang berubah backend, deploy versi baru lewat **Manage deployments**, bukan New deployment.

---

## Catatan Operasional

- **Backup:** di Sheet, buka **File → Version history**. Untuk arsip bulanan, admin bisa export CSV rekap tiap akhir bulan.
- **Ganti radius/jam/batas:** cukup edit sheet `Config`, tidak perlu deploy ulang.
- **Peserta ganti HP/email:** admin edit email di tab Peserta. Data lama tetap tercatat dengan email lama.
- **Kuota Apps Script (akun gratis):** sekitar 20.000 UrlFetch/hari dan waktu eksekusi 6 menit/request, cukup untuk puluhan peserta. Token di-cache, jadi rata-rata hanya 1 fetch per sesi.
