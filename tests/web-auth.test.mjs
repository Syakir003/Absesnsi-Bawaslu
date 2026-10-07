import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeJwt } from '../web/js/auth.js';

test('decodeJwt: payload base64url + UTF-8', () => {
  const payload = { email: 'ani@gmail.com', name: 'Ani Sêtya', exp: 123 };
  const b64url = Buffer.from(JSON.stringify(payload)).toString('base64url');
  assert.deepEqual(decodeJwt(`xx.${b64url}.yy`), payload);
});
