export async function openCamera(videoEl) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser tidak mendukung kamera. Pakai Chrome atau Safari versi terbaru.');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false });
    videoEl.muted = true;
    videoEl.srcObject = stream;
    await videoEl.play();
    return stream;
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('Izin kamera ditolak. Buka pengaturan browser → Izin situs → Kamera → Izinkan, lalu muat ulang.');
    if (e.name === 'NotFoundError') throw new Error('Kamera tidak ditemukan di perangkat ini.');
    throw new Error(`Kamera gagal dibuka: ${e.message}`);
  }
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Ambil frame video → JPEG base64 (tanpa prefix data URL), lebar maks 640px. */
export function captureFrame(videoEl, maxWidth = 640, quality = 0.7) {
  const scale = Math.min(1, maxWidth / videoEl.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(videoEl.videoWidth * scale);
  canvas.height = Math.round(videoEl.videoHeight * scale);
  canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return { mime: 'image/jpeg', base64: canvas.toDataURL('image/jpeg', quality).split(',')[1] };
}
