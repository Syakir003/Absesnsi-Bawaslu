import { api } from './api.js';
import { h, clear, toast, setBusy, link, monthOf, formatTanggal, segmented, table, badge, tabs, loadInto } from './ui.js';
import { getPosition } from './geo.js';
import { openCamera, stopCamera, captureFrame } from './camera.js';
import { prepareUpload } from './file.js';

// Upload foto/surat lewat jaringan HP bisa lambat: beri waktu 2 menit.
const UPLOAD_OPTS = { timeoutMs: 120_000 };

/**
 * Setelah submit ditolak dengan ApiError USER (mis. 'sudah mengisi presensi hari ini' karena
 * request yang di-retry sebenarnya sudah tersimpan), tampilkan pesan lalu segarkan status hari ini.
 * Error NETWORK cukup toast. Mengembalikan true hanya bila status presensi hari ini ternyata berubah
 * (view perlu digambar ulang); kalau tidak, form dibiarkan apa adanya supaya foto/catatan tidak hilang.
 */
async function handleSubmitError(e, me) {
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

export function mountPeserta(main, me) {
  return tabs(main, [
    { id: 'presensi', label: 'Presensi', render: (el) => renderPresensi(el, me) },
    { id: 'riwayat', label: 'Riwayat', render: (el) => renderRiwayat(el, me) },
    { id: 'logbook', label: 'Logbook', render: (el) => renderLogbook(el, me) },
  ]);
}

/* ---------------- Presensi ---------------- */

function renderPresensi(el, me) {
  let cleanup = null;
  let disposed = false;
  const rerender = () => {
    if (disposed) return; // tab sudah ditutup saat request berjalan: jangan nyalakan kamera lagi
    cleanup?.();
    clear(el);
    cleanup = draw();
  };
  const draw = () => {
    el.append(h('p', { class: 'muted' }, `${formatTanggal(me.today)} · Jam masuk ${me.config.jamMasuk}, batas telat ${me.config.batasTelat}`));
    const row = me.absensiHariIni;
    if (!row) return checkInForm(el, me, rerender);
    el.append(statusCard(row));
    if (row.status === 'Masuk' && !row.jam_pulang) {
      el.append(h('h3', {}, 'Absen Pulang'));
      return captureFlow(el, {
        me,
        onStale: rerender,
        submitLabel: 'Kirim Absen Pulang',
        onSubmit: async (payload) => {
          me.absensiHariIni = await api('absen.checkout', payload, UPLOAD_OPTS);
          toast('Absen pulang tercatat. Hati-hati di jalan!', 'success');
          rerender();
        },
      });
    }
    el.append(h('p', { class: 'success' }, 'Presensi hari ini sudah lengkap. Jangan lupa isi logbook!'));
    return null;
  };
  cleanup = draw();
  return () => {
    disposed = true;
    cleanup?.();
  };
}

function statusCard(row) {
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, badge(row.status), row.mode ? h('span', { class: 'badge' }, row.mode) : null),
    row.status === 'Masuk'
      ? h('p', {}, `Masuk ${row.jam_masuk || '-'} · Pulang ${row.jam_pulang || '-'}`)
      : h('p', {}, 'Surat: ', link(row.link_surat, 'lihat file')),
    row.catatan ? h('p', { class: 'muted small' }, row.catatan) : null);
}

