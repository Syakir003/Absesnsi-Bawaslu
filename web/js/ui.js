// Helper DOM kecil. Selalu pakai textContent (lewat h) → aman dari XSS.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) {
      if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      continue; // jangan pernah jadikan inline handler (setAttribute)
    }
    if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
}

let toastTimers = [];
export function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  const isError = type === 'error';
  toastTimers.forEach(clearTimeout);
  el.setAttribute('role', isError ? 'alert' : 'status');
  el.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  el.textContent = message;
  el.className = `toast ${type} show`;
  toastTimers = [setTimeout(() => {
    el.classList.remove('show');
    // kosongkan teks setelah fade-out supaya teks lama tidak tertinggal di DOM
    toastTimers = [setTimeout(() => { el.textContent = ''; }, 400)];
  }, isError ? 10_000 : 3000)];
}

export function setBusy(btn, busy, busyLabel = 'Memproses...') {
  if (busy) {
    if (btn.dataset.label === undefined) btn.dataset.label = btn.textContent; // jangan timpa label asli
    btn.textContent = busyLabel;
    btn.disabled = true;
  } else {
    if (btn.dataset.label !== undefined) btn.textContent = btn.dataset.label;
    delete btn.dataset.label;
    btn.disabled = false;
  }
}

// Hanya link ke Google Drive/Docs/Maps. Mengembalikan URL ter-normalisasi atau null.
const ALLOWED_HOSTS = new Set(['drive.google.com', 'docs.google.com', 'www.google.com']);
export function safeUrl(url) {
  try {
    const u = new URL(String(url ?? ''));
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname) ? u.href : null;
  } catch {
    return null;
  }
}

export function link(url, label) {
  const href = safeUrl(url);
  return href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label) : '';
}

export function monthOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

/** Geser tanggal 'yyyy-MM-dd' sebanyak n hari (aritmetika UTC, bebas zona waktu perangkat). */
export function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function formatTanggal(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return String(dateStr);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[dow]}, ${String(d).padStart(2, '0')} ${BULAN[m - 1]} ${y}`;
}

export function segmented(options, initial, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  options.forEach((opt) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(opt === initial), class: opt === initial ? 'active' : '' }, opt);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => { x.classList.remove('active'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('active');
      b.setAttribute('aria-checked', 'true');
      onChange(opt);
    });
    wrap.append(b);
  });
  // Matikan/hidupkan semua pilihan (mis. saat form sedang mengirim).
  wrap.setDisabled = (disabled) => wrap.querySelectorAll('button').forEach((x) => { x.disabled = Boolean(disabled); });
  return wrap;
}

/** columns: [{ label, key } | { label, render: (row) => Node|string }] */
export function table(columns, rows) {
  return h('div', { class: 'table-wrap' },
    h('table', {},
      h('thead', {}, h('tr', {}, columns.map((c) => h('th', {}, c.label)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, columns.map((c) => h('td', {}, c.render ? c.render(r) : (r[c.key] ?? '')))))),
    ));
}

export function badge(status) {
  return h('span', { class: `badge ${status || 'Belum'}` }, status || 'Belum absen');
}

/**
 * Tab sederhana. render(el) boleh mengembalikan fungsi cleanup (mis. matikan kamera).
 * initialId (opsional): tab yang dibuka pertama; id tak dikenal → tab pertama.
 * Mengembalikan dispose(): menjalankan cleanup tab aktif (idempotent); dispose.current() = id tab aktif.
 */
export function tabs(container, defs, initialId) {
  const nav = h('nav', { class: 'tabs', role: 'tablist' });
  const body = h('div', { role: 'tabpanel' });
  let cleanup = null;
  let currentId = null;
  let observer = null;
  const cleanupTab = () => {
    const fn = cleanup;
    cleanup = null;
    if (typeof fn === 'function') fn();
  };
  // dispose akhir: cleanup tab aktif + lepas ResizeObserver (idempotent)
  const dispose = () => {
    observer?.disconnect();
    observer = null;
    cleanupTab();
  };
  const show = (id) => {
    cleanupTab();
    currentId = id;
    nav.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    clear(body);
    cleanup = defs.find((d) => d.id === id).render(body);
  };
  defs.forEach((d) => nav.append(h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': d.id, onclick: () => show(d.id) }, d.label)));
  // Petunjuk visual (class "more") bila tab masih bisa digulir ke kanan.
  const updateFade = () => nav.classList.toggle('more', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  nav.addEventListener('scroll', updateFade, { passive: true });
  container.append(nav, body);
  show(defs.some((d) => d.id === initialId) ? initialId : defs[0].id);
  updateFade();
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(updateFade); observer.observe(nav); }
  dispose.current = () => currentId;
  return dispose;
}

/** Muat data async ke dalam `out` dengan state loading/error. Respons lama diabaikan. */
export async function loadInto(out, loader, renderRows) {
  const id = String((Number(out.dataset.req) || 0) + 1);
  out.dataset.req = id;
  out.replaceChildren(h('p', { class: 'muted' }, 'Memuat...'));
  try {
    const data = await loader();
    if (out.dataset.req !== id) return;
    out.replaceChildren(renderRows(data));
  } catch (e) {
    if (out.dataset.req !== id) return;
    out.replaceChildren(h('p', { class: 'error' }, e.message));
  }
}
