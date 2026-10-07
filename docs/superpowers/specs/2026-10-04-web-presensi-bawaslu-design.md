# Web Presensi Anak Magang — Bawaslu Malang (Design Spec)

Tanggal: 2026-10-04

## 1. Tujuan
Web presensi untuk peserta magang Bawaslu Malang, tanpa server sendiri. Dipakai lewat browser HP.

## 2. Keputusan
- Validasi: GPS + selfie live.
- Role: Peserta dan Admin (dengan rekap). Tidak ada role Pembimbing.
- Backend: Google Apps Script sebagai API + Google Sheets (data) + Google Drive (foto/surat).
- Frontend: web statis (HTML/JS, mobile-first) di GitHub Pages/Netlify. Tidak memakai HtmlService karena akses kamera/GPS di iframe bermasalah.
- Login: Google Sign-In di frontend; ID token dikirim ke Apps Script dan diverifikasi di server (bukan `Session.getActiveUser()`). Email dicocokkan dengan whitelist sheet `Peserta`/`Admin`.

## 3. Fitur
1. Absen WFO/WFH. WFO wajib dalam radius kantor (radius diatur admin di `Config`). WFH tanpa batas radius, lokasi tetap dicatat.
2. Bukti kehadiran: selfie dari kamera langsung (bukan galeri), koordinat GPS, akurasi, timestamp server.
3. Keterangan: Masuk, Izin, Sakit. Izin/Sakit wajib upload foto/file surat (JPG/PNG/PDF), tanpa GPS.
4. Logbook harian: tanggal, uraian kegiatan, lampiran opsional; bisa diedit sampai batas waktu di `Config`.
5. Admin: kelola peserta, lihat absensi harian (foto + lokasi), rekap bulanan, export CSV/PDF.

## 4. Struktur Google Sheets
- `Peserta`: email (key), nama, instansi/kampus, aktif (Y/N), tanggal_mulai, tanggal_selesai
- `Absensi`: id, email, tanggal, jam_masuk, jam_pulang, mode (WFO/WFH), status (Masuk/Izin/Sakit), lat_masuk, lng_masuk, lat_pulang, lng_pulang, akurasi, link_selfie_masuk, link_selfie_pulang, link_surat, catatan
- `Logbook`: id, email, tanggal, kegiatan, link_lampiran, dibuat, diubah
- `Config`: lat/lng kantor, radius (m), jam_masuk, batas_telat, batas_edit_logbook, id_folder_drive, google_client_id
- `Admin`: daftar email admin

Aturan: satu baris `Absensi` per peserta per tanggal (dicek di server).

## 5. Alur Absen
1. Login Google → token diverifikasi → email dicek di `Peserta` (aktif dan dalam periode magang).
2. Pilih status. Masuk: pilih WFO/WFH, izinkan GPS, ambil selfie live. Izin/Sakit: upload surat.
3. Frontend POST ke Apps Script. Server menghitung jarak (Haversine) untuk WFO, memakai waktu server, menyimpan file ke Drive, menulis ke Sheet di dalam `LockService`.
4. Pulang: check-out (selfie + GPS) tersedia setelah check-in.

## 6. Error Handling
- WFO di luar radius: ditolak dengan info jarak; peserta bisa pindah ke WFH.
- GPS/kamera ditolak: tampilkan petunjuk mengaktifkan izin; tidak ada fallback manual.
- Absen dobel, atau izin/sakit setelah absen masuk: ditolak.
- Sinyal buruk: tombol disable saat proses, ada retry; foto dikompres di client (maks ±1 MB).
- Penulisan konkuren: `LockService`.
- Server memvalidasi tipe dan ukuran file.
- Akun tidak terdaftar/nonaktif/di luar periode: ditolak.

## 7. Batasan yang diterima
- Fake GPS tidak bisa dideteksi penuh tanpa server sendiri. Mitigasi: kamera live-only, timestamp server, flag akurasi GPS mencurigakan.
- Kuota Apps Script cukup untuk puluhan peserta, bukan ratusan.

## 8. Testing
- Fungsi inti (jarak, validasi status, telat) dipisah dari kode Sheets, dites unit di Node.
- Checklist manual di HP asli: WFO dalam/luar radius, WFH, izin + surat, absen dobel, akun tidak terdaftar, admin rekap/export.

## 9. Deployment
- Apps Script: Web App, Execute as Me, akses siapa saja.
- Frontend: GitHub Pages/Netlify. Google OAuth Client ID dipasang di Config dan frontend.
