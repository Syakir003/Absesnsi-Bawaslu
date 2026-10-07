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
