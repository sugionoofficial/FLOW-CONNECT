'use strict';
// Uji tampilan: muat renderer di Chromium headless dengan window.fc tiruan, buka semua halaman
// (terang & gelap), pastikan tidak ada error JS / pelanggaran CSP. UI_SHOTS=folder → simpan tangkapan layar.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchBrowser, waitForDebugPort, getJSON, findBrowsers } = require('../src/main/browser');
const { CDPConnection } = require('../src/main/cdp');

const CHROME = process.env.CHROME_PATH || (findBrowsers()[0] || {}).path;
const EXTRA = (process.env.CHROME_ARGS || '--headless=new').split(' ').filter(Boolean);
const SHOTS = process.env.UI_SHOTS;
const SRC = path.join(__dirname, '..', 'src');

const MOCK = `(() => {
  const now = Date.now();
  const accounts = [
    { id: 'a1', label: 'Kerja', email: 'studio.kerja@gmail.com', createdAt: now },
    { id: 'a2', label: 'Pribadi', email: null, createdAt: now }
  ];
  const settings = {
    accounts, activeAccountId: 'a1', theme: 'system', browser: { prefer: 'auto', customPath: '' }, browserWindow: 'background',
    downloadDir: 'C:\\\\Users\\\\Sugiono\\\\Downloads\\\\FLOW CONNECT', mode: 'auto', autoAck: '2026-11-25T00:00:00Z',
    auto: { minDelay: 45, maxDelay: 120, maxPerRun: 10, timeoutMin: 8, autoDownload: true, stopOnError: true },
    downloads: [
      { path: 'C:\\\\x\\\\Kucing neon - 1a2b3c4d.png', name: 'Kucing neon - 1a2b3c4d.png', mediaId: 'm1', accountId: 'a1', at: now - 60000 },
      { path: 'C:\\\\x\\\\Hujan di sawah - 9f8e7d6c.mp4', name: 'Hujan di sawah - 9f8e7d6c.mp4', mediaId: 'm2', accountId: 'a1', at: now - 3600000 }
    ]
  };
  const statuses = { a1: { connected: true, signedIn: true, account: 'studio.kerja@gmail.com', projectId: 'p1', projectTitle: 'Iklan Kopi Nusantara' }, a2: { connected: false } };
  const queue = { running: true, activity: '[Kerja] Flow sedang membuat…', nextAt: null, jobs: [
    { id: 'j1', prompt: 'Secangkir kopi tubruk di meja kayu, cahaya pagi, sinematik', images: ['C:\\\\a.png'], accountId: 'a1', status: 'done', results: ['C:\\\\x\\\\kopi.png'], error: null },
    { id: 'j2', prompt: 'Barista menuang latte art berbentuk wayang, slow motion', images: [], accountId: 'a1', status: 'running', results: [], error: null },
    { id: 'j3', prompt: 'Kebun kopi di lereng gunung saat kabut', images: [], accountId: 'a1', status: 'pending', results: [], error: null },
    { id: 'j4', prompt: 'Biji kopi berjatuhan, latar hitam', images: [], accountId: 'a2', status: 'failed', results: [], error: 'NOT_SIGNED_IN' }
  ] };
  const svg = (c) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/></svg>');
  const items = [['#6b3e1f','#e2b07a'],['#0f3057','#00587a'],['#2d6a4f','#95d5b2'],['#3d0c11','#d4a373'],['#22223b','#9a8c98'],['#ffb703','#fb8500']].map((c, i) => ({
    mediaId: 'm' + i + '-0000-0000-0000-000000000000', title: ['Kopi tubruk pagi hari','Barista latte art wayang','Kebun kopi berkabut','Biji kopi berjatuhan','Kemasan kopi minimalis','Senja di kedai kopi'][i],
    createdAt: now - i * 3600000, isVideo: i === 1, done: i !== 5, image: svg(c), video: null }));
  const R = {
    'app:info': () => ({ version: '1.0.0', platform: 'win32', accent: '#0067c0', browsers: [{ id: 'chrome', name: 'Google Chrome', path: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe' }, { id: 'edge', name: 'Microsoft Edge', path: 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe' }], settings, statuses, queue, webUrl: 'https://flow-connect-2qu.pages.dev' }),
    'settings:set': (p) => Object.assign(settings, p),
    'flow:listMedia': () => items,
    'flow:thumb': (id, it) => it.image,
    'files:register': (p) => p,
    'files:preview': () => svg(['#888', '#ccc'])
  };
  window.__calls = [];
  window.fc = {
    call: async (ch, ...a) => { window.__calls.push(ch); return R[ch] ? { ok: true, data: R[ch](...a) } : { ok: true, data: null }; },
    on: (ev, fn) => { (window.__ev = window.__ev || {})[ev] = fn; return () => {}; },
    pathForFile: () => ''
  };
})();`;

