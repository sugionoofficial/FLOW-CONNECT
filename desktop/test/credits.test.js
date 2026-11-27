'use strict';
// Saldo kredit Google Flow dibaca dari panel "Account details" — berbagai bentuk panel (paket gratis, paket Google AI,
// angka terpisah dari label, aria-label saja) dan TIDAK tertukar dengan label biaya / banner "Add AI credits".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchBrowser, waitForDebugPort, getJSON, findBrowsers } = require('../src/main/browser');
const { CDPConnection } = require('../src/main/cdp');
const { agentExpression } = require('../src/main/agent');

const CHROME = process.env.CHROME_PATH || (findBrowsers()[0] || {}).path;
const EXTRA = (process.env.CHROME_ARGS || '--headless=new').split(' ').filter(Boolean);

const AVATAR = '<button aria-label="Account details"><img alt=""><span>PRO</span></button>';
const CASES = [
  ['paket gratis: tautan "50 Google Flow credits"', `${AVATAR}<div role="dialog"><div>studio@gmail.com</div><a href="/credits">50 Google Flow credits</a><button>Sign out</button><button aria-label="Close account panel">x</button></div>`, 50],
  ['angka & label di elemen terpisah', `${AVATAR}<div role="dialog"><a href="/c"><span class="material-symbols-outlined" aria-hidden="true">toll</span><span>Google Flow credits</span><b>1,250</b></a></div>`, 1250],
  ['paket Google AI: "AI credits"', `${AVATAR}<div class="cdk-overlay-pane"><p>Google AI Pro</p><div><span>820</span> <span>AI credits</span></div><button>Sign out</button></div>`, 820],
  ['hanya aria-label', `${AVATAR}<div role="dialog"><a href="/c" aria-label="Google Flow credits: 35"><i>toll</i></a></div>`, 35],
  ['saldo nol', `${AVATAR}<div role="dialog"><a href="/c">0 Google Flow credits</a></div>`, 0]
];

test('Kredit Flow: tombol Account details, saldo dari berbagai bentuk panel, tombol tutup panel', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 60000 }, async (t) => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-cr-'));
  launchBrowser({ exe: CHROME, profileDir: prof, debug: true, url: 'about:blank', extraArgs: EXTRA });
  const port = await waitForDebugPort(prof);
  const [target] = (await getJSON(port, '/json/list')).filter((x) => x.type === 'page');
  const page = await CDPConnection.connect(target.webSocketDebuggerUrl);
  t.after(async () => {
    const v = await getJSON(port, '/json/version');
    const b = await CDPConnection.connect(v.webSocketDebuggerUrl);
    await b.send('Browser.close').catch(() => {});
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ }
  });
  const ev = async (expression) => {
    const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const call = (name, args) => ev(agentExpression(name, args || [], { mediaHosts: [], allowHttp: false }));
  const html = (h) => ev(`document.body.innerHTML = ${JSON.stringify(h)}; true`);

  for (const [name, h, want] of CASES) {
    await html(h);
    const r = await call('creditsBalance');
    assert.ok(r, name + ': terbaca');
    assert.strictEqual(r.credits, want, name);
  }
  // panel belum dibuka: label biaya "20 credits" di setelan & banner "Add AI credits" bukan saldo
  await html('<button aria-label="Settings trigger">Veo 3.1 - Fast · 20 credits</button><a href="/buy">Add AI credits</a><div class="cdk-overlay-pane"><span class="credit-cost-label">Cost</span><a href="#">15 credits</a></div>' + AVATAR);
  assert.strictEqual(await call('creditsBalance'), null, 'biaya / banner bukan saldo');
  const btn = await call('accountDetailsButton');
  assert.ok(btn && /Account details/.test(btn.label), 'tombol Account details');
  // tombol avatar dengan aria "Google Account: …" dipakai bila tak ada yang persis; tombol keluar tidak pernah
  await html('<button aria-label="Sign out">Sign out</button><button aria-label="Google Account: Sugi (s@gmail.com)">S</button>');
  assert.ok(/^Google Account/.test((await call('accountDetailsButton')).label));
  await html('<button>Sign out</button>');
  assert.strictEqual(await call('accountDetailsButton'), null);
  // tutup panel & diagnosa (email disamarkan)
  await html(CASES[0][1].replace('50 Google Flow credits', 'Lihat paket'));
  assert.ok(await call('accountPanelClose'), 'tombol Close account panel');
  const txt = await call('accountPanelText');
  assert.ok(txt.includes('Lihat paket') && !txt.includes('studio@gmail.com') && txt.includes('•••@•••'), txt);
});
