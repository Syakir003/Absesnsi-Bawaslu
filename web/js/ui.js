// Helper DOM kecil. Selalu pakai textContent (lewat h) → aman dari XSS.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
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

let toastTimer = null;
export function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), type === 'error' ? 6000 : 3000);
}

export function setBusy(btn, busy, busyLabel = 'Memproses...') {
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.textContent = busyLabel;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
  }
}

export function safeUrl(url) {
  return /^https:\/\//.test(String(url || '')) ? url : null;
}

export function link(url, label) {
  const href = safeUrl(url);
  return href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label) : '';
}

export function monthOf(dateStr) {
  return String(dateStr).slice(0, 7);
}

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function formatTanggal(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return String(dateStr);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[dow]}, ${String(d).padStart(2, '0')} ${BULAN[m - 1]} ${y}`;
}

export function segmented(options, initial, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
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

/** Tab sederhana. render(el) boleh mengembalikan fungsi cleanup (mis. matikan kamera). */
export function tabs(container, defs) {
  const nav = h('nav', { class: 'tabs' });
  const body = h('div');
  let cleanup = null;
  const show = (id) => {
    if (typeof cleanup === 'function') cleanup();
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    clear(body);
    cleanup = defs.find((d) => d.id === id).render(body);
  };
  defs.forEach((d) => nav.append(h('button', { type: 'button', 'data-tab': d.id, onclick: () => show(d.id) }, d.label)));
  container.append(nav, body);
  show(defs[0].id);
}

/** Muat data async ke dalam `out` dengan state loading/error. */
export async function loadInto(out, loader, renderRows) {
  out.replaceChildren(h('p', { class: 'muted' }, 'Memuat...'));
  try {
    const data = await loader();
    out.replaceChildren(renderRows(data));
  } catch (e) {
    out.replaceChildren(h('p', { class: 'error' }, e.message));
  }
}
