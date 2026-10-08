const GEO_MESSAGES = {
  1: 'Izin lokasi ditolak. Buka pengaturan browser → Izin situs → Lokasi → Izinkan, lalu muat ulang halaman.',
  2: 'Lokasi tidak tersedia. Nyalakan GPS/Lokasi di HP kamu lalu coba lagi.',
  3: 'Membaca lokasi terlalu lama. Pastikan GPS aktif lalu coba lagi.',
};

/** Nama tempat dari koordinat (OpenStreetMap Nominatim). Gagal/lambat → null; tidak pernah melempar. */
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=id&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const a = (await res.json()).address;
    if (!a) return null;
    const kota = a.city || a.county || a.municipality || a.town || a.regency || '';
    const alamat = [a.road, a.village || a.suburb || a.neighbourhood, a.city_district || a.subdistrict].filter(Boolean).join(', ');
    return kota || alamat ? { kota, alamat } : null;
  } catch { return null; }
}

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
