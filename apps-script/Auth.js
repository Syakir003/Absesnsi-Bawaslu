/** Auth.js — verifikasi Google ID token & tentukan role. */
function verifyIdToken_(idToken, clientId) {
  if (!idToken) throw authError_('Kamu belum login.');
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var cached = cache.get(key);
  if (cached) {
    var c = JSON.parse(cached);
    if (c.exp > Date.now() / 1000) return c;
  }

  var res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw authError_('Sesi login kedaluwarsa. Silakan login ulang.');

  var claims = checkTokenClaims(JSON.parse(res.getContentText()), clientId, Date.now() / 1000);
  if (!claims.ok) throw authError_(claims.error);

  var ttl = Math.floor(claims.exp - Date.now() / 1000) - 30;
  if (ttl > 0) cache.put(key, JSON.stringify(claims), Math.min(ttl, 21600));
  return claims;
}

function resolveUserOrThrow_(email, today) {
  var r = resolveRole(email, readAll_(SHEETS.ADMIN), readAll_(SHEETS.PESERTA), today);
  if (!r.ok) throw userError_(r.error, 'FORBIDDEN');
  return r;
}
