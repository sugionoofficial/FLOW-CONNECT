'use strict';
// Satu sesi = satu akun Google = satu profil browser asli yang menjalankan Google Flow.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { CDPConnection } = require('./cdp');
const os = require('os');
const crypto = require('crypto');
const { agentExpression } = require('./agent');
const browser = require('./browser');
const wire = require('./wire');
const { NetWatch } = require('./netwatch');
const { parsePrompt, sanitizeTags } = require('./refs');

const DEFAULT_FLOW_URL = 'https://flow.google.com/';
const IMAGE_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic' };
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normText = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const rand = (a, b) => a + Math.random() * (b - a);
const fail = (code, detail, extra) => { const e = new Error(code); if (detail) e.detail = String(detail).slice(0, 300); if (extra) Object.assign(e, extra); return e; };
const KEYS = {
  Enter: { code: 'Enter', vk: 13, text: '\r' }, Escape: { code: 'Escape', vk: 27 }, Backspace: { code: 'Backspace', vk: 8 },
  ArrowDown: { code: 'ArrowDown', vk: 40 }, ArrowUp: { code: 'ArrowUp', vk: 38 }, End: { code: 'End', vk: 35 }, Tab: { code: 'Tab', vk: 9 }
};

const IMG_SUFFIX = /\.(png|jpe?g|webp|gif|heic|heif|avif|bmp)$/i;
/** Indeks opsi pemilih aset yang judulnya persis `want` (dinormalisasi; ekstensi file diabaikan). -1 bila tidak ada / ganda. */
function pickOption(options, want, exact = true) {
  const norm = (t) => normText(String(t || '').trim().replace(IMG_SUFFIX, ''));
  const hits = options.map((o, i) => (norm(o.title) === want ? i : -1)).filter((i) => i >= 0);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return -1; // ganda → jangan menebak
  if (exact) return -1;
  const pre = options.map((o, i) => (norm(o.title).startsWith(want) ? i : -1)).filter((i) => i >= 0);
  return pre.length === 1 ? pre[0] : -1;
}

