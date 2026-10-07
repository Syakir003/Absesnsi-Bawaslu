const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers/load-core');
const core = loadCore();

const VALID_PAIRS = [
  ['kantor_lat', '-7.9666'], ['kantor_lng', '112.6326'], ['radius_meter', '100'],
  ['jam_masuk', '07:30'], ['batas_telat', '08:00'], ['batas_edit_logbook_hari', '1'],
  ['max_akurasi_meter', '100'], ['folder_id', 'abc123'], ['google_client_id', 'cid.apps.googleusercontent.com'],
];

test('haversineMeters: titik sama = 0', () => {
  assert.equal(core.haversineMeters(-7.9666, 112.6326, -7.9666, 112.6326), 0);
});

test('haversineMeters: 0.001 derajat lintang ≈ 111 m', () => {
  const d = core.haversineMeters(-7.9666, 112.6326, -7.9676, 112.6326);
  assert.ok(d > 110 && d < 112, `dapat ${d}`);
});

test('parseConfig: nilai valid di-parse ke tipe yang benar', () => {
  assert.deepEqual(core.parseConfig(VALID_PAIRS), {
    kantorLat: -7.9666, kantorLng: 112.6326, radiusMeter: 100, jamMasuk: '07:30', batasTelat: '08:00',
    batasEditLogbookHari: 1, maxAkurasiMeter: 100, folderId: 'abc123', googleClientId: 'cid.apps.googleusercontent.com',
  });
});

test('parseConfig: key kosong dilaporkan', () => {
  const pairs = VALID_PAIRS.filter(([k]) => k !== 'folder_id');
  assert.throws(() => core.parseConfig(pairs), /Config belum lengkap: folder_id/);
});

test('parseConfig: angka tidak valid ditolak', () => {
  const pairs = VALID_PAIRS.map(([k, v]) => [k, k === 'kantor_lat' ? 'ISI_LATITUDE' : v]);
  assert.throws(() => core.parseConfig(pairs), /kantor_lat harus angka/);
});

test('parseConfig: format jam salah ditolak', () => {
  const pairs = VALID_PAIRS.map(([k, v]) => [k, k === 'batas_telat' ? '8.00' : v]);
  assert.throws(() => core.parseConfig(pairs), /batas_telat harus format HH:mm/);
});
