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
  const day0 = new Date(new Date(now).setHours(12, 0, 0, 0)).getTime(); // tengah hari ini → pengelompokan tanggal tidak bergantung jam uji
  const accounts = [
    { id: 'a1', label: 'Kerja', email: 'studio.kerja@gmail.com', createdAt: now, signedInAt: now },
    { id: 'a2', label: 'Pribadi', email: null, createdAt: now, headlessFailedAt: now, headlessReason: 'Flow keluar akun' }
  ];
  const settings = {
    accounts, activeAccountId: 'a1', theme: 'dark', browser: { prefer: 'auto', customPath: '' }, browserWindow: 'hidden', autoProject: true,
    studio: { kind: 'video', sub: 'ingredients', model: 'Omni 1.2 Flash', models: { video: 'Omni 1.2 Flash', image: 'Nano Banana 2.1' }, ratio: '16:9', count: 2, duration: 10, apply: true },
    downloadDir: 'C:\\\\Users\\\\Sugiono\\\\Downloads\\\\FLOW CONNECT', mode: 'auto', autoAck: '2026-11-25T00:00:00Z',
    auto: { minDelay: 45, maxDelay: 120, maxPerRun: 10, timeoutMin: 8, autoDownload: true, stopOnError: true },
    downloads: [
      { path: 'C:\\\\x\\\\Kucing neon - 1a2b3c4d.png', name: 'Kucing neon - 1a2b3c4d.png', mediaId: 'm1', accountId: 'a1', at: day0 - 60000 },
      { path: 'C:\\\\x\\\\Hujan di sawah - 9f8e7d6c.mp4', name: 'Hujan di sawah - 9f8e7d6c.mp4', mediaId: 'm2', accountId: 'a1', at: day0 - 3600000 },
      { path: 'C:\\\\x\\\\Kopi tubruk pagi - 5e6f7a8b.png', name: 'Kopi tubruk pagi - 5e6f7a8b.png', mediaId: 'm3', accountId: 'a1', at: day0 - 24 * 3600000 },
      { path: 'C:\\\\x\\\\Kebun kopi berkabut - 0a1b2c3d.png', name: 'Kebun kopi berkabut - 0a1b2c3d.png', mediaId: 'm4', accountId: 'a2', at: day0 - 25 * 3600000 },
      { path: 'C:\\\\x\\\\Dipindahkan - 77777777.png', name: 'Dipindahkan - 77777777.png', mediaId: 'm5', accountId: 'a1', at: day0 - 9 * 86400000 },
      { path: 'C:\\\\x\\\\Narasi iklan kopi - 31415926.mp3', name: 'Narasi iklan kopi - 31415926.mp3', mediaId: null, accountId: 'a1', at: day0 - 2 * 3600000 }
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
    createdAt: day0 - [0, 1, 24, 25, 100, 960][i] * 3600000, isVideo: i === 1, done: i !== 5, image: svg(c), video: null }));
  const gate = location.search === '?gate';
  let license = gate ? { state: 'none', deviceId: '7f3a9c2e-0000' }
    : { state: 'valid', hint: 'FC-7KQ2M…H4ZPA', checkedAt: now - 600000, deviceId: '7f3a9c2e-0000', info: { ok: true, label: 'PC Studio', email: 'sugiono@flowconnect.id', devices: 2, max_devices: 3, expires_at: null } };
  const update = gate ? { state: 'none', current: '1.2.0' } : { state: 'available', current: '1.2.0', version: '1.3.0', notes: 'Perbaikan', percent: 0, portable: false };
  const R = {
    'license:activate': (k) => {
      if (!/^FC(-[A-Z0-9]{5}){5}$/.test(k)) return { __err: 'INVALID_KEY' };
      license = { state: 'valid', hint: k.slice(0, 8) + '…' + k.slice(-5), checkedAt: now, deviceId: '7f3a9c2e-0000', info: { ok: true, label: 'Baru', email: 'sugiono@flowconnect.id', devices: 1, max_devices: 3 } };
      return license;
    },
    'update:download': () => Object.assign(update, { state: 'downloading', percent: 37 }),
    'auto:ack': (v) => Object.assign(settings, { mode: v ? 'auto' : 'safe', autoAck: v ? '2026-11-25T00:00:00Z' : null }),
    'app:info': () => ({ license, update, version: '1.2.0', platform: 'win32', chrome: { customTitlebar: true, mica: false }, flowOptions: {}, accent: '#0067c0', browsers: [{ id: 'chrome', name: 'Google Chrome', path: 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe' }, { id: 'edge', name: 'Microsoft Edge', path: 'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe' }], settings, statuses, queue, webUrl: 'https://flow-connect-2qu.pages.dev' }),
    'settings:set': (p) => Object.assign(settings, p),
    'flow:scan': () => ({ models: ['Veo 3.1 - Fast', 'Veo 3.1 - Quality', 'Veo 4 - Preview'], options: [], current: {} }),
    'flow:newProject': (id) => Object.assign(statuses[id], { projectId: 'p2', projectTitle: 'Project baru' }),
    'flow:run': () => new Promise((res) => setTimeout(() => res({ click: { label: 'Create' }, settings: { applied: { kind: 1, model: 1 }, missing: ['duration'] }, items: items.slice(0, 2), files: [] }), window.__runDelay || 0)),
    'flow:credits': (id) => { const a = accounts.find((x) => x.id === id); a.credits = { value: 50, at: Date.now() }; return a.credits; },
    'bulk:plan': (inp) => {
      window.__bulkIn = inp;
      const video = inp.options.kind === 'video';
      const cost = inp.cost || (video ? (/1[.]1/.test(inp.options.model) ? 15 : 30) : 0);
      const accs = inp.accounts.map((a) => ({ id: a.id, credits: a.credits, capacity: video ? Math.floor((a.credits || 0) / cost) : null, planned: 0 }));
      const cap = video ? accs.reduce((s, a) => s + a.capacity, 0) : 300;
      const target = Math.min(inp.count || (video ? cap : inp.prompts.length * (inp.options.count || 1)), 300, cap);
      let left = target;
      accs.forEach((a) => { a.planned = video ? Math.min(a.capacity, left) : Math.ceil(target / accs.length); left -= a.planned; });
      const fr = video && inp.options.sub === 'frames';
      const each = inp.refMode === 'each' && inp.images.length;
      const refError = each && fr && inp.images.length % 2 ? { code: 'FRAMES_REQUIRED', detail: inp.images.length + ' foto — mode Frame per prompt butuh pasangan foto awal + akhir' } : null;
      const groups = each && !refError ? inp.images.length / (fr ? 2 : 1) : 0;
      return { kind: inp.options.kind, perJob: video ? 1 : inp.options.count, cost, target, jobs: target, capacity: cap, credits: target * cost, accounts: accs, warnings: accs.some((a) => a.credits === null) ? ['UNKNOWN_CREDITS'] : [], refMode: inp.refMode, groups, units: Math.max(inp.prompts.length, groups), refError };
    },
    'bulk:start': (inp) => {
      window.__bulkStart = inp;
      const t = Date.now() - 65000;
      return { running: true, activity: '[Kerja · #2/6] Flow sedang membuat…', batch: { id: 'b1', startedAt: t, finishedAt: null, kind: 'video', model: 'Omni 1.1 Flash', duration: 10, cost: 15, perJob: 1, target: 6, options: { ratio: '16:9' }, prompts: ['Drone sawah', 'Kota malam'], parallel: false,
        accounts: [{ id: 'a1', label: 'Kerja', credits: 35, startCredits: 50, planned: 3, done: 1, failed: 0, used: 15, status: 'running' }, { id: 'a2', label: 'Pribadi', credits: 50, startCredits: 50, planned: 3, done: 0, failed: 0, used: 0, status: 'waiting' }],
        jobs: [1, 2, 3, 4, 5, 6].map((n) => ({ id: 'j' + n, n, p: (n - 1) % 2, count: 1, status: n === 1 ? 'done' : n === 2 ? 'running' : 'pending', accountId: n <= 2 ? 'a1' : null, startedAt: t + (n === 2 ? 50000 : 0), finishedAt: n === 1 ? t + 48000 : null, results: n === 1 ? ['C:/x/001 Drone sawah.mp4'] : [], error: null })) } };
    },
    'bulk:stop': () => null,
    'accounts:login': (id) => new Promise((res) => {
      const ev = window.__ev.login;
      ev({ id, state: 'card' });
      setTimeout(() => ev({ id, state: 'connecting' }), 150);
      setTimeout(() => ev({ id, state: 'project' }), 300);
      setTimeout(() => { Object.assign(statuses[id], { connected: true, signedIn: true, projectId: 'p3', projectTitle: 'Untitled' }); res({ ok: true, status: statuses[id] }); }, 450);
    }),
    'accounts:resetHeadless': (id) => { const a = accounts.find((x) => x.id === id); delete a.headlessFailedAt; return settings; },
    'flow:listMedia': () => items,
    'flow:thumb': (id, it) => it.image,
    'files:thumb': (p) => (/Dipindahkan/.test(p) ? { missing: true } : { url: svg(/[.]mp4$/.test(p) ? ['#1d3557', '#a8dadc'] : ['#7f5539', '#ddb892']) }),
    'assistant:catalog': (force) => { window.__catForce = !!force; return [
      { id: '11111111-1111-1111-1111-111111111111', provider: 'opencode', provider_name: 'OpenCode Console', model: 'gpt-5-nano', label: 'GPT 5 Nano', category: 'chat', is_default: true, ready: true },
      { id: '22222222-2222-2222-2222-222222222222', provider: 'opencode', provider_name: 'OpenCode Console', model: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', category: 'chat', is_default: false, ready: true }
    ].concat(window.__catExtra || []); },
    'assistant:chat': (req) => new Promise((res) => setTimeout(() => res({ reply: 'Siap! Ini prompt untuk **' + (req.mode === 'image' ? 'gambar' : 'video') + '** kamu:\\n\\n\\u0060\\u0060\\u0060prompt\\nAerial drone shot slowly gliding over Bali rice terraces at sunrise, soft mist, cinematic\\n\\u0060\\u0060\\u0060\\n\\nMau saya buat versi 9:16?', model: { id: req.model, label: 'GPT 5 Nano' } }), 300)),
    'files:pickImages': (max) => { window.__pickMax = max; return ['/foto/Kucing Oren.png', '/foto/latar.jpg']; },
    'files:register': (p, max) => { window.__regMax = max; return p; },
    'files:preview': () => svg(['#888', '#ccc']),
    'skills:catalog': () => [{ id: 'admin-1', name: 'Promo Ramadan', description: 'Skill dari admin', category: 'image', icon: 'sparkles', template: 'Poster promo Ramadan untuk {Produk}, nuansa hijau emas', settings: { ratio: '9:16' }, refs: { min: 0, max: 0 }, source: 'admin' }],
    'skills:mine': () => window.__mine || [],
    'skills:save': (sk) => { window.__mine = [Object.assign({}, sk, { id: sk.id || 'my-1' })].concat((window.__mine || []).filter((x) => x.id !== sk.id)); return window.__mine; },
    'queue:add': (o) => { window.__queued = o; return queue; },
    'flow:openTool': (id, url, o) => { (window.__tools = window.__tools || []).push([url, o]); window.__tool = url; return { how: o && o.browser ? 'browser' : 'app' }; },
    'tools:pick': () => ['/foto/produk.png'],
    'tools:read': async (p) => {
      const c = new OffscreenCanvas(400, 300); const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, 400, 300); x.fillStyle = '#d00000'; x.fillRect(150, 100, 100, 100);
      return { name: p.split('/').pop(), mime: 'image/png', data: new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()) };
    },
    'tools:save': async (o) => { window.__saved = (window.__saved || []).concat([o]); const b = await createImageBitmap(new Blob([o.data])); window.__savedSize = b.width + 'x' + b.height; return '/unduhan/Alat/' + o.name + '.' + o.format; },
    'tools:renamePlan': () => settings.downloads.map((d, i) => ({ from: d.path, to: '/x/' + i + ' ' + d.name, name: i + ' ' + d.name })),
    'tools:rename': () => ({ renamed: 6, skipped: 0 })
  };
  window.__calls = [];
  window.__settings = settings;
  window.fc = {
    call: async (ch, ...a) => { window.__calls.push(ch); const d = R[ch] ? R[ch](...a) : null; return d && d.__err ? { ok: false, error: d.__err } : { ok: true, data: d }; },
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
    for (const p of ['home', 'accounts', 'studio', 'assistant', 'gallery', 'auto', 'downloads', 'settings']) {
      await ev(`document.querySelector('[data-page="${p}"]').click()`);
      await sleep(p === 'gallery' ? 700 : 250);
      const h1 = await ev('document.querySelector("#page h1") && document.querySelector("#page h1").textContent');
      assert.ok(h1, `halaman ${p} punya judul ` + errors.join(" | "));
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
  // galeri per tanggal: Hari ini, Kemarin, lalu tanggal lengkap
  const heads = await ev('[...document.querySelectorAll("#page .day-head h3")].map((h) => h.textContent)');
  assert.strictEqual(heads[0], 'Hari ini');
  assert.strictEqual(heads[1], 'Kemarin');
  assert.ok(heads.length >= 3 && heads.slice(2).every((h) => /\d{4}$/.test(h)), 'tanggal lengkap: ' + heads.join(' | '));
  assert.strictEqual(await ev('document.querySelectorAll("#page .day")[0].querySelectorAll(".tile").length'), 2);
  await ev(`document.querySelector('[data-act=gallerySelectDay]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelectorAll(".tile.sel").length'), 2, 'pilih semua hasil hari ini');
  await ev(`document.querySelector('[data-act=gallerySelectDay]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelectorAll(".tile.sel").length'), 0);
  // kategori galeri: Semua · Gambar · Video · Audio
  assert.deepStrictEqual(await ev('[...document.querySelectorAll("#page .cat-tab")].map((b) => b.textContent)'), ['Semua6', 'Gambar5', 'Video1', 'Audio0']);
  await ev(`document.querySelector('[data-act=galleryCat][data-cat=video]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelectorAll(".tile").length'), 1, 'hanya video');
  assert.ok(await ev('document.querySelector(".tile .badge").textContent === "Video"'));
  await ev(`document.querySelector('[data-act=gallerySelectAll]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelectorAll(".tile.sel").length'), 1, 'pilih semua hanya kategori aktif');
  assert.ok(await ev('document.querySelector("[data-act=galleryDownloadSel]").textContent.includes("(1)")'));
  await ev(`document.querySelector('[data-act=gallerySelectAll]').click()`);
  await ev(`document.querySelector('[data-act=galleryCat][data-cat=image]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelectorAll(".tile").length'), 5, 'hanya gambar');
  await ev(`document.querySelector('[data-act=galleryCat][data-cat=audio]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelectorAll(".tile").length'), 0);
  assert.ok(await ev('document.querySelector("#page .card.empty").textContent.includes("Belum ada audio")'));
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'galeri-audio.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('[data-act=galleryCat][data-cat=video]').click()`);
  await sleep(300);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'galeri-video.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('[data-act=galleryCat][data-cat=all]').click()`);
  await sleep(100);
  // unduhan per tanggal dengan thumbnail (gambar & video), file hilang ditandai
  await ev(`document.querySelector('[data-page="downloads"]').click()`);
  await sleep(500);
  assert.strictEqual(await ev('document.querySelectorAll(".dl-tile").length'), 6);
  assert.deepStrictEqual(await ev('[...document.querySelectorAll("#page .cat-tab")].map((b) => b.textContent)'), ['Semua6', 'Gambar4', 'Video1', 'Audio1']);
  assert.deepStrictEqual((await ev('[...document.querySelectorAll("#page .day-head h3")].map((h) => h.textContent)')).slice(0, 2), ['Hari ini', 'Kemarin']);
  assert.strictEqual(await ev('document.querySelectorAll("#page .day").length'), 3);
  assert.strictEqual(await ev('document.querySelectorAll(".dl-tile img.pic").length'), 5, 'thumbnail untuk 5 file yang ada');
  assert.ok(await ev('document.querySelector(".dl-tile.missing .badge.warn").textContent.includes("tidak ditemukan")'));
  assert.ok(await ev('!!document.querySelector(".dl-tile .badge") && [...document.querySelectorAll(".dl-tile .badge")].some((b) => b.textContent.includes("Video"))'));
  await ev(`document.querySelector('.dl-tile button.media').click()`);
  await sleep(100);
  assert.ok(await ev('window.__calls.includes("files:open")'), 'klik thumbnail membuka file');
  await ev(`document.querySelector('[data-act=dlCat][data-cat=audio]').click()`);
  await sleep(200);
  assert.strictEqual(await ev('document.querySelectorAll(".dl-tile").length'), 1, 'unduhan: hanya audio');
  assert.ok(await ev('document.querySelector(".dl-tile .badge").textContent.includes("Audio")'));
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'unduhan-audio.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('[data-act=dlCat][data-cat=all]').click()`);
  await sleep(100);
  // Asisten Prompt: chat → blok prompt → "Pakai di Studio"
  await ev(`document.querySelector('[data-page="assistant"]').click()`);
  await sleep(300);
  assert.deepStrictEqual(await ev('[...document.querySelectorAll("[data-change=chatModel] option")].map((o) => o.textContent)'), ['GPT 5 Nano', 'DeepSeek V4.1 Flash']);
  assert.strictEqual(await ev('document.querySelectorAll(".starters .chip").length'), 3);
  // admin menambah model OpenRouter → tombol muat ulang langsung menampilkannya (beserta nama provider)
  await ev(`window.__catExtra = [{ id: '33333333-3333-3333-3333-333333333333', provider: 'openrouter', provider_name: 'OpenRouter', model: 'qwen/qwen3-coder:free', label: 'Qwen3 Coder (free)', category: 'chat', is_default: false, ready: true }]`);
  await ev(`document.querySelector('.page-head [data-act=chatCatalog]').click()`);
  await sleep(300);
  assert.strictEqual(await ev('window.__catForce'), true, 'muat ulang memaksa ambil katalog baru');
  assert.deepStrictEqual(await ev('[...document.querySelectorAll("[data-change=chatModel] option")].map((o) => o.textContent)'),
    ['GPT 5 Nano · OpenCode Console', 'DeepSeek V4.1 Flash · OpenCode Console', 'Qwen3 Coder (free) · OpenRouter']);
  await ev(`window.__catExtra = []`);
  await ev(`document.querySelector('.page-head [data-act=chatCatalog]').click()`);
  await sleep(300);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'asisten-kosong.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`(() => { const t = document.querySelector('#chat-input'); t.focus(); t.value = 'Prompt video sawah Bali saat sunrise'; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
  await sleep(100);
  assert.ok(await ev('!!document.querySelector(".typing")'), 'indikator mengetik');
  await sleep(500);
  assert.strictEqual(await ev('document.querySelectorAll(".msg.me").length'), 1);
  assert.strictEqual(await ev('document.querySelectorAll(".msg.ai .pblock").length'), 1, 'blok prompt tampil');
  assert.ok(await ev('document.querySelector(".msg.ai .txt b").textContent === "video"'), 'teks tebal');
  assert.strictEqual(await ev('document.querySelector("#chat-input").value'), '');
  assert.ok(await ev('JSON.parse(localStorage.getItem("fc.chat.v1")).messages.length === 2'), 'percakapan tersimpan');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'asisten-chat.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('[data-act=chatUse]').click()`);
  await sleep(300);
  assert.strictEqual(await ev('document.querySelector("#page h1").textContent'), 'Studio');
  assert.strictEqual(await ev('document.querySelector("#prompt").value'), 'Aerial drone shot slowly gliding over Bali rice terraces at sunrise, soft mist, cinematic');
  await ev(`(() => { const t = document.querySelector('#prompt'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev(`document.querySelector('[data-page="assistant"]').click()`);
  await sleep(200);
  await ev(`document.querySelector('[data-act=chatNew]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelectorAll(".msg").length'), 0, 'percakapan baru');
  if (SHOTS) {
    for (const [pg, name] of [['downloads', 'unduhan-tanggal'], ['gallery', 'galeri-tanggal']]) {
      await ev(`document.querySelector('[data-page="${pg}"]').click()`);
      await sleep(600);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
    }
  }
  // Studio: Video/Gambar, mode, model, rasio → tersimpan ke settings.studio
  await ev(`document.querySelector('[data-page="studio"]').click()`);
  await sleep(300);
  assert.strictEqual(await ev('document.querySelectorAll(".seg-btn").length'), 2);
  const modelOpts = '[...document.querySelectorAll("[data-change=studioModel] option")].map((o) => o.value)';
  assert.deepStrictEqual(await ev('[...document.querySelectorAll(".modes .chip")].map((c) => c.textContent)'), ['Frame', 'Bahan'], 'video: hanya Frame & Bahan');
  assert.deepStrictEqual(await ev(modelOpts), ['Omni 1.2 Flash', 'Omni 1.1 Flash', 'Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality'], 'model video Flow');
  assert.strictEqual(await ev('document.querySelector("#dur-chip").textContent'), '10 dtk', 'Omni: hanya 10 detik');
  await ev(`(() => { const s = document.querySelector('[data-change=studioModel]'); s.value = 'Omni 1.1 Flash'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelector("#dur-chip").textContent'), '10 dtk');
  await ev(`(() => { const s = document.querySelector('[data-change=studioModel]'); s.value = 'Veo 3.1 - Quality'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelector("#dur-chip").textContent'), '8 dtk', 'Veo: hanya 8 detik');
  assert.strictEqual(await ev('__settings.studio.duration'), 8);
  // mode Frame: wajib foto awal & akhir → tombol Generate nonaktif sampai 2 foto dipilih
  await ev(`document.querySelector('[data-act=studioOpt][data-k=sub][data-v=frames]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('__settings.studio.sub'), 'frames');
  assert.deepStrictEqual(await ev('[...document.querySelectorAll(".thumb.add.slot")].map((b) => b.textContent.trim())'), ['Frame awal', 'Frame akhir']);
  assert.ok(await ev('document.querySelector(".refs-head").textContent.includes("Wajib")'));
  assert.ok(await ev('document.querySelector("[data-act=sendGenerate]").disabled'), 'Generate menunggu 2 foto');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'dark-studio-frames-empty.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  // gambar: hanya 3 model Nano Banana, bawaan Nano Banana 2.1
  await ev(`document.querySelector('[data-act=studioOpt][data-k=kind][data-v=image]').click()`);
  await sleep(150);
  assert.strictEqual(await ev('JSON.stringify([__settings.studio.kind, __settings.studio.model, __settings.studio.duration])'), JSON.stringify(['image', 'Nano Banana 2.1', 0]), 'gambar: bawaan Nano Banana 2.1');
  assert.strictEqual(await ev('document.querySelectorAll(".modes .chip").length'), 0);
  assert.deepStrictEqual(await ev(modelOpts), ['Nano Banana 2.1', 'Nano Banana Pro', 'Nano Banana 2 Lite'], 'model gambar Flow');
  await ev(`document.querySelector('[data-act=studioOpt][data-k=ratio][data-v="1:1"]').click()`);
  await ev(`document.querySelector('[data-act=studioOpt][data-k=count][data-v="4"]').click()`);
  await sleep(150);
  assert.strictEqual(await ev('__settings.studio.ratio + "/" + __settings.studio.count'), '1:1/4');
  assert.ok(await ev('!!document.querySelector(".stage.r-1-1")'));
  // gambar referensi: tag @ di setiap thumbnail + autocomplete @ di prompt
  await ev(`document.querySelector('[data-act=pickImages]').click()`);
  await sleep(300);
  assert.deepStrictEqual(await ev('[...document.querySelectorAll(".reftag")].map((b) => b.textContent)'), ['@kucing-oren', '@latar']);
  await ev(`(() => { const t = document.querySelector('#prompt'); t.focus(); t.value = 'Foto @ku'; t.setSelectionRange(8, 8); t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelector("#mention-pop").hidden'), false, 'popup @ tampil');
  assert.strictEqual(await ev('document.querySelectorAll("#mention-pop .mp-item").length'), 1);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'dark-studio-mention.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('#prompt').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelector("#prompt").value'), 'Foto @kucing-oren ');
  assert.strictEqual(await ev('document.querySelector("#mention-pop").hidden'), true);
  await ev(`document.querySelectorAll('.reftag')[1].click()`);
  await sleep(100);
  assert.strictEqual(await ev('document.querySelector("#prompt").value'), 'Foto @kucing-oren @latar ');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'dark-studio-image.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('[data-act=studioOpt][data-k=kind][data-v=video]').click()`);
  await sleep(100);
  assert.strictEqual(await ev('__settings.studio.model'), 'Veo 3.1 - Quality', 'model video terakhir diingat');
  assert.deepStrictEqual(await ev('[...document.querySelectorAll(".thumb .tag")].map((t) => t.textContent)'), ['Awal', 'Akhir'], 'foto ke-1 = awal, ke-2 = akhir');
  assert.ok(await ev('!document.querySelector("[data-act=sendGenerate]").disabled'), 'Generate aktif dengan 2 frame');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'dark-studio-frames.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  if (SHOTS) { await ev(`document.querySelector('.opts').scrollIntoView()`); await sleep(100); fs.writeFileSync(path.join(SHOTS, 'dark-studio-duration.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); }
  // baca model dari Flow
  await ev(`document.querySelector('[data-act=studioScan]').click()`);
  await sleep(200);
  assert.ok(await ev('[...document.querySelectorAll("[data-change=studioModel] option")].some((o) => o.value === "Veo 4 - Preview")'), 'model hasil scan tampil');
  // generate (Mode Otomatis) memakai flow:run dengan options
  await ev(`(() => { const t = document.querySelector('#prompt'); t.value = 'Drone di atas sawah'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev('window.__runDelay = 1600');
  await ev(`document.querySelector('[data-act=sendGenerate]').click()`);
  await sleep(300);
  assert.ok(await ev('!!document.querySelector(".stage-clock .runtime")'), 'timer runtime saat Flow membuat');
  assert.ok(await ev('!!document.querySelector(".runtime-pill .runtime")'), 'pil runtime di kepala Studio');
  const t0 = await ev('document.querySelector(".stage-clock .runtime").textContent');
  await sleep(1100);
  assert.notStrictEqual(await ev('document.querySelector(".stage-clock .runtime") && document.querySelector(".stage-clock .runtime").textContent'), t0, 'timer berdetak');
  await sleep(500);
  await ev('window.__runDelay = 0');
  assert.ok(await ev('window.__calls.includes("flow:run")'), 'flow:run dipanggil');
  assert.ok(await ev('/hasil siap dalam 00:0[12]/.test(document.querySelector(".logcard").textContent)'), 'durasi Generate dicatat');
  assert.ok(await ev('!document.querySelector(".runtime-pill")'), 'pil runtime hilang setelah selesai');
  assert.ok(await ev('document.querySelector(".logcard").textContent.includes("durasi")'), 'setelan yang tidak ditemukan dilaporkan');
  // project baru
  await ev(`document.querySelector('[data-act=newProject]').click()`);
  await sleep(200);
  assert.ok(await ev('document.querySelector(".pill").textContent.includes("Project baru")'));
  // kartu login: langkah berjalan → selesai → pindah ke Studio
  await ev(`document.querySelector('[data-page="accounts"]').click()`);
  await sleep(200);
  await ev(`document.querySelector('[data-act=login][data-id=a2]').click()`);
  await sleep(200);
  assert.ok(await ev('document.querySelector("#dialog").open && !!document.querySelector(".ls-steps li.now")'), 'proses login tampil');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'dark-login.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await sleep(1500);
  assert.ok(await ev('!document.querySelector("#dialog").open'), 'dialog login tertutup');
  assert.strictEqual(await ev('document.querySelector("#page h1").textContent'), 'Studio');
  // pengaturan: reset headless per akun
  await ev(`document.querySelector('[data-page="settings"]').click()`);
  await sleep(200);
  await ev(`document.querySelector('[data-act=resetHeadless]').click()`);
  await sleep(200);
  assert.ok(await ev('!document.querySelector("[data-act=resetHeadless]")'));

  // dialog peringatan Mode Otomatis: tombol Aktifkan nonaktif sampai dicentang
  await ev(`window.fc.call = (o => async (ch, ...a) => ch === 'app:info' ? o(ch, ...a) : o(ch, ...a))(window.fc.call)`);
  await ev(`document.querySelector('[data-page="settings"]').click()`);
  await sleep(200);
  await ev(`(() => { const r = document.querySelector('input[name=mode][value=safe]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(200);

  // spanduk pembaruan: tampil, klik "Update sekarang" → progres unduhan
  await ev(`document.querySelector('[data-page="home"]').click()`);
  await sleep(200);
  assert.ok(await ev('!!document.querySelector(".update-bar [data-act=updateDownload]")'), 'spanduk pembaruan tampil');
  assert.ok(await ev('document.querySelector("#statusbar").textContent.includes("v1.2.0")'));
  await ev(`document.querySelector('.update-bar [data-act=updateDownload]').click()`);
  await sleep(200);
  assert.strictEqual(await ev('document.querySelector(".update-bar progress") && document.querySelector(".update-bar progress").value'), 37);
  // baris lisensi di Pengaturan
  await ev(`document.querySelector('[data-page="settings"]').click()`);
  await sleep(200);
  assert.ok(await ev('document.querySelector("#page").textContent.includes("sugiono@flowconnect.id")'), 'info lisensi tampil');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'dark-settings-license.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

  // layar aktivasi: tanpa lisensi tidak ada navigasi; kunci salah → galat; kunci benar → masuk
  for (const scheme of ['light', 'dark']) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await page.send('Page.navigate', { url: base + '?gate' });
    await sleep(900);
    assert.ok(await ev('!!document.querySelector("#gate")'), 'layar lisensi tampil');
    assert.strictEqual(await ev('document.querySelectorAll("[data-page]").length'), 0, 'navigasi tersembunyi');
    if (SHOTS) fs.writeFileSync(path.join(SHOTS, `${scheme}-gate.png`), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  }
  const typeKey = (k) => ev(`(() => { const i = document.querySelector('#license-key'); i.value = ${JSON.stringify(k)}; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-act=licenseActivate]').click(); })()`);
  await typeKey('salah');
  await sleep(300);
  assert.ok(await ev('document.querySelector(".toast.err") && document.querySelector(".toast.err").textContent.includes("tidak dikenal")'), 'galat kunci salah');
  assert.ok(await ev('!!document.querySelector("#gate")'));
  await typeKey('FC-7KQ2M-PX9RT-WB3NV-CJ8LD-H4ZPA');
  await sleep(400);
  assert.ok(await ev('!document.querySelector("#gate") && document.querySelectorAll("[data-page]").length >= 7'), 'masuk setelah aktivasi');
  assert.ok(await ev('!!document.querySelector("#page .hero")'), 'beranda tampil');

  // Studio → Alat & Skill
  await ev(`document.querySelector('[data-page="studio"]').click()`);
  await sleep(250);
  assert.deepStrictEqual(await ev('[...document.querySelectorAll(".subtab")].map((b) => b.textContent)'), ['Buat', 'Alat', 'Skill', 'Bulk']);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', altKey: true, bubbles: true }))`);
  await sleep(250);
  assert.strictEqual(await ev('document.querySelector(".subtab.on").textContent'), 'Alat', 'Alt+2 → Alat');
  assert.strictEqual(await ev('document.querySelectorAll(".tool-card").length'), 19, 'Bulk + 6 alat lokal + 12 alat Flow');
  assert.ok(await ev('!!document.querySelector(".tool-card.bulk-card[data-tab=bulk]")'), 'kartu Bulk Generate di Alat');
  await ev(`document.querySelector('[data-act=flowTool]').click()`);
  await sleep(200);
  assert.ok(await ev('/flow[.]google[.]com[/]shared[/]tool[/]/.test(window.__tool)'), 'alat Flow dibuka di Flow');
  assert.deepStrictEqual(await ev('window.__tools[0][1]'), { name: 'Teks Animasi' }, 'bawaan: jendela aplikasi (browser tetap tersembunyi)');
  assert.ok(await ev('[...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("dibuka di jendela aplikasi"))'));
  assert.ok(await ev('[...document.querySelectorAll(".sec-head")].some((h) => h.textContent.includes("browser Google Flow tetap tersembunyi"))'));
  // jendela alat meminta masuk Google → tawarkan browser (cara lama) atas persetujuan pengguna
  await ev(`void window.__ev.tool({ state: 'signin', id: 'a1', url: window.__tool, name: 'Teks Animasi' })`);
  await sleep(200);
  assert.ok(await ev('document.querySelector("#dialog").open && document.querySelector("#dialog").textContent.includes("Sesi Google tidak terbawa")'));
  await ev(`document.querySelector('#dialog [data-primary]').click()`);
  await sleep(200);
  assert.deepStrictEqual(await ev('window.__tools[1][1]'), { browser: true });
  await ev(`void window.__ev.tool({ state: 'saved', name: 'hasil.png', path: 'C:/x/Alat/hasil.png' })`);
  await sleep(100);
  assert.ok(await ev('[...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("hasil.png"))'), 'hasil ekspor alat diberitahukan');
  await ev(`document.querySelector('[data-act=toolOpen][data-id=crop]').click()`);
  await sleep(150);
  await ev(`document.querySelector('[data-act=toolPick]').click()`);
  await sleep(500);
  assert.ok(await ev('!!document.querySelector(".tool-src img.tool-media")'), 'pratinjau gambar sumber');
  await ev(`document.querySelector('[data-act=toolOpt][data-k=ratio][data-v="1:1"]').click()`);
  await ev(`document.querySelector('[data-act=toolRun]').click()`);
  await sleep(700);
  assert.strictEqual(await ev('window.__savedSize'), '300x300', 'potong 1:1');
  assert.strictEqual(await ev('document.querySelectorAll(".tres").length'), 1);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'studio-alat.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('[data-act=toolOpen][data-id=grid]').click()`);
  await sleep(150);
  await ev(`document.querySelector('[data-act=toolPick]').click()`);
  await sleep(500);
  await ev(`document.querySelector('[data-act=toolRun]').click()`);
  await sleep(900);
  assert.strictEqual(await ev('document.querySelectorAll(".tres").length'), 4, 'grid 2×2 → 4 bagian');
  assert.strictEqual(await ev('window.__savedSize'), '200x150');
  await ev(`document.querySelector('[data-act=toolOpen][data-id=bg]').click()`);
  await sleep(150);
  await ev(`document.querySelector('[data-act=toolPick]').click()`);
  await sleep(500);
  await ev(`document.querySelector('[data-act=toolRun]').click()`);
  await sleep(700);
  assert.ok(await ev('!!document.querySelector(".tres-img.checker")'), 'hasil transparan');
  assert.strictEqual(await ev('window.__saved[window.__saved.length - 1].format'), 'png');
  await ev(`document.querySelector('[data-act=toolOpen][data-id=rename]').click()`);
  await sleep(150);
  await ev(`document.querySelector('[data-act=toolRenamePlan]').click()`);
  await sleep(300);
  assert.strictEqual(await ev('document.querySelectorAll(".rename-plan li").length'), 6, 'pratinjau ganti nama');
  // hasil alat → Studio
  await ev(`document.querySelector('[data-act=toolOpen][data-id=crop]').click()`);
  await sleep(150);
  await ev(`document.querySelector('[data-act=toolPick]').click()`);
  await sleep(500);
  await ev(`document.querySelector('[data-act=toolRun]').click()`);
  await sleep(700);
  await ev(`document.querySelector('.tres [data-act=toolUse]').click()`);
  await sleep(400);
  assert.strictEqual(await ev('document.querySelector(".subtab.on").textContent'), 'Buat');
  assert.ok(await ev('[...document.querySelectorAll(".ref-row .thumb")].some((t) => (t.title || "").includes("Alat"))'), 'hasil alat jadi gambar referensi');
  // Skill
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '3', altKey: true, bubbles: true }))`);
  await sleep(400);
  assert.strictEqual(await ev('document.querySelectorAll(".sk-item").length'), 25, '24 bawaan + 1 dari admin');
  assert.ok(await ev('[...document.querySelectorAll(".sk-item")].some((b) => b.textContent.includes("Promo Ramadan"))'), 'skill admin tampil');
  await ev(`(() => { const t = document.querySelector('[data-input=skField]'); t.value = 'botol kopi susu'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert.ok(await ev('document.querySelector("#sk-prompt").value.startsWith("Professional commercial product photograph of botol kopi susu")'), 'prompt tersusun dari isian');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'studio-skill.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('[data-act=skQueue]').click()`);
  await sleep(300);
  assert.ok(await ev('window.__queued && window.__queued.options.kind === "image" && window.__queued.options.ratio === "1:1" && window.__queued.prompts[0].includes("botol kopi susu")'), 'skill → antrean dengan setelan skill');
  await ev(`document.querySelector('[data-act=skSel][data-id=b-fix]').click()`);
  await sleep(150);
  await ev(`(() => { const t = document.querySelector('[data-input=skField]'); t.value = 'kucing lucu main bola'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev(`document.querySelector('[data-act=skRun]').click()`);
  await sleep(600);
  assert.strictEqual(await ev('document.querySelectorAll(".sk-res-item").length'), 1, 'hasil AI: 1 prompt');
  await ev(`document.querySelector('[data-act=skSel][data-id=b-product]').click()`);
  await sleep(150);
  await ev(`document.querySelector('[data-act=skToStudio]').click()`);
  await sleep(300);
  assert.ok(await ev('document.querySelector("#prompt").value.includes("botol kopi susu")'), 'skill → Studio');
  assert.strictEqual(await ev('window.__settings.studio.kind'), 'image');
  // simpan prompt Studio sebagai skill
  await ev(`document.querySelector('[data-act=skSaveStudio]').click()`);
  await sleep(200);
  await ev(`(() => { const d = document.querySelector('#dialog'); d.querySelector('[name=name]').value = 'Kopi saya'; d.querySelector('[data-primary]').click(); })()`);
  await sleep(400);
  assert.strictEqual(await ev('window.__mine && window.__mine[0].name'), 'Kopi saya');
  await ev(`(() => { const t = document.querySelector('#prompt'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  // Studio → Bulk: video mengikuti kredit tiap akun (2 akun × 50 kredit, Omni 1.1 Flash 15 kredit → 2 × 3 = 6 video)
  await ev(`(() => { const t = document.querySelector('#prompt'); if (t) { t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '4', altKey: true, bubbles: true }))`);
  await sleep(300);
  assert.strictEqual(await ev('document.querySelector(".subtab.on").textContent'), 'Bulk', 'Alt+4 → Bulk');
  await ev(`document.querySelector('.bulk-form [data-act=studioOpt][data-k=kind][data-v=video]').click()`);
  await sleep(200);
  await ev(`(() => { const s = document.querySelector('.bulk-form [data-change=studioModel]'); s.value = 'Omni 1.1 Flash'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(300);
  assert.ok(await ev('document.querySelector("[data-change=bulkAcc][data-id=a1]").checked && !document.querySelector("[data-change=bulkAcc][data-id=a2]").checked'), 'akun yang sudah masuk terpilih otomatis');
  await ev(`document.querySelector('[data-change=bulkAcc][data-id=a2]').click()`);
  await sleep(300);
  assert.ok(await ev('!document.querySelector("[data-act=bulkReadCredits][data-id=a2]").disabled'), 'kredit akun yang belum ditandai masuk tetap bisa dibaca (disambungkan otomatis)');
  await ev(`document.querySelector('[data-act=bulkReadCredits][data-id=a1]').click()`);
  await sleep(400);
  assert.ok(await ev('window.__calls.includes("flow:credits")'), 'kredit dibaca dari Flow');
  assert.ok(await ev('document.querySelector("#bulk-plan").textContent.includes("belum diketahui")'), 'akun tanpa data kredit diperingatkan');
  await ev(`(() => { const i = document.querySelector('[data-input=bulkCredit][data-id=a2]'); i.value = '50'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev(`(() => { const t = document.querySelector('#bulk-prompts'); t.value = 'Drone sawah\\n\\nKota malam\\n'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(400);
  assert.strictEqual(await ev('document.querySelector("#bulk-lines").textContent'), '2 prompt');
  assert.ok(await ev('document.querySelector("#bulk-plan").textContent.includes("2 akun × 3 = 6 video")'), 'rencana: ' + await ev('document.querySelector("#bulk-plan").textContent'));
  assert.ok(await ev('document.querySelector("#bulk-plan").textContent.includes("90 kredit")'));
  assert.ok(await ev('document.querySelector("#bulk-start").textContent.includes("6 video")'));
  assert.deepStrictEqual(await ev('window.__bulkIn.accounts'), [{ id: 'a1', credits: 50 }, { id: 'a2', credits: 50 }]);
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'studio-bulk-form.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('#bulk-start').click()`);
  await sleep(300);
  assert.ok(await ev('document.querySelector("#dialog").open && document.querySelector("#dialog").textContent.includes("6 video")'), 'konfirmasi mulai');
  await ev(`document.querySelector('#dialog [data-primary]').click()`);
  await sleep(400);
  assert.deepStrictEqual(await ev('window.__bulkStart.prompts'), ['Drone sawah', 'Kota malam']);
  assert.ok(await ev('!!document.querySelector(".bulk-run .bulk-clock .runtime.big")'), 'timer runtime batch');
  assert.ok(/^01:0\d$/.test(await ev('document.querySelector(".bulk-clock .runtime").textContent')), 'runtime sejak batch dimulai');
  assert.ok(await ev('document.querySelector(".runtime-pill.on").textContent.includes("Bulk 1/6")'), 'pil Bulk di kepala Studio');
  assert.ok(await ev('document.querySelector(".bulk-progress i").style.width === "17%"'), 'progres tanpa inline style HTML');
  assert.strictEqual(await ev('document.querySelectorAll(".bulk-jobs tbody tr").length'), 6);
  const r0 = await ev('document.querySelector(".bulk-clock .runtime").textContent');
  await sleep(1100);
  assert.notStrictEqual(await ev('document.querySelector(".bulk-clock .runtime").textContent'), r0, 'timer batch berdetak');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'studio-bulk-run.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  // selesai → total durasi tetap + toast
  await ev(`(() => { const t = Date.now() - 3723000; window.__ev.bulk({ running: false, activity: 'Bulk selesai', batch: { id: 'b1', startedAt: t, finishedAt: t + 3723000, stopped: false, kind: 'video', model: 'Omni 1.1 Flash', duration: 10, cost: 15, perJob: 1, target: 2, options: { ratio: '16:9' }, prompts: ['a'], parallel: false, accounts: [{ id: 'a1', label: 'Kerja', credits: 5, startCredits: 50, planned: 3, done: 2, failed: 0, used: 30, status: 'exhausted', note: 'Kredit Flow habis' }], jobs: [1, 2, 3].map((n) => ({ id: 'j' + n, n, p: 0, count: 1, status: n < 3 ? 'done' : 'skipped', accountId: 'a1', startedAt: t, finishedAt: t + 60000, results: [], error: n < 3 ? null : 'NO_CREDITS_LEFT' })) } }); })()`);
  await sleep(300);
  assert.strictEqual(await ev('document.querySelector(".bulk-clock .runtime").textContent'), '1:02:03', 'total durasi');
  assert.ok(await ev('[...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("Bulk selesai · durasi 1 j 02 m"))'), 'toast durasi');
  assert.ok(await ev('!!document.querySelector("[data-act=bulkResume]") && document.querySelector(".bulk-jobs").textContent.includes("kredit semua akun sudah habis")'), 'tugas terlewat bisa dilanjutkan');
  await ev(`document.querySelector('[data-act=bulkView][data-v=form]').click()`);
  await sleep(200);
  assert.ok(await ev('!!document.querySelector(".bulk-form")'), 'batch baru');
  // gambar referensi Bulk: "sama untuk semua" (maks. 10) ↔ "satu per prompt" (maks. 300; Frame = pasangan awal + akhir)
  assert.ok(await ev('!!document.querySelector(".bulk-refs #bulk-drop") && document.querySelector("[data-act=bulkRefMode][data-v=shared]").classList.contains("on")'), 'bagian gambar referensi di Bulk');
  await ev(`document.querySelector('.bulk-form [data-act=studioOpt][data-k=sub][data-v=ingredients]').click()`);
  await sleep(200);
  await ev(`document.querySelector('[data-act=bulkPickImages]').click()`);
  await sleep(500);
  assert.strictEqual(await ev('window.__pickMax'), 10);
  assert.strictEqual(await ev('document.querySelectorAll(".bulk-refs .thumb:not(.add) img").length'), 2, 'thumbnail referensi');
  assert.strictEqual(await ev('document.querySelector("#bulk-ref-count").textContent'), '2/10');
  await ev(`(() => { const t = document.querySelector('#bulk-prompts'); t.value = 'Kucing menari'; t.selectionStart = t.selectionEnd = 0; document.querySelector('.bulk-refs .reftag').click(); })()`);
  await sleep(400);
  assert.match(await ev('document.querySelector("#bulk-prompts").value'), /^@\S+ Kucing menari$/, 'klik @tag → disisipkan ke prompt');
  assert.deepStrictEqual(await ev('[window.__bulkIn.refMode, window.__bulkIn.images.length, window.__bulkIn.tags.length]'), ['shared', 2, 2]);
  await ev(`document.querySelector('[data-act=bulkRefMode][data-v=each]').click()`);
  await sleep(200);
  await ev(`document.querySelector('.bulk-form [data-act=studioOpt][data-k=sub][data-v=frames]').click()`);
  await sleep(200);
  await ev(`document.querySelector('[data-act=bulkPickImages]').click()`);
  await sleep(500);
  assert.deepStrictEqual(await ev('[window.__pickMax, window.__regMax]'), [300, 300], 'satu per prompt: pilih sampai 300');
  assert.deepStrictEqual(await ev('[...document.querySelectorAll(".bulk-refs .thumb .tag")].map((t) => t.textContent)'), ['1 awal', '1 akhir', '2 awal', '2 akhir'], 'Frame per prompt = pasangan');
  assert.deepStrictEqual(await ev('[window.__bulkIn.refMode, window.__bulkIn.images.length, window.__bulkIn.tags]'), ['each', 4, null]);
  await ev(`document.querySelector('[data-act=bulkRemoveImage][data-i="3"]').click()`);
  await sleep(400);
  assert.ok(await ev('document.querySelector(".bulk-refs").textContent.includes("3 foto") && document.querySelector("#bulk-start").disabled'), 'jumlah foto ganjil → galat & tombol mulai nonaktif');
  assert.ok(await ev('document.querySelector("#bulk-plan").textContent.includes("pasangan")'));
  await ev(`document.querySelector('[data-act=bulkRemoveImage][data-i="2"]').click()`);
  await sleep(400);
  assert.ok(await ev('!document.querySelector("#bulk-start").disabled && document.querySelector("#bulk-plan").textContent.includes("1 pasang foto")'), 'pasangan lengkap → siap: ' + await ev('document.querySelector("#bulk-plan").textContent'));
  assert.strictEqual(await ev('JSON.parse(localStorage.getItem("fc.bulk")).refMode'), 'each', 'mode referensi tersimpan');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'studio-bulk-refs.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await ev(`document.querySelector('[data-act=bulkClearImages]').click()`);
  await ev(`document.querySelector('[data-act=bulkRefMode][data-v=shared]').click()`);
  await sleep(200);
  await ev(`document.querySelector('[data-act=studioTab][data-tab=buat]').click()`);
  await sleep(150);
  // pembaruan ditemukan otomatis di latar (tanpa klik "Periksa pembaruan") → bilah + toast + lencana langsung muncul
  assert.ok(await ev('!document.querySelector(".update-bar")'), 'belum ada pembaruan');
  await ev(`window.__ev.update({ state: 'checking', current: '1.2.0', version: null, percent: 0, portable: false })`);
  await ev(`window.__ev.update({ state: 'available', current: '1.2.0', version: '1.3.2', notes: 'Baru', percent: 0, portable: false })`);
  await sleep(200);
  assert.ok(await ev('!!document.querySelector(".update-bar [data-act=updateDownload]")'), 'bilah pembaruan muncul sendiri');
  assert.ok(await ev('[...document.querySelectorAll(".toast")].some((t) => t.textContent.includes("1.3.2"))'), 'toast pembaruan');
  assert.ok(await ev('document.querySelector("[data-page=settings]").textContent.includes("Update")'), 'lencana di Pengaturan');
  assert.ok(await ev('!window.__calls.includes("update:check")'), 'tanpa pemeriksaan manual');
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'dark-update-auto.png'), Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  // pemeriksaan berkala berikutnya (versi sama) tidak memunculkan toast lagi
  const toasts = await ev('document.querySelectorAll(".toast").length');
  await ev(`window.__ev.update({ state: 'available', current: '1.2.0', version: '1.3.2', notes: 'Baru', percent: 0, portable: false })`);
  assert.ok(await ev('document.querySelectorAll(".toast").length') <= toasts, 'tidak dobel');
  // "Nanti" menyembunyikan; klik notifikasi Windows menampilkannya lagi
  await ev(`document.querySelector('.update-bar [data-act=updateHide]').click()`);
  await sleep(150);
  assert.ok(await ev('!document.querySelector(".update-bar")'), 'disembunyikan');
  await ev(`window.__ev['update-show']({ state: 'available', current: '1.2.0', version: '1.3.2', percent: 0, portable: false })`);
  await sleep(150);
  assert.ok(await ev('!!document.querySelector(".update-bar.attn")'), 'tampil lagi setelah notifikasi diklik');
  assert.deepStrictEqual(errors, [], 'tanpa error JS/CSP');
});
