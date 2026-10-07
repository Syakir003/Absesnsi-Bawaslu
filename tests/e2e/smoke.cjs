// Smoke test UI: Chromium headless + Google Sign-In, API Apps Script, GPS & kamera dipalsukan.
// Jalankan: npm run test:e2e  (butuh devDependency playwright; set CHROMIUM_PATH kalau pakai Chromium sistem)
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(__dirname, '..', '..', 'web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64u({ alg: 'none' })}.${b64u({ email: 'x@gmail.com', exp: 4102444800 })}.sig`;
const FAKE_GSI = `window.google={accounts:{id:{initialize(o){window.__gsi=o},renderButton(el){const b=document.createElement('button');b.id='fake-google';b.textContent='Login Google';b.onclick=()=>window.__gsi.callback({credential:${JSON.stringify(TOKEN)}});el.append(b)},prompt(){},disableAutoSelect(){}}}};`;

let role = 'peserta';
let absensi = null;
let commitThenReject = true; // sekali: check-in tersimpan tapi responsnya ditolak (meniru retry setelah request yang sebenarnya sukses)
const logbook = [];
const cfg = { jamMasuk: '07:30', batasTelat: '08:00', radiusMeter: 100, batasEditLogbookHari: 1 };
function handle(action, data) {
  switch (action) {
    case 'me': return { email: 'x@gmail.com', nama: role === 'admin' ? 'Pak Admin' : 'Ani', role, today: '2026-10-07', jam: '07:15:00', config: cfg, absensiHariIni: role === 'peserta' ? absensi : undefined };
    case 'absen.checkin':
      if (!data.selfie?.base64 || typeof data.lat !== 'number') throw new Error('payload checkin tidak lengkap');
      absensi = { status: data.status, mode: data.mode, jam_masuk: '07:15:00', jam_pulang: '' }; return absensi;
    case 'absen.checkout': absensi = { ...absensi, jam_pulang: '16:00:00' }; return absensi;
    case 'absen.riwayat': return absensi ? [{ tanggal: '2026-10-07', ...absensi }] : [];
    case 'logbook.save': logbook.push({ tanggal: data.tanggal, kegiatan: data.kegiatan, bisaEdit: true, link_lampiran: '' }); return logbook.at(-1);
    case 'logbook.list': return logbook;
    case 'admin.harian': return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', absensi: { status: 'Masuk', mode: 'WFO', jam_masuk: '07:15:00', jarak_masuk: '11', flags: 'AKURASI_RENDAH', lat_masuk: '-7.9667', lng_masuk: '112.6326', link_selfie_masuk: 'https://drive.google.com/file/d/1' } }, { email: 'b@gmail.com', nama: 'Budi', instansi: 'UM', absensi: null }];
    case 'admin.rekap': return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', hariKerja: 5, hadir: 4, wfo: 3, wfh: 1, izin: 0, sakit: 1, telat: 1, tanpaKeterangan: 0 }];
    case 'admin.peserta.list': return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', aktif: 'Y', tanggal_mulai: '2026-09-01', tanggal_selesai: '2026-12-31' }];
    case 'admin.peserta.save': return data;
    case 'admin.logbook': return [{ tanggal: '2026-10-07', nama: 'Ani', email: 'ani@gmail.com', kegiatan: '=cmd', link_lampiran: '' }];
    default: throw new Error('aksi ' + action);
  }
}

(async () => {
  await new Promise((r) => server.listen(5500, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['geolocation', 'camera'], geolocation: { latitude: -7.9666, longitude: 112.6326, accuracy: 12 }, acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_GSI }));
  await page.route('https://script.google.com/**', async (r) => {
    const req = JSON.parse(r.request().postData());
    if (req.idToken !== TOKEN) return r.fulfill({ json: { ok: false, error: 'no token', code: 'AUTH' } });
    if (commitThenReject && req.action === 'absen.checkin') {
      commitThenReject = false;
      handle(req.action, req.data);
      return r.fulfill({ json: { ok: false, error: 'Kamu sudah mengisi presensi hari ini', code: 'USER' } });
    }
    try { r.fulfill({ json: { ok: true, data: handle(req.action, req.data) } }); }
    catch (e) { errors.push('mock: ' + e.message); r.fulfill({ json: { ok: false, error: e.message, code: 'USER' } }); }
  });

  const step = (s) => console.log('✓', s);
  await page.goto('http://localhost:5500/');
  await page.click('#fake-google'); step('login');
  await page.getByText('Lokasi terbaca').waitFor(); step('gps terbaca');
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0); step('kamera aktif');
  await page.screenshot({ path: path.join(OUT, 'shot-checkin.png'), fullPage: true });
  await page.click('text=Ambil Foto');
  await page.click('text=Kirim Absen Masuk');
  await page.getByText('Kamu sudah mengisi presensi hari ini').first().waitFor();
  await page.getByRole('heading', { name: 'Absen Pulang' }).waitFor(); step('checkin ditolak USER → status disegarkan → form pulang');
  await page.getByText('Lokasi terbaca').waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  await page.click('text=Ambil Foto');
  await page.click('text=Kirim Absen Pulang');
  await page.getByText('Presensi hari ini sudah lengkap').waitFor(); step('checkout selesai');
  await page.click('nav >> text=Riwayat');
  await page.getByText('Rab, 07 Okt 2026').waitFor(); step('riwayat');
  await page.click('nav >> text=Logbook');
  await page.fill('textarea', 'Input data pemilih di sistem');
  await page.click('text=Simpan Logbook');
  await page.getByRole('cell', { name: 'Input data pemilih di sistem' }).waitFor(); step('logbook simpan');
  // Privasi kamera: logout harus mematikan semua track kamera yang sedang aktif
  absensi = null; await page.reload();
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  await page.evaluate(() => { window.__tracks = document.querySelector('video').srcObject.getTracks(); });
  const tracksLive = await page.evaluate(() => window.__tracks.length > 0 && window.__tracks.every((t) => t.readyState === 'live'));
  if (!tracksLive) throw new Error('track kamera seharusnya live sebelum logout');
  await page.click('text=Keluar'); await page.waitForSelector('#fake-google');
  const tracksEnded = await page.evaluate(() => window.__tracks.every((t) => t.readyState === 'ended'));
  if (!tracksEnded) throw new Error('kamera masih menyala setelah logout'); step('logout mematikan kamera');
  // Izin flow on fresh state
  await page.click('#fake-google'); await page.click('.seg >> text=Izin');
  await page.getByText('Surat / bukti').waitFor(); step('form izin tampil');
  await page.screenshot({ path: path.join(OUT, 'shot-izin.png'), fullPage: true });

  role = 'admin'; await page.click('text=Keluar'); await page.click('#fake-google');
  await page.getByText('1 hadir dari 2 peserta').waitFor(); step('admin harian');
  if (!(await page.getAttribute('a:text("Lokasi")', 'href')).includes('maps?q=-7.9667')) throw new Error('link lokasi salah');
  await page.screenshot({ path: path.join(OUT, 'shot-admin.png'), fullPage: true });
  const dl = page.waitForEvent('download'); await page.click('text=Export CSV'); const d = await dl;
  const csv = fs.readFileSync(await d.path(), 'utf8'); if (!csv.includes('AKURASI_RENDAH')) throw new Error('csv kosong'); step('export csv ' + d.suggestedFilename());
  await page.click('nav >> text=Rekap Bulanan'); await page.getByRole('cell', { name: 'Ani' }).waitFor();
  await page.getByText(/akhir pekan/).waitFor(); await page.getByText(/hari ini belum dihitung/).waitFor(); step('rekap + catatan akhir pekan/hari ini');
  await page.click('nav >> text=Peserta'); await page.getByRole('button', { name: 'Edit' }).click();
  if ((await page.inputValue('input[type=email]')) !== 'ani@gmail.com') throw new Error('edit tidak isi form'); 
  await page.click('text=Simpan Peserta'); await page.getByText('Peserta tersimpan.').waitFor(); step('peserta edit+simpan');
  await page.click('nav >> text=Logbook'); await page.getByRole('cell', { name: '=cmd' }).waitFor(); step('admin logbook (teks tidak dieksekusi)');

  await browser.close(); server.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK, tanpa error JS');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
