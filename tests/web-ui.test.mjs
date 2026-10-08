import test from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, setBusy, loadInto, h, formatTanggal } from '../web/js/ui.js';

test('safeUrl: hanya https ke host Google yang diizinkan', () => {
  assert.equal(safeUrl('https://drive.google.com/file/d/abc/view'), 'https://drive.google.com/file/d/abc/view');
  assert.equal(safeUrl('https://docs.google.com/document/d/abc'), 'https://docs.google.com/document/d/abc');
  assert.equal(safeUrl('https://www.google.com/maps?q=-7.9,112.7'), 'https://www.google.com/maps?q=-7.9,112.7');
});

test('safeUrl: tolak host lain, skema lain, dan sampah', () => {
  assert.equal(safeUrl('https://evil.example.com/x'), null);
  assert.equal(safeUrl('https://drive.google.com.evil.com/x'), null);
  assert.equal(safeUrl('https://drive.google.com@evil.com/x'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('http://drive.google.com/x'), null);
  assert.equal(safeUrl('data:text/html,<b>x</b>'), null);
  assert.equal(safeUrl('//drive.google.com/x'), null);
  assert.equal(safeUrl('bukan url'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl(null), null);
  assert.equal(safeUrl(undefined), null);
});

test('setBusy: dua kali busy tidak menimpa label asli', () => {
  const btn = { dataset: {}, textContent: 'Simpan', disabled: false };
  setBusy(btn, true, 'Menyimpan...');
  setBusy(btn, true, 'Menyimpan...');
  assert.equal(btn.textContent, 'Menyimpan...');
  assert.equal(btn.disabled, true);
  setBusy(btn, false);
  assert.equal(btn.textContent, 'Simpan');
  assert.equal(btn.disabled, false);
  // siklus berikutnya tetap benar
  setBusy(btn, true);
  setBusy(btn, false);
  assert.equal(btn.textContent, 'Simpan');
});

// Stub DOM minimal supaya h()/loadInto bisa jalan di Node.
function installDom() {
  class FakeNode {}
  class FakeEl extends FakeNode {
    constructor(tag) { super(); this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.dataset = {}; }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(k, fn) { this.listeners[k] = fn; }
    append(...c) { this.children.push(...c); }
    replaceChildren(...c) { this.children = c; }
  }
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => Object.assign(new FakeNode(), { text: String(t) }) };
  return FakeEl;
}
const textOf = (el) => el.children.map((c) => (c.text ?? textOf(c))).join('');

test('h: atribut on* non-fungsi diabaikan (tidak jadi inline handler)', () => {
  installDom();
  const el = h('button', { onclick: 'alert(1)', onerror: 'x()', type: 'button' }, 'ok');
  assert.equal(el.attrs.onclick, undefined);
  assert.equal(el.attrs.onerror, undefined);
  assert.equal(el.attrs.type, 'button');
  const fn = () => {};
  const el2 = h('button', { onClick: fn });
  assert.equal(el2.listeners.click, fn);
});

test('loadInto: respons lama tidak menimpa respons terbaru', async () => {
  const El = installDom();
  const out = new El('div');
  let resolveSlow;
  const slow = new Promise((r) => { resolveSlow = r; });
  const p1 = loadInto(out, () => slow, (d) => h('p', {}, d));
  const p2 = loadInto(out, async () => 'baru', (d) => h('p', {}, d));
  await p2;
  assert.equal(textOf(out), 'baru');
  resolveSlow('lama');
  await p1;
  assert.equal(textOf(out), 'baru');
});

test('loadInto: error lama juga diabaikan', async () => {
  const El = installDom();
  const out = new El('div');
  let rejectSlow;
  const slow = new Promise((_, rej) => { rejectSlow = rej; });
  const p1 = loadInto(out, () => slow, (d) => h('p', {}, d));
  await loadInto(out, async () => 'baru', (d) => h('p', {}, d));
  rejectSlow(new Error('gagal lama'));
  await p1;
  assert.equal(textOf(out), 'baru');
});

test('formatTanggal tetap bekerja', () => {
  assert.equal(formatTanggal('2026-10-07'), 'Rab, 07 Okt 2026');
});

test('addDays: aritmetika tanggal UTC lintas bulan/tahun/kabisat', async () => {
  const { addDays } = await import('../web/js/ui.js');
  assert.equal(addDays('2026-10-07', -1), '2026-10-06');
  assert.equal(addDays('2026-10-01', -1), '2026-09-30');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(addDays('2026-10-07', 0), '2026-10-07');
});

import { driveId } from '../web/js/ui.js';

test('driveId: ambil ID dari tautan Drive, tolak host lain', () => {
  assert.equal(driveId('https://drive.google.com/file/d/1AbC_-x/view?usp=drivesdk'), '1AbC_-x');
  assert.equal(driveId('https://evil.com/file/d/123/view'), null);
  assert.equal(driveId(''), null);
});
