# Checklist Test Manual (HP asli)

Jalankan setelah deploy backend dan frontend. Pakai minimal 1 HP Android (Chrome) dan 1 iPhone (Safari) kalau ada.

## Persiapan
- [ ] Setelah mengisi sheet `Config`, jalankan `checkSetup` di editor Apps Script: log menampilkan "Setup OK".
- [ ] Sheet `Admin` berisi email kamu, dan sheet `Peserta` berisi 1 akun test (aktif, periode mencakup hari ini).
- [ ] `radius_meter` sementara diisi 100.

## Sheet asli (sekali saja setelah deploy)
- [ ] Logbook yang diawali `=` (mis. `=1+1`) tersimpan sebagai teks di sheet dan tampil persis sama di app (tidak ada tanda `'` ekstra).
- [ ] Ketik jam manual `7:45` di kolom `jam_masuk` sheet `Absensi`, lalu buka Rekap: tidak error.
- [ ] Time zone Sheet = (GMT+07:00) Jakarta (File → Settings → Time zone).
- [ ] Setelah lebih dari 1000 baris di `Absensi`, kolom jam masih tersimpan sebagai teks (boleh dicek nanti, atau isi data dummy).

## Login
- [ ] Email yang tidak terdaftar ditolak dengan pesan "belum terdaftar".
- [ ] Peserta nonaktif (`aktif` = N) ditolak dengan pesan "tidak aktif".
- [ ] Akun di luar periode magang (sebelum `tanggal_mulai` atau setelah `tanggal_selesai`) ditolak dengan pesan "di luar periode magang".
- [ ] Setelah sekitar 1 jam token Google kedaluwarsa: app kembali ke halaman login dengan pesan sesi habis, lalu bisa login lagi.
- [ ] Peserta masuk ke tab Presensi, admin masuk ke tab Harian.
- [ ] Tombol Keluar lalu login lagi berjalan normal.

## Peserta — Presensi
- [ ] Izin lokasi ditolak: muncul pesan cara mengaktifkan, tombol kirim tetap nonaktif.
- [ ] Izin kamera ditolak: muncul pesan cara mengaktifkan.
- [ ] WFO di kantor (dalam radius): absen masuk berhasil, baris muncul di sheet `Absensi`, selfie ada di folder Drive.
- [ ] WFO dari luar kantor: ditolak dengan info jarak (m).
- [ ] Absen pulang WFO dari luar radius: ditolak dan peserta diberi tahu (pesan jarak dari kantor).
- [ ] WFH dari rumah: berhasil, `jarak_masuk` tercatat.
- [ ] Absen pulang berhasil dan `jam_pulang` terisi.
- [ ] Mencoba absen lagi di hari yang sama ditolak.
- [ ] Izin dengan foto surat (JPG) berhasil, dan Sakit dengan PDF berhasil (pakai akun lain atau hari lain).
- [ ] Mengirim PDF di atas 2 MB ditolak.
- [ ] Mode pesawat lalu klik kirim: muncul pesan koneksi, dan setelah online lagi bisa dikirim ulang.
- [ ] Foto surat potret dari iPhone tidak terbalik atau miring setelah dikirim.
- [ ] Surat berupa PNG transparan tidak berubah jadi hitam.
- [ ] PDF besar (sekitar 2 MB) lewat data seluler berhasil terkirim, atau muncul pesan timeout yang jelas.
- [ ] Menekan "Perbarui lokasi" saat sedang mengirim tidak membuat absen dobel.
- [ ] Keluar dari app sebentar (buka WhatsApp) lalu kembali: teks logbook yang belum disimpan tidak hilang.
- [ ] Tab dibiarkan terbuka sampai besok pagi, lalu dibuka lagi: tanggal dan status presensi ikut berganti.

## Peserta — Riwayat & Logbook
- [ ] Riwayat bulan ini tampil sesuai data.
- [ ] Simpan logbook hari ini, lalu simpan lagi di tanggal yang sama: data ter-update, tidak dobel.
- [ ] Logbook untuk tanggal yang sudah lewat batas edit ditolak.

## Admin
- [ ] Harian: status semua peserta tampil, link selfie bisa dibuka (folder sudah di-share ke admin).
- [ ] Export CSV harian bisa dibuka di Excel dengan huruf tetap rapi (UTF-8).
- [ ] CSV dibuka di Excel PC kantor (locale Indonesia): kolom terpisah dengan benar (pemisah `;`).
- [ ] Koordinat di Excel mungkin tampil aneh (bukan masalah): gunakan link Lokasi di app.
- [ ] Rekap bulanan: angka hadir, izin, sakit, telat, dan tanpa keterangan cocok dengan sheet.
- [ ] Cetak / PDF menampilkan tabel rekap tanpa tombol dan menu.
- [ ] Cetak Rekap ke PDF dengan kertas A4 landscape: tabel muat dan terbaca.
- [ ] Tambah peserta baru lalu login dengan akun itu berhasil. Edit menjadi nonaktif lalu login lagi ditolak.
- [ ] Logbook: filter per peserta berjalan, dan Export CSV berjalan.
- [ ] Screen reader (TalkBack/VoiceOver) membacakan pesan toast.

## Keamanan
- [ ] Membuka URL `/exec` langsung di browser hanya menampilkan JSON health check, tanpa data apa pun.
- [ ] Akun Google yang tidak terdaftar ditolak.

## Konkurensi
- [ ] Dua HP absen bersamaan (beda akun): dua-duanya tercatat dan tidak ada baris yang hilang.
