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

test('logbook: kegiatan berawalan rumus disimpan aman (apostrof) tapi dibaca apa adanya', () => {
  const gas = setupGas();
  const kegiatan = '=IMPORTXML("http://x","//a")';
  const saved = gas.call('logbook.save', 'tok-ani', { tanggal: '2026-10-07', kegiatan });
  assert.equal(saved.ok, true, saved.error);
  const list = gas.call('logbook.list', 'tok-ani', { bulan: '2026-10' }).data;
  assert.equal(list[0].kegiatan, kegiatan);
  assert.ok(gas.sheets.Logbook.rawWrites.some((r) => r.includes("'" + kegiatan)));
  assert.ok(!gas.sheets.Logbook.rows.some((r) => r.some((c) => c.startsWith("'"))));
});
