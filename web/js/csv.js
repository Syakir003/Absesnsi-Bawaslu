// CSV aman: escape kutip/pemisah/newline + cegah formula injection.
// Awalan = + - @ TAB CR diberi apostrof, kecuali seluruh sel adalah angka polos (mis. -7.9666).
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

export function csvCell(value, delimiter = ';') {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  const needsQuote = /[",;\r\n]/.test(s) || (delimiter && s.includes(delimiter));
  return needsQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * columns: [{ label, key }]. Default pemisah ';' supaya terbuka rapi di Excel berbahasa Indonesia.
 */
export function toCsv(rows, columns, delimiter = ';') {
  const head = columns.map((c) => csvCell(c.label, delimiter)).join(delimiter);
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key], delimiter)).join(delimiter));
  return [head, ...body].join('\r\n');
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM biar Excel baca UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
