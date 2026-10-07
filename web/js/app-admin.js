import { api } from './api.js';
import { h, toast, setBusy, link, monthOf, formatTanggal, table, badge, tabs, loadInto } from './ui.js';
import { toCsv, downloadCsv } from './csv.js';

export function mountAdmin(main, me) {
  return tabs(main, [
    { id: 'harian', label: 'Harian', render: (el) => renderHarian(el, me) },
    { id: 'rekap', label: 'Rekap Bulanan', render: (el) => renderRekap(el, me) },
    { id: 'peserta', label: 'Peserta', render: (el) => renderPeserta(el) },
    { id: 'logbook', label: 'Logbook', render: (el) => renderLogbook(el, me) },
  ]);
}

function toolbar(...children) {
  return h('div', { class: 'card row no-print' }, ...children);
}

function exportButton(getRows, columns, filename) {
  return h('button', { class: 'btn', type: 'button', onclick: () => {
    const rows = getRows();
    if (!rows.length) return toast('Tidak ada data untuk diekspor.', 'error');
    downloadCsv(filename(), toCsv(rows, columns));
  } }, 'Export CSV');
}

/* ---------------- Harian ---------------- */

const HARIAN_CSV = [
  { label: 'Nama', key: 'nama' }, { label: 'Instansi', key: 'instansi' }, { label: 'Email', key: 'email' },
  { label: 'Status', key: 'status' }, { label: 'Mode', key: 'mode' }, { label: 'Jam Masuk', key: 'jam_masuk' },
  { label: 'Jam Pulang', key: 'jam_pulang' }, { label: 'Lat Masuk', key: 'lat_masuk' }, { label: 'Lng Masuk', key: 'lng_masuk' },
  { label: 'Jarak Masuk (m)', key: 'jarak_masuk' }, { label: 'Jarak Pulang (m)', key: 'jarak_pulang' },
  { label: 'Flags', key: 'flags' }, { label: 'Selfie Masuk', key: 'link_selfie_masuk' },
  { label: 'Selfie Pulang', key: 'link_selfie_pulang' }, { label: 'Surat', key: 'link_surat' }, { label: 'Catatan', key: 'catatan' },
];

function mapsUrl(lat, lng) {
  return lat && lng ? `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}` : null;
}

function renderHarian(el, me) {
  const tanggal = h('input', { type: 'date', value: me.today, max: me.today });
  const out = h('div');
  let flat = [];
  const load = () => loadInto(out, () => api('admin.harian', { tanggal: tanggal.value }), (rows) => {
    flat = rows.map((r) => ({ nama: r.nama, instansi: r.instansi, email: r.email, ...(r.absensi || { status: 'Belum absen' }) }));
    const hadir = rows.filter((r) => r.absensi?.status === 'Masuk').length;
    return h('div', {},
      h('p', { class: 'muted' }, `${formatTanggal(tanggal.value)} · ${hadir} hadir dari ${rows.length} peserta`),
      table([
        { label: 'Nama', render: (r) => h('div', {}, r.nama, h('div', { class: 'muted small' }, r.instansi)) },
        { label: 'Status', render: (r) => badge(r.absensi?.status) },
        { label: 'Mode', render: (r) => r.absensi?.mode || '' },
        { label: 'Masuk', render: (r) => r.absensi?.jam_masuk || '' },
        { label: 'Pulang', render: (r) => r.absensi?.jam_pulang || '' },
        { label: 'Jarak', render: (r) => (r.absensi?.jarak_masuk ? `${r.absensi.jarak_masuk} m` : '') },
        { label: 'Flag', render: (r) => (r.absensi?.flags ? h('span', { class: 'warn small' }, r.absensi.flags) : '') },
        { label: 'Bukti', render: (r) => h('div', { class: 'row' },
          link(r.absensi?.link_selfie_masuk, 'Selfie masuk'), link(r.absensi?.link_selfie_pulang, 'Selfie pulang'),
          link(r.absensi?.link_surat, 'Surat'), link(mapsUrl(r.absensi?.lat_masuk, r.absensi?.lng_masuk), 'Lokasi')) },
      ], rows));
  });
  tanggal.addEventListener('change', load);
  el.append(toolbar(h('label', {}, 'Tanggal', tanggal),
    exportButton(() => flat, HARIAN_CSV, () => `presensi-${tanggal.value}.csv`)), out);
  load();
}

/* ---------------- Rekap ---------------- */

const REKAP_COLS = [
  { label: 'Nama', key: 'nama' }, { label: 'Instansi', key: 'instansi' }, { label: 'Hari Kerja', key: 'hariKerja' },
  { label: 'Hadir', key: 'hadir' }, { label: 'WFO', key: 'wfo' }, { label: 'WFH', key: 'wfh' }, { label: 'Izin', key: 'izin' },
  { label: 'Sakit', key: 'sakit' }, { label: 'Telat', key: 'telat' }, { label: 'Tanpa Ket.', key: 'tanpaKeterangan' },
];

