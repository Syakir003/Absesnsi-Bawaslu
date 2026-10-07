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
