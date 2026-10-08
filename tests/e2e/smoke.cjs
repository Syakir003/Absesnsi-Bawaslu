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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = `${b64u({ alg: 'none' })}.${b64u({ email: 'x@gmail.com', exp: 4102444800 })}.sig`;
const FAKE_GSI = `window.google={accounts:{id:{initialize(o){window.__gsi=o},renderButton(el){const b=document.createElement('button');b.id='fake-google';b.textContent='Login Google';b.onclick=()=>window.__gsi.callback({credential:${JSON.stringify(TOKEN)}});el.append(b)},prompt(){},disableAutoSelect(){}}}};`;
const DRIVE = 'https://drive.google.com/file/d/1';

class UserErr extends Error {}

let role = 'peserta';
let absensi = null;
let commitThenReject = true; // sekali: check-in tersimpan tapi responsnya ditolak (meniru retry setelah request yang sebenarnya sukses)
let htmlForMe = false; // sekali-sekali: 'me' dijawab HTML (mis. halaman login Apps Script) untuk menguji deployment salah setting
let delayCheckinMs = 0; // tahan respons check-in supaya double submit bisa diuji
const DELAY_ME_MS = 300; // lebar jendela balapan untuk login ganda
const logbook = [{ tanggal: '2026-10-06', kegiatan: 'Catatan kemarin', bisaEdit: true, link_lampiran: '' }];
const calls = [];
const count = (a) => calls.filter((c) => c === a).length;
const cfg = { jamMasuk: '07:30', batasTelat: '08:00', radiusMeter: 100, batasEditLogbookHari: 1 };
function handle(action, data) {
  switch (action) {
    case 'me': return { email: 'x@gmail.com', nama: role === 'admin' ? 'Pak Admin' : 'Ani', role, today: '2026-10-07', jam: '07:15:00', config: cfg, absensiHariIni: role === 'peserta' ? absensi : undefined };
    case 'absen.checkin':
      if (data.status === 'Masuk') {
        if (!data.selfie?.base64 || typeof data.lat !== 'number') throw new Error('payload checkin tidak lengkap');
        absensi = { status: data.status, mode: data.mode, jam_masuk: '07:15:00', jam_pulang: '' };
      } else {
        if (!data.surat?.base64) throw new Error('payload surat tidak lengkap');
        absensi = { status: data.status, link_surat: DRIVE };
      }
      return absensi;
    case 'absen.checkout': absensi = { ...absensi, jam_pulang: '16:00:00' }; return absensi;
    case 'absen.riwayat': return absensi ? [{ tanggal: '2026-10-07', ...absensi }] : [];
    case 'logbook.save': {
      const i = logbook.findIndex((r) => r.tanggal === data.tanggal);
      const row = { tanggal: data.tanggal, kegiatan: data.kegiatan, bisaEdit: true, link_lampiran: DRIVE };
      if (i >= 0) logbook[i] = row; else logbook.push(row);
      return row;
    }
    case 'logbook.list': return logbook.filter((r) => r.tanggal.startsWith(data.bulan));
    case 'admin.harian': return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', absensi: { status: 'Masuk', mode: 'WFO', jam_masuk: '07:15:00', jarak_masuk: '11', akurasi_masuk: '12', flags: 'AKURASI_RENDAH', catatan: 'Dari lapangan', lat_masuk: '-7.9667', lng_masuk: '112.6326', link_selfie_masuk: DRIVE } }, { email: 'b@gmail.com', nama: 'Budi', instansi: 'UM', absensi: null }];
    case 'admin.rekap':
      if (data.bulan === '2026-09') throw new UserErr('Rekap bulan ini gagal dimuat.');
      return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', hariKerja: 5, hadir: 4, wfo: 3, wfh: 1, izin: 0, sakit: 1, telat: 1, tanpaKeterangan: 0 }];
    case 'admin.peserta.list': return [{ email: 'ani@gmail.com', nama: 'Ani', instansi: 'UB', aktif: 'Y', tanggal_mulai: '2026-09-01', tanggal_selesai: '2026-12-31' }];
    case 'admin.peserta.save': return data;
    case 'admin.logbook': return [{ tanggal: '2026-10-07', nama: 'Ani', email: 'ani@gmail.com', kegiatan: '=cmd', link_lampiran: '' }];
    default: throw new Error('aksi ' + action);
  }
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const BASE = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const context = await browser.newContext({ permissions: ['geolocation', 'camera'], geolocation: { latitude: -7.9666, longitude: 112.6326, accuracy: 12 }, acceptDownloads: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // Catat semua MediaStream yang pernah dibuka supaya kebocoran kamera terdeteksi walau elemen <video>-nya sudah hilang.
  await page.addInitScript(() => {
    window.__streams = [];
    // Jam yang bisa dimajukan (window.__offset ms) untuk menguji muat ulang saat kembali ke aplikasi.
    const realNow = Date.now.bind(Date);
    window.__offset = 0;
    Date.now = () => realNow() + window.__offset;
    // Majukan jam virtual sampai 3 detik sebelum tengah malam Asia/Jakarta berikutnya.
    window.__toMidnight = () => {
      const DAY = 24 * 3600 * 1000;
      const intoDay = (Date.now() + 7 * 3600 * 1000) % DAY;
      window.__offset += (DAY - 3000 - intoDay + DAY) % DAY;
    };
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await orig(c); window.__streams.push(s); return s; };
  });
  await page.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_GSI }));
  await page.route('https://script.google.com/**', async (r) => {
    const req = JSON.parse(r.request().postData());
    calls.push(req.action);
    if (req.idToken !== TOKEN) return r.fulfill({ json: { ok: false, error: 'no token', code: 'AUTH' } });
    if (req.action === 'me' && htmlForMe) return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>Sign in - Google Accounts</body></html>' });
    if (req.action === 'me') await sleep(DELAY_ME_MS);
    if (req.action === 'absen.checkin' && delayCheckinMs) await sleep(delayCheckinMs);
    try {
      if (commitThenReject && req.action === 'absen.checkin') {
        commitThenReject = false;
        handle(req.action, req.data);
        return r.fulfill({ json: { ok: false, error: 'Kamu sudah mengisi presensi hari ini', code: 'USER' } });
      }
      r.fulfill({ json: { ok: true, data: handle(req.action, req.data) } });
    } catch (e) {
      if (!(e instanceof UserErr)) errors.push('mock: ' + e.message);
      r.fulfill({ json: { ok: false, error: e.message, code: 'USER' } });
    }
  });

  const step = (s) => console.log('✓', s);
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const liveTracks = () => page.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length);
  const waitNoLive = () => page.waitForFunction(() => window.__streams.flatMap((s) => s.getTracks()).every((t) => t.readyState === 'ended'), null, { timeout: 5000 });
  const waitVideo = () => page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
  const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
  // Simulasi aplikasi di-background lalu kembali: sembunyikan, majukan jam, tampilkan lagi.
  const setVis = (st) => page.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, st);
  const away = async (ms) => { await setVis('hidden'); await page.evaluate((m) => { window.__offset += m; }, ms); await setVis('visible'); await sleep(700); };
  const MIN = 60 * 1000;
  const waitMe = async (before, msg) => { for (let i = 0; i < 40 && count('me') === before; i++) await sleep(150); assert(count('me') > before, msg); };
  const toTab = (name) => page.click(`nav >> text=${name}`); // login mendarat di Dasbor
  const activeTab = () => page.locator('nav.tabs button.active').first().innerText();
  const noDriveLinks = async (where) => assert((await page.locator('a[href*="drive.google.com"]').count()) === 0, `peserta melihat link Drive di ${where}`);

  await page.goto(BASE);
  await page.waitForSelector('#fake-google');
  // Deployment salah setting (respons HTML, status 200): layar fatal dengan pesan jelas, tanpa retry
  htmlForMe = true;
  await page.click('#fake-google');
  await page.getByText('Respons server tidak valid. Cek setting deployment Apps Script (Who has access: Anyone).').waitFor();
  await sleep(1500); // lebih lama dari jeda retry (1 dtk): kalau ada retry, 'me' akan terhitung 2x
  assert(count('me') === 1, `respons non-JSON di-retry: 'me' terkirim ${count('me')}x, seharusnya 1x`);
  step('respons non-JSON → layar fatal "Respons server tidak valid", tanpa retry');
  htmlForMe = false;
  await page.click('text=Coba lagi'); await page.getByRole('button', { name: 'Keluar' }).waitFor();
  await page.click('text=Keluar'); await page.waitForSelector('#fake-google'); await waitNoLive(); step('Coba lagi setelah mock dipulihkan → masuk normal, lalu keluar');
  // Login ganda cepat (dua callback sebelum 'me' selesai): hanya satu aplikasi boleh ter-mount
  await page.evaluate(() => { const b = document.querySelector('#fake-google'); b.click(); b.click(); }); step('login (klik ganda)');
  await page.getByText('Halo, Ani').waitFor(); step('dasbor peserta tampil');
  await toTab('Presensi');
  await page.getByText('Lokasi terbaca').waitFor(); step('gps terbaca');
  await waitVideo(); step('kamera aktif');
  assert((await scrollWidth()) <= 390, 'scroll horizontal di Presensi: ' + await scrollWidth()); step('tanpa scroll horizontal (Presensi)');
  await page.getByLabel('Catatan (opsional)').waitFor();
  assert((await page.locator('p[aria-live=polite]', { hasText: 'Lokasi terbaca' }).count()) === 1, 'teks lokasi tanpa aria-live'); step('a11y: label catatan + aria-live lokasi');
  await page.screenshot({ path: path.join(OUT, 'shot-checkin.png'), fullPage: true });
  await page.click('text=Ambil Foto');

  // Double submit: respons ditahan, lalu coba kirim ulang lewat segala jalan
  delayCheckinMs = 2000;
  await page.click('text=Kirim Absen Masuk');
  const sending = page.getByRole('button', { name: 'Mengirim...' });
  await sending.waitFor();
  assert(await page.getByRole('button', { name: 'Perbarui lokasi' }).isDisabled(), '"Perbarui lokasi" aktif saat mengirim');
  assert(await page.getByRole('button', { name: 'Ulangi Foto' }).isDisabled(), '"Ulangi Foto" aktif saat mengirim');
  assert(await page.locator('.seg button:not(:disabled)').count() === 0, 'tombol segmented aktif saat mengirim');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Perbarui lokasi').click());
  await sleep(500); // beri waktu pembacaan GPS selesai
  assert(await sending.isDisabled(), 'tombol kirim aktif lagi setelah lokasi diperbarui saat mengirim');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Mengirim|Kirim Absen/.test(b.textContent)).click());
  await page.getByText('Kamu sudah mengisi presensi hari ini').first().waitFor();
  await page.getByRole('heading', { name: 'Absen Pulang' }).waitFor();
  delayCheckinMs = 0;
  assert(count('absen.checkin') === 1, `absen.checkin terkirim ${count('absen.checkin')}x, seharusnya 1x`);
  step('double submit dicegah (1 request) + checkin ditolak USER → status disegarkan → form pulang');
  await page.getByText('Lokasi terbaca').waitFor();
  await waitVideo();
  await page.click('text=Ambil Foto');
  await page.click('text=Kirim Absen Pulang');
  await page.getByText('Presensi hari ini sudah lengkap').waitFor(); step('checkout selesai');
  await page.click('nav >> text=Riwayat');
  await page.getByText('Rab, 07 Okt 2026').waitFor(); step('riwayat');
  await page.click('nav >> text=Logbook');
  assert((await page.getAttribute('input[type=date]', 'min')) === '2026-10-06', 'min tanggal logbook salah');
  await page.fill('textarea', 'Input data pemilih di sistem');
  await page.click('text=Simpan Logbook');
  await page.getByRole('cell', { name: 'Input data pemilih di sistem' }).waitFor(); step('logbook simpan');
  await page.getByText('Ada lampiran').waitFor(); await noDriveLinks('logbook'); step('peserta: lampiran tanpa link Drive');
  await page.click('nav >> text=Riwayat'); await page.click('nav >> text=Logbook');
  await page.waitForFunction(() => document.querySelector('textarea')?.value === 'Input data pemilih di sistem');
  await page.getByText('Logbook tanggal ini sudah ada — simpan akan memperbarui.').waitFor(); step('logbook terisi otomatis dari entri tersimpan');
  // Ketikan belum disimpan + ganti ke tanggal yang sudah punya entri: teks dipertahankan, peringatan MENIMPA tampil
  await page.fill('textarea', 'ketikan belum disimpan');
  await page.fill('input[type=date]', '2026-10-06');
  await page.getByText('Tanggal ini sudah punya logbook — menyimpan akan MENIMPA isinya.').waitFor();
  assert((await page.inputValue('textarea')) === 'ketikan belum disimpan', 'ketikan pengguna tertimpa saat ganti tanggal'); step('logbook: ganti tanggal tidak menimpa ketikan + peringatan MENIMPA');
  // (a) Kembali ke aplikasi setelah >5 menit dengan form kotor: tidak ada muat ulang, teks tetap
  let me0 = count('me');
  await away(6 * MIN);
  assert((await page.inputValue('textarea')) === 'ketikan belum disimpan', 'teks logbook hilang setelah kembali ke aplikasi');
  assert(count('me') === me0, 'app dimuat ulang walau form logbook belum disimpan'); step('foreground: form kotor (logbook) tidak dimuat ulang setelah 6 menit');
  // Ganti hari + form kotor: tetap tidak dimuat ulang, tampil toast
  await away(25 * 60 * MIN);
  await page.getByText('Data belum disimpan — muat ulang setelah selesai.').waitFor();
  assert((await page.inputValue('textarea')) === 'ketikan belum disimpan' && count('me') === me0, 'ganti hari + form kotor memuat ulang'); step('foreground: ganti hari + form kotor → toast, tanpa muat ulang');
  // Refresh tertunda berjalan otomatis begitu tidak ada yang kotor/sibuk (setelah logbook disimpan), tab tetap Logbook
  await page.click('text=Simpan Logbook');
  await waitMe(me0, 'refresh tertunda tidak jalan setelah logbook disimpan');
  await page.getByText('Catatan kemarin').or(page.getByText('ketikan belum disimpan')).first().waitFor();
  assert((await activeTab()) === 'Logbook', 'tab aktif berpindah setelah refresh tertunda: ' + await activeTab());
  step('refresh tertunda jalan otomatis setelah simpan + tab Logbook dipertahankan');

  // Kamera harus mati saat ganti mode/tab/logout (semua stream yang pernah dibuka)
  absensi = null; await page.reload(); await page.getByText('Halo, Ani').waitFor(); await toTab('Presensi'); await waitVideo();
  assert((await liveTracks()) > 0, 'kamera seharusnya aktif');
  // Selfie yang sudah diambil tidak boleh hilang karena kembali ke aplikasi setelah >5 menit
  await page.getByText('Lokasi terbaca').waitFor(); await page.click('text=Ambil Foto');
  me0 = count('me'); await away(6 * MIN);
  assert(await page.getByRole('button', { name: 'Ulangi Foto' }).isVisible() && count('me') === me0, 'selfie hilang/app dimuat ulang saat form check-in kotor'); step('foreground: selfie yang sudah diambil tidak hilang');
  await page.click('text=Ulangi Foto'); await waitMe(me0, 'refresh tertunda tidak jalan setelah selfie dibuang');
  await waitVideo(); step('refresh tertunda jalan setelah selfie dibuang');
  await page.click('.seg >> text=Izin'); await waitNoLive(); step('kamera mati setelah Masuk → Izin');
  await page.click('.seg >> text=Masuk'); await waitVideo();
  await page.click('nav >> text=Riwayat'); await waitNoLive(); step('kamera mati setelah pindah tab');
  await page.click('nav >> text=Presensi'); await waitVideo();
  await page.click('text=Keluar'); await page.waitForSelector('#fake-google'); await waitNoLive(); step('logout mematikan kamera');
  // Login ganda lagi, lalu logout: tidak boleh ada kamera bocor dari mount ganda
  await page.evaluate(() => { const b = document.querySelector('#fake-google'); b.click(); b.click(); });
  await page.getByText('Halo, Ani').waitFor(); await toTab('Presensi'); await waitVideo(); await sleep(500);
  await page.click('text=Keluar'); await page.waitForSelector('#fake-google'); await waitNoLive(); step('login ganda tidak membocorkan kamera');

  // Izin flow on fresh state
  await page.click('#fake-google'); await page.getByText('Halo, Ani').waitFor(); await toTab('Presensi'); await page.click('.seg >> text=Izin');
  await page.getByLabel('Surat / bukti').waitFor(); step('form izin tampil (label file)');
  await page.screenshot({ path: path.join(OUT, 'shot-izin.png'), fullPage: true });
  await page.setInputFiles('input[type=file]', { name: 'surat.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await page.click('text=Kirim Izin');
  await page.getByText('Surat terkirim').waitFor(); await noDriveLinks('status izin'); step('peserta: surat tanpa link Drive');

  role = 'admin'; await page.click('text=Keluar'); await page.click('#fake-google');
  await page.getByText('Dasbor Admin').waitFor(); await page.getByText('Belum absen (1)').waitFor(); await page.getByText('Perlu dicek (1)').waitFor(); step('admin dasbor');
  await toTab('Harian'); await page.getByText('1 hadir dari 2 peserta').waitFor(); step('admin harian');
  assert((await scrollWidth()) <= 390, 'scroll horizontal di Admin Harian: ' + await scrollWidth()); step('tanpa scroll horizontal (Admin Harian)');
  const overflow = await page.evaluate(() => { const n = document.querySelector('nav.tabs'); return n.scrollWidth > n.clientWidth + 2; });
  assert(!overflow || (await page.locator('nav.tabs.more').count()) === 1, 'tab admin overflow tanpa petunjuk (class "more")'); step('tab admin muat atau punya petunjuk overflow');
  await page.fill('input[type=date]', '');
  await page.waitForFunction(() => document.querySelector('input[type=date]').value === '2026-10-07'); step('harian: tanggal kosong dipulihkan ke hari ini');
  await page.getByText('Dari lapangan').waitFor(); step('catatan tampil di tabel harian');
  if (!(await page.getAttribute('a:text("Lokasi")', 'href')).includes('maps?q=-7.9667')) throw new Error('link lokasi salah');
  await page.screenshot({ path: path.join(OUT, 'shot-admin.png'), fullPage: true });
  const dl = page.waitForEvent('download'); await page.click('text=Export CSV'); const d = await dl;
  const csv = fs.readFileSync(await d.path(), 'utf8'); if (!csv.includes('AKURASI_RENDAH')) throw new Error('csv kosong');
  const head = csv.replace(/^﻿/, '').split('\r\n')[0];
  assert(head.startsWith('Tanggal;Nama;') && head.includes('Akurasi Masuk (m)') && head.includes('Lat Pulang') && head.includes('Akurasi Pulang (m)'), 'kolom csv harian kurang: ' + head);
  step('export csv ' + d.suggestedFilename());
  await page.click('nav >> text=Rekap Bulanan'); await page.getByRole('cell', { name: 'Ani' }).waitFor();
  await page.getByText(/akhir pekan/).waitFor(); await page.getByText(/hari ini belum dihitung/).waitFor(); step('rekap + catatan akhir pekan/hari ini');
  const dl2 = page.waitForEvent('download'); await page.click('text=Export CSV'); const d2 = await dl2;
  const head2 = fs.readFileSync(await d2.path(), 'utf8').replace(/^﻿/, '').split('\r\n')[0];
  assert(head2.startsWith('Nama;Email;'), 'csv rekap tanpa kolom Email: ' + head2); step('export csv rekap + Email');
  // Export tidak boleh memakai data bulan lain saat muat gagal
  await page.fill('input[type=month]', '2026-09');
  await page.locator('p.error', { hasText: 'Rekap bulan ini gagal dimuat.' }).waitFor();
  assert(await page.getByRole('button', { name: 'Export CSV' }).isDisabled(), 'Export CSV aktif walau muat gagal (data basi)'); step('export dinonaktifkan saat muat gagal');
  await page.fill('input[type=month]', '2026-10');
  await page.getByRole('cell', { name: 'Ani' }).waitFor();
  assert(!(await page.getByRole('button', { name: 'Export CSV' }).isDisabled()), 'Export CSV tetap nonaktif setelah muat berhasil'); step('export aktif lagi setelah muat berhasil');
  // (b) Admin di tab Rekap dengan bulan non-default: hilang 10 detik tidak boleh mereset tab/filter
  await page.fill('input[type=month]', '2026-08'); await page.getByRole('cell', { name: 'Ani' }).waitFor();
  me0 = count('me');
  await away(10 * 1000);
  assert((await page.inputValue('input[type=month]')) === '2026-08' && count('me') === me0, 'tab/bulan rekap direset setelah background singkat');
  assert(await page.locator('nav.tabs button.active', { hasText: 'Rekap Bulanan' }).count() === 1, 'tab aktif berpindah'); step('foreground: background singkat tidak mereset tab Rekap + filter bulan');
  await page.click('nav >> text=Peserta'); await page.getByText('Ganti email peserta: nonaktifkan baris lama (dan isi tanggal selesai), lalu tambah peserta baru.').waitFor(); step('peserta: petunjuk ganti email'); await page.getByRole('button', { name: 'Edit' }).click();
  if ((await page.inputValue('input[type=email]')) !== 'ani@gmail.com') throw new Error('edit tidak isi form');
  await page.getByText('Mode edit: ani@gmail.com').waitFor();
  await page.click('text=Simpan Peserta'); await page.getByText('Peserta tersimpan.').waitFor(); step('peserta edit+simpan');
  await page.getByRole('button', { name: 'Kosongkan' }).click();
  await page.fill('input[type=email]', 'ANI@gmail.com'); await page.fill('input[maxlength="100"]', 'Ani Dobel');
  await page.click('text=Simpan Peserta'); await page.getByText('Email sudah terdaftar. Klik Edit di tabel untuk mengubah.').waitFor();
  assert(count('admin.peserta.save') === 1, 'email duplikat tetap dikirim ke server'); step('peserta: email duplikat diblokir');
  await away(6 * MIN);
  assert((await page.inputValue('input[type=email]')) === 'ANI@gmail.com' && count('me') === me0, 'form peserta yang kotor hilang/dimuat ulang'); step('foreground: form peserta kotor tidak dimuat ulang');
  // Hanya ganti hari (hilang 6 detik melewati tengah malam): kotor → toast tanpa muat ulang
  await page.evaluate(() => window.__toMidnight());
  me0 = count('me'); await away(6000);
  await page.getByText('Data belum disimpan — muat ulang setelah selesai.').waitFor();
  assert((await page.inputValue('input[type=email]')) === 'ANI@gmail.com' && count('me') === me0, 'ganti hari + form peserta kotor memuat ulang'); step('foreground: ganti hari (6 detik) + form kotor → toast, tanpa muat ulang');
  // Form dikosongkan → refresh tertunda jalan, tab Peserta tetap
  await page.getByRole('button', { name: 'Kosongkan' }).click(); await waitMe(me0, 'refresh tertunda tidak jalan setelah form peserta dikosongkan');
  await page.getByRole('button', { name: 'Edit' }).waitFor();
  assert((await activeTab()) === 'Peserta', 'tab Peserta tidak dipertahankan'); step('refresh tertunda jalan setelah form peserta bersih + tab Peserta dipertahankan');
  // Hanya ganti hari, tanpa form kotor → langsung muat ulang
  await page.evaluate(() => window.__toMidnight());
  me0 = count('me'); await away(6000); await waitMe(me0, 'ganti hari tanpa form kotor tidak memuat ulang'); step('foreground: ganti hari (6 detik) + bersih → muat ulang');
  await page.click('nav >> text=Logbook'); await page.getByRole('cell', { name: '=cmd' }).waitFor(); step('admin logbook (teks tidak dieksekusi)');

  // (c) Tidak ada form kotor, di tab Rekap: hilang ≥5 menit → dimuat ulang tapi tetap di tab Rekap (filter tidak dipertahankan)
  await page.click('nav >> text=Rekap Bulanan'); await page.getByRole('cell', { name: 'Ani' }).waitFor();
  me0 = count('me');
  await away(6 * MIN); await waitMe(me0, 'app tidak dimuat ulang setelah 5 menit di background tanpa form kotor');
  await page.getByRole('cell', { name: 'Ani' }).waitFor();
  assert((await activeTab()) === 'Rekap Bulanan', 'tab Rekap tidak dipertahankan: ' + await activeTab());
  assert((await page.inputValue('input[type=month]')) === '2026-10', 'filter bulan seharusnya kembali ke bawaan');
  step('foreground: bersih + ≥5 menit → muat ulang, tetap di tab Rekap');
  // (d) Token kedaluwarsa → login
  await away(100 * 365 * 24 * 60 * MIN);
  await page.getByText('Sesi habis, silakan login lagi.').waitFor(); step('foreground: token kedaluwarsa → login');

  await browser.close(); server.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK, tanpa error JS');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