function renderRekap(el, me) {
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const out = h('div');
  let rows = [];
  const load = () => loadInto(out, () => api('admin.rekap', { bulan: month.value }), (data) => {
    rows = data;
    return h('div', {},
      h('h3', {}, `Rekap Presensi Magang Bawaslu Malang — ${month.value}`),
      h('p', { class: 'muted small' }, 'Hari kerja = Senin–Jumat dalam periode magang sampai hari ini. Hadir bisa termasuk kerja di akhir pekan. Tanpa Ket. = hari kerja tanpa catatan presensi (hari ini belum dihitung).'),
      table(REKAP_COLS, data));
  });
  month.addEventListener('change', load);
  el.append(toolbar(h('label', {}, 'Bulan', month),
    exportButton(() => rows, REKAP_COLS, () => `rekap-${month.value}.csv`),
    h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Cetak / PDF')), out);
  load();
}

/* ---------------- Peserta ---------------- */

function renderPeserta(el) {
  const f = {
    email: h('input', { type: 'email', placeholder: 'nama@gmail.com' }),
    nama: h('input', { type: 'text', maxlength: 100 }),
    instansi: h('input', { type: 'text', maxlength: 150, placeholder: 'Kampus / sekolah' }),
    aktif: h('select', {}, h('option', { value: 'Y' }, 'Aktif'), h('option', { value: 'N' }, 'Nonaktif')),
    tanggal_mulai: h('input', { type: 'date' }),
    tanggal_selesai: h('input', { type: 'date' }),
  };
  const saveBtn = h('button', { class: 'btn primary', type: 'button' }, 'Simpan Peserta');
  const resetBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => fill({}) }, 'Kosongkan');
  const out = h('div');

  function fill(p) {
    Object.entries(f).forEach(([k, input]) => { input.value = p[k] || (k === 'aktif' ? 'Y' : ''); });
    f.email.readOnly = Boolean(p.email);
  }

  const load = () => loadInto(out, () => api('admin.peserta.list'), (rows) => (rows.length
    ? table([
      { label: 'Nama', key: 'nama' }, { label: 'Email', key: 'email' }, { label: 'Instansi', key: 'instansi' },
      { label: 'Periode', render: (p) => `${p.tanggal_mulai} s/d ${p.tanggal_selesai}` },
      { label: 'Status', render: (p) => (p.aktif === 'Y' ? 'Aktif' : 'Nonaktif') },
      { label: '', render: (p) => h('button', { class: 'btn small', type: 'button', onclick: () => { fill(p); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Edit') },
    ], rows)
    : h('p', { class: 'muted' }, 'Belum ada peserta.')));

  saveBtn.addEventListener('click', async () => {
    setBusy(saveBtn, true, 'Menyimpan...');
    try {
      const data = Object.fromEntries(Object.entries(f).map(([k, input]) => [k, input.value]));
      await api('admin.peserta.save', data);
      toast('Peserta tersimpan.', 'success');
      fill({});
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(saveBtn, false);
    }
  });

  el.append(h('div', { class: 'card' },
    h('h3', {}, 'Tambah / Edit Peserta'),
    h('label', {}, 'Email Google', f.email), h('label', {}, 'Nama', f.nama), h('label', {}, 'Instansi', f.instansi),
    h('label', {}, 'Status', f.aktif), h('label', {}, 'Tanggal mulai', f.tanggal_mulai), h('label', {}, 'Tanggal selesai', f.tanggal_selesai),
    h('div', { class: 'row' }, saveBtn, resetBtn)), out);
  fill({});
  load();
}

/* ---------------- Logbook ---------------- */

const LOGBOOK_CSV = [
  { label: 'Tanggal', key: 'tanggal' }, { label: 'Nama', key: 'nama' }, { label: 'Email', key: 'email' },
  { label: 'Kegiatan', key: 'kegiatan' }, { label: 'Lampiran', key: 'link_lampiran' },
];

function renderLogbook(el, me) {
  const month = h('input', { type: 'month', value: monthOf(me.today), max: monthOf(me.today) });
  const who = h('select', {}, h('option', { value: '' }, 'Semua peserta'));
  const out = h('div');
  let rows = [];

  api('admin.peserta.list')
    .then((list) => list.forEach((p) => who.append(h('option', { value: p.email }, p.nama))))
    .catch((e) => toast(e.message, 'error'));

  const load = () => loadInto(out, () => api('admin.logbook', { bulan: month.value, email: who.value }), (data) => {
    rows = data;
    return data.length
      ? table([
        { label: 'Tanggal', render: (r) => formatTanggal(r.tanggal) }, { label: 'Nama', key: 'nama' },
        { label: 'Kegiatan', key: 'kegiatan' }, { label: 'Lampiran', render: (r) => link(r.link_lampiran, 'lihat') },
      ], data)
      : h('p', { class: 'muted' }, 'Belum ada logbook.');
  });
  month.addEventListener('change', load);
  who.addEventListener('change', load);
  el.append(toolbar(h('label', {}, 'Bulan', month), h('label', {}, 'Peserta', who),
    exportButton(() => rows, LOGBOOK_CSV, () => `logbook-${month.value}.csv`)), out);
  load();
}
