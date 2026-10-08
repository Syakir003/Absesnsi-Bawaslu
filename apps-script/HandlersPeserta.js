/** HandlersPeserta.js — me, absen masuk/pulang, riwayat, logbook. */
/** Jalankan fn setelah upload; kalau apa pun gagal, file yang sudah diupload dibuang lalu error dilempar ulang. */
function afterUpload_(file, fn) {
  try {
    return fn();
  } catch (e) {
    if (file) trashFile_(file.id);
    throw e;
  }
}

function handleMe_(ctx) {
  var c = ctx.config;
  var out = {
    email: ctx.user.email, nama: ctx.user.nama, role: ctx.user.role,
    today: ctx.now.tanggal, jam: ctx.now.jam,
    config: { jamMasuk: c.jamMasuk, batasTelat: c.batasTelat, radiusMeter: c.radiusMeter, batasEditLogbookHari: c.batasEditLogbookHari }
  };
  if (ctx.user.role === 'peserta') {
    var row = findAbsensi_(ctx.user.email, ctx.now.tanggal);
    out.absensiHariIni = row ? stripRow_(row) : null;
  }
  return out;
}

function handleCheckIn_(ctx) {
  var d = ctx.data, u = ctx.user, c = ctx.config, now = ctx.now;
  var input = {
    status: d.status, mode: d.mode, lat: num_(d.lat), lng: num_(d.lng), accuracy: num_(d.accuracy),
    hasSelfie: !!(d.selfie && d.selfie.base64), hasSurat: !!(d.surat && d.surat.base64)
  };
  // Validasi cepat di luar lock (gagal cepat tanpa upload).
  var v = validateCheckIn(input, findAbsensi_(u.email, now.tanggal), c);
  if (!v.ok) throw userError_(v.error);

  var base = now.tanggal + '_' + u.email;
  var file = input.status === 'Masuk'
    ? saveUpload_(d.selfie, 'selfie', c.folderId, base + '_masuk')
    : saveUpload_(d.surat, 'surat', c.folderId, base + '_' + input.status.toLowerCase());

  return afterUpload_(file, function () { return withLock_(function () {
    var recheck = validateCheckIn(input, findAbsensi_(u.email, now.tanggal), c);
    if (!recheck.ok) throw userError_(recheck.error);
    var row = { id: Utilities.getUuid(), email: u.email, tanggal: now.tanggal, status: input.status, catatan: sanitizeText(d.catatan, 500) };
    if (input.status === 'Masuk') {
      row.jam_masuk = now.jam;
      row.mode = input.mode;
      row.lat_masuk = input.lat; row.lng_masuk = input.lng;
      row.akurasi_masuk = Math.round(input.accuracy); row.jarak_masuk = recheck.distance;
      row.flags = recheck.flags.join(',');
      row.link_selfie_masuk = file.url;
    } else {
      row.link_surat = file.url;
    }
    insert_(SHEETS.ABSENSI, row);
    return rowOut_(SHEETS.ABSENSI, row);
  }); });
}

function handleCheckOut_(ctx) {
  var d = ctx.data, u = ctx.user, c = ctx.config, now = ctx.now;
  var input = { lat: num_(d.lat), lng: num_(d.lng), accuracy: num_(d.accuracy), hasSelfie: !!(d.selfie && d.selfie.base64) };
  var v = validateCheckOut(input, findAbsensi_(u.email, now.tanggal), c);
  if (!v.ok) throw userError_(v.error);

  var file = saveUpload_(d.selfie, 'selfie', c.folderId, now.tanggal + '_' + u.email + '_pulang');

  return afterUpload_(file, function () { return withLock_(function () {
    var existing = findAbsensi_(u.email, now.tanggal);
    var recheck = validateCheckOut(input, existing, c);
    if (!recheck.ok) throw userError_(recheck.error);
    existing.jam_pulang = now.jam;
    existing.lat_pulang = input.lat; existing.lng_pulang = input.lng;
    existing.akurasi_pulang = Math.round(input.accuracy); existing.jarak_pulang = recheck.distance;
    var flags = existing.flags ? existing.flags.split(',') : [];
    recheck.flags.forEach(function (f) { if (flags.indexOf(f + '_PULANG') < 0) flags.push(f + '_PULANG'); });
    existing.flags = flags.join(',');
    existing.link_selfie_pulang = file.url;
    update_(SHEETS.ABSENSI, existing._row, existing);
    return rowOut_(SHEETS.ABSENSI, existing);
  }); });
}

function handleRiwayat_(ctx) {
  var b = requireMonth_(ctx.data.bulan);
  return readAll_(SHEETS.ABSENSI)
    .filter(function (r) { return normEmail_(r.email) === ctx.user.email && r.tanggal >= b.first && r.tanggal <= b.last; })
    .sort(function (a, z) { return a.tanggal < z.tanggal ? 1 : -1; })
    .map(stripRow_);
}

function handleLogbookList_(ctx) {
  var b = requireMonth_(ctx.data.bulan);
  var batas = ctx.config.batasEditLogbookHari;
  return readAll_(SHEETS.LOGBOOK)
    .filter(function (r) { return normEmail_(r.email) === ctx.user.email && r.tanggal >= b.first && r.tanggal <= b.last; })
    .sort(function (a, z) { return a.tanggal < z.tanggal ? 1 : -1; })
    .map(function (r) {
      var out = stripRow_(r);
      var age = daysBetween(r.tanggal, ctx.now.tanggal);
      out.bisaEdit = age >= 0 && age <= batas;
      return out;
    });
}

function handleLogbookSave_(ctx) {
  var d = ctx.data, u = ctx.user, c = ctx.config, now = ctx.now;
  var v = validateLogbook({ tanggal: d.tanggal, kegiatan: d.kegiatan }, now.tanggal, c.batasEditLogbookHari);
  if (!v.ok) throw userError_(v.error);

  var file = null;
  if (d.lampiran && d.lampiran.base64) {
    file = saveUpload_(d.lampiran, 'lampiran', c.folderId, d.tanggal + '_' + u.email + '_logbook');
  }

  var oldUrl = '';
  var saved = afterUpload_(file, function () { return withLock_(function () {
    var existing = readAll_(SHEETS.LOGBOOK).filter(function (r) { return normEmail_(r.email) === u.email && r.tanggal === d.tanggal; })[0];
    if (existing) {
      existing.kegiatan = v.kegiatan;
      if (file) { oldUrl = existing.link_lampiran; existing.link_lampiran = file.url; }
      existing.diubah = now.iso;
      update_(SHEETS.LOGBOOK, existing._row, existing);
      return rowOut_(SHEETS.LOGBOOK, existing);
    }
    var row = { id: Utilities.getUuid(), email: u.email, tanggal: d.tanggal, kegiatan: v.kegiatan,
      link_lampiran: file ? file.url : '', dibuat: now.iso, diubah: now.iso };
    insert_(SHEETS.LOGBOOK, row);
    return rowOut_(SHEETS.LOGBOOK, row);
  }); });
  // Update sukses dengan lampiran baru: buang lampiran lama, hanya bila ada di folder presensi (di luar lock; error diabaikan).
  var oldId = driveFileIdFromUrl(oldUrl);
  if (oldId) trashIfInFolder_(oldId, c.folderId);
  return saved;
}
