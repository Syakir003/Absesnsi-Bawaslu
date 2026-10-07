const test = require('node:test');
const assert = require('node:assert/strict');
const { SELFIE, SURAT, LAMPIRAN, LAMPIRAN2, KANTOR, setupGas } = require('./helpers/fixtures');

const checkinWfo = (gas) => gas.call('absen.checkin', 'tok.ani.sig', { status: 'Masuk', mode: 'WFO', selfie: SELFIE, ...KANTOR });
const trashedCount = (gas) => Object.values(gas.files).filter((f) => f.trashed).length;

function patchLock(gas, tryLock) {
  const calls = [];
  gas.ctx.LockService = { getScriptLock: () => ({ tryLock, releaseLock: () => calls.push('release') }) };
  return calls;
}

test('flush: check-in memanggil SpreadsheetApp.flush sebelum lock dilepas', () => {
  const gas = setupGas();
  const events = [];
  gas.ctx.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => events.push(['release', gas.flushCalls]) }),
  };
  assert.equal(checkinWfo(gas).ok, true);
  assert.equal(gas.flushCalls, 1);
  assert.deepEqual(events, [['release', 1]]);
});

test('insert_: sheet penuh (lastRow == maxRows) otomatis diperluas dan baris tersimpan', () => {
  const gas = setupGas();
  const sh = gas.sheets.Absensi;
  while (sh.rows.length < sh.getMaxRows()) sh.rows.push(new Array(20).fill(''));
  assert.equal(sh.getLastRow(), sh.getMaxRows());
  assert.equal(checkinWfo(gas).ok, true);
  assert.equal(sh.getMaxRows(), 1100);
  assert.equal(sh.rows[1000][1], 'ani@gmail.com');
  assert.deepEqual(sh.rawWrites[sh.rawWrites.length - 1].slice(1, 3), ['ani@gmail.com', '2026-10-07']);
});

test('baca waktu: Date time-only Sheets (1899) → HH:mm:ss, Date biasa → yyyy-MM-dd', () => {
  const gas = setupGas();
  assert.equal(gas.call('absen.checkin', 'tok.ani.sig', { status: 'Izin', surat: SURAT }).ok, true);
  const row = gas.sheets.Absensi.rows[1];
  row[3] = new Date(Date.UTC(1899, 11, 30, 0, 15)); // jam_masuk, 07:15 WIB
  row[2] = new Date(Date.UTC(2026, 9, 6, 17, 0)); // tanggal 2026-10-07 WIB
  const me = gas.call('me', 'tok.ani.sig', {}).data;
  assert.equal(me.today, '2026-10-07');
  assert.equal(me.absensiHariIni.jam_masuk, '07:15:00');
  assert.equal(me.absensiHariIni.tanggal, '2026-10-07');
});

test('baca teks: apostrof pelindung yang tersimpan literal di sel dibuang', () => {
  const gas = setupGas();
  gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan x' });
  gas.sheets.Logbook.rows[1][3] = "'=1+1";
  assert.equal(gas.call('logbook.list', 'tok.ani.sig', { bulan: '2026-10' }).data[0].kegiatan, '=1+1');
});

test('lock sibuk saat check-in → error sibuk DAN file upload di-trash', () => {
  const gas = setupGas();
  patchLock(gas, () => false);
  const res = checkinWfo(gas);
  assert.match(res.error, /Server sedang sibuk/);
  assert.equal(Object.keys(gas.files).length, 1);
  assert.equal(trashedCount(gas), 1);
  assert.equal(gas.rowsOf('Absensi').length, 0);
});

test('race check-in: baris muncul sebelum lock → "sudah mengisi" DAN file di-trash', () => {
  const gas = setupGas();
  patchLock(gas, () => {
    const headers = gas.sheets.Absensi.rows[0];
    const row = headers.map((h) => ({ id: 'x', email: 'ani@gmail.com', tanggal: '2026-10-07', status: 'Izin' }[h] || ''));
    gas.sheets.Absensi.appendRow(row);
    return true;
  });
  const res = checkinWfo(gas);
  assert.match(res.error, /sudah mengisi/);
  assert.equal(trashedCount(gas), 1);
});

test('lock sibuk saat check-out → file pulang di-trash', () => {
  const gas = setupGas();
  assert.equal(checkinWfo(gas).ok, true);
  gas.setNow(new Date('2026-10-07T09:00:00Z'));
  patchLock(gas, () => false);
  const res = gas.call('absen.checkout', 'tok.ani.sig', { selfie: SELFIE, ...KANTOR });
  assert.match(res.error, /Server sedang sibuk/);
  assert.equal(Object.keys(gas.files).length, 2);
  assert.equal(trashedCount(gas), 1);
  assert.equal(gas.rowsOf('Absensi')[0].jam_pulang, '');
});

test('error saat menulis (insert gagal) → file di-trash, error generik', () => {
  const gas = setupGas();
  gas.sheets.Absensi.getRange = () => { throw new Error('boom'); };
  const res = checkinWfo(gas);
  assert.equal(res.code, 'SERVER');
  assert.equal(trashedCount(gas), 1);
});

test('logbook: lock sibuk → lampiran baru di-trash', () => {
  const gas = setupGas();
  patchLock(gas, () => false);
  const res = gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan a', lampiran: LAMPIRAN });
  assert.match(res.error, /Server sedang sibuk/);
  assert.equal(trashedCount(gas), 1);
});

