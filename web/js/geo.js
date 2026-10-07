const GEO_MESSAGES = {
  1: 'Izin lokasi ditolak. Buka pengaturan browser → Izin situs → Lokasi → Izinkan, lalu muat ulang halaman.',
  2: 'Lokasi tidak tersedia. Nyalakan GPS/Lokasi di HP kamu lalu coba lagi.',
  3: 'Membaca lokasi terlalu lama. Pastikan GPS aktif lalu coba lagi.',
};

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Browser ini tidak mendukung GPS.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (err) => reject(new Error(GEO_MESSAGES[err.code] || 'Gagal membaca lokasi.')),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });
}
