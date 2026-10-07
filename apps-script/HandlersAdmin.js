/** HandlersAdmin.js — harian, rekap, kelola peserta, logbook semua peserta. */
function handleAdminHarian_(ctx) {
  var tanggal = ctx.data.tanggal || ctx.now.tanggal;
  if (!isValidDate(tanggal)) throw userError_('Tanggal tidak valid.');
  var absensi = readAll_(SHEETS.ABSENSI).filter(function (r) { return r.tanggal === tanggal; });
  var byEmail = {};
  absensi.forEach(function (r) { byEmail[r.email] = stripRow_(r); });
  var peserta = readAll_(SHEETS.PESERTA).filter(function (p) {
    return isPesertaActive(p, tanggal) || byEmail[String(p.email).toLowerCase()];
  });
  return peserta.map(function (p) {
    var email = String(p.email).toLowerCase();
    return { email: email, nama: p.nama, instansi: p.instansi, absensi: byEmail[email] || null };
  }).sort(function (a, z) { return a.nama.localeCompare(z.nama); });
}

function handleAdminRekap_(ctx) {
  requireMonth_(ctx.data.bulan);
  return buildRekap(readAll_(SHEETS.PESERTA), readAll_(SHEETS.ABSENSI), ctx.data.bulan, ctx.now.tanggal, ctx.config.batasTelat)
    .sort(function (a, z) { return a.nama.localeCompare(z.nama); });
}

function handleAdminPesertaList_() {
  return readAll_(SHEETS.PESERTA).map(stripRow_).sort(function (a, z) { return a.nama.localeCompare(z.nama); });
}

function handleAdminPesertaSave_(ctx) {
  var v = validatePeserta(ctx.data);
  if (!v.ok) throw userError_(v.error);
  return withLock_(function () {
    var existing = readAll_(SHEETS.PESERTA).filter(function (p) { return String(p.email).toLowerCase() === v.peserta.email; })[0];
    if (existing) update_(SHEETS.PESERTA, existing._row, v.peserta);
    else insert_(SHEETS.PESERTA, v.peserta);
    return v.peserta;
  });
}

function handleAdminLogbook_(ctx) {
  var b = requireMonth_(ctx.data.bulan);
  var email = ctx.data.email ? String(ctx.data.email).toLowerCase() : '';
  var nama = {};
  readAll_(SHEETS.PESERTA).forEach(function (p) { nama[String(p.email).toLowerCase()] = p.nama; });
  return readAll_(SHEETS.LOGBOOK)
    .filter(function (r) { return r.tanggal >= b.first && r.tanggal <= b.last && (!email || r.email === email); })
    .sort(function (a, z) { return a.tanggal === z.tanggal ? a.email.localeCompare(z.email) : (a.tanggal < z.tanggal ? 1 : -1); })
    .map(function (r) { var o = stripRow_(r); o.nama = nama[r.email] || r.email; return o; });
}
