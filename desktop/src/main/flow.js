'use strict';
// Satu sesi = satu akun Google = satu profil browser asli yang menjalankan Google Flow.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { CDPConnection } = require('./cdp');
const { agentExpression } = require('./agent');
const browser = require('./browser');

const DEFAULT_FLOW_URL = 'https://flow.google.com/';
const IMAGE_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic' };
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normText = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const rand = (a, b) => a + Math.random() * (b - a);

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
    this.agentCfg = o.agentCfg || { mediaHosts: ['flow-content.google'] };
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

  async listMedia(projectId) { return this.call('listMedia', [projectId]); }
  async getMedia(mediaId) { return this.call('getMedia', [mediaId]); }

  /** Ambil file media (Buffer). Coba langsung dulu (URL bertanda tangan), lalu lewat tab Flow (cookie pengguna). */
  async fetchMedia(url) {
    const u = new URL(url);
    if (!this.agentCfg.mediaHosts.includes(u.hostname)) throw new Error('INVALID_URL');
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.ok) return { buffer: Buffer.from(await r.arrayBuffer()), mime: (r.headers.get('content-type') || '').split(';')[0] };
    } catch { /* lanjut lewat tab */ }
    const res = await this.call('fetchB64', [url], 180000);
    return { buffer: Buffer.from(res.b64, 'base64'), mime: (res.mime || '').split(';')[0] };
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
   * Jalur lengkap satu generate: (project baru bila perlu) → setelan → gambar → prompt → Generate → konfirmasi → tunggu hasil.
   * Mode tersembunyi yang ditolak Flow otomatis diulang sekali di jendela diperkecil.
   * hooks: { onLog, shouldStop, timeoutMs, wait, onFallback }
   */
  async generate(job, hooks = {}) {
    const say = hooks.onLog || (() => {});
    const stop = () => { if (hooks.shouldStop && hooks.shouldStop()) throw new Error('STOPPED'); };
    for (let attempt = 0; ; attempt++) {
      await this.beginWork();
      let res;
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
        const before = st.projectId ? (await this.listMedia(st.projectId)).map((i) => i.mediaId) : [];
        stop();
        let settings = null;
        if (job.options && job.options.apply !== false) {
          say('Menerapkan setelan Flow (mode, model, rasio)…');
          settings = await this.applySettings(job.options);
          await sleep(rand(400, 900));
        }
        stop();
        if (job.images && job.images.length) {
          say(`Melampirkan ${job.images.length} gambar…`);
          await this.sendImages(job.images);
          await sleep(rand(2500, 4500));
        }
        stop();
        if (job.prompt) {
          say('Menulis prompt…');
          await this.sendPrompt(job.prompt);
          await sleep(rand(1000, 2600));
        }
        stop();
        say('Menekan Generate…');
        const click = await this.clickGenerate();
        say('Memastikan Flow mulai membuat…');
        const v = await this.confirmStarted(before, job.prompt);
        if (v.error) {
          if (this.mode === 'hidden' && v.suspect && attempt === 0) {
            say('Flow menolak di mode tersembunyi — beralih otomatis ke jendela diperkecil…');
            if (hooks.onFallback) await hooks.onFallback(v);
            await this.relaunch('minimized');
            continue;
          }
          const e = new Error(v.error === 'NOT_STARTED' ? 'GENERATE_NOT_STARTED' : 'FLOW_ERROR');
          e.detail = v.error;
          throw e;
        }
        res = { click, settings, before, projectId: st.projectId, mode: this.mode, fellBack: attempt > 0 };
        if (hooks.wait === false) return res;
      } finally { await this.endWork(); }
      const out = await this.waitForNew(res.before, { timeoutMs: hooks.timeoutMs || 8 * 60000, onProgress: say, shouldStop: hooks.shouldStop });
      return { ...res, items: out.items, projectId: out.projectId };
    }
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
    for (const p of paths) {
      if (!IMAGE_EXT[path.extname(p).toLowerCase()]) throw new Error('INVALID_IMAGE');
      const st = fs.statSync(p);
      if (!st.isFile() || st.size > 30 * 1024 * 1024) throw new Error('INVALID_IMAGE');
    }
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

module.exports = { FlowSession, DEFAULT_FLOW_URL, IMAGE_EXT, sleep, rand };
