// Muat apps-script/Core.js seperti Apps Script (global scope) lewat node:vm.
// Hasil fungsi di-structuredClone supaya assert.deepStrictEqual tidak gagal karena beda realm.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCore() {
  const ctx = vm.createContext({});
  const file = path.join(__dirname, '..', '..', 'apps-script', 'Core.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: 'Core.js' });
  const api = {};
  for (const key of Object.keys(ctx)) {
    const v = ctx[key];
    api[key] = typeof v === 'function'
      ? (...args) => toLocal(v(...args))
      : toLocal(v);
  }
  return api;
}

function toLocal(v) {
  return v === undefined ? undefined : structuredClone(v);
}

module.exports = { loadCore };
