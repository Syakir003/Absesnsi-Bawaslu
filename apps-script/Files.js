/** Files.js — simpan upload base64 ke folder Drive. */
var MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };

/** @return {{url: string, id: string}} */
function saveUpload_(file, kind, folderId, baseName) {
  var v = validateUpload(file, kind);
  if (!v.ok) throw userError_(v.error);
  var bytes = Utilities.base64Decode(stripDataUrl(file.base64));
  var blob = Utilities.newBlob(bytes, file.mime, baseName + MIME_EXT[file.mime]);
  var f = DriveApp.getFolderById(folderId).createFile(blob);
  return { url: f.getUrl(), id: f.getId() };
}

function trashFile_(id) {
  try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { console.warn('Gagal hapus file ' + id, e); }
}
