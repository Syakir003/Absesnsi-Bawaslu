// Penanda "ada submit sedang berjalan". Dipakai main.js supaya muat-ulang saat kembali ke aplikasi
// (visibilitychange) tidak menghapus form yang sedang mengirim.
let active = 0;

export function isBusy() {
  return active > 0;
}

// Pemanggil tunggal (main.js) yang diberi tahu saat aplikasi menjadi "idle": tidak sibuk dan tidak ada
// form kotor. Dipanggil lewat setTimeout 0 supaya state sudah rapi (mis. tab sudah selesai berganti)
// dan pemanggil tetap harus memeriksa ulang isBusy()/isDirty() saat dijalankan.
let idleListener = null;
export function onIdle(fn) {
  idleListener = fn;
}
function notifyIfIdle() {
  if (idleListener && active === 0 && dirtyKeys.size === 0) setTimeout(() => idleListener?.(), 0);
}

/** Jalankan fn (async) sambil menandai aplikasi sibuk; selalu dilepas di finally. */
export async function withBusy(fn) {
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    notifyIfIdle();
  }
}

// Form yang berisi isian belum tersimpan (foto selfie, catatan, teks logbook, ...). Tiap komponen
// memakai kuncinya sendiri dan WAJIB menghapusnya saat dibuang (setDirty(key, false) di cleanup),
// supaya tidak bocor ke mount berikutnya. main.js tidak memuat ulang aplikasi selama ada yang dirty.
const dirtyKeys = new Set();

export function setDirty(key, dirty) {
  if (dirty) {
    dirtyKeys.add(key);
  } else if (dirtyKeys.delete(key)) {
    notifyIfIdle();
  }
}

export function isDirty() {
  return dirtyKeys.size > 0;
}

export function clearDirty() {
  dirtyKeys.clear();
}