function checkInForm(el, me, done) {
  let status = 'Masuk';
  let mode = 'WFO';
  let flowCleanup = null;
  const area = h('div');
  const catatan = h('textarea', { rows: 2, maxlength: 500, placeholder: 'Catatan (opsional)' });

  el.append(h('div', { class: 'card' }, h('h3', {}, 'Keterangan'),
    segmented(['Masuk', 'Izin', 'Sakit'], status, (v) => { status = v; drawArea(); }, 'Keterangan presensi')), area);

  function drawArea() {
    flowCleanup?.();
    flowCleanup = null;
    clear(area);
    if (status === 'Masuk') {
      area.append(
        h('div', { class: 'card' }, h('h3', {}, 'Mode kerja'),
          segmented(['WFO', 'WFH'], mode, (v) => { mode = v; }, 'Mode kerja'),
          h('p', { class: 'muted small' }, `WFO wajib dalam radius ${me.config.radiusMeter} m dari kantor.`)),
        h('div', { class: 'card' }, catatan));
      flowCleanup = captureFlow(area, {
        me,
        onStale: done,
        submitLabel: 'Kirim Absen Masuk',
        getExtra: () => ({ status, mode, catatan: catatan.value }),
        onSubmit: async (payload) => {
          me.absensiHariIni = await api('absen.checkin', payload, UPLOAD_OPTS);
          toast('Absen masuk tercatat.', 'success');
          done();
        },
      });
      return;
    }
    const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf' });
    const btn = h('button', { class: 'btn primary block', type: 'button' }, `Kirim ${status}`);
    btn.addEventListener('click', async () => {
      setBusy(btn, true, 'Mengunggah...');
      try {
        const surat = await prepareUpload(fileInput.files[0]);
        me.absensiHariIni = await api('absen.checkin', { status, surat, catatan: catatan.value }, UPLOAD_OPTS);
        toast(`${status} tercatat.`, 'success');
        done();
      } catch (e) {
        if (await handleSubmitError(e, me)) done();
        else setBusy(btn, false);
      }
    });
    area.append(
      h('div', { class: 'card' }, h('h3', {}, 'Surat / bukti'), h('p', { class: 'muted small' }, 'JPG, PNG, atau PDF maks 2 MB.'), fileInput),
      h('div', { class: 'card' }, catatan),
      btn);
  }

  drawArea();
  return () => flowCleanup?.();
}

/** Lokasi + selfie live + tombol kirim. Return cleanup (matikan kamera). */
function captureFlow(container, { me, submitLabel, getExtra, onSubmit, onStale }) {
  let pos = null;
  let photo = null;
  let stream = null;
  let disposed = false;

  const locText = h('p', { class: 'muted' }, 'Mengambil lokasi...');
  const locBtn = h('button', { class: 'btn ghost small', type: 'button' }, 'Perbarui lokasi');
  const video = h('video', { class: 'cam', playsinline: true, autoplay: true, muted: true });
  const preview = h('img', { class: 'cam hidden', alt: 'Preview selfie' });
  const camMsg = h('p', { class: 'error hidden' });
  const shotBtn = h('button', { class: 'btn', type: 'button' }, 'Ambil Foto');
  const retakeBtn = h('button', { class: 'btn ghost hidden', type: 'button' }, 'Ulangi Foto');
  const submitBtn = h('button', { class: 'btn primary block', type: 'button', disabled: true }, submitLabel);

  container.append(
    h('div', { class: 'card' }, h('h3', {}, 'Lokasi'), locText, locBtn),
    h('div', { class: 'card' }, h('h3', {}, 'Selfie'), video, preview, camMsg, h('div', { class: 'row' }, shotBtn, retakeBtn)),
    submitBtn);

  const refresh = () => { submitBtn.disabled = !(pos && photo); };

  async function readLocation() {
    pos = null;
    refresh();
    locText.className = 'muted';
    locText.textContent = 'Mengambil lokasi...';
    try {
      pos = await getPosition();
      locText.textContent = `Lokasi terbaca (akurasi ±${pos.accuracy} m)`;
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
      camMsg.textContent = e.message;
      camMsg.classList.remove('hidden');
      shotBtn.disabled = true;
    }
  }

  shotBtn.addEventListener('click', () => {
    if (!video.videoWidth) return toast('Kamera belum siap.', 'error');
    photo = captureFrame(video);
    preview.src = `data:image/jpeg;base64,${photo.base64}`;
    video.classList.add('hidden');
    preview.classList.remove('hidden');
    shotBtn.classList.add('hidden');
    retakeBtn.classList.remove('hidden');
    refresh();
  });

  retakeBtn.addEventListener('click', () => {
    photo = null;
    preview.classList.add('hidden');
    video.classList.remove('hidden');
    shotBtn.classList.remove('hidden');
    retakeBtn.classList.add('hidden');
    refresh();
  });

  locBtn.addEventListener('click', readLocation);

  submitBtn.addEventListener('click', async () => {
    setBusy(submitBtn, true, 'Mengirim...');
    try {
      await onSubmit({ ...pos, selfie: photo, ...(getExtra ? getExtra() : {}) });
    } catch (e) {
      if (await handleSubmitError(e, me)) onStale();
      else setBusy(submitBtn, false);
    }
  });

  readLocation();
  startCamera();
  return () => {
    disposed = true;
    stopCamera(stream);
  };
}

