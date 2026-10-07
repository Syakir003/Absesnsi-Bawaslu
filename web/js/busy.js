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
