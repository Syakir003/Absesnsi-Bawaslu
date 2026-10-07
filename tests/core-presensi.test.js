const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

const config = { kantorLat: -7.9666, kantorLng: 112.6326, radiusMeter: 100, maxAkurasiMeter: 50 };
const diKantor = { lat: -7.9667, lng: 112.6326, accuracy: 10 };   // ±11 m
const jauh = { lat: -7.9766, lng: 112.6326, accuracy: 10 };       // ±1,1 km

test('checkIn Masuk WFO dalam radius → ok + jarak', () => {
  const r = core.validateCheckIn({ status: 'Masuk', mode: 'WFO', hasSelfie: true, ...diKantor }, null, config);
  assert.equal(r.ok, true);
  assert.equal(r.distance, 11);
  assert.deepEqual(r.flags, []);
});

test('checkIn WFO di luar radius → ditolak dengan info jarak', () => {
  const r = core.validateCheckIn({ status: 'Masuk', mode: 'WFO', hasSelfie: true, ...jauh }, null, config);
  assert.equal(r.ok, false);
  assert.match(r.error, /1112 m dari kantor \(maks 100 m\)/);
});

test('checkIn WFH jauh tetap ok, akurasi jelek di-flag', () => {
  const r = core.validateCheckIn({ status: 'Masuk', mode: 'WFH', hasSelfie: true, ...jauh, accuracy: 300 }, null, config);
  assert.equal(r.ok, true);
  assert.deepEqual(r.flags, ['AKURASI_RENDAH']);
});

test('checkIn Masuk tanpa selfie / mode / GPS ditolak', () => {
  assert.match(core.validateCheckIn({ status: 'Masuk', mode: 'WFO', hasSelfie: false, ...diKantor }, null, config).error, /Selfie wajib/);
  assert.match(core.validateCheckIn({ status: 'Masuk', mode: 'X', hasSelfie: true, ...diKantor }, null, config).error, /WFO atau WFH/);
  assert.match(core.validateCheckIn({ status: 'Masuk', mode: 'WFO', hasSelfie: true, lat: null, lng: null, accuracy: null }, null, config).error, /GPS tidak terbaca/);
});

test('checkIn Izin/Sakit wajib surat, tanpa GPS', () => {
  assert.deepEqual(core.validateCheckIn({ status: 'Sakit', hasSurat: true }, null, config), { ok: true, distance: null, flags: [] });
  assert.match(core.validateCheckIn({ status: 'Izin', hasSurat: false }, null, config).error, /wajib melampirkan surat/);
});

test('checkIn dobel / status asing ditolak', () => {
  assert.match(core.validateCheckIn({ status: 'Izin', hasSurat: true }, { status: 'Masuk' }, config).error, /sudah mengisi presensi hari ini \(Masuk\)/);
  assert.match(core.validateCheckIn({ status: 'Alpa' }, null, config).error, /Status tidak valid/);
});

test('checkOut: alur normal pakai mode saat masuk', () => {
  const existing = { status: 'Masuk', mode: 'WFO', jam_pulang: '' };
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...diKantor }, existing, config).ok, true);
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...jauh }, existing, config).ok, false);
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...jauh }, { ...existing, mode: 'WFH' }, config).ok, true);
});

test('checkOut: belum masuk / izin / sudah pulang / tanpa selfie', () => {
  assert.match(core.validateCheckOut({ hasSelfie: true, ...diKantor }, null, config).error, /belum absen masuk/);
  assert.match(core.validateCheckOut({ hasSelfie: true, ...diKantor }, { status: 'Izin' }, config).error, /tercatat Izin/);
  assert.match(core.validateCheckOut({ hasSelfie: true, ...diKantor }, { status: 'Masuk', mode: 'WFO', jam_pulang: '16:00:00' }, config).error, /sudah absen pulang/);
  assert.match(core.validateCheckOut({ hasSelfie: false, ...diKantor }, { status: 'Masuk', mode: 'WFO', jam_pulang: '' }, config).error, /Selfie wajib/);
});

test('checkIn: koordinat / akurasi di luar rentang → Lokasi GPS tidak valid', () => {
  const base = { status: 'Masuk', mode: 'WFH', hasSelfie: true, ...diKantor };
  const msg = { ok: false, error: 'Lokasi GPS tidak valid.' };
  assert.deepEqual(core.validateCheckIn({ ...base, lat: 91 }, null, config), msg);
  assert.deepEqual(core.validateCheckIn({ ...base, lat: -90.01 }, null, config), msg);
  assert.deepEqual(core.validateCheckIn({ ...base, lng: 181 }, null, config), msg);
  assert.deepEqual(core.validateCheckIn({ ...base, lng: -180.01 }, null, config), msg);
  assert.deepEqual(core.validateCheckIn({ ...base, accuracy: -1 }, null, config), msg);
  // batas tepat masih valid
  assert.equal(core.validateCheckIn({ ...base, lat: 90, lng: 180, accuracy: 0 }, null, config).ok, true);
});

test('checkOut: koordinat tidak valid ditolak', () => {
  const existing = { status: 'Masuk', mode: 'WFH', jam_pulang: '' };
  assert.deepEqual(core.validateCheckOut({ hasSelfie: true, ...diKantor, lat: 200 }, existing, config), { ok: false, error: 'Lokasi GPS tidak valid.' });
});

test('checkOut: mode kosong/asing → radius tetap berlaku (default-deny), hanya WFH dibebaskan', () => {
  const kosong = { status: 'Masuk', mode: '', jam_pulang: '' };
  const r = core.validateCheckOut({ hasSelfie: true, ...jauh }, kosong, config);
  assert.equal(r.ok, false);
  assert.match(r.error, /dari kantor \(maks 100 m\)/);
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...jauh }, { ...kosong, mode: undefined }, config).ok, false);
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...jauh }, { ...kosong, mode: 'wfh' }, config).ok, false);
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...diKantor }, kosong, config).ok, true);
  assert.equal(core.validateCheckOut({ hasSelfie: true, ...jauh }, { ...kosong, mode: 'WFH' }, config).ok, true);
});
