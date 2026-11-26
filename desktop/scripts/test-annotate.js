'use strict';
// Ubah keluaran node --test (reporter spec) menjadi anotasi GitHub Actions agar hasil uji terbaca tanpa membuka log.
const fs = require('fs');
const raw = fs.existsSync(process.argv[2]) ? fs.readFileSync(process.argv[2], 'utf8') : '';
const enc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
const sum = ['tests', 'pass', 'fail', 'skipped'].map((k) => { const m = new RegExp('ℹ ' + k + ' (\\d+)').exec(raw); return `${k}=${m ? m[1] : '?'}`; }).join(' ');
const failIdx = raw.indexOf('failing tests:');
if (failIdx >= 0 || /✖/.test(raw)) {
  const part = failIdx >= 0 ? raw.slice(failIdx) : raw.split('\n').filter((l) => /✖|Error|expected|actual|at .*test\.js/.test(l)).join('\n');
  console.log(`::error title=Uji gagal (${sum})::${enc(part.slice(0, 6000))}`);
} else {
  console.log(`::notice title=Hasil uji::${sum}`);
}