/* ---------------- Riwayat ---------------- */

function renderRiwayat(el, me) {
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const out = h('div');
  const load = () => loadInto(out, () => api('absen.riwayat', { bulan: month.value }), (rows) => (rows.length
    ? table([
      { label: 'Tanggal', render: (r) => formatTanggal(r.tanggal) },
      { label: 'Status', render: (r) => badge(r.status) },
      { label: 'Mode', key: 'mode' },
      { label: 'Masuk', key: 'jam_masuk' },
      { label: 'Pulang', key: 'jam_pulang' },
    ], rows)
    : h('p', { class: 'muted' }, 'Belum ada data bulan ini.')));
  month.addEventListener('change', load);
  el.append(h('div', { class: 'card' }, h('label', {}, 'Bulan', month)), out);
  load();
}

/* ---------------- Logbook ---------------- */

function renderLogbook(el, me) {
  const tanggal = h('input', { type: 'date', value: me.today, max: me.today });
  const kegiatan = h('textarea', { rows: 4, maxlength: 2000, placeholder: 'Apa saja yang kamu kerjakan hari ini?' });
  const lampiran = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf' });
  const saveBtn = h('button', { class: 'btn primary block', type: 'button' }, 'Simpan Logbook');
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const out = h('div');

  const load = () => loadInto(out, () => api('logbook.list', { bulan: month.value }), (rows) => (rows.length
    ? table([
      { label: 'Tanggal', render: (r) => formatTanggal(r.tanggal) },
      { label: 'Kegiatan', key: 'kegiatan' },
      { label: 'Lampiran', render: (r) => link(r.link_lampiran, 'lihat') },
      { label: '', render: (r) => (r.bisaEdit ? h('button', { class: 'btn small', type: 'button', onclick: () => { tanggal.value = r.tanggal; kegiatan.value = r.kegiatan; kegiatan.focus(); } }, 'Edit') : '') },
    ], rows)
    : h('p', { class: 'muted' }, 'Belum ada logbook bulan ini.')));

  saveBtn.addEventListener('click', async () => {
    setBusy(saveBtn, true, 'Menyimpan...');
    try {
      const file = lampiran.files[0] ? await prepareUpload(lampiran.files[0]) : null;
      await api('logbook.save', { tanggal: tanggal.value, kegiatan: kegiatan.value, lampiran: file }, UPLOAD_OPTS);
      toast('Logbook tersimpan.', 'success');
      kegiatan.value = '';
      lampiran.value = '';
      month.value = monthOf(tanggal.value);
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(saveBtn, false);
    }
  });
  month.addEventListener('change', load);

  el.append(
    h('div', { class: 'card' },
      h('label', {}, 'Tanggal', tanggal),
      h('label', {}, 'Kegiatan', kegiatan),
      h('label', {}, 'Lampiran (opsional)', lampiran),
      h('p', { class: 'muted small' }, `Logbook bisa diubah sampai ${me.config.batasEditLogbookHari} hari setelah tanggalnya. Simpan di tanggal yang sama = update.`),
      saveBtn),
    h('div', { class: 'card' }, h('label', {}, 'Bulan', month)),
    out);
  load();
}
