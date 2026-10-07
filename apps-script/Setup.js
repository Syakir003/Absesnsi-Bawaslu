/** Setup.js — jalankan setupSheets() SEKALI dari editor Apps Script. */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (k) {
    var def = SHEETS[k];
    var sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    sh.getRange('A:Z').setNumberFormat('@'); // plain text: cegah tanggal/jam berubah jadi Date
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });

  var cfg = ss.getSheetByName(SHEETS.CONFIG.name);
  if (cfg.getLastRow() < 2) {
    cfg.getRange(2, 1, 9, 2).setValues([
      ['kantor_lat', 'ISI_LATITUDE_KANTOR'],
      ['kantor_lng', 'ISI_LONGITUDE_KANTOR'],
      ['radius_meter', '100'],
      ['jam_masuk', '07:30'],
      ['batas_telat', '08:00'],
      ['batas_edit_logbook_hari', '1'],
      ['max_akurasi_meter', '100'],
      ['folder_id', 'ISI_ID_FOLDER_DRIVE'],
      ['google_client_id', 'ISI_CLIENT_ID.apps.googleusercontent.com']
    ]);
  }

  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);
}

/** Cek cepat dari editor: Config valid & sheet lengkap. Lihat hasilnya di Execution log. */
function checkSetup() {
  var cfg = readConfig_();
  DriveApp.getFolderById(cfg.folderId).getName();
  Object.keys(SHEETS).forEach(function (k) { sheet_(SHEETS[k]); });
  console.log('Setup OK', JSON.stringify(cfg));
}
