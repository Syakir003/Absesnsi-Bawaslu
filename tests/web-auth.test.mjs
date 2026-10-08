import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt } from '../web/js/auth.js';

test('decodeJwt: payload base64url + UTF-8', () => {
  const payload = { email: 'ani@gmail.com', name: 'Ani Sêtya', exp: 123 };
  const b64url = Buffer.from(JSON.stringify(payload)).toString('base64url');
  assert.deepEqual(decodeJwt(`xx.${b64url}.yy`), payload);
});

import { isTokenFresh } from '../web/js/auth.js';

test('isTokenFresh: masih berlaku > 60 detik', () => {
  const now = 1_000_000_000_000;
  const exp = Math.floor(now / 1000) + 3000;
  assert.equal(isTokenFresh({ exp }, 0, now), true);
});

test('isTokenFresh: sisa 30 detik dianggap kedaluwarsa', () => {
  const now = 1_000_000_000_000;
  const exp = Math.floor(now / 1000) + 30;
  assert.equal(isTokenFresh({ exp }, 0, now), false);
});

test('isTokenFresh: jam HP cepat ~59 menit tapi skew tercatat tetap fresh', () => {
  const serverNow = 1_000_000_000; // detik
  const payload = { iat: serverNow, exp: serverNow + 3600 };
  const deviceNowMs = (serverNow + 59 * 60 + 30) * 1000;
  const skew = payload.iat - Math.floor(deviceNowMs / 1000); // -3570
  assert.equal(isTokenFresh(payload, skew, deviceNowMs), true);
  assert.equal(isTokenFresh(payload, 0, deviceNowMs), false); // tanpa koreksi: salah dianggap habis
});

test('isTokenFresh: payload tanpa exp dianggap tidak fresh', () => {
  assert.equal(isTokenFresh({}, 0, Date.now()), false);
  assert.equal(isTokenFresh(null, 0, Date.now()), false);
});

import { pictureFromPayload } from '../web/js/auth.js';

test('pictureFromPayload: hanya https googleusercontent', () => {
  assert.equal(pictureFromPayload({ picture: 'https://lh3.googleusercontent.com/a/x=s96-c' }), 'https://lh3.googleusercontent.com/a/x=s96-c');
  assert.equal(pictureFromPayload({ picture: 'https://evil.com/googleusercontent.com' }), null);
  assert.equal(pictureFromPayload({ picture: 'http://lh3.googleusercontent.com/x' }), null);
  assert.equal(pictureFromPayload({}), null);
});
