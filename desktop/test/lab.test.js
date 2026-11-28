'use strict';
// Uji Alat Kreatif (src/lab): 12 alat offline dimuat di Chromium headless dengan window.lab tiruan,
// tanpa error JS / pelanggaran CSP; alur utama tiap alat (muat berkas, AI, ekspor) dijalankan.
// UI_SHOTS=folder → simpan tangkapan layar.
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

// Jembatan tiruan: berkas sintetis (gambar, video WebM hasil MediaRecorder, WAV berketukan 120 BPM), AI berjawaban kalengan.
const MOCK = `(() => {
  const ext = (p) => (p.split('.').pop() || '').toLowerCase();
  const kind = (p) => (['mp4', 'webm', 'mov'].includes(ext(p)) ? 'video' : ['wav', 'mp3', 'ogg', 'm4a'].includes(ext(p)) ? 'audio' : 'image');
  const classify = (paths) => ({ images: paths.filter((p) => kind(p) === 'image'), videos: paths.filter((p) => kind(p) === 'video'), audios: paths.filter((p) => kind(p) === 'audio') });
  const PICK = {
    image: ['/foto/produk.png'], media: ['/foto/produk.png'], video: ['/video/klip.webm'], audio: ['/musik/ketukan.wav']
  };
  async function png(name) {
    const big = /panorama/.test(name);
    const W = big ? 1024 : (/grid/.test(name) ? 600 : 640), H = big ? 512 : (/grid/.test(name) ? 600 : 480);
    const c = new OffscreenCanvas(W, H); const x = c.getContext('2d');
    if (/grid/.test(name)) {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
      const cols = ['#e63946', '#2a9d8f', '#e9c46a', '#264653'];
      for (let i = 0; i < 4; i++) { x.fillStyle = cols[i]; x.fillRect((i % 2) * 305, Math.floor(i / 2) * 305, 295, 295); }
    } else {
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1d3557'); g.addColorStop(1, '#e76f51');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = '#ffffff'; x.fillRect(W * 0.35, H * 0.3, W * 0.3, H * 0.4);
      x.fillStyle = '#d00000'; x.beginPath(); x.arc(W / 2, H / 2, H * 0.12, 0, 7); x.fill();
    }
    return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
  }
  let videoBytes = null;
  async function webm() {
    if (videoBytes) return videoBytes;
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const x = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm' });
    const parts = []; rec.ondataavailable = (e) => parts.push(e.data);
    const done = new Promise((r) => { rec.onstop = r; });
    rec.start(100);
    const t0 = performance.now();
    await new Promise((res) => { const tick = () => { const t = (performance.now() - t0) / 1000; x.fillStyle = 'hsl(' + (t * 200) + ',70%,45%)'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.fillRect(40 + t * 120, 90, 60, 60); if (t < 1.6) setTimeout(tick, 30); else res(); }; tick(); });
    rec.stop(); await done;
    videoBytes = new Uint8Array(await new Blob(parts).arrayBuffer());
    return videoBytes;
  }
  function wav() {
    const sr = 22050, secs = 6, n = sr * secs;
    const buf = new ArrayBuffer(44 + n * 2); const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    const beat = 0.5; // 120 BPM, ketukan pertama di 0,25 dtk
    for (let i = 0; i < n; i++) {
      const t = i / sr; const ph = (t - 0.25) % beat; const since = ph < 0 ? 9 : ph;
      const kick = since < 0.12 ? Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-since * 30)) * since) * Math.exp(-since * 25) : 0;
      const pad = Math.sin(2 * Math.PI * 220 * t) * 0.03;
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, kick * 0.9 + pad)) * 32767, true);
    }
    return new Uint8Array(buf);
  }
  window.__saved = []; window.__studio = []; window.__bulk = []; window.__ai = []; window.__calls = [];
  const AI = (p) => {
    if (/"lines"/.test(p)) return '{"lines":[{"text":"Kopi pagi","preset":"pop"},{"text":"Diskon 20%","preset":"rise"}]}';
    if (/"scenes"/.test(p)) return '\\u0060\\u0060\\u0060json\\n{"title":"Kopi Nusantara","logline":"Perjalanan biji kopi","cast":[{"name":"Sari","look":"barista muda, apron hijau"}],"scenes":[{"title":"Kebun","shot":"Wide shot","camera":"drone maju","action":"Kabut di kebun kopi","dialogue":"","sound":"angin","prompt":"Aerial drone shot over misty coffee farm at sunrise"},{"title":"Seduh","shot":"Close-up","camera":"slider","action":"Sari menuang kopi","dialogue":"Selamat pagi!","sound":"tuangan","prompt":"Close-up of a barista pouring coffee, warm light"}]}\\n\\u0060\\u0060\\u0060';
    if (/"cast"/.test(p)) return '{"cast":[{"name":"Raka","look":"pemuda 25 tahun, jaket denim"}]}';
    if (/GLSL/.test(p)) return '\\u0060\\u0060\\u0060glsl\\nvec4 effect(vec2 uv) { vec4 c = tex(uv); return vec4(c.bgr * (0.8 + 0.2 * sin(u_time)), c.a); }\\n\\u0060\\u0060\\u0060';
    if (/"subject"/.test(p) && /koordinat/.test(p)) return '{"x":0.5,"y":0.45,"subject":"lingkaran merah"}';
    if (/"brightness"/.test(p)) return '{"brightness":108,"contrast":112,"saturation":118,"hue":0,"sepia":0,"headline":"Segar Setiap Pagi","textColor":"#ffffff","position":"bottom","reason":"Sedikit lebih cerah"}';
    if (/"bg1"/.test(p)) return '{"bg1":"#0f172a","bg2":"#7c3aed","headline":"Produk Baru","template":"phone"}';
    if (/"appearance"/.test(p)) return '{"name":"Nara","archetype":"Penjelajah","age":"20-an","appearance":{"face":"oval","hair":"hitam sebahu","eyes":"cokelat","body":"ramping","outfit":"jaket merah","accessories":"kalung"},"palette":["#d00000","#1d3557"],"personality":["berani","ramah"],"backstory":"Tumbuh di pesisir.","voice":"hangat","signature_prompt":"Nara, young explorer with shoulder-length black hair, red jacket","turnaround_prompt":"character turnaround sheet of Nara","expression_prompts":["Nara smiling","Nara surprised"]}';
    if (/"colors"/.test(p)) return '{"name":"Senja","colors":["#2b2d42","#8d99ae","#edf2f4","#ef233c"]}';
    if (/"cells"/.test(p)) return '{"prompt":"A 2x2 grid of the same red ball from four camera angles, consistent lighting","cells":["front","side","top","back"]}';
    if (/"render_prompt"/.test(p)) return '{"subject":"rumah kecil","description":"Sketsa rumah dengan pohon","render_prompt":"Photorealistic small house with a tree, following the sketch composition"}';
    if (/"shots"/.test(p)) return '{"location":"Pantai","mood":"tenang","shots":[{"name":"Pembuka","camera":"pan kiri","prompt":"Slow pan across a calm beach at dusk"},{"name":"Detail","camera":"dolly in","prompt":"Dolly in toward waves"}]}';
    if (/equirectangular/.test(p)) return '{"prompt":"Seamless 360 equirectangular panorama of the scene"}';
    return 'ok';
  };
  const R = {
    'lab:info': () => ({ tool: new URLSearchParams(location.search).get('t'), accent: '#0067c0', dark: false, licensed: true, version: '1.8.0' }),
    'lab:pick': (k, multi) => classify(window.__pick && window.__pick.length ? window.__pick.splice(0) : (multi && k === 'image' ? ['/foto/produk.png', '/foto/latar.png'] : PICK[k] || PICK.image)),
    'lab:register': (paths) => classify(paths),
    'lab:read': async (p) => {
      const k = kind(p);
      if (k === 'video') return { name: p.split('/').pop(), mime: 'video/webm', data: await webm() };
      if (k === 'audio') return { name: p.split('/').pop(), mime: 'audio/wav', data: wav() };
      return { name: p.split('/').pop(), mime: 'image/png', data: await png(p) };
    },
    'lab:save': (o) => { const n = typeof o.data === 'string' ? o.data.length : o.data.length; window.__saved.push({ name: o.name, format: o.format, size: n, head: typeof o.data === 'string' ? o.data.slice(0, 200) : Array.from(o.data.slice(0, 12)) }); return '/unduhan/Alat/' + o.name + '.' + o.format; },
    'lab:ai': (o) => { window.__ai.push({ prompt: o.prompt, image: !!o.image }); return new Promise((r) => setTimeout(() => r({ reply: AI(o.prompt), model: { id: 'm', label: 'Gemma Uji' } }), 60)); },
    'lab:toStudio': (o) => { window.__studio.push(o); return { images: (o.images || []).length }; },
    'lab:toBulk': (o) => { window.__bulk.push(o); return { prompts: o.prompts.length }; },
    'lab:show': () => true
  };
  window.lab = {
    call: async (ch, ...a) => { window.__calls.push(ch); try { return { ok: true, data: R[ch] ? await R[ch](...a) : null }; } catch (e) { return { ok: false, error: e.message }; } },
    pathForFile: () => ''
  };
})();`;

