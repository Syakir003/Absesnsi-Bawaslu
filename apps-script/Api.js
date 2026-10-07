/** Api.js — entry point Web App. Semua request: POST {action, idToken, data}. */
function doGet() {
  return json_({ ok: true, data: 'presensi-api' });
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { ok: true, data: route_(req) };
  } catch (err) {
    if (!err.userMessage) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: err.userMessage || 'Terjadi kesalahan di server. Coba lagi.', code: err.code || 'SERVER' };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handlers_() {
  return {
    'me': { role: 'any', fn: handleMe_ },
    'absen.checkin': { role: 'peserta', fn: handleCheckIn_ },
    'absen.checkout': { role: 'peserta', fn: handleCheckOut_ },
    'absen.riwayat': { role: 'peserta', fn: handleRiwayat_ },
    'logbook.list': { role: 'peserta', fn: handleLogbookList_ },
    'logbook.save': { role: 'peserta', fn: handleLogbookSave_ },
    'admin.harian': { role: 'admin', fn: handleAdminHarian_ },
    'admin.rekap': { role: 'admin', fn: handleAdminRekap_ },
    'admin.peserta.list': { role: 'admin', fn: handleAdminPesertaList_ },
    'admin.peserta.save': { role: 'admin', fn: handleAdminPesertaSave_ },
    'admin.logbook': { role: 'admin', fn: handleAdminLogbook_ }
  };
}

function route_(req) {
  var handlers = handlers_();
  var handler = Object.prototype.hasOwnProperty.call(handlers, req.action) ? handlers[req.action] : null;
  if (!handler) throw userError_('Aksi tidak dikenal: ' + req.action);
  var config = readConfig_();
  var claims = verifyIdToken_(req.idToken, config.googleClientId);
  var now = nowParts_();
  var user = resolveUserOrThrow_(claims.email, now.tanggal);
  if (handler.role !== 'any' && handler.role !== user.role) throw userError_('Kamu tidak punya akses ke fitur ini.', 'FORBIDDEN');
  return handler.fn({ user: user, data: req.data || {}, config: config, now: now });
}

function requireMonth_(bulan) {
  if (!isValidMonth(bulan)) throw userError_('Format bulan harus YYYY-MM.');
  return monthBounds(bulan);
}

function num_(v) {
  if (typeof v === 'number') return v;
  return typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
}