test('logbook: simpan ulang dengan lampiran baru → lampiran lama di-trash, baru tidak', () => {
  const gas = setupGas();
  assert.equal(gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan a', lampiran: LAMPIRAN }).ok, true);
  assert.equal(trashedCount(gas), 0);
  const res = gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan b', lampiran: LAMPIRAN2 });
  assert.equal(res.ok, true, res.error);
  assert.equal(Object.keys(gas.files).length, 2);
  assert.equal(gas.files.f1.trashed, true);
  assert.equal(gas.files.f2.trashed, false);
  assert.ok(res.data.link_lampiran.endsWith('/f2'));
  // simpan ulang tanpa lampiran: lampiran tetap
  gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan c' });
  assert.equal(gas.files.f2.trashed, false);
});

test("router: 'constructor' dan '__proto__' bukan aksi", () => {
  const gas = setupGas();
  ['constructor', '__proto__', 'toString', 'hasOwnProperty'].forEach((a) => {
    const res = gas.call(a, 'tok.ani.sig', {});
    assert.equal(res.ok, false);
    assert.match(res.error, /Aksi tidak dikenal/);
  });
});

test('body sampah → error SERVER generik, bukan crash', () => {
  const gas = setupGas();
  const res = JSON.parse(gas.ctx.doPost({ postData: { contents: 'bukan json' } }).text);
  assert.deepEqual(res, { ok: false, error: 'Terjadi kesalahan di server. Coba lagi.', code: 'SERVER' });
});

test('koordinat sampah ([] / spasi / teks) ditolak sebagai GPS tidak terbaca', () => {
  const gas = setupGas();
  [[[], 112.7], [' ', 112.7], ['abc', 112.7], [-8.1, []], [-8.1, 112.7, []]].forEach(([lat, lng, acc]) => {
    const res = gas.call('absen.checkin', 'tok.ani.sig', { status: 'Masuk', mode: 'WFH', selfie: SELFIE, lat, lng, accuracy: acc === undefined ? 20 : acc });
    assert.match(res.error, /Lokasi GPS tidak terbaca/);
  });
  assert.equal(Object.keys(gas.files).length, 0);
  // string numerik tetap diterima
  const ok = gas.call('absen.checkin', 'tok.ani.sig', { status: 'Masuk', mode: 'WFH', selfie: SELFIE, lat: '-8.1', lng: ' 112.7 ', accuracy: '20' });
  assert.equal(ok.ok, true, ok.error);
});

test('respons check-in/check-out/logbook.save berbentuk sama dengan baris tersimpan', () => {
  const gas = setupGas();
  const masuk = checkinWfo(gas);
  const header = gas.sheets.Absensi.rows[0];
  assert.deepEqual(Object.keys(masuk.data), header);
  assert.equal(masuk.data.jam_pulang, '');
  assert.equal(typeof masuk.data.akurasi_masuk, 'string');
  assert.equal(typeof masuk.data.jarak_masuk, 'string');
  assert.equal(masuk.data._row, undefined);
  assert.deepEqual(masuk.data, gas.call('me', 'tok.ani.sig', {}).data.absensiHariIni);

  gas.setNow(new Date('2026-10-07T09:00:00Z'));
  const pulang = gas.call('absen.checkout', 'tok.ani.sig', { selfie: SELFIE, ...KANTOR });
  assert.deepEqual(Object.keys(pulang.data), header);
  assert.deepEqual(pulang.data, gas.call('me', 'tok.ani.sig', {}).data.absensiHariIni);

  const lb = gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: '=SUM(1+1)' });
  assert.deepEqual(Object.keys(lb.data), gas.sheets.Logbook.rows[0]);
  assert.equal(lb.data.link_lampiran, '');
  assert.equal(lb.data.kegiatan, '=SUM(1+1)');
  const lb2 = gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan y' });
  assert.deepEqual(Object.keys(lb2.data), gas.sheets.Logbook.rows[0]);
});

test('token: pra-filter bentuk JWT sebelum fetch tokeninfo', () => {
  const gas = setupGas();
  ['abc', 'a.b', 'a..c', '.b.c', 'a.b.c.d', 'x'.repeat(4097), 12345, { a: 1 }].forEach((t) => {
    const res = gas.call('me', t, {});
    assert.equal(res.code, 'AUTH', String(t).slice(0, 20));
  });
  assert.equal(gas.call('me', 'abc', {}).error, 'Sesi login tidak valid. Silakan login ulang.');
  assert.equal(gas.fetchCalls.length, 0);
});

test('logbook: lampiran lama di luar folder presensi TIDAK di-trash (link ditempel manual)', () => {
  const gas = setupGas();
  gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan a', lampiran: LAMPIRAN });
  const other = gas.ctx.DriveApp.getFolderById('OTHER').createFile({ bytes: [1], mime: 'image/jpeg', name: 'lain.jpg' });
  gas.sheets.Logbook.rows[1][4] = other.getUrl();
  const res = gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan b', lampiran: LAMPIRAN2 });
  assert.equal(res.ok, true, res.error);
  assert.equal(gas.files[other.getId()].trashed, false);
  assert.equal(gas.files.f1.trashed, false); // f1 tidak lagi direferensikan sheet, tapi bukan urusan di sini
  assert.equal(gas.files[other.getId()].parent, 'OTHER');
});

test('logbook: lampiran lama berupa link Docs/id tak dikenal → tidak error, tidak ada yang di-trash', () => {
  const gas = setupGas();
  gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan a', lampiran: LAMPIRAN });
  gas.sheets.Logbook.rows[1][4] = 'https://docs.google.com/document/d/unknownId123/edit';
  const res = gas.call('logbook.save', 'tok.ani.sig', { tanggal: '2026-10-07', kegiatan: 'kegiatan b', lampiran: LAMPIRAN2 });
  assert.equal(res.ok, true, res.error);
  assert.equal(trashedCount(gas), 0);
});
