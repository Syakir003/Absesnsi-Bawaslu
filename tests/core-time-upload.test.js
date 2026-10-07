const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

test('toSeconds: H:mm, HH:mm, H:mm:ss, HH:mm:ss', () => {
  assert.equal(core.toSeconds('07:30'), 27000);
  assert.equal(core.toSeconds('7:30'), 27000);
  assert.equal(core.toSeconds('07:30:15'), 27015);
  assert.equal(core.toSeconds('7:30:15'), 27015);
  assert.equal(core.toSeconds('0:00'), 0);
  assert.equal(core.toSeconds('23:59:59'), 86399);
});

test('toSeconds: format/rentang salah melempar error', () => {
  assert.throws(() => core.toSeconds('7.30'), /Format jam tidak valid: 7\.30/);
  assert.throws(() => core.toSeconds('24:00'), /Format jam tidak valid/);
  assert.throws(() => core.toSeconds('12:60'), /Format jam tidak valid/);
  assert.throws(() => core.toSeconds('12:30:60'), /Format jam tidak valid/);
  assert.throws(() => core.toSeconds('12:5'), /Format jam tidak valid/);
  assert.throws(() => core.toSeconds('1899-12-30'), /Format jam tidak valid/);
});

test('isLate: lewat batas = telat, pas batas = tidak', () => {
  assert.equal(core.isLate('08:00:00', '08:00'), false);
  assert.equal(core.isLate('08:00:01', '08:00'), true);
  assert.equal(core.isLate('', '08:00'), false);
});