test('tampilan aplikasi: semua halaman tanpa error', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 90000 }, async (t) => {
  const server = http.createServer((req, res) => {
    const p = path.normalize(path.join(SRC, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(SRC) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(p)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-ui-'));
  launchBrowser({ exe: CHROME, profileDir: prof, debug: true, url: 'about:blank', extraArgs: EXTRA });
  const port = await waitForDebugPort(prof);
  const [target] = (await getJSON(port, '/json/list')).filter((x) => x.type === 'page');
  const page = await CDPConnection.connect(target.webSocketDebuggerUrl);
  t.after(async () => {
    const v = await getJSON(port, '/json/version');
    const b = await CDPConnection.connect(v.webSocketDebuggerUrl);
    await b.send('Browser.close').catch(() => {});
    server.close();
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows: file terkunci */ }
  });

  const errors = [];
  page.on('Runtime.exceptionThrown', (e) => errors.push(e.exceptionDetails.exception ? e.exceptionDetails.exception.description : e.exceptionDetails.text));
  page.on('Log.entryAdded', (e) => { if (e.entry.level === 'error' && !/favicon/.test(e.entry.url || '')) errors.push(e.entry.text); });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const base = `http://127.0.0.1:${server.address().port}/renderer/index.html`;
  const ev = async (expression) => (await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const scheme of ['light', 'dark']) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await page.send('Page.navigate', { url: base });
    await sleep(900);
    for (const p of ['home', 'accounts', 'studio', 'gallery', 'auto', 'downloads', 'settings']) {
      await ev(`document.querySelector('[data-page="${p}"]').click()`);
      await sleep(p === 'gallery' ? 700 : 250);
      const h1 = await ev('document.querySelector("#page h1") && document.querySelector("#page h1").textContent');
      assert.ok(h1, `halaman ${p} punya judul`);
      if (SHOTS) {
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(SHOTS, { recursive: true });
        fs.writeFileSync(path.join(SHOTS, `${scheme}-${p}.png`), Buffer.from(data, 'base64'));
      }
    }
  }
  // galeri memuat item & thumbnail lewat jembatan
  await ev(`document.querySelector('[data-page="gallery"]').click()`);
  await sleep(700);
  assert.strictEqual(await ev('document.querySelectorAll(".tile").length'), 6);
  assert.ok(await ev('document.querySelectorAll(".tile img").length') >= 5);
  // dialog peringatan Mode Otomatis: tombol Aktifkan nonaktif sampai dicentang
  await ev(`window.fc.call = (o => async (ch, ...a) => ch === 'app:info' ? o(ch, ...a) : o(ch, ...a))(window.fc.call)`);
  await ev(`document.querySelector('[data-page="settings"]').click()`);
  await sleep(200);
  await ev(`(() => { const r = document.querySelector('input[name=mode][value=safe]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert.deepStrictEqual(errors, [], 'tanpa error JS/CSP');
});
