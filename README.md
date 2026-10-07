# Presensi Magang — Bawaslu Malang

Web presensi peserta magang tanpa server sendiri.

- **Frontend**: HTML/JS statis di `web/`, di-host di GitHub Pages.
- **Backend**: Google Apps Script di `apps-script/` sebagai API (Web App).
- **Data**: Google Sheets (Peserta, Absensi, Logbook, Config, Admin).
- **File**: selfie dan surat disimpan di satu folder Google Drive.
- **Login**: Google Sign-In; ID token diverifikasi di Apps Script lalu email dicocokkan ke sheet `Peserta`/`Admin`.

## Development

```bash
npm test                 # unit + integration test (Node 22, tanpa install)
npm install              # hanya untuk e2e
npx playwright install chromium
npm run test:e2e         # smoke test UI di Chromium headless (semua API dipalsukan)
npm run dev              # serve web/ di http://localhost:5500
```

## Deploy backend (sekali)

Pakai akun Google milik kantor/admin (bukan akun pribadi peserta), karena semua data dan file disimpan atas nama akun ini.

1. Buat Google Sheet baru, misalnya "Presensi Magang Bawaslu".
2. Di Sheet: **File → Settings → Time zone** pilih **(GMT+07:00) Jakarta**, supaya tanggal/jam di Sheet sama dengan jam server.
3. Di Sheet: **Extensions → Apps Script**. Buat file dengan nama dan isi yang sama seperti di `apps-script/`: `Core`, `Errors`, `Repo`, `Setup`, `Auth`, `Files`, `Api`, `HandlersPeserta`, `HandlersAdmin`. Hapus `Code.gs` bawaan.
4. **Project Settings → centang "Show appsscript.json"**, lalu ganti isinya dengan `apps-script/appsscript.json`.
5. Pilih fungsi `setupSheets` lalu **Run**. Setujui izin akses. Sheet `Peserta`, `Absensi`, `Logbook`, `Config`, dan `Admin` akan terbentuk.
6. Buat folder di Google Drive, misalnya "Presensi - Bukti". Ambil ID-nya dari URL (`drive.google.com/drive/folders/<ID>`). **Share folder ini ke email admin (Viewer)** supaya admin bisa membuka selfie dan surat.
7. Buat OAuth Client ID:
   1. Buka https://console.cloud.google.com/ lalu buat project baru.
   2. Masuk ke **APIs & Services → OAuth consent screen**. Pilih External, isi nama aplikasi dan email. Scope cukup default (email, profile, openid). Lalu **Publish app**. Kalau masih mode Testing, hanya test user yang bisa login.
   3. Masuk ke **Credentials → Create credentials → OAuth client ID → Web application**.
   4. Isi **Authorized JavaScript origins** dengan `https://<username>.github.io` dan `http://localhost:5500`.
   5. Salin Client ID-nya.
8. Isi sheet `Config`:
   - `kantor_lat` dan `kantor_lng`: di Google Maps, klik kanan titik kantor, lalu klik koordinatnya untuk menyalin.
   - `radius_meter`, `jam_masuk`, `batas_telat`, `batas_edit_logbook_hari`, `max_akurasi_meter`.
   - `folder_id`: dari langkah 6.
   - `google_client_id`: dari langkah 7.
9. Isi sheet `Admin` (email, nama). Peserta bisa ditambahkan nanti dari menu Admin → Peserta.
10. Jalankan fungsi `checkSetup` dan pastikan log menampilkan `Setup OK`.
11. **Deploy → New deployment → Web app**. Isi Execute as: **Me**, Who has access: **Anyone**. Salin URL `/exec`-nya.
12. Cek dari terminal:
    ```bash
    curl -sL "<URL_EXEC>"
    # {"ok":true,"data":"presensi-api"}
    curl -sL -H 'Content-Type: text/plain' -d '{"action":"me"}' "<URL_EXEC>"
    # {"ok":false,"error":"Kamu belum login.","code":"AUTH"}
    ```

**Update kode backend:** tempel perubahan di editor, lalu buka **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Dengan cara ini URL-nya tetap sama. Jangan pakai "New deployment", karena URL-nya akan berubah.

## Deploy frontend

1. Isi `web/config.js` dengan `API_URL` (dari langkah 11) dan `GOOGLE_CLIENT_ID` (dari langkah 7).
2. Push repo ke GitHub, lalu buka **Settings → Pages → Source: GitHub Actions**.
3. Setiap push ke `main` akan menjalankan `npm test` lalu deploy folder `web/` ke `https://<username>.github.io/<repo>/`.

Kedua nilai di `web/config.js` bukan rahasia: Client ID memang publik, dan API selalu memverifikasi token.

## Batasan yang diketahui

- Fake GPS tidak bisa dideteksi 100% tanpa server sendiri. Mitigasinya: selfie live (bukan dari galeri), jam dari server, dan flag `AKURASI_RENDAH`.
- Kuota Apps Script cukup untuk puluhan peserta. Kalau sudah ratusan, pertimbangkan pindah ke backend sendiri.
- Hari kerja di rekap = Senin–Jumat. Hari libur nasional belum dikecualikan.
- Satu email = satu baris di sheet `Peserta`. Untuk mengganti email peserta, nonaktifkan baris lama (aktif = N) lalu tambah peserta baru — jangan ada email dobel.
- Edit data langsung di Sheet boleh, tapi jaga format teks: tanggal `yyyy-MM-dd`, jam `HH:mm:ss`.