test('Alat Kreatif: 12 alat offline tanpa error + alur utama', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 420000 }, async (t) => {
  const server = http.createServer((req, res) => {
    const p = path.normalize(path.join(SRC, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(SRC) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(p)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-lab-'));
  launchBrowser({ exe: CHROME, profileDir: prof, debug: true, url: 'about:blank', extraArgs: [...EXTRA, '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
  page.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') errors.push(e.args.map((a) => a.value || a.description).join(' ')); });
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('Page.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 860, deviceScaleFactor: 1, mobile: false });
  const base = `http://127.0.0.1:${server.address().port}/lab/lab.html`;
  const ev = async (expression) => {
    const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    return r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (expr, ms = 15000, what = expr) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(100); }
    throw new Error('menunggu: ' + what + ' | ' + errors.join(' | '));
  };
  const click = (sel, text) => ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => ${text ? `b.textContent.includes(${JSON.stringify(text)})` : 'true'}); if (!el) throw new Error('tidak ada ' + ${JSON.stringify(sel + ' ' + (text || ''))}); el.click(); return true; })()`);
  const shot = async (name) => { if (!SHOTS) return; const { data } = await page.send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, `lab-${name}.png`), Buffer.from(data, 'base64')); };
  const open = async (id, scheme = 'light') => {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await page.send('Page.navigate', { url: `${base}?t=${id}` });
    await waitFor(`document.body.dataset.ready === ${JSON.stringify(id)}`, 15000, 'alat ' + id + ' siap');
  };
  const saved = () => ev('window.__saved');
  const noErrors = (what) => assert.deepStrictEqual(errors.splice(0), [], 'tanpa error: ' + what);

  const IDS = ['textanim', 'resize', 'editor', 'storyboard', 'shader', 'mockup', 'beat', 'converge', 'character', 'pixel', 'gridarch', 'scout'];
  const only = process.env.LAB_ONLY ? process.env.LAB_ONLY.split(',') : null;
  for (const id of IDS.filter((x) => !only || only.includes(x))) {
    for (const scheme of ['dark', 'light']) {
      await open(id, scheme);
      await sleep(400);
      assert.ok(await ev('!!document.querySelector(".lab-head .lab-title b").textContent'), 'judul ' + id);
      assert.ok(await ev('document.querySelectorAll(".side .sec").length >= 1'), 'panel pengaturan ' + id);
      await shot(`${id}-${scheme}`);
      noErrors(`${id} (${scheme})`);
    }
  }
  // alur per alat diuji di berkas yang sama (lihat di bawah)
  t.diagnostic('alat dimuat: ' + IDS.length);
  if (process.env.LAB_NOFLOW) return;
  const flows = require('./lab.flows');
  for (const [name, fn] of Object.entries(flows)) {
    if (only && !only.includes(name)) continue;
    await fn({ ev, open, click, waitFor, sleep, saved, noErrors, shot, assert });
  }
});
