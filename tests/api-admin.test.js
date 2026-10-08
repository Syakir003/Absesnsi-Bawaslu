const test = require('node:test');
const assert = require('node:assert/strict');
const { SELFIE, setupGas } = require('./helpers/fixtures');

test('peserta tidak bisa akses aksi admin', () => {
  const gas = setupGas();
  assert.equal(gas.call('admin.rekap', 'tok.ani.sig', { bulan: '2026-10' }).code, 'FORBIDDEN');
});

test('admin.harian & admin.rekap', () => {
  const gas = setupGas();
  gas.call('absen.checkin', 'tok.ani.sig', { status: 'Masuk', mode: 'WFH', selfie: SELFIE, lat: -8.1, lng: 112.7, accuracy: 20 });
  const harian = gas.call('admin.harian', 'tok.admin.sig', { tanggal: '2026-10-07' }).data;
  assert.equal(harian.length, 1);
  assert.equal(harian[0].absensi.mode, 'WFH');
  const rekap = gas.call('admin.rekap', 'tok.admin.sig', { bulan: '2026-10' }).data;
  assert.equal(rekap[0].hadir, 1);
  assert.equal(rekap[0].wfh, 1);
  assert.match(gas.call('admin.harian', 'tok.admin.sig', { tanggal: 'kemarin' }).error, /Tanggal tidak valid/);
});

test('admin.peserta.save insert lalu update (email case-insensitive)', () => {
  const gas = setupGas();
  const saved = gas.call('admin.peserta.save', 'tok.admin.sig', { email: 'Budi@gmail.com', nama: 'Budi', instansi: 'UM', aktif: 'Y', tanggal_mulai: '2026-10-01', tanggal_selesai: '2026-12-31' });
  assert.equal(saved.ok, true, saved.error);
  gas.call('admin.peserta.save', 'tok.admin.sig', { email: 'budi@gmail.com', nama: 'Budi S', instansi: 'UM', aktif: 'N', tanggal_mulai: '2026-10-01', tanggal_selesai: '2026-12-31' });
  const list = gas.call('admin.peserta.list', 'tok.admin.sig', {}).data;
  assert.deepEqual(list.map((p) => [p.nama, p.aktif]), [['Ani', 'Y'], ['Budi S', 'N']]);
  assert.match(gas.call('admin.peserta.save', 'tok.admin.sig', { email: 'x' }).error, /Email tidak valid/);
});

test('admin.logbook menyertakan nama peserta & filter email', () => {
  const gas = setupGas();
  gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'Input data pemilih' });
  assert.equal(gas.call('admin.logbook', 'tok.admin.sig', { bulan: '2026-10' }).data[0].nama, 'Ani');
  assert.equal(gas.call('admin.logbook', 'tok.admin.sig', { bulan: '2026-10', email: 'lain@gmail.com' }).data.length, 0);
});

test('admin.harian: email Peserta dengan spasi/huruf besar tetap cocok dengan absensinya', () => {
  const gas = setupGas();
  gas.sheets.Peserta.rows[1][0] = 'Ani@Gmail.com '; // spasi di belakang (hasil salin-tempel admin)
  gas.call('absen.checkin', 'tok.ani.sig', { status: 'Masuk', mode: 'WFH', selfie: SELFIE, lat: -8.1, lng: 112.7, accuracy: 20 });
  const harian = gas.call('admin.harian', 'tok.admin.sig', { tanggal: '2026-10-07' }).data;
  assert.equal(harian.length, 1);
  assert.equal(harian[0].email, 'ani@gmail.com');
  assert.equal(harian[0].absensi.mode, 'WFH');
});

test('admin.harian & admin.logbook: email di baris Absensi/Logbook hasil edit manual (huruf besar/spasi) tetap cocok', () => {
  const gas = setupGas();
  gas.call('absen.checkin', 'tok.ani.sig', { status: 'Masuk', mode: 'WFH', selfie: SELFIE, lat: -8.1, lng: 112.7, accuracy: 20 });
  gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'Input data pemilih' });
  gas.sheets.Absensi.rows[1][1] = ' ANI@gmail.com ';
  gas.sheets.Logbook.rows[1][1] = ' ANI@gmail.com ';
  const harian = gas.call('admin.harian', 'tok.admin.sig', { tanggal: '2026-10-07' }).data;
  assert.equal(harian[0].absensi.mode, 'WFH');
  const log = gas.call('admin.logbook', 'tok.admin.sig', { bulan: '2026-10', email: ' Ani@Gmail.com ' }).data;
  assert.equal(log.length, 1);
  assert.equal(log[0].nama, 'Ani');
});
