// Fake minimal Google Apps Script services untuk integration test doPost di Node.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const GAS_FILES = ['Core.js', 'Errors.js', 'Repo.js', 'Setup.js', 'Auth.js', 'Files.js', 'Api.js', 'HandlersPeserta.js', 'HandlersAdmin.js'];

function fakeSheet(name) {
  const rows = [];
  const rawWrites = []; // setiap baris mentah (sebelum apostrof dibuang) yang ditulis ke sheet
  let maxRows = 1000; // ukuran awal sheet baru di Google Sheets
  // Meniru Sheets: apostrof di awal disembunyikan, sisanya disimpan sebagai teks.
  const stored = (r) => Array.from(r, (v) => { const s = String(v); return s.startsWith("'") ? s.slice(1) : s; });
  const sheet = {
    name,
    rows,
    rawWrites,
    getDataRange: () => ({ getValues: () => (rows.length ? rows.map((r) => r.slice()) : [[]]) }),
    getRange: (a, col, numRows, numCols) => {
      if (typeof a === 'string') return { setNumberFormat() { return this; } };
      const range = {
        setNumberFormat() { return range; },
        setValues(values) {
          if (a + values.length - 1 > maxRows) throw new Error('Range di luar batas sheet (maxRows=' + maxRows + ')');
          values.forEach((v, i) => {
            rawWrites.push(Array.from(v, String));
            rows[a - 1 + i] = stored(v);
          });
          return { setFontWeight: () => ({}) };
        },
      };
      return range;
    },
    appendRow: (r) => {
      rawWrites.push(Array.from(r, String));
      rows.push(stored(r));
    },
    getLastRow: () => rows.length,
    getMaxRows: () => maxRows,
    insertRowsAfter: (after, howMany) => { if (after <= maxRows) maxRows += howMany; },
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
  let flushCalls = 0;

  const spreadsheet = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = fakeSheet(n)),
    getSheets: () => Object.values(sheets),
    deleteSheet: (s) => delete sheets[s.name],
  };

  const pad = (n) => String(n).padStart(2, '0');
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush: () => { flushCalls++; } },
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
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache[k] ?? null,
        put: (k, v, ttl) => {
          if (String(k).length > 250) throw new Error('CacheService: key > 250 karakter');
          if (ttl !== undefined && ttl > 21600) throw new Error('CacheService: ttl > 21600 detik');
          cache[k] = v;
        },
      }),
    },
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

  return { ctx, sheets, files, fetchCalls, get flushCalls() { return flushCalls; }, call, rowsOf, setNow: (d) => { now = d; } };
}

module.exports = { createGas };
