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
