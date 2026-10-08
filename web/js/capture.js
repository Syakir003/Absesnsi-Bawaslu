import { api } from './api.js';
import { h, toast, setBusy } from './ui.js';
import { getPosition } from './geo.js';
import { openCamera, stopCamera, captureFrame } from './camera.js';
import { withBusy, setDirty } from './busy.js';

/**
 * Submit ditolak. Selalu toast pesannya. Untuk ApiError USER (mis. 'sudah mengisi presensi hari ini'
 * karena request yang di-retry sebenarnya sudah tersimpan) segarkan status hari ini lewat 'me'.
 * Mengembalikan true hanya bila status presensi hari ini ternyata berubah (view perlu digambar ulang);
 * kalau tidak, form dibiarkan apa adanya supaya foto/catatan tidak hilang. NETWORK: cukup toast.
 */
export async function handleSubmitError(e, me) {
  toast(e.message, 'error');
  if (e?.code !== 'USER') return false;
  try {
    const before = JSON.stringify(me.absensiHariIni ?? null);
    const fresh = await api('me');
    me.absensiHariIni = fresh.absensiHariIni;
    return JSON.stringify(me.absensiHariIni ?? null) !== before;
  } catch {
    return false; // abaikan error refresh
  }
}

/**
 * Lokasi + selfie live + tombol kirim. Return cleanup (matikan kamera).
 * Selama submit berjalan semua kontrol dikunci (anti double submit); `onLock(true|false)` memberi tahu
 * pemanggil supaya ikut mengunci kontrolnya sendiri (pilihan status/mode). Saat gagal kontrol dibuka lagi.
 */
export function captureFlow(container, { me, submitLabel, getExtra, onSubmit, onStale, onLock }) {
  let pos = null;
  let photo = null;
  let stream = null;
  let disposed = false;
  let submitting = false;
  let camFailed = false;

  const locText = h('p', { class: 'muted', 'aria-live': 'polite' }, 'Mengambil lokasi...');
  const locBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Perbarui lokasi');
  const video = h('video', { class: 'cam', playsinline: true, autoplay: true, muted: true });
  const preview = h('img', { class: 'cam hidden', alt: 'Preview selfie' });
  const camMsg = h('p', { class: 'error hidden', 'aria-live': 'polite' });
  const shotBtn = h('button', { class: 'btn', type: 'button' }, 'Ambil Foto');
  const retakeBtn = h('button', { class: 'btn ghost hidden', type: 'button' }, 'Ulangi Foto');
  const submitBtn = h('button', { class: 'btn primary block', type: 'button', disabled: true }, submitLabel);

  const needHint = h('p', { class: 'need small center', 'aria-live': 'polite' });
  const step = (n, title, desc) => h('h3', { class: 'step' }, h('span', {}, n), title, h('small', {}, desc));

  container.append(
    h('div', { class: 'card' }, step(1, 'Lokasi', 'Dipakai untuk memastikan Anda berada di area kantor. Izinkan akses lokasi bila browser meminta.'), locText, locBtn),
    h('div', { class: 'card' }, step(2, 'Selfie', 'Foto wajah langsung dari kamera (tidak bisa dari galeri). Pastikan wajah terlihat jelas dan cukup terang.'), video, preview, camMsg, h('div', { class: 'row' }, shotBtn, retakeBtn)),
    needHint, submitBtn);

  const refresh = () => {
    submitBtn.disabled = submitting || !(pos && photo);
    const need = [!pos && 'lokasi', !photo && 'foto selfie'].filter(Boolean);
    needHint.textContent = need.length ? `Untuk mengirim, lengkapi dulu: ${need.join(' dan ')}.` : 'Semua siap. Tekan tombol kirim di bawah.';
    needHint.className = `need small center ${need.length ? 'muted' : 'success'}`;
    locBtn.disabled = submitting;
    shotBtn.disabled = submitting || camFailed;
    retakeBtn.disabled = submitting;
  };

  async function readLocation() {
    if (submitting) return;
    pos = null;
    refresh();
    locText.className = 'muted';
    locText.textContent = 'Mengambil lokasi...';
    try {
      pos = await getPosition();
      locText.textContent = `Lokasi terbaca (akurasi ±${pos.accuracy} m). Semakin kecil angkanya, semakin akurat.`;
    } catch (e) {
      locText.className = 'error';
      locText.textContent = e.message;
    }
    refresh();
  }

  async function startCamera() {
    try {
      const s = await openCamera(video);
      if (disposed) return stopCamera(s);
      stream = s;
    } catch (e) {
      camFailed = true;
      camMsg.textContent = e.message;
      camMsg.classList.remove('hidden');
      refresh();
    }
  }

  shotBtn.addEventListener('click', () => {
    if (submitting) return;
    if (!video.videoWidth) return toast('Kamera belum siap.', 'error');
    const waktu = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23' }).format(new Date()).replace(/\./g, ':');
    photo = captureFrame(video, 640, 0.7, [
      `${me.nama} · ${waktu} WIB`,
      pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (±${pos.accuracy} m)` : 'Lokasi belum terbaca',
    ]);
    setDirty('capture', true); // foto sudah diambil: jangan hilang karena muat ulang
    preview.src = `data:image/jpeg;base64,${photo.base64}`;
    video.classList.add('hidden');
    preview.classList.remove('hidden');
    shotBtn.classList.add('hidden');
    retakeBtn.classList.remove('hidden');
    refresh();
  });

  retakeBtn.addEventListener('click', () => {
    if (submitting) return;
    photo = null;
    setDirty('capture', false);
    preview.classList.add('hidden');
    video.classList.remove('hidden');
    shotBtn.classList.remove('hidden');
    retakeBtn.classList.add('hidden');
    refresh();
  });

  locBtn.addEventListener('click', readLocation);

  submitBtn.addEventListener('click', async () => {
    if (submitting || !(pos && photo)) return;
    submitting = true;
    setBusy(submitBtn, true, 'Mengirim...');
    refresh();
    onLock?.(true);
    await withBusy(async () => {
      try {
        await onSubmit({ ...pos, selfie: photo, ...(getExtra ? getExtra() : {}) });
        setDirty('capture', false);
        return; // sukses: pemanggil menggambar ulang view
      } catch (e) {
        if (await handleSubmitError(e, me)) return onStale();
      }
      submitting = false;
      setBusy(submitBtn, false);
      refresh();
      onLock?.(false);
    });
  });

  readLocation();
  startCamera();
  return () => {
    disposed = true;
    setDirty('capture', false);
    stopCamera(stream);
  };
}
