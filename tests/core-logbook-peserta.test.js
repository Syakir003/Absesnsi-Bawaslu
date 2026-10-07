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
