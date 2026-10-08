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
  // Hari kerja 1–7 Okt: 1,2,5,6,7 = 5 hari; tercatat 1,2,5; hari ini (7) belum dihitung alpa → tanpa keterangan 1 (hanya 6)
  assert.deepEqual(core.buildRekap(peserta, absensi, '2026-10', '2026-10-07', '08:00'), [
    { email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', hariKerja: 5, hadir: 2, wfo: 1, wfh: 1, izin: 0, sakit: 1, telat: 1, tanpaKeterangan: 1 },
  ]);
});

const ani = { email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', aktif: 'Y', tanggal_mulai: '2026-10-01', tanggal_selesai: '2026-12-31' };
const row = (tanggal, extra) => ({ email: 'ani@gmail.com', tanggal, status: 'Masuk', mode: 'WFO', jam_masuk: '07:30:00', ...extra });
const rekapAni = (rows, today, p) => core.buildRekap([p || ani], rows, '2026-10', today || '2026-10-07', '08:00')[0];

test('buildRekap: baris dobel di tanggal sama dihitung sekali (baris pertama menang)', () => {
  const r = rekapAni([row('2026-10-01'), row('2026-10-01', { status: 'Sakit', mode: '' }), row('2026-10-01', { mode: 'WFH' })]);
  assert.equal(r.hadir, 1);
  assert.equal(r.wfo, 1);
  assert.equal(r.wfh, 0);
  assert.equal(r.sakit, 0);
});

test('buildRekap: baris sebelum tanggal_mulai atau setelah hari ini diabaikan', () => {
  const p = { ...ani, tanggal_mulai: '2026-10-05' };
  const r = rekapAni([row('2026-10-01'), row('2026-10-05'), row('2026-10-20')], '2026-10-07', p);
  assert.equal(r.hadir, 1);
  assert.equal(r.hariKerja, 3); // 5, 6, 7
});

test('buildRekap: baris setelah tanggal_selesai diabaikan', () => {
  const p = { ...ani, tanggal_selesai: '2026-10-02' };
  const r = rekapAni([row('2026-10-02'), row('2026-10-05')], '2026-10-07', p);
  assert.equal(r.hadir, 1);
  assert.equal(r.hariKerja, 2);
});

test('buildRekap: WFH hari Sabtu tetap dihitung hadir, hariKerja tidak bertambah', () => {
  // 2026-10-03 Sabtu
  const r = rekapAni([row('2026-10-03', { mode: 'WFH' })]);
  assert.equal(r.hadir, 1);
  assert.equal(r.wfh, 1);
  assert.equal(r.hariKerja, 5);
  assert.equal(r.tanpaKeterangan, 4); // 1,2,5,6 (7 = hari ini)
});

test('buildRekap: hari ini tanpa baris tidak dihitung tanpaKeterangan, tapi masuk hariKerja', () => {
  const r = rekapAni([], '2026-10-01');
  assert.equal(r.hariKerja, 1);
  assert.equal(r.tanpaKeterangan, 0);
  const r2 = rekapAni([], '2026-10-02');
  assert.equal(r2.hariKerja, 2);
  assert.equal(r2.tanpaKeterangan, 1);
});

test('buildRekap: hari ini sudah ada baris tetap normal', () => {
  const r = rekapAni([row('2026-10-07')], '2026-10-07');
  assert.equal(r.hadir, 1);
  assert.equal(r.tanpaKeterangan, 4); // 1,2,5,6
});

test('buildRekap: tanggal_selesai kosong = sampai akhir bulan / hari ini', () => {
  const p = { ...ani, tanggal_selesai: '' };
  const r = rekapAni([row('2026-10-01')], '2026-10-07', p);
  assert.equal(r.hariKerja, 5);
  assert.equal(r.hadir, 1);
  // bulan lampau: seluruh bulan
  const lalu = core.buildRekap([p], [], '2026-09', '2026-10-07', '08:00');
  assert.deepEqual(lalu, []); // mulai 2026-10-01 → belum magang di September
});

test('buildRekap: Izin dihitung izin, bukan hadir', () => {
  const r = rekapAni([row('2026-10-01', { status: 'Izin', mode: '', jam_masuk: '' })]);
  assert.equal(r.izin, 1);
  assert.equal(r.hadir, 0);
  assert.equal(r.tanpaKeterangan, 3); // 2,5,6
});

test('buildRekap: email dicocokkan tanpa peduli huruf besar & spasi', () => {
  const p = { ...ani, email: 'Ani@Gmail.com' };
  const r = rekapAni([row('2026-10-01', { email: ' ANI@gmail.COM ' })], '2026-10-07', p);
  assert.equal(r.hadir, 1);
  assert.equal(r.email, 'ani@gmail.com');
});

test('buildRekap: jam_masuk berantakan (1899-12-30) tidak melempar error', () => {
  let r;
  assert.doesNotThrow(() => { r = rekapAni([row('2026-10-01', { jam_masuk: '1899-12-30' })]); });
  assert.equal(r.hadir, 1);
  assert.equal(r.telat, 0);
});

test('buildRekap: baris peserta lain tidak tercampur', () => {
  const budi = { ...ani, email: 'budi@gmail.com', nama: 'Budi' };
  const rows = [row('2026-10-01'), row('2026-10-01', { email: 'budi@gmail.com' }), row('2026-10-02', { email: 'budi@gmail.com' })];
  const out = core.buildRekap([ani, budi], rows, '2026-10', '2026-10-07', '08:00');
  assert.deepEqual(out.map((x) => x.hadir), [1, 2]);
});

test('buildRekap: peserta nonaktif tanpa baris absensi dikecualikan', () => {
  const lama = { ...ani, aktif: 'N' };
  assert.deepEqual(core.buildRekap([lama], [], '2026-10', '2026-10-07', '08:00'), []);
  // aktif kosong/selain Y juga dianggap nonaktif
  assert.deepEqual(core.buildRekap([{ ...ani, aktif: '' }], [], '2026-10', '2026-10-07', '08:00'), []);
});

test('buildRekap: peserta nonaktif dengan baris dalam rentang efektif tetap masuk', () => {
  const lama = { ...ani, aktif: 'N', tanggal_selesai: '2026-10-05' };
  const r = rekapAni([row('2026-10-02')], '2026-10-07', lama);
  assert.equal(r.hadir, 1);
  assert.equal(r.hariKerja, 3); // 1, 2, 5
});

test('buildRekap: peserta nonaktif, baris hanya di luar rentang efektif → dikecualikan', () => {
  const lama = { ...ani, aktif: 'N', tanggal_selesai: '2026-10-05' };
  // setelah tanggal_selesai, setelah hari ini, dan bulan lain: semuanya di luar rentang efektif
  const out = core.buildRekap([lama], [row('2026-10-06'), row('2026-10-20'), row('2026-09-30')], '2026-10', '2026-10-07', '08:00');
  assert.deepEqual(out, []);
});

test('buildRekap: aktif dibandingkan tanpa peduli huruf besar & spasi', () => {
  assert.equal(core.buildRekap([{ ...ani, aktif: ' y ' }], [], '2026-10', '2026-10-07', '08:00').length, 1);
  assert.equal(core.buildRekap([{ ...ani, aktif: 'Y' }], [], '2026-10', '2026-10-07', '08:00').length, 1);
  // email baris absensi dengan huruf besar/spasi tetap dihitung sebagai baris peserta nonaktif
  const lama = { ...ani, aktif: 'n' };
  assert.equal(core.buildRekap([lama], [row('2026-10-01', { email: ' ANI@gmail.com ' })], '2026-10', '2026-10-07', '08:00').length, 1);
});
