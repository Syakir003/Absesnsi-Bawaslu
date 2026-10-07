import test from 'node:test';
import assert from 'node:assert/strict';
import { detectKind } from '../web/js/file.js';

test('detectKind: berdasarkan MIME', () => {
  assert.equal(detectKind({ type: 'image/jpeg', name: 'a.jpg', size: 5 }), 'image');
  assert.equal(detectKind({ type: 'image/jpg', name: 'a.jpg', size: 5 }), 'image');
  assert.equal(detectKind({ type: 'image/png', name: 'a.png', size: 5 }), 'image');
  assert.equal(detectKind({ type: 'application/pdf', name: 'a.pdf', size: 5 }), 'pdf');
});

test('detectKind: MIME kosong → tebak dari ekstensi (case-insensitive)', () => {
  assert.equal(detectKind({ type: '', name: 'FOTO.JPG', size: 5 }), 'image');
  assert.equal(detectKind({ type: '', name: 'foto.jpeg', size: 5 }), 'image');
  assert.equal(detectKind({ type: '', name: 'foto.PNG', size: 5 }), 'image');
  assert.equal(detectKind({ type: '', name: 'surat.Pdf', size: 5 }), 'pdf');
  assert.equal(detectKind({ name: 'surat.pdf', size: 5 }), 'pdf');
});

test('detectKind: format lain → null', () => {
  assert.equal(detectKind({ type: 'image/gif', name: 'a.gif', size: 5 }), null);
  assert.equal(detectKind({ type: 'image/webp', name: 'a.webp', size: 5 }), null);
  assert.equal(detectKind({ type: '', name: 'a.docx', size: 5 }), null);
  assert.equal(detectKind({ type: '', name: 'tanpa-ekstensi', size: 5 }), null);
  assert.equal(detectKind({ type: 'application/octet-stream', name: 'a.bin', size: 5 }), null);
  assert.equal(detectKind(null), null);
});
