export async function openCamera(videoEl) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser tidak mendukung kamera. Pakai Chrome atau Safari versi terbaru.');
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false });
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('Izin kamera ditolak. Buka pengaturan browser → Izin situs → Kamera → Izinkan, lalu muat ulang.');
    if (e.name === 'NotFoundError') throw new Error('Kamera tidak ditemukan di perangkat ini.');
    if (e.name === 'NotReadableError') throw new Error('Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.');
    throw new Error(`Kamera gagal dibuka: ${e.message}`);
  }
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch {
    stopCamera(stream);
    throw new Error('Kamera gagal diputar. Muat ulang halaman lalu coba lagi.');
  }
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Cap di bawah foto: bilah gelap + teks putih. lines = array string (baris terakhir paling bawah). */
function drawWatermark(ctx, w, h, lines) {
  const fs = Math.max(11, Math.round(w / 34));
  const pad = Math.round(fs * 0.6);
  const barH = lines.length * Math.round(fs * 1.35) + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(0, h - barH, w, barH);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  lines.forEach((t, i) => ctx.fillText(t, pad, h - barH + pad + i * Math.round(fs * 1.35), w - pad * 2));
}

/** Ambil frame video → JPEG base64 (tanpa prefix data URL), lebar maks 640px. watermark = array baris teks (opsional). */
export function captureFrame(videoEl, maxWidth = 640, quality = 0.7, watermark = []) {
  const scale = Math.min(1, maxWidth / videoEl.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(videoEl.videoWidth * scale);
  canvas.height = Math.round(videoEl.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  if (watermark.length) drawWatermark(ctx, canvas.width, canvas.height, watermark);
  return { mime: 'image/jpeg', base64: canvas.toDataURL('image/jpeg', quality).split(',')[1] };
}
