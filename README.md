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
5. Pilih fungsi `setupSheets` lalu **Run**. Setujui izin akses. Google akan menampilkan peringatan "Google hasn't verified this app": klik **Advanced → Go to ... (unsafe)**. Ini aman karena script-nya milik sendiri. Sheet `Peserta`, `Absensi`, `Logbook`, `Config`, dan `Admin` akan terbentuk.
6. Buat folder di Google Drive, misalnya "Presensi - Bukti". Ambil ID-nya dari URL (`drive.google.com/drive/folders/<ID>`). **Share folder ini ke email admin (Viewer)** supaya admin bisa membuka selfie dan surat.
7. Buat OAuth Client ID:
   1. Buka https://console.cloud.google.com/ lalu buat project baru.
   2. Masuk ke menu **Google Auth Platform** (dulu bernama **OAuth consent screen** di *APIs & Services*). Di **Branding** isi nama aplikasi dan email; di **Audience** pilih External. Scope cukup default (email, profile, openid). Lalu klik **Publish app** di **Audience**. Kalau masih mode Testing, hanya test user yang bisa login.
   3. Masuk ke **Clients** (dulu **Credentials → Create credentials → OAuth client ID**) lalu buat client bertipe **Web application**.
   4. Isi **Authorized JavaScript origins** dengan tiga origin ini: `https://<username>.github.io`, `http://localhost`, dan `http://localhost:5500`. Perubahan origin bisa butuh beberapa menit sampai berlaku.
   5. Salin Client ID-nya.
8. Isi sheet `Config`:
   - `kantor_lat` dan `kantor_lng`: di Google Maps, klik kanan titik kantor, lalu klik koordinatnya untuk menyalin. Google Maps menyalin keduanya sebagai satu teks `lat, lng` (mis. `-7.9666, 112.6326`), jadi pisahkan: angka pertama (lintang/latitude) ke `kantor_lat`, angka kedua (bujur/longitude) ke `kantor_lng`. Setelah semua Config terisi, jalankan `checkSetup` (langkah 10).
   - `radius_meter`, `jam_masuk`, `batas_telat`, `batas_edit_logbook_hari`, `max_akurasi_meter`.
   - `folder_id`: dari langkah 6.
   - `google_client_id`: dari langkah 7.
9. Isi sheet `Admin` (email, nama). Peserta bisa ditambahkan nanti dari menu Admin → Peserta.
10. Jalankan fungsi `checkSetup` dan pastikan log menampilkan `Setup OK`.
11. **Deploy → New deployment → Web app**. Isi Execute as: **Me**, Who has access: **Anyone**. Salin URL `/exec`-nya.
    Kalau memakai akun Google Workspace (bukan Gmail biasa), pastikan admin Workspace mengizinkan Web App dengan akses **Anyone**; kalau dibatasi, API akan mengembalikan halaman login Google dan app menampilkan "Respons server tidak valid".
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
2. Push repo ke GitHub (paket gratis GitHub Pages butuh repo **public**), lalu buka **Settings → Pages → Source: GitHub Actions**.
3. Setiap push ke `main` akan menjalankan `npm test` dan e2e smoke test; folder `web/` baru di-deploy ke `https://<username>.github.io/<repo>/` kalau keduanya lolos.

Kedua nilai di `web/config.js` bukan rahasia: Client ID memang publik, dan API selalu memverifikasi token.

## Batasan yang diketahui

- Fake GPS tidak bisa dideteksi 100% tanpa server sendiri. Mitigasinya: selfie live (bukan dari galeri), jam dari server, dan flag `AKURASI_RENDAH`.
- Kuota Apps Script cukup untuk puluhan peserta. Kalau sudah ratusan, pertimbangkan pindah ke backend sendiri.
- Export: CSV memakai pemisah titik koma (;) untuk Excel berbahasa Indonesia; kalau kolom menyatu, buka lewat Data → From Text/CSV atau Google Sheets.
- Hari kerja di rekap = Senin–Jumat. Hari libur nasional belum dikecualikan.
- Satu email = satu baris di sheet `Peserta`. Untuk mengganti email peserta, set baris lama `aktif = N` DAN isi `tanggal_selesai` dengan hari terakhir email itu dipakai, lalu tambah baris baru — jangan ada email dobel. Peserta nonaktif tidak tampil di Rekap kecuali punya absensi dalam periodenya.
- Edit data langsung di Sheet boleh, tapi jaga format teks: tanggal `yyyy-MM-dd`, jam `HH:mm:ss`. Jangan ubah urutan kolom atau menyisipkan kolom di tengah sheet; kolom tambahan hanya boleh di paling kanan.