/** URL media Flow yang boleh diambil (sama dengan agen: isMediaUrl). */
function isMediaUrl(url, cfg) {
  let x;
  try { x = new URL(url); } catch { return false; }
  if (!(x.protocol === 'https:' || (cfg.allowHttp && x.protocol === 'http:'))) return false;
  const h = x.hostname;
  if (cfg.mediaHosts.includes(h) || h === 'flow-content.google' || /\.googleusercontent\.com$/.test(h)) return true;
  return (h === 'flow.google.com' || h === 'labs.google') && (/^\/asb\//.test(x.pathname) || /getMediaUrlRedirect/.test(x.pathname));
}

// Gambar yang DIUNGGAH sebagai referensi juga tercatat di project Flow; judulnya nama file (mis. kucing-oren-1a2b3c.png)
const UPLOAD_TITLE = /\.(png|jpe?g|webp|gif|heic|heif|avif|bmp)$/i;

function sniffMime(b) {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (b.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  return null;
}

function checkImageFile(p) {
  if (!IMAGE_EXT[path.extname(p).toLowerCase()]) throw new Error('INVALID_IMAGE');
  const st = fs.statSync(p);
  if (!st.isFile() || st.size > 30 * 1024 * 1024) throw new Error('INVALID_IMAGE');
}

class FlowSession extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.profileDir  folder profil browser untuk akun ini
   * @param {() => {path:string}} o.getBrowser  browser terpilih
   * @param {string} [o.flowUrl]
   * @param {{mediaHosts:string[], allowHttp?:boolean}} [o.agentCfg]
   * @param {string[]} [o.extraArgs]
   * @param {() => 'hidden'|'minimized'|'normal'} [o.getMode]  mode tampilan browser yang diinginkan
   * @param {string} [o.loginUrl]
   * @param {() => {x:number,y:number,width:number,height:number}} [o.getShowBounds]  posisi jendela saat ditampilkan
   */
  constructor(o) {
    super();
    this.profileDir = o.profileDir;
    this.getBrowser = o.getBrowser;
    this.flowUrl = o.flowUrl || DEFAULT_FLOW_URL;
    this.flowHost = new URL(this.flowUrl).host;
    this.agentCfg = o.agentCfg || { mediaHosts: ['flow-content.google', 'lh3.googleusercontent.com'] };
    this.uploads = o.uploads || new Set(); // media id gambar referensi yang diunggah aplikasi (bukan hasil generate)
    this.extraArgs = o.extraArgs || [];
    this.getMode = o.getMode || (() => 'normal');
    this.loginUrl = o.loginUrl || 'https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent(this.flowUrl.replace(/[?&]hl=[^&]*/, ''));
    this.getShowBounds = o.getShowBounds || (() => ({ x: 80, y: 60, width: 1280, height: 820 }));
    this.mode = null;      // mode browser yang sedang berjalan
    this.ua = null;        // UA bersih untuk mode tersembunyi
    this.loginState = null;
    this.port = null;
    this.page = null;      // CDPConnection ke tab Flow
    this.pageTarget = null;
    this.browserConn = null;
    this.busy = Promise.resolve();
  }

  get connected() { return !!this.port; }

  /** Buka browser TANPA kendali (cadangan login manual — jendela browser biasa). */
  openForLogin() {
    const exe = this.getBrowser().path;
    browser.launchBrowser({ exe, profileDir: this.profileDir, url: this.loginUrl, debug: false, extraArgs: this.extraArgs });
  }

  /**
   * KARTU LOGIN GOOGLE: jendela kecil tanpa bilah alamat (--app) yang langsung membuka halaman login Google asli.
   * Halaman TIDAK disentuh lewat CDP (tidak ada skrip/klik dari aplikasi) — aplikasi hanya membaca alamat tab lewat
   * HTTP /json/list untuk mengetahui kapan login selesai (Google mengalihkan ke Flow), lalu menutup kartu.
   * @returns {Promise<{ok:boolean, closed?:boolean}>}
   */
  async loginCard({ card, timeoutMs = 10 * 60000, shouldStop } = {}) {
    const running = this.port || await browser.existingDebugPort(this.profileDir);
    if (running) { this.port = running; await this.closeBrowser(); }
    await browser.waitForExit(this.profileDir);
    this._setLogin('card');
    browser.launchBrowser({ exe: this.getBrowser().path, profileDir: this.profileDir, url: this.loginUrl, debug: true, app: true, mode: 'card', card, extraArgs: this.extraArgs });
    let port;
    try { port = await browser.waitForDebugPort(this.profileDir); } catch (e) { this._setLogin(null); throw e; }
    const start = Date.now(), end = start + timeoutMs;
    let seen = false, opened = false;
    try {
      while (Date.now() < end) {
        if (shouldStop && shouldStop()) { await this._closePort(port); return { ok: false, closed: true }; }
        let targets;
        try { targets = await browser.getJSON(port, '/json/list', 'GET', 2000); } catch { return { ok: false, closed: true }; } // kartu ditutup pengguna
        const pages = targets.filter((t) => t.type === 'page');
        if (!pages.length) {
          if (seen) return { ok: false, closed: true };
          // browser tertentu mengabaikan --app: buka halaman login sebagai tab biasa (tetap tanpa kendali)
          if (!opened && Date.now() - start > 4000) { opened = true; await browser.getJSON(port, '/json/new?' + encodeURI(this.loginUrl), 'PUT').catch(() => {}); }
          await sleep(400);
          continue;
        }
        seen = true;
        if (pages.some((t) => this._isFlowUrl(t.url) && !t.url.startsWith(this.loginUrl))) {
          this._setLogin('done');
          await sleep(600);
          await this._closePort(port);
          return { ok: true };
        }
        await sleep(600);
      }
      await this._closePort(port);
      throw new Error('LOGIN_TIMEOUT');
    } finally {
      await browser.waitForExit(this.profileDir);
      if (this.loginState !== 'done') this._setLogin(null);
    }
  }

  _setLogin(state) { this.loginState = state; this.emit('login', state); }

  async _closePort(port) {
    try {
      const v = await browser.getJSON(port, '/json/version', 'GET', 2000);
      const b = await CDPConnection.connect(v.webSocketDebuggerUrl);
      await b.send('Browser.close').catch(() => {});
      b.close();
    } catch { /* sudah tertutup */ }
  }

  _isFlowUrl(u) { try { return new URL(u).host === this.flowHost; } catch { return false; } }

  /** Sambungkan: pakai browser profil ini yang sudah berjalan, atau jalankan baru (mode sesuai pengaturan). */
  async connect({ mode } = {}) {
    let port = await browser.existingDebugPort(this.profileDir);
    if (port) this.mode = browser.launchedMode(this.profileDir);
    else {
      this.mode = mode || this.getMode();
      const hidden = this.mode === 'hidden';
      browser.launchBrowser({ exe: this.getBrowser().path, profileDir: this.profileDir, url: hidden ? 'about:blank' : this.flowUrl, debug: true, mode: this.mode, extraArgs: this.extraArgs });
      port = await browser.waitForDebugPort(this.profileDir);
    }
    this.port = port;
    this.ua = null;
    await this.ensurePage({ waitForTabMs: this.mode === 'hidden' ? 0 : 8000 });
    await this.waitReady();
    if (this.mode === 'minimized') await this.minimize();
    this.emit('change');
    return port;
  }

  /** Tutup browser lalu jalankan lagi dengan mode lain (mis. cadangan dari headless ke jendela diperkecil). */
  async relaunch(mode) {
    const st = await this.status().catch(() => ({}));
    const url = st.url && this._isFlowUrl(st.url) ? st.url : null;
    await this.closeBrowser();
    await browser.waitForExit(this.profileDir);
    await this.connect({ mode });
    if (url && /\/project\//.test(url)) await this.navigate(url).catch(() => {});
    return this.mode;
  }

  /** Tunggu halaman Flow selesai dimuat (agar status/agen tidak membaca halaman setengah jadi). */
  async waitReady(timeoutMs = 20000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        const page = await this.ensurePage();
        const r = await page.send('Runtime.evaluate', { expression: 'document.readyState + "|" + location.host', returnByValue: true }, 5000);
        const [state, host] = String(r.result && r.result.value).split('|');
        if (state === 'complete' && host === this.flowHost) return true;
      } catch { /* tab sedang berpindah halaman */ }
      await sleep(250);
    }
    return false;
  }

  disconnect() {
    if (this.page) this.page.close();
    if (this.browserConn) this.browserConn.close();
    this.page = this.browserConn = this.pageTarget = null;
    this.port = null;
    this.emit('change');
  }

  /** Tutup browser profil ini sepenuhnya. */
  async closeBrowser() {
    try { await (await this._browser()).send('Browser.close'); } catch { /* sudah tertutup */ }
    this.disconnect();
  }

  async _targets() {
    try { return await browser.getJSON(this.port, '/json/list'); } catch {
      this.disconnect();
      throw new Error('BROWSER_CLOSED');
    }
  }

  _isFlow(t) {
    try { return t.type === 'page' && new URL(t.url).host === this.flowHost; } catch { return false; }
  }

  /** Cari (atau buat) tab Google Flow lalu sambungkan CDP ke tab itu. */
  async ensurePage({ waitForTabMs = 0 } = {}) {
    if (!this.port) throw new Error('NOT_CONNECTED');
    let targets = await this._targets();
    let flows = targets.filter((t) => this._isFlow(t));
    // Browser yang baru diluncurkan: tab pertama bisa masih "about:blank" sesaat sebelum membuka Flow
    for (const end = Date.now() + waitForTabMs; !flows.length && Date.now() < end; ) {
      await sleep(250);
      targets = await this._targets();
      flows = targets.filter((t) => this._isFlow(t));
    }
    let target = (this.pageTarget && flows.find((t) => t.id === this.pageTarget.id)) ||
      flows.find((t) => /\/project\//.test(t.url)) || flows[0];
    let navigateTo = null;
    if (!target) {
      // tab kosong dulu → (mode tersembunyi: pasang UA bersih) → baru buka Flow
      target = targets.find((t) => t.type === 'page' && /^(about:blank|chrome:\/\/newtab)/.test(t.url)) ||
        await browser.getJSON(this.port, '/json/new?about:blank', 'PUT');
      navigateTo = this.flowUrl;
    }
    if (this.page && !this.page.closed && this.pageTarget && this.pageTarget.id === target.id) return this.page;
    if (this.page) this.page.close();
    this.page = await CDPConnection.connect(target.webSocketDebuggerUrl);
    this.pageTarget = target;
    this.net = null;
    this.page.on('close', () => { if (this.page && this.page.closed) this.page = null; });
    if (this.mode === 'hidden') await this._stealth(!navigateTo);
    if (navigateTo) {
      await this.page.send('Page.navigate', { url: navigateTo });
      this.pageTarget = { ...target, url: navigateTo };
      await sleep(500);
    }
    return this.page;
  }

  /** Mode tersembunyi: hapus jejak "HeadlessChrome" dari User-Agent & Client Hints untuk tab ini. */
  async _stealth(reloadIfNeeded) {
    try {
      if (!this.ua) {
        const v = await (await this._browser()).send('Browser.getVersion');
        this.ua = browser.cleanUserAgent(v.product, this.getBrowser().path);
      }
      await this.page.send('Emulation.setUserAgentOverride', this.ua);
      await this.page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
      if (reloadIfNeeded) {
        const r = await this.page.send('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true });
        if (/Headless/i.test(String(r.result && r.result.value))) { await this.page.send('Page.reload'); await sleep(800); }
      }
    } catch { /* tidak didukung */ }
  }

  async _browser() {
    if (this.browserConn && !this.browserConn.closed) return this.browserConn;
    const v = await browser.getJSON(this.port, '/json/version');
    this.browserConn = await CDPConnection.connect(v.webSocketDebuggerUrl);
    return this.browserConn;
  }

  /** Jalankan fungsi agen di tab Flow. */
  async call(name, args = [], timeoutMs = 60000) {
    const page = await this.ensurePage();
    const res = await page.send('Runtime.evaluate', {
      expression: agentExpression(name, args, this.agentCfg), awaitPromise: true, returnByValue: true, userGesture: true
    }, timeoutMs);
    if (res.exceptionDetails) {
      const desc = (res.exceptionDetails.exception && res.exceptionDetails.exception.description) || res.exceptionDetails.text || 'ERROR';
      const m = /Error: ([A-Z_0-9]+)/.exec(desc);
      throw new Error(m ? m[1] : desc.split('\n')[0]);
    }
    return res.result.value;
  }

  // Satu aksi UI pada satu waktu per akun.
  _exclusive(fn) {
    const run = this.busy.then(fn, fn);
    this.busy = run.catch(() => {});
    return run;
  }

  async status() {
    if (!this.port) return { connected: false };
    try {
      const s = await this.call('status', [], 8000);
      return { connected: true, ...s };
    } catch (e) {
      if (!this.port) return { connected: false };
      return { connected: true, signedIn: false, error: e.message };
    }
  }

  async navigate(url) {
    const u = new URL(url || this.flowUrl);
    if (u.host !== this.flowHost) throw new Error('INVALID_URL');
    const page = await this.ensurePage();
    await page.send('Page.navigate', { url: u.toString() });
    await sleep(300);
    await this.waitReady();
  }

  /** Isi project Flow: hasil generate saja (gambar referensi yang diunggah disaring), kecuali { uploads: true }. */
  async listMedia(projectId, { uploads = false } = {}) {
    const items = await this.call('listMedia', [projectId]);
    return uploads ? items : items.filter((i) => !this.uploads.has(i.mediaId) && !UPLOAD_TITLE.test((i.title || '').trim()));
  }
  async getMedia(mediaId) { return this.call('getMedia', [mediaId]); }

  /** Ambil file media (Buffer). Coba langsung dulu (URL bertanda tangan), lalu lewat tab Flow (cookie pengguna). */
  async fetchMedia(url) {
    if (!isMediaUrl(url, this.agentCfg)) throw new Error('INVALID_URL');
    // 1) langsung (URL CDN bertanda tangan tidak butuh cookie)
    try {
      const r = await fetch(url, { redirect: 'follow' });
      const mime = (r.headers.get('content-type') || '').split(';')[0];
      if (r.ok && !/^text\/html/.test(mime)) return { buffer: Buffer.from(await r.arrayBuffer()), mime };
    } catch { /* lanjut */ }
    // 2) lewat jaringan browser Flow (cookie akun, tanpa batasan CORS) — poster /asb/ butuh ini
    try { return await this._browserFetch(url); } catch { /* lanjut */ }
    // 3) fetch dari dalam tab
    const res = await this.call('fetchB64', [url], 180000);
    return { buffer: Buffer.from(res.b64, 'base64'), mime: (res.mime || '').split(';')[0] };
  }

  /** Ambil URL lewat tumpukan jaringan browser (Network.loadNetworkResource): cookie ikut, CORS tidak berlaku. */
  async _browserFetch(url) {
    if (!isMediaUrl(url, this.agentCfg)) throw new Error('INVALID_URL');
    await this._net(); // Network domain aktif
    const page = await this.ensurePage();
    const tree = await page.send('Page.getFrameTree');
    const r = await page.send('Network.loadNetworkResource', { frameId: tree.frameTree.frame.id, url, options: { disableCache: false, includeCredentials: true } }, 120000);
    const res = r.resource || {};
    if (!res.success || !res.stream) throw new Error('HTTP_' + (res.httpStatusCode || 0));
    if (res.httpStatusCode && res.httpStatusCode >= 400) { await page.send('IO.close', { handle: res.stream }).catch(() => {}); throw new Error('HTTP_' + res.httpStatusCode); }
    const parts = [];
    let size = 0;
    try {
      for (;;) {
        const c = await page.send('IO.read', { handle: res.stream, size: 1 << 20 }, 60000);
        if (c.data) { const b = Buffer.from(c.data, c.base64Encoded ? 'base64' : 'utf8'); parts.push(b); size += b.length; }
        if (size > 300 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
        if (c.eof) break;
      }
    } finally { await page.send('IO.close', { handle: res.stream }).catch(() => {}); }
    const h = res.headers || {};
    const ct = Object.keys(h).find((k) => k.toLowerCase() === 'content-type');
    let mime = ct ? String(h[ct]).split(';')[0].trim() : '';
    const buf = Buffer.concat(parts);
    if (!mime || mime === 'application/octet-stream') mime = sniffMime(buf) || mime;
    if (/^text\/html/.test(mime)) throw new Error('NOT_MEDIA');
    return { buffer: buf, mime };
  }

  /** Unduh satu item galeri ke folder; kembalikan path file. */
  async download(item, dir) {
    if (!item || !/^[A-Za-z0-9-]{1,128}$/.test(item.mediaId || '')) throw new Error('INVALID_MEDIA_ID');
    let url = item.isVideo ? (item.video || item.image) : (item.image || item.video);
    if (!url) {
      const m = await this.getMedia(item.mediaId);
      url = item.isVideo ? (m.video || m.image) : (m.image || m.video);
    }
    if (!url) throw new Error('MEDIA_NOT_READY');
    const { buffer, mime } = await this.fetchMedia(url);
    fs.mkdirSync(dir, { recursive: true });
    const ext = MIME_EXT[mime] || (item.isVideo ? '.mp4' : '.png');
    const base = (item.title || (item.isVideo ? 'video' : 'gambar')).replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 60) || 'flow';
    let file = path.join(dir, `${base} - ${item.mediaId.slice(0, 8)}${ext}`);
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base} - ${item.mediaId.slice(0, 8)} (${i})${ext}`);
    fs.writeFileSync(file, buffer);
    return file;
  }

  async _windowBounds(bounds) {
    if (this.mode === 'hidden') return;
    try {
      const b = await this._browser();
      const { windowId } = await b.send('Browser.getWindowForTarget', { targetId: this.pageTarget.id });
      await b.send('Browser.setWindowBounds', { windowId, bounds });
    } catch { /* tidak didukung */ }
  }
  _windowState(state) { return this._windowBounds({ windowState: state }); }
  minimize() { return this._windowState('minimized'); }
  restore() { return this._windowState('normal'); }

  /** Sebelum aplikasi bekerja di Flow: jendela diperkecil dipulihkan (tetap di luar layar) agar halaman dirender penuh. */
  async beginWork() { if (this.mode === 'minimized') await this.restore(); }
  async endWork() { if (this.mode === 'minimized') await this.minimize(); }

  /** Tampilkan jendela Flow ke pengguna. Mode tersembunyi tidak punya jendela → diluncurkan ulang sebagai jendela. */
  async bringToFront() {
    if (this.mode === 'hidden') await this.relaunch('minimized');
    await this.restore();
    if (this.mode === 'minimized') {
      const r = this.getShowBounds();
      await this._windowBounds({ left: Math.round(r.x), top: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    }
    const page = await this.ensurePage();
    await page.send('Page.bringToFront');
  }

  /** Klik mouse asli (isTrusted) di tengah kotak elemen, dengan sedikit variasi posisi. */
  async _click(b) {
    const page = await this.ensurePage();
    const x = b.x + rand(-b.w / 6, b.w / 6), y = b.y + rand(-b.h / 6, b.h / 6);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await sleep(rand(60, 160));
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(rand(40, 110));
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async _escape() {
    const page = await this.ensurePage();
    const key = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  }

  async _closeOverlays() {
    for (let i = 0; i < 3; i++) {
      if (!(await this.call('overlayOpen').catch(() => false))) return;
      await this._escape();
      await sleep(350);
    }
  }

  async _waitFor(fn, timeoutMs, step = 250) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const v = await fn().catch(() => null);
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  /** Klik tombol "New project" Flow (dan tombol "Create with Google Flow" di halaman sambutan bila perlu). */
  newProject({ timeoutMs = 25000 } = {}) {
    return this._exclusive(async () => {
      await this.beginWork();
      try {
        const st0 = await this.status();
        // dari dalam project: kembali ke beranda Flow dulu
        if (st0.projectId) await this.navigate(this.flowUrl);
        for (let attempt = 0; attempt < 4; attempt++) {
          const t = await this._waitFor(() => this.call('newProjectTarget'), 8000, 400);
          if (!t) break;
          await sleep(rand(250, 600));
          await this._click(t);
          if (t.kind === 'cta') { await sleep(2500); await this.waitReady(); continue; }
          const st = await this._waitFor(async () => { const x = await this.status(); return x.projectId ? x : null; }, timeoutMs, 500);
          if (st) { await this.ensurePage(); await this.waitReady(); return { projectId: st.projectId, projectTitle: st.projectTitle }; }
        }
        throw new Error((await this.status()).signedIn ? 'NEW_PROJECT_NOT_FOUND' : 'NOT_SIGNED_IN');
      } finally { await this.endWork(); }
    });
  }

  /** Pilih radio/opsi di panel setelan Flow. Mengembalikan true bila sudah/berhasil dipilih. */
  async _pick(spec) {
    const t = await this.call('find', [spec]);
    if (!t || t.disabled) return false;
    if (!t.checked) { await this._click(t); await sleep(rand(300, 550)); }
    return true;
  }

  async _openPanel() {
    if (await this.call('overlayOpen')) return true;
    const t = await this.call('settingsTrigger');
    if (!t) return false;
    await this._click(t);
    return !!(await this._waitFor(() => this.call('overlayOpen'), 2500, 200));
  }

  async _pickModel(model) {
    const want = String(model);
    // pilihan model kadang langsung terlihat (radio/opsi)
    if (await this._pick({ roles: ['option', 'menuitemradio', 'radio'], norm: want, scope: 'overlay' })) return true;
    const trig = await this.call('modelTrigger');
    if (!trig) return false;
    if (normText(trig.label) === normText(want)) return true; // sudah terpilih
    await this._click(trig);
    await sleep(rand(450, 700));
    const ok = await this._pick({ roles: ['option', 'menuitemradio', 'menuitem', 'radio'], norm: want, scope: 'overlay' });
    if (!ok) await this._escape();
    await sleep(250);
    return ok;
  }

  /**
   * Terapkan setelan Studio ke UI Flow sendiri (klik asli di panel setelan Flow) sebelum Generate.
   * opts: { kind:'video'|'image', sub:'text'|'frames'|'ingredients', model, ratio:'16:9', count:1-4, duration:4|6|8 }
   * Semua langkah "sebisanya": bila kontrol tidak ditemukan, dilaporkan di `missing` dan Flow memakai setelannya sendiri.
   */
  applySettings(opts = {}) {
    return this._exclusive(async () => this._applySettings(opts));
  }

  async _applySettings(opts) {
    const want = {};
    if (opts.kind === 'video' || opts.kind === 'image') want.kind = opts.kind;
    if (want.kind === 'video' && ['text', 'frames', 'ingredients'].includes(opts.sub)) want.sub = opts.sub;
    if (opts.model && opts.model !== 'auto') want.model = String(opts.model).slice(0, 60);
    if (/^\d{1,2}:\d{1,2}$/.test(opts.ratio || '')) want.ratio = opts.ratio;
    if (Number(opts.count) >= 1 && Number(opts.count) <= 4) want.count = Number(opts.count);
    if (want.kind !== 'image' && [4, 5, 6, 8, 10].includes(Number(opts.duration))) want.duration = Number(opts.duration);
    const applied = {};
    if (!Object.keys(want).length) return { applied, missing: [] };

    // 1) pemilih mode gaya lama (combobox "Text to Video")
    if (want.kind) {
      const legacy = await this.call('legacyModeTrigger');
      if (legacy) {
        const label = want.kind === 'image' ? 'create image|buat gambar' : want.sub === 'frames' ? 'frames to video|frame ke video' : want.sub === 'ingredients' ? 'ingredients to video|bahan ke video' : 'text to video|teks ke video';
        if (new RegExp('^(' + label + ')$', 'i').test(legacy.label)) { applied.kind = want.kind; if (want.sub) applied.sub = want.sub; }
        else {
          await this._click(legacy);
          await sleep(rand(400, 650));
          if (await this._pick({ roles: ['option', 'menuitem', 'menuitemradio'], re: '^(' + label + ')$', scope: 'overlay' })) { applied.kind = want.kind; if (want.sub) applied.sub = want.sub; }
          await this._closeOverlays();
        }
      }
    }

    // 2) panel setelan gaya baru (chip "Video · 8s · x2" di samping prompt)
    const needPanel = Object.keys(want).some((k) => !applied[k]);
    if (needPanel && await this._openPanel()) {
      if (want.kind && !applied.kind) {
        const re = want.kind === 'video' ? '^(video|videos|vid[eé]o|视频|視頻|影片)$' : '^(image|images|gambar|foto|photo|图片|圖片|圖像)$';
        if (await this._pick({ roles: ['radio', 'tab', 'option', 'menuitemradio', 'button'], re, scope: 'overlay' })) { applied.kind = want.kind; await sleep(400); }
      }
      if (want.sub && !applied.sub) {
        const re = { text: '^(text|text to video|teks|teks ke video)$', frames: '^(frames?|frames to video|frame ke video|幀|帧)$', ingredients: '^(ingredients?|ingredients to video|bahan|bahan ke video|素材)$' }[want.sub];
        if (await this._pick({ roles: ['radio', 'tab', 'option', 'menuitemradio', 'button'], re, scope: 'overlay' })) applied.sub = want.sub;
        else if (want.sub === 'text') applied.sub = 'text'; // UI baru tidak punya sub-mode "teks": prompt tanpa bahan = teks ke video
      }
      if (want.ratio && await this._pick({ roles: ['radio', 'tab', 'option', 'menuitemradio', 'button'], re: '(^|[^\\d])' + want.ratio.replace(':', '\\s?:\\s?') + '([^\\d]|$)', scope: 'overlay' })) applied.ratio = want.ratio;
      if (want.count && await this._pick({ roles: ['radio', 'tab', 'option', 'menuitemradio', 'button'], re: '^(x\\s?' + want.count + '|' + want.count + 'x|' + want.count + ' (outputs?|hasil))$', scope: 'overlay' })) applied.count = want.count;
      if (want.duration && await this._pick({ roles: ['radio', 'tab', 'option', 'menuitemradio', 'button'], re: '^' + want.duration + '\\s?(s|sec|secs|seconds?|detik|dtk|秒)$', scope: 'overlay' })) applied.duration = want.duration;
      if (want.model && await this._pickModel(want.model)) applied.model = want.model;
      await this._closeOverlays();
    } else if (want.model && !applied.model && await this._pickModel(want.model)) {
      applied.model = want.model;
      await this._closeOverlays();
    }
    return { applied, missing: Object.keys(want).filter((k) => applied[k] === undefined) };
  }

  /** Baca pilihan yang tersedia di panel setelan Flow (model, rasio, jumlah) — untuk mengisi pilihan di Studio. */
  scanSettings() {
    return this._exclusive(async () => {
      await this.beginWork();
      try {
        const out = { models: [], options: [] };
        if (await this._openPanel()) {
          out.options = await this.call('optionLabels');
          const trig = await this.call('modelTrigger');
          if (trig) {
            out.current = trig.label;
            await this._click(trig);
            await sleep(600);
            out.models = (await this.call('optionLabels')).filter((o) => /veo|imagen|nano|banana|omni|gemini/i.test(o.primary)).map((o) => o.primary.slice(0, 60));
          }
          await this._closeOverlays();
        }
        out.models = [...new Set(out.models)].slice(0, 20);
        return out;
      } finally { await this.endWork(); }
    });
  }

  /**
   * Setelah klik Generate: pastikan Flow benar-benar mulai membuat.
   * → {started:true} | {error, suspect} (Flow menolak; suspect = kemungkinan karena mode tersembunyi) | {unknown:true}
   */
  async confirmStarted(beforeIds, prompt, { timeoutMs = 40000, intervalMs = 2000 } = {}) {
    const before = new Set(beforeIds || []);
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await sleep(intervalMs);
      const err = await this.call('pageError').catch(() => null);
      if (err) return { error: err.text, suspect: err.suspect };
      const st = await this.status();
      if (st.projectId) {
        const items = await this.listMedia(st.projectId).catch(() => []);
        if (items.some((it) => !before.has(it.mediaId))) return { started: true };
      }
    }
    const left = await this.call('promptText').catch(() => null);
    if (prompt && left && left.replace(/\s+/g, ' ').trim() === prompt.replace(/\s+/g, ' ').trim()) return { error: 'NOT_STARTED', suspect: true };
    return { unknown: true };
  }

  /**
   * Jalur lengkap satu generate. Gambar → "skill" generate foto (skills/image.js); video → runGeneration langsung.
   * hooks: { onLog, shouldStop, timeoutMs, wait, onFallback }
   */
  async generate(job, hooks = {}) {
    const kind = job.options ? job.options.kind : null;
    if (kind === 'image') return require('./skills/image').run(this, job, hooks);
    return this.runGeneration(job, hooks, { kind: kind === 'video' ? 'video' : null });
  }

  /**
   * (project baru bila perlu) → setelan → UNGGAH gambar & tunggu selesai → prompt dengan penanda "@" → periksa →
   * Generate → amati sampai jadi / GAGAL (tidak menunggu tanpa akhir).
   * Mode tersembunyi yang ditolak Flow otomatis diulang sekali di jendela diperkecil.
   * spec: { kind, imageMs, startMs, check(prep) }
   */
  async runGeneration(job, hooks = {}, spec = {}) {
    const say = hooks.onLog || (() => {});
    const stop = () => { if (hooks.shouldStop && hooks.shouldStop()) throw new Error('STOPPED'); };
    for (let attempt = 0; ; attempt++) {
      await this.beginWork();
      let res, obs;
      try {
        let st = await this.status();
        if (!st.projectId) {
          say('Membuat project baru di Google Flow…');
          await this.endWork();
          await this.newProject();
          await this.beginWork();
          st = await this.status();
        }
        if (!st.signedIn) throw new Error('NOT_SIGNED_IN');
        stop();
        let settings = null;
        if (job.options && job.options.apply !== false) {
          say('Menerapkan setelan Flow (mode, model, rasio)…');
          settings = await this.applySettings(job.options);
          await sleep(rand(400, 900));
        }
        stop();
        const prep = await this._exclusive(() => this.prepareComposer(job, say));
        if (spec.check) spec.check(prep);
        stop();
        const credits = await this.call('creditsWarning').catch(() => null);
        if (credits) throw fail('INSUFFICIENT_CREDITS', credits);
        const before = (await this.listMedia(st.projectId).catch(() => [])).map((i) => i.mediaId);
        const tiles0 = ((await this.call('failedTiles').catch(() => null)) || { count: 0 }).count;
        const net = await this._net();
        const mark = net.mark();
        await sleep(rand(600, 1400));
        say('Menekan Generate…');
        const click = await this.clickGenerate();
        res = { click, settings, refs: prep.refs, mentions: prep.mentions, projectId: st.projectId, mode: this.mode, fellBack: attempt > 0 };
        say('Memastikan Flow mulai membuat…');
        // tunggu sampai permintaan generate benar-benar terkirim selagi jendela masih "aktif"
        obs = await this.observe({ mark, before, exclude: prep.refs.map((r) => r.mediaId), kind: spec.kind, prompt: job.prompt, wait: false, startMs: spec.startMs, tiles0, shouldStop: hooks.shouldStop });
        if (obs.ok && hooks.wait !== false) {
          await this.endWork();
          obs = await this.observe({ mark, before, exclude: prep.refs.map((r) => r.mediaId), kind: spec.kind, prompt: job.prompt, wait: true, timeoutMs: hooks.timeoutMs || 8 * 60000, imageMs: spec.imageMs, tiles0, onProgress: say, shouldStop: hooks.shouldStop });
        }
      } finally { await this.endWork(); }
      if (obs.error) {
        if (this.mode === 'hidden' && obs.error.suspect && attempt === 0) {
          say('Flow menolak di mode tersembunyi — beralih otomatis ke jendela diperkecil…');
          if (hooks.onFallback) await hooks.onFallback({ error: obs.error.detail || obs.error.code, suspect: true });
          await this.relaunch('minimized');
          continue;
        }
        throw fail(obs.error.code, obs.error.detail);
      }
      return { ...res, items: obs.items || null, projectId: obs.projectId || res.projectId };
    }
  }

  /** MODE AMAN: siapkan Flow (setelan + unggah gambar + prompt ber-"@") — pengguna sendiri yang menekan Generate. */
  async prepare(job, say = () => {}) {
    await this.beginWork();
    const out = {};
    if (job.options && job.options.apply !== false) out.settings = await this.applySettings(job.options);
    out.prep = await this._exclusive(() => this.prepareComposer(job, say));
    return out;
  }

  /** Tulis prompt ke kolom prompt Flow (ketikan asli lewat Input.insertText). */
  sendPrompt(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('INVALID_PROMPT');
    return this._exclusive(async () => {
      const page = await this.ensurePage();
      await this.call('focusPrompt');
      await sleep(rand(120, 300));
      await page.send('Input.insertText', { text });
      await sleep(200);
      const now = await this.call('promptText');
      if (!now || now.replace(/\s+/g, ' ').trim() !== text.replace(/\s+/g, ' ').trim()) await this.call('setPromptFallback', [text]);
      return { ok: true };
    });
  }

  /** Lampirkan gambar ke Flow: isi input file asli (DOM.setFileInputFiles), cadangan: paste/drop. */
  sendImages(paths) {
    if (!Array.isArray(paths) || !paths.length || paths.length > 10) throw new Error('INVALID_FILES');
    for (const p of paths) checkImageFile(p);
    return this._exclusive(async () => {
      const page = await this.ensurePage();
      if (await this.call('markFileInput')) {
        const r = await page.send('Runtime.evaluate', { expression: 'document.querySelector("[data-fc-target]")' });
        if (r.result && r.result.objectId) {
          await page.send('DOM.setFileInputFiles', { files: paths, objectId: r.result.objectId });
          return { method: 'file-input', count: paths.length };
        }
      }
      const list = paths.map((p) => ({ name: path.basename(p), mime: IMAGE_EXT[path.extname(p).toLowerCase()], b64: fs.readFileSync(p).toString('base64') }));
      const method = await this.call('pasteFiles', [list], 120000);
      return { method, count: paths.length };
    });
  }

  // =====================================================================
  //  Referensi gambar: unggah ke Flow dulu → tandai dengan "@" → baru Generate
  // =====================================================================

  /** Pengamat lalu lintas batchexecute tab Flow (dipasang sekali per koneksi tab). */
  async _net() {
    const page = await this.ensurePage();
    if (this.net && this.net.page === page) return this.net;
    this.net = await new NetWatch(page).enable();
    return this.net;
  }

  /** Tombol keyboard asli (keyDown/keyUp). */
  async _key(name, times = 1, gap = 120) {
    const page = await this.ensurePage();
    const k = KEYS[name];
    for (let i = 0; i < times; i++) {
      const base = { key: name, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
      await page.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      if (times > 1) await sleep(gap);
    }
  }

  /** Ketik per karakter dengan event tombol (plugin "@" Flow butuh event tombol, bukan insertText). */
  async _typeKeys(str, delay = 90) {
    const page = await this.ensurePage();
    for (const ch of String(str)) {
      const shift = /[A-Z@!#$%^&*()_+{}|:"<>?~]/.test(ch);
      const code = ch === '@' ? 'Digit2' : ch === ' ' ? 'Space' : ch === '-' ? 'Minus' : ch === '_' ? 'Minus' : ch === '.' ? 'Period' : /[0-9]/.test(ch) ? 'Digit' + ch : /[a-z]/i.test(ch) ? 'Key' + ch.toUpperCase() : '';
      const vk = ch === '@' ? 50 : ch === ' ' ? 32 : ch === '-' || ch === '_' ? 189 : ch === '.' ? 190 : /[a-z0-9]/i.test(ch) ? ch.toUpperCase().charCodeAt(0) : 0;
      const base = { key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: shift ? 8 : 0 };
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(rand(delay * 0.6, delay * 1.4));
    }
  }

  /** Klik elemen yang membuka dialog pilih-file, lalu isi dialog itu dengan `file` (tanpa jendela dialog OS). */
  async _chooseFile(target, file) {
    const page = await this.ensurePage();
    await page.send('Page.enable').catch(() => {});
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
    try {
      const opened = new Promise((resolve) => {
        const h = (e) => { page.off('Page.fileChooserOpened', h); resolve(e); };
        page.on('Page.fileChooserOpened', h);
        setTimeout(() => { page.off('Page.fileChooserOpened', h); resolve(null); }, 7000);
      });
      await this._click(target);
      const ev = await opened;
      if (!ev || !ev.backendNodeId) return false;
      await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: ev.backendNodeId });
      return true;
    } finally {
      await page.send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
    }
  }

  /** Salinan file dengan nama unik → nama itu yang dicari lagi di pemilih "@" (tidak tertukar dengan unggahan lama). */
  _uniqueCopy(file, tag) {
    const ext = path.extname(file).toLowerCase();
    const dir = path.join(os.tmpdir(), 'flow-connect-refs');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) { try { const p = path.join(dir, f); if (Date.now() - fs.statSync(p).mtimeMs > 6 * 3600000) fs.unlinkSync(p); } catch { /* */ } }
    const name = `${tag}-${crypto.randomBytes(3).toString('hex')}${ext}`;
    const dest = path.join(dir, name);
    fs.copyFileSync(file, dest);
    return { dest, name, stem: name.slice(0, name.length - ext.length) };
  }

  /**
   * Unggah SATU gambar referensi lewat pengunggah Flow sendiri ("+" → Upload → dialog file) dan TUNGGU sampai
   * Flow selesai menyimpannya (balasan maseQ berisi media id). Tanpa ini Flow men-generate tanpa gambar.
   * → { mediaId, name, tag, how }
   */
  async uploadReference(file, tag, { timeoutMs = 90000 } = {}) {
    checkImageFile(file);
    const { dest, name, stem } = this._uniqueCopy(file, tag || 'gambar');
    const net = await this._net();
    const st = await this.status();
    const mark = net.mark();
    const dialogsBefore = await this.call('dialogCount').catch(() => 0);
    let how = null;
    await this._closeOverlays();
    const cookie = await this.call('cookieReject').catch(() => null);
    if (cookie) { await this._click(cookie); await sleep(600); }
    // 1) "+" → menu "Upload" → dialog file (dicegat, diisi file)
    const add = await this.call('toolbarAdd');
    if (add) {
      await this._click(add);
      const item = await this._waitFor(() => this.call('uploadMenuItem'), 5000, 250);
      if (item) { if (await this._chooseFile(item, dest)) how = 'menu'; }
      else if (await this._chooseFile(add, dest).catch(() => false)) how = 'button'; // "+" langsung membuka dialog file
      if (!how) await this._closeOverlays();
    }
    // 2) cadangan: input file Flow langsung
    if (!how && await this.call('markFileInput')) {
      const page = await this.ensurePage();
      const r = await page.send('Runtime.evaluate', { expression: 'document.querySelector("[data-fc-target]")' });
      if (r.result && r.result.objectId) {
        await page.send('DOM.setFileInputFiles', { files: [dest], objectId: r.result.objectId });
        how = 'input';
      }
    }
    if (!how) throw fail('UPLOAD_BUTTON_NOT_FOUND');
    const isUpload = (e) => e.kind !== 'request' && e.rpcids.includes(wire.UPLOAD_RPC);
    const ev = await net.wait(mark, isUpload, timeoutMs);
    if (!ev) {
      const sent = net.since(mark, (e) => e.kind === 'request' && e.rpcids.includes(wire.UPLOAD_RPC)).length > 0;
      const dialogs = await this.call('dialogCount').catch(() => 0);
      if (!sent && dialogs > dialogsBefore) throw fail('UPLOAD_TERMS');
      throw fail(sent ? 'UPLOAD_TIMEOUT' : 'UPLOAD_NOT_SENT', name);
    }
    if (ev.kind === 'failed') throw fail('UPLOAD_FAILED', ev.error);
    if (ev.status && ev.status !== 200) throw fail('UPLOAD_FAILED', 'HTTP ' + ev.status);
    const ref = ev.text ? wire.refusal(ev.text, [wire.UPLOAD_RPC]) : null;
    if (ref) throw fail('UPLOAD_REJECTED', ref.reason || ref.text);
    const mediaId = ev.text ? wire.uploadedMediaId(ev.text, st.projectId) : null;
    if (!mediaId) throw fail('UPLOAD_FAILED', 'tanpa media id');
    await this._closeOverlays();
    this.uploads.add(mediaId);
    this.emit('upload', mediaId);
    return { mediaId, name, stem, tag, how };
  }

  /** Kosongkan kolom prompt Flow (termasuk chip "@"). */
  async clearPrompt() {
    await this.call('focusPrompt');
    await sleep(120);
    await this._key('Backspace');
    await sleep(250);
    const left = await this.call('caretToEnd');
    if ((left.text || '').trim() || left.chips) {
      await this.call('focusPrompt');
      await this._key('Backspace', 2, 80);
      const again = await this.call('caretToEnd');
      if ((again.text || '').trim() || again.chips) await this.call('setPromptFallback', ['']);
    }
  }

  /**
   * Tandai aset `name` dengan "@" di akhir prompt Flow: ketik @ + nama → pilih opsi yang judulnya sama → Enter.
   * Enter HANYA ditekan bila pemilih menampilkan opsi yang cocok (tanpa pemilih, Enter = kirim generate).
   * → true bila chip bertambah.
   */
  async _mention(name, { attempts = 3, exact = true } = {}) {
    const want = normText(name);
    let offered = [];
    for (let a = 1; a <= attempts; a++) {
      const before = await this.call('caretToEnd');
      await this._typeKeys('@', 120);
      await sleep(rand(1200, 1800));
      await this._typeKeys(name, 70);
      await sleep(rand(1800, 2400));
      offered = await this.call('mentionOptions').catch(() => []);
      const idx = pickOption(offered, want, exact);
      if (idx >= 0) {
        if (idx > 0) await this._key('ArrowDown', idx, 450);
        await sleep(300);
        await this._key('Enter');
        await sleep(rand(1200, 1700));
        const after = await this.call('caretToEnd');
        if (after.chips === before.chips + 1) { await this._typeKeys(' ', 60); return true; }
      }
      // batal: Escape menutup pemilih; buang sisa "@nama" bila tertinggal
      if (offered.length || await this.call('overlayOpen').catch(() => false)) await this._key('Escape');
      await sleep(500);
      const now = await this.call('caretToEnd');
      if (now.chips < before.chips) throw fail('REFERENCE_LOST', name);
      const tail = '@' + name;
      if ((now.text || '').replace(/\s+$/, '').endsWith(tail)) await this._key('Backspace', tail.length, 25);
      if (a < attempts) await sleep(2000);
    }
    this.lastOffered = offered.map((o) => o.title).slice(0, 6);
    return false;
  }

  /** Mode Frames: pasang gambar ke slot frame kosong berikutnya (Awal, lalu Akhir) lewat pemilih aset. */
  async _attachFrame(name) {
    for (let a = 1; a <= 3; a++) {
      const bound = await this.call('boundFrames').catch(() => 0);
      const chip = await this.call('emptyFrameChip');
      if (!chip) throw fail('FRAME_SLOT_NOT_FOUND');
      await this._click(chip);
      const pk = await this._waitFor(async () => { const p = await this.call('picker'); return p.open ? p : null; }, 8000, 300);
      if (!pk) { await this._closeOverlays(); continue; }
      if (pk.search) { await this._click(pk.search); await this.call('focusPickerSearch'); await this._typeKeys(name, 60); await sleep(2200); }
      const opts = await this.call('mentionOptions').catch(() => []);
      const o = opts[pickOption(opts, normText(name), true)];
      if (o) {
        await this._click(o);
        await sleep(900);
        const p2 = await this.call('picker');
        if (p2.open && p2.confirm) { await this._click(p2.confirm); await sleep(900); }
        const ok = await this._waitFor(async () => (await this.call('boundFrames')) > bound, 15000, 400);
        if (ok) return true;
      }
      await this._closeOverlays();
      await sleep(2000);
    }
    return false;
  }

  /**
   * Siapkan kotak prompt Flow untuk satu tugas: unggah semua gambar referensi (tunggu selesai), lalu susun prompt
   * dengan penanda "@" yang menunjuk aset hasil unggahan. Gambar yang tidak disebut di prompt tetap ditandai di awal.
   * job: { prompt, images:[path], tags:[tag], options:{kind, sub} }
   * → { refs:[{tag, name, mediaId}], mentions:{ok:[], missing:[]}, frames:n }
   */
  async prepareComposer(job, say = () => {}) {
    const images = job.images || [];
    const tags = sanitizeTags(job.tags, images);
    const refs = [];
    for (let i = 0; i < images.length; i++) {
      say(`Mengunggah gambar ${i + 1}/${images.length} ke Google Flow…`);
      const r = await this.uploadReference(images[i], tags[i]);
      refs.push(r);
      await sleep(rand(800, 1600));
    }
    const prompt = String(job.prompt || '');
    const o = job.options || {};
    const frames = o.kind === 'video' && o.sub === 'frames' && refs.length ? refs.slice(0, 2) : [];
    const parsed = parsePrompt(prompt, tags);
    const mentionRefs = refs.map((r, i) => i).filter((i) => !frames.includes(refs[i]));
    // gambar yang tidak disebut → ditandai di awal prompt, agar tetap dipakai sebagai referensi
    const lead = mentionRefs.filter((i) => !parsed.used.includes(i));
    const segments = [...lead.map((i) => ({ ref: i })), ...parsed.segments.map((sg) => (sg.ref !== undefined && frames.includes(refs[sg.ref]) ? { text: '@' + tags[sg.ref] } : sg))];
    const result = { refs: refs.map((r) => ({ tag: r.tag, name: r.name, mediaId: r.mediaId })), mentions: { ok: [], missing: [] }, frames: 0 };

    await this.clearPrompt();
    for (const r of frames) {
      say(`Memasang ${frames.indexOf(r) ? 'frame akhir' : 'frame awal'} @${r.tag}…`);
      if (!(await this._attachFrame(r.stem))) throw fail('FRAME_NOT_ATTACHED', '@' + r.tag);
      result.frames++;
    }
    const needChips = segments.some((sg) => sg.ref !== undefined || sg.mention !== undefined);
    if (!needChips) {
      if (prompt.trim()) { say('Menulis prompt…'); await this._insertText(prompt); }
      return result;
    }
    const page = await this.ensurePage();
    let prevChip = false;
    for (const sg of segments) {
      if (sg.text !== undefined) {
        const t = prevChip ? sg.text.replace(/^ /, '') : sg.text; // setelah chip sudah diketik satu spasi
        prevChip = false;
        if (!t) continue;
        await this.call('caretToEnd');
        await page.send('Input.insertText', { text: t });
        await sleep(rand(150, 400));
        continue;
      } else if (sg.ref !== undefined) {
        const r = refs[sg.ref];
        say(`Menandai @${r.tag} di prompt…`);
        if (!(await this._mention(r.stem))) throw fail('REFERENCE_NOT_ATTACHED', '@' + r.tag + (this.lastOffered && this.lastOffered.length ? ' (Flow menawarkan: ' + this.lastOffered.join(', ') + ')' : ''));
        result.mentions.ok.push(r.tag);
        prevChip = true;
      } else {
        say(`Menandai @${sg.mention} di prompt…`);
        if (await this._mention(sg.mention, { attempts: 1, exact: false })) { result.mentions.ok.push(sg.mention); prevChip = true; } else { await this.call('caretToEnd'); await page.send('Input.insertText', { text: '@' + sg.mention }); result.mentions.missing.push(sg.mention); }
      }
    }
    // periksa: setiap gambar referensi harus terpasang sebagai chip sebelum Generate
    const chips = await this.call('mentionChips');
    const want = result.mentions.ok.length;
    if (chips.length < want) throw fail('REFERENCE_NOT_ATTACHED', `${chips.length}/${want} chip`);
    return result;
  }

  async _insertText(text) {
    const page = await this.ensurePage();
    await this.call('caretToEnd');
    await page.send('Input.insertText', { text });
    await sleep(200);
    const now = await this.call('promptText');
    if (!now || now.replace(/\s+/g, ' ').trim() !== text.replace(/\s+/g, ' ').trim()) await this.call('setPromptFallback', [text]);
  }

  /**
   * Amati hasil setelah tombol Generate diklik — tidak menunggu tanpa akhir:
   *  • balasan kirim (ogiZ0b gambar / YhhmEf… video) berisi penolakan → gagal seketika
   *  • status video (jwpduf/Zzl0ze) gagal → gagal seketika (dengan pesan Flow)
   *  • peringatan / kartu "Failed" di halaman → gagal
   *  • tidak ada permintaan generate yang keluar → GENERATE_NOT_STARTED
   *  • gambar: balasan tidak datang dalam batas waktu → GENERATE_TIMEOUT
   * → { ok:true, items, projectId } | { error:{code, detail, suspect} }
   */
  async observe({ mark, before, exclude = [], kind, prompt, wait = true, timeoutMs = 8 * 60000, startMs = 25000, imageMs = 180000, tiles0 = 0, onProgress, shouldStop }) {
    const net = await this._net();
    const say = onProgress || (() => {});
    const skip = new Set([...(before || []), ...exclude]);
    const t0 = Date.now();
    let cursor = mark, submitted = null, imageReply = null, lastList = 0, firstSeen = 0, lastSay = '';
    const ours = { wf: new Set(), media: new Set() };
    const imgs = [];
    const status = (t) => { if (t !== lastSay) { lastSay = t; say(t); } };
    const errOut = (code, detail, suspect = false) => ({ error: { code, detail: detail ? String(detail).slice(0, 300) : null, suspect } });
    while (true) {
      if (shouldStop && shouldStop()) throw new Error('STOPPED');
      // 1) lalu lintas Flow
      for (const e of net.since(cursor)) {
        cursor = e.seq;
        const isSubmit = e.rpcids.some((r) => wire.SUBMIT_RPCS.includes(r));
        if (isSubmit) {
          if (e.kind === 'request') { submitted = submitted || { t: e.t, rpc: e.rpcids[0] }; status('Flow menerima permintaan, sedang membuat…'); continue; }
          if (e.kind === 'failed') return errOut('FLOW_ERROR', e.error || 'jaringan');
          if (e.status && e.status !== 200) return errOut('FLOW_ERROR', 'HTTP ' + e.status);
          if (!e.text) continue;
          const ref = wire.refusal(e.text, wire.SUBMIT_RPCS);
          if (ref) return errOut(ref.code, ref.text, ref.suspect);
          for (const [rid, payload] of wire.frames(e.text)) {
            if (rid === wire.IMAGE_SUBMIT_RPC) {
              imageReply = imageReply || { t: e.t };
              for (const r of wire.imageRecords(payload)) if (!imgs.some((x) => x.mediaId === r.mediaId)) imgs.push(r);
            } else if (wire.VIDEO_SUBMIT_RPCS.includes(rid)) {
              for (const r of wire.generationRecords(payload)) {
                ours.wf.add(r.workflowId); ours.media.add(r.mediaId);
                if (r.failed) return errOut('GENERATE_FAILED', r.errorText || 'status ' + r.status);
              }
            }
          }
        } else if (e.kind === 'reply' && e.text && e.rpcids.some((r) => wire.STATUS_RPCS.includes(r)) && (ours.wf.size || ours.media.size)) {
          for (const [, payload] of wire.frames(e.text)) {
            for (const r of wire.generationRecords(payload)) {
              if (!ours.wf.has(r.workflowId) && !ours.media.has(r.mediaId)) continue;
              if (r.failed) return errOut('GENERATE_FAILED', r.errorText || 'status ' + r.status);
            }
          }
        }
      }
      // 2) pesan galat di halaman
      const perr = await this.call('pageError').catch(() => null);
      if (perr) return errOut(perr.suspect ? 'FLOW_UNUSUAL_ACTIVITY' : 'GENERATE_FAILED', perr.text, perr.suspect);
      const tiles = await this.call('failedTiles').catch(() => null);
      if (tiles && tiles.count > tiles0) return errOut('GENERATE_FAILED', tiles.texts[tiles.texts.length - 1]);
      // 3) daftar project: hasil baru siap?
      let fresh = null;
      if (Date.now() - lastList > 4000 || imageReply) {
        lastList = Date.now();
        const st = await this.status();
        if (st.projectId) {
          try {
            const items = await this.listMedia(st.projectId);
            fresh = items.filter((it) => !skip.has(it.mediaId));
            if (imgs.length) { const mine = fresh.filter((it) => imgs.some((x) => x.mediaId === it.mediaId)); if (mine.length) fresh = mine; }
            if (fresh.length && !firstSeen) firstSeen = Date.now();
            for (const it of fresh) {
              const r = !it.image && imgs.find((x) => x.mediaId === it.mediaId);
              if (r && isMediaUrl(r.url, this.agentCfg)) it.image = r.url; // URL dari balasan generate Flow
            }
            const ready = fresh.filter((it) => it.done && (it.image || it.video));
            if (fresh.length) status(`Hasil: ${ready.length}/${fresh.length} siap`);
            if (!wait && (submitted || fresh.length)) return { ok: true, started: true, projectId: st.projectId };
            if (fresh.length && (ready.length === fresh.length || (ready.length && Date.now() - firstSeen > 90000))) return { ok: true, items: ready, projectId: st.projectId };
            if (imgs.length && imageReply && Date.now() - imageReply.t > 15000) {
              // gambar sudah jadi menurut balasan Flow, tetapi belum muncul di daftar → pakai data balasan
              const okUrl = (u) => (isMediaUrl(u, this.agentCfg) ? u : null);
              return { ok: true, items: imgs.map((r) => ({ mediaId: r.mediaId, title: String(prompt || 'gambar').slice(0, 40), isVideo: false, done: true, image: okUrl(r.url), video: null })), projectId: st.projectId };
            }
          } catch (e) { status('Membaca galeri gagal (' + e.message + '), mencoba lagi…'); }
        }
      }
      // 4) batas waktu
      const el = Date.now() - t0;
      if (!submitted && !firstSeen && el > startMs) {
        const left = await this.call('promptText').catch(() => null);
        const stuck = prompt && left && left.replace(/\s+/g, ' ').trim() === String(prompt).replace(/\s+/g, ' ').trim();
        const credits = await this.call('creditsWarning').catch(() => null);
        if (credits) return errOut('INSUFFICIENT_CREDITS', credits);
        return errOut('GENERATE_NOT_STARTED', null, !!stuck);
      }
      if (imageReply && !imgs.length && Date.now() - imageReply.t > 20000 && !(fresh && fresh.length)) return errOut('GENERATE_FAILED', 'Flow tidak mengembalikan gambar (kemungkinan diblokir filter keamanan)');
      if (kind === 'image' && submitted && !imageReply && !firstSeen && Date.now() - submitted.t > imageMs) return errOut('GENERATE_TIMEOUT', 'Flow tidak menjawab dalam ' + Math.round(imageMs / 1000) + ' dtk');
      if (el > timeoutMs) return errOut('GENERATE_TIMEOUT');
      if (!submitted && !firstSeen) status('Menunggu Flow memulai…');
      await sleep(1000);
    }
  }

  /** MODE OTOMATIS: klik tombol Generate Flow (klik mouse asli), cadangan: tombol Enter di kolom prompt. */
  clickGenerate() {
    return this._exclusive(async () => {
      const page = await this.ensurePage();
      let g = null;
      for (let i = 0; i < 12; i++) {
        g = await this.call('findGenerate');
        if (g && !g.disabled) break;
        await sleep(500);
      }
      if (g && !g.disabled) {
        await sleep(rand(250, 700));
        const x = g.x + rand(-g.w / 5, g.w / 5), y = g.y + rand(-g.h / 5, g.h / 5);
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await sleep(rand(80, 220));
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await sleep(rand(50, 130));
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        return { method: 'click', label: g.label };
      }
      if (g && g.disabled) throw new Error('GENERATE_DISABLED');
      await this.call('focusPrompt');
      const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...key });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
      return { method: 'enter' };
    });
  }

  /** Tunggu hasil baru muncul di project & selesai diproses. */
  async waitForNew(beforeIds, { timeoutMs = 8 * 60000, intervalMs = 6000, onProgress, shouldStop } = {}) {
    const before = new Set(beforeIds || []);
    const say = onProgress || (() => {});
    const end = Date.now() + timeoutMs;
    let firstSeen = 0;
    while (Date.now() < end) {
      if (shouldStop && shouldStop()) throw new Error('STOPPED');
      await sleep(intervalMs);
      const st = await this.status();
      if (!st.projectId) { say('Menunggu Flow membuat project…'); continue; }
      let items;
      try { items = await this.listMedia(st.projectId); } catch (e) { say('Membaca galeri gagal (' + e.message + '), mencoba lagi…'); continue; }
      const fresh = items.filter((it) => !before.has(it.mediaId));
      if (!fresh.length) { say('Flow sedang membuat…'); continue; }
      if (!firstSeen) firstSeen = Date.now();
      const ready = fresh.filter((it) => it.done && (it.image || it.video));
      say(`Hasil: ${ready.length}/${fresh.length} siap`);
      // semua siap, atau sebagian siap & tidak ada perubahan 90 detik
      if (ready.length === fresh.length || (ready.length && Date.now() - firstSeen > 90000)) return { projectId: st.projectId, items: ready };
    }
    throw new Error('GENERATE_TIMEOUT');
  }
}

module.exports = { FlowSession, DEFAULT_FLOW_URL, IMAGE_EXT, sleep, rand, fail };
