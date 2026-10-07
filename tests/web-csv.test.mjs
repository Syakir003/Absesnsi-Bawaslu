import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../web/js/csv.js';

test('csvCell: escape koma, kutip, newline', () => {
  assert.equal(csvCell('biasa'), 'biasa');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('kata "kutip"'), '"kata ""kutip"""');
  assert.equal(csvCell('baris1\nbaris2'), '"baris1\nbaris2"');
  assert.equal(csvCell(null), '');
});

test('csvCell: cegah formula injection, angka negatif aman', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+62812'), "'+62812");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('-7.9666'), '-7.9666');
});

test('toCsv: header + baris pakai CRLF', () => {
  const csv = toCsv([{ nama: 'Ani', hadir: 3 }], [{ label: 'Nama', key: 'nama' }, { label: 'Hadir', key: 'hadir' }]);
  assert.equal(csv, 'Nama,Hadir\r\nAni,3');
});
