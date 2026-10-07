import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../web/js/csv.js';

test('csvCell: escape koma, titik koma, kutip, newline', () => {
  assert.equal(csvCell('biasa'), 'biasa');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell('kata "kutip"'), '"kata ""kutip"""');
  assert.equal(csvCell('baris1\nbaris2'), '"baris1\nbaris2"');
  assert.equal(csvCell('baris1\r\nbaris2'), '"baris1\r\nbaris2"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('csvCell: cegah formula injection, angka polos aman', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell('\tcmd'), "'\tcmd");
  assert.equal(csvCell('-7.9666'), '-7.9666');
  assert.equal(csvCell('112.7508'), '112.7508');
  assert.equal(csvCell(-7.9666), '-7.9666');
  assert.equal(csvCell('+62812'), '+62812'); // angka polos (tidak bisa jadi rumus)
});

test('csvCell: bypass angka-diikuti-rumus tetap diberi apostrof', () => {
  assert.equal(csvCell('-1+HYPERLINK("x")'), '"\'-1+HYPERLINK(""x"")"');
  assert.equal(csvCell('-2+3+cmd|\' /C calc\'!A0'), "'-2+3+cmd|' /C calc'!A0");
  assert.equal(csvCell('+1-1'), "'+1-1");
  assert.equal(csvCell('-.5'), "'-.5");
  assert.equal(csvCell('-5.'), "'-5.");
});

test('toCsv: header + baris pakai CRLF dan pemisah ; secara default', () => {
  const cols = [{ label: 'Nama', key: 'nama' }, { label: 'Hadir', key: 'hadir' }];
  assert.equal(toCsv([{ nama: 'Ani', hadir: 3 }], cols), 'Nama;Hadir\r\nAni;3');
  assert.equal(toCsv([{ nama: 'Ani', hadir: 3 }, { nama: 'Budi', hadir: 1 }], cols), 'Nama;Hadir\r\nAni;3\r\nBudi;1');
});

test('toCsv: delimiter bisa diganti dan sel yang memuat delimiter dikutip', () => {
  const cols = [{ label: 'Nama', key: 'nama' }, { label: 'Catatan', key: 'c' }];
  assert.equal(toCsv([{ nama: 'Ani', c: 'a;b' }], cols), 'Nama;Catatan\r\nAni;"a;b"');
  assert.equal(toCsv([{ nama: 'Ani', c: 'a,b' }], cols, ','), 'Nama,Catatan\r\nAni,"a,b"');
  assert.equal(toCsv([{ nama: 'Ani', c: 'a\tb' }], cols, '\t'), 'Nama\tCatatan\r\nAni\t"a\tb"');
});