test('isLate: toleran jam tanpa nol di depan dan data sheet berantakan', () => {
  assert.equal(core.isLate('7:45', '08:00'), false);
  assert.equal(core.isLate('8:05', '08:00'), true);
  assert.equal(core.isLate('1899-12-30', '08:00'), false);
  assert.equal(core.isLate('bukan jam', '08:00'), false);
  assert.equal(core.isLate(null, '08:00'), false);
  assert.equal(core.isLate(undefined, '08:00'), false);
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

// Buat base64 dengan prefix magic dan tepat `n` byte (padding '=' sesuai).
function fileOfBytes(prefix, n) {
  const chars = Math.ceil(n / 3) * 4;
  const pad = (3 - (n % 3)) % 3;
  return prefix + 'A'.repeat(chars - prefix.length - pad) + '='.repeat(pad);
}
const jpeg = (n) => fileOfBytes('/9j/', n);
const png = (n) => fileOfBytes('iVBORw0KGgo', n);
const pdf = (n) => fileOfBytes('JVBERi0x', n);

test('fileOfBytes helper: jumlah byte tepat', () => {
  [1024, 1025, 1026, 100, 101, 102].forEach((n) => assert.equal(core.base64Bytes(jpeg(n)), n));
});

test('validateUpload: selfie jpeg valid (termasuk data URL)', () => {
  assert.deepEqual(core.validateUpload({ mime: 'image/jpeg', base64: jpeg(2000) }, 'selfie'), { ok: true, bytes: 2000 });
  assert.deepEqual(core.validateUpload({ mime: 'image/jpeg', base64: 'data:image/jpeg;base64,' + jpeg(2000) }, 'selfie'), { ok: true, bytes: 2000 });
});

test('validateUpload: surat png & pdf valid', () => {
  assert.deepEqual(core.validateUpload({ mime: 'image/png', base64: png(500) }, 'surat'), { ok: true, bytes: 500 });
  assert.deepEqual(core.validateUpload({ mime: 'application/pdf', base64: pdf(500) }, 'lampiran'), { ok: true, bytes: 500 });
});

test('validateUpload: mime salah, kosong, rusak, kebesaran, jenis asing', () => {
  assert.match(core.validateUpload({ mime: 'image/png', base64: jpeg(2000) }, 'selfie').error, /Format file/);
  assert.match(core.validateUpload({ mime: 'image/jpeg', base64: '' }, 'selfie').error, /belum dipilih/);
  assert.match(core.validateUpload({ mime: 'application/pdf', base64: 'JVBE$D0x' + 'A'.repeat(200) }, 'surat').error, /rusak/);
  assert.match(core.validateUpload({ mime: 'application/pdf', base64: pdf(2 * 1024 * 1024 + 3) }, 'surat').error, /maksimal 2 MB/);
  assert.match(core.validateUpload({ mime: 'image/jpeg', base64: jpeg(2000) }, 'foto').error, /tidak dikenal/);
});

test('validateUpload: panjang base64 bukan kelipatan 4 → rusak', () => {
  const r = core.validateUpload({ mime: 'image/jpeg', base64: '/9j/' + 'A'.repeat(2001) }, 'selfie');
  assert.deepEqual(r, { ok: false, error: 'Isi file rusak.' });
});

test('validateUpload: magic prefix tidak cocok dengan mime', () => {
  assert.deepEqual(
    core.validateUpload({ mime: 'image/jpeg', base64: png(2000) }, 'selfie'),
    { ok: false, error: 'Isi file tidak sesuai format image/jpeg.' });
  assert.deepEqual(
    core.validateUpload({ mime: 'image/png', base64: jpeg(500) }, 'surat'),
    { ok: false, error: 'Isi file tidak sesuai format image/png.' });
  assert.deepEqual(
    core.validateUpload({ mime: 'application/pdf', base64: jpeg(500) }, 'lampiran'),
    { ok: false, error: 'Isi file tidak sesuai format application/pdf.' });
  // payload kecil sembarang ('QUJD' = "ABC") tidak lolos lagi
  assert.match(core.validateUpload({ mime: 'image/jpeg', base64: 'QUJD' }, 'selfie').error, /tidak sesuai format/);
});

test('validateUpload: CORE_MAGIC_PREFIX terdefinisi', () => {
  assert.deepEqual(core.CORE_MAGIC_PREFIX, { 'image/jpeg': '/9j/', 'image/png': 'iVBORw0KGgo', 'application/pdf': 'JVBERi0' });
});

test('validateUpload: terlalu kecil ditolak, tepat minBytes diterima', () => {
  const small = 'File terlalu kecil atau rusak.';
  assert.deepEqual(core.validateUpload({ mime: 'image/jpeg', base64: jpeg(1023) }, 'selfie'), { ok: false, error: small });
  assert.deepEqual(core.validateUpload({ mime: 'image/jpeg', base64: jpeg(1024) }, 'selfie'), { ok: true, bytes: 1024 });
  assert.deepEqual(core.validateUpload({ mime: 'application/pdf', base64: pdf(99) }, 'surat'), { ok: false, error: small });
  assert.deepEqual(core.validateUpload({ mime: 'application/pdf', base64: pdf(100) }, 'surat'), { ok: true, bytes: 100 });
  assert.deepEqual(core.validateUpload({ mime: 'image/png', base64: png(99) }, 'lampiran'), { ok: false, error: small });
  assert.deepEqual(core.validateUpload({ mime: 'image/png', base64: png(100) }, 'lampiran'), { ok: true, bytes: 100 });
});

test('validateUpload: tepat maxBytes diterima, maxBytes+1 ditolak', () => {
  const selfieMax = 1.5 * 1024 * 1024;
  const suratMax = 2 * 1024 * 1024;
  assert.deepEqual(core.validateUpload({ mime: 'image/jpeg', base64: jpeg(selfieMax) }, 'selfie'), { ok: true, bytes: selfieMax });
  assert.match(core.validateUpload({ mime: 'image/jpeg', base64: jpeg(selfieMax + 1) }, 'selfie').error, /maksimal 1\.5 MB/);
  assert.deepEqual(core.validateUpload({ mime: 'application/pdf', base64: pdf(suratMax) }, 'surat'), { ok: true, bytes: suratMax });
  assert.match(core.validateUpload({ mime: 'application/pdf', base64: pdf(suratMax + 1) }, 'surat').error, /maksimal 2 MB/);
  assert.deepEqual(core.validateUpload({ mime: 'image/png', base64: png(suratMax) }, 'lampiran'), { ok: true, bytes: suratMax });
  assert.match(core.validateUpload({ mime: 'image/png', base64: png(suratMax + 1) }, 'lampiran').error, /maksimal 2 MB/);
});
