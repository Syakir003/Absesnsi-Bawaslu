// Fixture bersama untuk test API: sheet sudah di-setup, config terisi, 1 admin + 1 peserta.
const { createGas } = require('./gas-fakes');

const CID = 'cid.apps.googleusercontent.com';
const EXP = String(Math.floor(new Date('2026-10-07T12:00:00Z').getTime() / 1000));
const info = (email) => ({ aud: CID, iss: 'accounts.google.com', email_verified: 'true', exp: EXP, email, name: email });
// Buat base64 dengan prefix magic dan tepat `n` byte (padding '=' sesuai), lolos validateUpload.
function fileOfBytes(prefix, n) {
  const chars = Math.ceil(n / 3) * 4;
  const pad = (3 - (n % 3)) % 3;
  return prefix + 'A'.repeat(chars - prefix.length - pad) + '='.repeat(pad);
}
const SELFIE = { mime: 'image/jpeg', base64: fileOfBytes('/9j/', 2000) };
const SURAT = { mime: 'application/pdf', base64: fileOfBytes('JVBERi0x', 500) };
const LAMPIRAN = { mime: 'image/jpeg', base64: fileOfBytes('/9j/', 300) };
const LAMPIRAN2 = { mime: 'image/png', base64: fileOfBytes('iVBORw0KGgo', 400) };
const KANTOR = { lat: -7.9666, lng: 112.6326, accuracy: 10 };

function setupGas() {
  const gas = createGas({ tokenInfo: { 'tok.ani.sig': info('ani@gmail.com'), 'tok.admin.sig': info('admin@gmail.com'), 'tok.asing.sig': info('asing@gmail.com') } });
  gas.ctx.setupSheets();
  const cfg = gas.sheets.Config;
  const set = (k, v) => { cfg.rows.find((r) => r[0] === k)[1] = v; };
  set('kantor_lat', '-7.9666');
  set('kantor_lng', '112.6326');
  set('folder_id', 'FOLDER');
  set('google_client_id', CID);
  gas.sheets.Admin.appendRow(['admin@gmail.com', 'Pak Admin']);
  gas.sheets.Peserta.appendRow(['Ani@Gmail.com', 'Ani', 'UB', 'Y', '2026-09-01', '2026-12-31']);
  return gas;
}

module.exports = { CID, info, SELFIE, SURAT, LAMPIRAN, LAMPIRAN2, KANTOR, fileOfBytes, setupGas };
