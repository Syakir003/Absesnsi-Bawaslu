import { api } from './api.js';
import { h, clear, toast, setBusy, monthOf, addDays, formatTanggal, segmented, table, badge, tabs, loadInto } from './ui.js';
import { prepareUpload } from './file.js';
import { captureFlow, handleSubmitError } from './capture.js';
import { withBusy } from './busy.js';

// Upload foto/surat lewat jaringan HP bisa lambat: beri waktu 2 menit.
const UPLOAD_OPTS = { timeoutMs: 120_000 };

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
      // File ada di folder Drive khusus admin; peserta tidak bisa membukanya, jadi cukup teks.
      : h('p', {}, row.link_surat ? 'Surat terkirim' : ''),
    row.catatan ? h('p', { class: 'muted small' }, row.catatan) : null);
}

function checkInForm(el, me, done) {
  let status = 'Masuk';
  let mode = 'WFO';
  let flowCleanup = null;
  let modeSeg = null;
  let sending = false; // Izin/Sakit sedang diunggah
  const area = h('div');
  const catatan = h('textarea', { rows: 2, maxlength: 500 });
  const statusSeg = segmented(['Masuk', 'Izin', 'Sakit'], status, (v) => { status = v; drawArea(); }, 'Keterangan presensi');

  el.append(h('div', { class: 'card' }, h('h3', {}, 'Keterangan'), statusSeg), area);

  const catatanCard = () => h('div', { class: 'card' }, h('label', {}, 'Catatan (opsional)', catatan));
  // Kunci pilihan status/mode selama submit supaya tidak berubah di tengah pengiriman.
  const lock = (locked) => { statusSeg.setDisabled(locked); modeSeg?.setDisabled(locked); };

  function drawArea() {
    flowCleanup?.();
    flowCleanup = null;
    modeSeg = null;
    clear(area);
    if (status === 'Masuk') {
      modeSeg = segmented(['WFO', 'WFH'], mode, (v) => { mode = v; }, 'Mode kerja');
      area.append(
        h('div', { class: 'card' }, h('h3', {}, 'Mode kerja'), modeSeg,
          h('p', { class: 'muted small' }, `WFO wajib dalam radius ${me.config.radiusMeter} m dari kantor.`)),
        catatanCard());
      flowCleanup = captureFlow(area, {
        me,
        onStale: done,
        onLock: lock,
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
      if (sending) return;
      sending = true;
      setBusy(btn, true, 'Mengunggah...');
      fileInput.disabled = true;
      lock(true);
      await withBusy(async () => {
        try {
          const surat = await prepareUpload(fileInput.files[0]);
          me.absensiHariIni = await api('absen.checkin', { status, surat, catatan: catatan.value }, UPLOAD_OPTS);
          toast(`${status} tercatat.`, 'success');
          return done();
        } catch (e) {
          if (await handleSubmitError(e, me)) return done();
        }
        sending = false;
        setBusy(btn, false);
        fileInput.disabled = false;
        lock(false);
      });
    });
    area.append(
      h('div', { class: 'card' }, h('label', { class: 'strong' }, 'Surat / bukti', fileInput), h('p', { class: 'muted small' }, 'JPG, PNG, atau PDF maks 2 MB.')),
      catatanCard(),
      btn);
  }

  drawArea();
  return () => flowCleanup?.();
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
  const batas = Number(me.config.batasEditLogbookHari) || 0;
  const tanggal = h('input', { type: 'date', value: me.today, min: addDays(me.today, -batas), max: me.today });
  const kegiatan = h('textarea', { rows: 4, maxlength: 2000, placeholder: 'Apa saja yang kamu kerjakan hari ini?' });
  const lampiran = h('input', { type: 'file', accept: 'image/jpeg,image/png,application/pdf' });
  const saveBtn = h('button', { class: 'btn primary block', type: 'button' }, 'Simpan Logbook');
  const existsHint = h('p', { class: 'success small hidden', 'aria-live': 'polite' }, 'Logbook tanggal ini sudah ada — simpan akan memperbarui.');
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const out = h('div');

  const byMonth = new Map(); // bulan -> baris logbook (untuk mengisi otomatis entri yang sudah ada)
  let prefilled = ''; // teks yang kita isikan sendiri; hanya teks ini (atau kosong) yang boleh ditimpa

  const rowFor = (date) => byMonth.get(monthOf(date))?.find((r) => r.tanggal === date);

  /** Isi Kegiatan dengan entri tanggal terpilih bila ada; jangan timpa ketikan pengguna. */
  function syncPrefill() {
    const row = rowFor(tanggal.value);
    if (kegiatan.value === '' || kegiatan.value === prefilled) {
      kegiatan.value = row ? row.kegiatan : '';
      prefilled = kegiatan.value;
    }
    existsHint.classList.toggle('hidden', !row);
  }

  async function onDateChange() {
    const date = tanggal.value;
    if (date && !byMonth.has(monthOf(date))) {
      try {
        byMonth.set(monthOf(date), await api('logbook.list', { bulan: monthOf(date) }));
      } catch { /* tanpa prefill; simpan tetap bisa */ }
      if (tanggal.value !== date) return; // tanggal berubah lagi saat menunggu
    }
    syncPrefill();
  }

  const load = () => loadInto(out, async () => {
    const bulan = month.value;
    const rows = await api('logbook.list', { bulan });
    byMonth.set(bulan, rows);
    return rows;
  }, (rows) => {
    syncPrefill();
    return rows.length
      ? table([
        { label: 'Tanggal', render: (r) => formatTanggal(r.tanggal) },
        { label: 'Kegiatan', key: 'kegiatan' },
        // File ada di folder Drive khusus admin; peserta tidak bisa membukanya, jadi cukup teks.
        { label: 'Lampiran', render: (r) => (r.link_lampiran ? 'Ada lampiran' : '') },
        { label: '', render: (r) => (r.bisaEdit ? h('button', { class: 'btn small', type: 'button', onclick: () => { tanggal.value = r.tanggal; kegiatan.value = r.kegiatan; prefilled = r.kegiatan; syncPrefill(); kegiatan.focus(); } }, 'Edit') : '') },
      ], rows)
      : h('p', { class: 'muted' }, 'Belum ada logbook bulan ini.');
  });

  saveBtn.addEventListener('click', async () => {
    setBusy(saveBtn, true, 'Menyimpan...');
    await withBusy(async () => {
      try {
        const file = lampiran.files[0] ? await prepareUpload(lampiran.files[0]) : null;
        await api('logbook.save', { tanggal: tanggal.value, kegiatan: kegiatan.value, lampiran: file }, UPLOAD_OPTS);
        toast('Logbook tersimpan.', 'success');
        lampiran.value = '';
        byMonth.delete(monthOf(tanggal.value));
        prefilled = kegiatan.value; // teks yang baru disimpan dianggap sama dengan entri tersimpan
        month.value = monthOf(tanggal.value);
        load();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        setBusy(saveBtn, false);
      }
    });
  });
  month.addEventListener('change', load);
  tanggal.addEventListener('change', onDateChange);

  el.append(
    h('div', { class: 'card' },
      h('label', {}, 'Tanggal', tanggal),
      h('label', {}, 'Kegiatan', kegiatan),
      existsHint,
      h('label', {}, 'Lampiran (opsional)', lampiran),
      h('p', { class: 'muted small' }, `Logbook bisa diubah sampai ${batas} hari setelah tanggalnya. Simpan di tanggal yang sama = update.`),
      saveBtn),
    h('div', { class: 'card' }, h('label', {}, 'Bulan', month)),
    out);
  load();
}
