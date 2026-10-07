// Penanda "ada submit sedang berjalan". Dipakai main.js supaya muat-ulang saat kembali ke aplikasi
// (visibilitychange) tidak menghapus form yang sedang mengirim.
let active = 0;

export function isBusy() {
  return active > 0;
}

/** Jalankan fn (async) sambil menandai aplikasi sibuk; selalu dilepas di finally. */
export async function withBusy(fn) {
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
  }
}

// Form yang berisi isian belum tersimpan (foto selfie, catatan, teks logbook, ...). Tiap komponen
// memakai kuncinya sendiri dan WAJIB menghapusnya saat dibuang (setDirty(key, false) di cleanup),
// supaya tidak bocor ke mount berikutnya. main.js tidak memuat ulang aplikasi selama ada yang dirty.
const dirtyKeys = new Set();

export function setDirty(key, dirty) {
  if (dirty) dirtyKeys.add(key);
  else dirtyKeys.delete(key);
}

export function isDirty() {
  return dirtyKeys.size > 0;
}

export function clearDirty() {
  dirtyKeys.clear();
}
