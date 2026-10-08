import { api } from './api.js';
import { h, formatTanggal, badge, stats, loadInto, monthOf } from './ui.js';

const pad = (n) => String(n).padStart(2, '0');
const isWeekend = (y, m, d) => [0, 6].includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay());

/** Cincin persentase (conic-gradient). */
function ring(pct, label) {
  return h('div', { class: 'ring', style: `--p:${Math.round(pct)}` }, h('div', {}, h('strong', {}, `${Math.round(pct)}%`), h('span', {}, label)));
}

/** Kalender bulan berwarna menurut status; hari akhir pekan/mendatang diredupkan. */
function calendar(bulan, today, byDay) {
  const [y, m] = bulan.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Minggu
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array.from({ length: first }, () => h('i'));
  for (let d = 1; d <= days; d++) {
    const date = `${bulan}-${pad(d)}`;
    const st = byDay.get(date);
    const cls = ['day', st ? `s-${st}` : '', date === today ? 'today' : '', date > today ? 'future' : '', isWeekend(y, m, d) ? 'off' : ''].join(' ');
    cells.push(h('div', { class: cls, title: st ? `${formatTanggal(date)}: ${st}` : formatTanggal(date) }, d));
  }
  return h('div', {},
    h('div', { class: 'cal-head' }, ['M', 'S', 'S', 'R', 'K', 'J', 'S'].map((x) => h('span', {}, x))),
    h('div', { class: 'cal' }, cells),
    h('div', { class: 'legend small muted' },
      h('span', { class: 'dot s-Masuk' }), 'Hadir', h('span', { class: 'dot s-Izin' }), 'Izin',
      h('span', { class: 'dot s-Sakit' }), 'Sakit', h('span', { class: 'dot' }), 'Belum'));
}

function workdaysUntil(bulan, today) {
  const [y, m] = bulan.split('-').map(Number);
  const last = bulan === monthOf(today) ? Number(today.slice(8)) : new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= last; d++) if (!isWeekend(y, m, d)) n++;
  return n;
}

export function renderDasborPeserta(el, me) {
  const bulan = monthOf(me.today);
  const out = h('div');
  el.append(h('div', { class: 'welcome' }, h('div', { class: 'small muted' }, formatTanggal(me.today)), h('h2', {}, `Halo, ${String(me.nama).split(' ')[0]}`)), out);
  loadInto(out, () => api('absen.riwayat', { bulan }), (rows) => {
    const byDay = new Map(rows.map((r) => [r.tanggal, r.status]));
    const count = (s) => rows.filter((r) => r.status === s).length;
    const hadir = count('Masuk');
    const hk = workdaysUntil(bulan, me.today) || 1;
    const row = me.absensiHariIni;
    const selesai = row && (row.status !== 'Masuk' || row.jam_pulang);
    const goto = () => document.querySelector('[data-tab="presensi"]')?.click();
    return h('div', {},
      h('div', { class: 'card cta' },
        h('div', {},
          h('strong', {}, !row ? 'Belum presensi hari ini' : selesai ? 'Presensi hari ini selesai' : 'Sudah masuk, belum pulang'),
          h('div', { class: 'small muted' }, row ? `Masuk ${row.jam_masuk || '-'} · Pulang ${row.jam_pulang || '-'}` : `Batas telat ${me.config.batasTelat}`)),
        h('button', { class: 'btn primary', type: 'button', onclick: goto }, selesai ? 'Lihat' : 'Presensi')),
      h('div', { class: 'card panel' },
        ring(Math.min(100, (hadir / hk) * 100), 'kehadiran'),
        h('div', {},
          h('h3', {}, 'Bulan ini'),
          h('p', { class: 'muted small' }, `${hadir} hadir dari ${hk} hari kerja berjalan.`),
          stats([['Hadir', hadir, 'ok'], ['Izin', count('Izin'), 'warn'], ['Sakit', count('Sakit'), 'bad']]))),
      h('div', { class: 'card' }, h('h3', {}, 'Kalender kehadiran'), calendar(bulan, me.today, byDay)),
      h('div', { class: 'card' }, h('h3', {}, 'Terakhir'),
        rows.length
          ? rows.slice(-5).reverse().map((r) => h('div', { class: 'item' }, h('span', {}, formatTanggal(r.tanggal)), badge(r.status), h('span', { class: 'muted small' }, `${r.jam_masuk || '-'} – ${r.jam_pulang || '-'}`)))
          : h('p', { class: 'muted' }, 'Belum ada data bulan ini.')));
  });
}

export function renderDasborAdmin(el, me) {
  const out = h('div');
  const bulan = monthOf(me.today);
  el.append(h('div', { class: 'welcome' }, h('div', { class: 'small muted' }, formatTanggal(me.today)), h('h2', {}, 'Dasbor Admin')), out);
  loadInto(out, async () => {
    const [harian, rekap] = await Promise.all([api('admin.harian', { tanggal: me.today }), api('admin.rekap', { bulan })]);
    return { harian, rekap };
  }, ({ harian, rekap }) => {
    const st = (s) => harian.filter((r) => r.absensi?.status === s).length;
    const hadir = st('Masuk');
    const belum = harian.filter((r) => !r.absensi);
    const flagged = harian.filter((r) => r.absensi?.flags);
    const telat = rekap.filter((r) => r.telat > 0).sort((a, b) => b.telat - a.telat).slice(0, 5);
    const list = (rows, render, empty) => (rows.length ? rows.map(render) : h('p', { class: 'muted small' }, empty));
    return h('div', {},
      h('div', { class: 'card panel' },
        ring(harian.length ? (hadir / harian.length) * 100 : 0, 'hadir hari ini'),
        h('div', {},
          h('h3', {}, 'Hari ini'),
          h('p', { class: 'muted small' }, `${hadir} dari ${harian.length} peserta aktif sudah hadir.`),
          stats([['Hadir', hadir, 'ok'], ['Izin', st('Izin'), 'warn'], ['Sakit', st('Sakit'), 'bad'], ['Belum', belum.length]]))),
      h('div', { class: 'grid2' },
        h('div', { class: 'card' }, h('h3', {}, `Belum absen (${belum.length})`),
          list(belum, (r) => h('div', { class: 'item' }, h('span', {}, r.nama), h('span', { class: 'muted small' }, r.instansi)), 'Semua peserta sudah presensi.')),
        h('div', { class: 'card' }, h('h3', {}, `Perlu dicek (${flagged.length})`),
          list(flagged, (r) => h('div', { class: 'item' }, h('span', {}, r.nama), h('span', { class: 'warn small' }, r.absensi.flags)), 'Tidak ada tanda mencurigakan hari ini.'))),
      h('div', { class: 'card' }, h('h3', {}, 'Paling sering telat bulan ini'),
        list(telat, (r) => h('div', { class: 'item' }, h('span', {}, r.nama), h('strong', {}, `${r.telat}x`)), 'Belum ada yang telat bulan ini.')));
  });
}
