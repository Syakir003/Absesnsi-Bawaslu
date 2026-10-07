const test = require('node:test');
const assert = require('node:assert/strict');
const { createGas } = require('./helpers/gas-fakes');

test('setupSheets membuat semua sheet + config default', () => {
  const gas = createGas();
  gas.ctx.setupSheets();
  assert.deepEqual(Object.keys(gas.sheets).sort(), ['Absensi', 'Admin', 'Config', 'Logbook', 'Peserta']);
  assert.deepEqual(gas.sheets.Absensi.rows[0].slice(0, 3), ['id', 'email', 'tanggal']);
  assert.equal(gas.sheets.Config.rows.length, 10);
});

test('setupSheets aman dijalankan ulang (config tidak ditimpa)', () => {
  const gas = createGas();
  gas.ctx.setupSheets();
  gas.sheets.Config.rows[1][1] = '-7.9666';
  gas.ctx.setupSheets();
  assert.equal(gas.sheets.Config.rows[1][1], '-7.9666');
});

test('readConfig_ menolak config default yang belum diisi', () => {
  const gas = createGas();
  gas.ctx.setupSheets();
  assert.throws(() => gas.ctx.readConfig_(), /kantor_lat harus angka/);
});
