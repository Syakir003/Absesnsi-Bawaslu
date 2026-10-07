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
