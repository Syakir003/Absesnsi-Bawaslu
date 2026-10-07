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

const withPair = (key, val) => VALID_PAIRS.map(([k, v]) => [k, k === key ? val : v]);

test('parseConfig: jam di luar 00:00–23:59 ditolak', () => {
  assert.throws(() => core.parseConfig(withPair('jam_masuk', '25:99')), /Config jam_masuk tidak valid: "25:99"/);
  assert.throws(() => core.parseConfig(withPair('batas_telat', '24:00')), /Config batas_telat tidak valid: "24:00"/);
  assert.throws(() => core.parseConfig(withPair('batas_telat', '08:60')), /Config batas_telat tidak valid: "08:60"/);
  assert.equal(core.parseConfig(withPair('jam_masuk', '00:00')).jamMasuk, '00:00');
  assert.equal(core.parseConfig(withPair('batas_telat', '23:59')).batasTelat, '23:59');
});

test('parseConfig: radius_meter harus > 0', () => {
  assert.throws(() => core.parseConfig(withPair('radius_meter', '-5')), /Config radius_meter harus > 0, sekarang: "-5"/);
  assert.throws(() => core.parseConfig(withPair('radius_meter', '0')), /Config radius_meter harus > 0, sekarang: "0"/);
});

test('parseConfig: max_akurasi_meter harus > 0', () => {
  assert.throws(() => core.parseConfig(withPair('max_akurasi_meter', '0')), /Config max_akurasi_meter harus > 0, sekarang: "0"/);
  assert.throws(() => core.parseConfig(withPair('max_akurasi_meter', '-1')), /Config max_akurasi_meter harus > 0, sekarang: "-1"/);
});

test('parseConfig: batas_edit_logbook_hari bilangan bulat >= 0', () => {
  assert.throws(() => core.parseConfig(withPair('batas_edit_logbook_hari', '-1')), /Config batas_edit_logbook_hari harus bilangan bulat >= 0, sekarang: "-1"/);
  assert.throws(() => core.parseConfig(withPair('batas_edit_logbook_hari', '1.5')), /Config batas_edit_logbook_hari harus bilangan bulat >= 0, sekarang: "1.5"/);
  assert.equal(core.parseConfig(withPair('batas_edit_logbook_hari', '0')).batasEditLogbookHari, 0);
});

test('parseConfig: kantor_lat dalam [-90,90] dan kantor_lng dalam [-180,180]', () => {
  assert.throws(() => core.parseConfig(withPair('kantor_lat', '91')), /Config kantor_lat harus antara -90 dan 90, sekarang: "91"/);
  assert.throws(() => core.parseConfig(withPair('kantor_lat', '-90.5')), /Config kantor_lat harus antara -90 dan 90/);
  assert.throws(() => core.parseConfig(withPair('kantor_lng', '181')), /Config kantor_lng harus antara -180 dan 180, sekarang: "181"/);
  assert.throws(() => core.parseConfig(withPair('kantor_lng', '-180.1')), /Config kantor_lng harus antara -180 dan 180/);
  assert.equal(core.parseConfig(withPair('kantor_lat', '90')).kantorLat, 90);
  assert.equal(core.parseConfig(withPair('kantor_lng', '-180')).kantorLng, -180);
});
