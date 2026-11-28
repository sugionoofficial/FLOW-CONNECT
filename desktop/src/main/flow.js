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
const { checkFrames } = require('./catalog');
const { sanitizeStudio } = require('./store');
const { formatPage, parseDecision, GOALS } = require('./pagereader');

const DEFAULT_FLOW_URL = 'https://flow.google.com/';
const IMAGE_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic' };
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm' };

// galat AI pembaca halaman yang tidak akan hilang bila dicoba lagi sebentar kemudian
const AI_FATAL = new Set(['LICENSE_REQUIRED', 'INVALID_KEY', 'REVOKED', 'EXPIRED', 'INVALID_DEVICE', 'DAILY_LIMIT', 'NO_MODEL', 'NO_API_KEY', 'PAGE_READER_OFF', 'UNSUPPORTED_PROVIDER']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normText = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const rand = (a, b) => a + Math.random() * (b - a);
const fail = (code, detail, extra) => { const e = new Error(code); if (detail) e.detail = String(detail).slice(0, 300); if (extra) Object.assign(e, extra); return e; };
const KEYS = {
  Enter: { code: 'Enter', vk: 13, text: '\r' }, Escape: { code: 'Escape', vk: 27 }, Backspace: { code: 'Backspace', vk: 8 },
  ArrowDown: { code: 'ArrowDown', vk: 40 }, ArrowUp: { code: 'ArrowUp', vk: 38 }, End: { code: 'End', vk: 35 }, Tab: { code: 'Tab', vk: 9 },
  Home: { code: 'Home', vk: 36 }, ArrowLeft: { code: 'ArrowLeft', vk: 37 }, ArrowRight: { code: 'ArrowRight', vk: 39 }
};

/** Setelan tugas → setelan yang sah (model yang ada di Flow, durasi per model, mode Frame/Bahan); cek frame wajib. */
function jobOptions(job) {
  const options = job.options ? sanitizeStudio(job.options) : null;
  checkFrames(options, job.images);
  return { ...job, options };
}

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

/** Domain cookie milik Google (google.com, *.google, googleusercontent.com, …). */
function isGoogleCookieDomain(domain) {
  const d = String(domain || '').toLowerCase().replace(/^\./, '');
  return /(^|\.)(google\.com|google|googleusercontent\.com|withgoogle\.com|usercontent\.goog)$/.test(d);
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
    this._refCache = new Map(); // "project|file|ukuran|waktu" → hasil unggah (Bulk: gambar yang sama cukup diunggah sekali per project)
    // hasil generate yang dikembalikan Flow ke aplikasi, per project → tetap tampil di galeri walau daftar Flow terlambat/berubah
    this.known = o.known || new Map();
    this.extraArgs = o.extraArgs || [];
    this.getMode = o.getMode || (() => 'normal');
    this.loginUrl = o.loginUrl || 'https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent(this.flowUrl.replace(/[?&]hl=[^&]*/, ''));
    this.pageReader = o.pageReader || null; // async ({text, image}) → {reply, model} — AI pembaca halaman (opsional)
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

  /** Buka browser biasa TANPA kendali (cadangan login manual — jendela browser lengkap). */
  async openForLogin() {
    const exe = this.getBrowser().path;
    await this.freeProfile();
    browser.launchBrowser({ exe, profileDir: this.profileDir, url: this.loginUrl, plain: true, extraArgs: this.extraArgs });
  }

  /**
   * Pastikan TIDAK ada proses browser yang masih memakai profil ini (yang dikenal aplikasi maupun yang "tertinggal").
   * Wajib sebelum browser polos untuk login: bila masih ada proses lama berport debug, Chrome menyerahkan halaman login
   * ke proses itu dan Google menolak ("This browser or app may not be secure").
   * @returns {Promise<{killed:number, debug:boolean}>}
   */
  async freeProfile() {
    const running = this.port || await browser.existingDebugPort(this.profileDir);
    if (running) { this.port = running; await this.closeBrowser(); }
    if (this.cardChild) await browser.closeGracefully(this.cardChild, null, 5000);
    await browser.waitForExit(this.profileDir, running ? 15000 : 3000);
    const r = await browser.killProfile(this.profileDir).catch(() => ({ killed: 0, debug: false }));
    return { killed: r.killed + (running ? 1 : 0), debug: r.debug || !!running };
  }

  /**
   * KARTU LOGIN GOOGLE: jendela kecil tanpa bilah alamat (--app) yang langsung membuka halaman login Google asli.
   * Browser dijalankan POLOS: tanpa port debug/CDP (bila ada, Chrome menyalakan navigator.webdriver dan Google
   * menolak: "This browser or app may not be secure"). Aplikasi hanya membaca log jaringan Chrome untuk tahu kapan
   * Google mengalihkan ke Flow, lalu menutup kartu dengan wajar (cookie login tersimpan) dan menghapus log itu.
   * Sebelum kartu dibuka, SEMUA proses lama profil ini ditutup (lihat freeProfile). Bila Google tetap menampilkan
   * halaman penolakan, kartu dibuka ulang sekali di proses yang benar-benar baru; masih ditolak → LOGIN_REJECTED.
   * @returns {Promise<{ok:boolean, closed?:boolean}>}
   */
  async loginCard({ card, timeoutMs = 10 * 60000, shouldStop } = {}) {
    let freed = await this.freeProfile();
    const end = Date.now() + timeoutMs;
    try {
      for (let attempt = 0; ; attempt++) {
        const r = await this._loginCardOnce({ card, end, shouldStop });
        if (!r.rejected) return r;
        if (attempt >= 1) {
          throw fail('LOGIN_REJECTED', freed.debug ? 'browser lama akun ini sudah ditutup, tetapi Google tetap menolak' : 'Google menolak browser ini untuk akun ini');
        }
        this._setLogin('retry');
        const again = await this.freeProfile();
        freed = { killed: freed.killed + again.killed, debug: freed.debug || again.debug };
        await sleep(1500);
      }
    } finally {
      if (this.loginState !== 'done') this._setLogin(null);
    }
  }

  async _loginCardOnce({ card, end, shouldStop }) {
    const netLog = path.join(this.profileDir, 'fc-login-netlog.json');
    try { fs.rmSync(netLog, { force: true }); } catch { /* tidak ada */ }
    this._setLogin('card');
    const child = browser.launchBrowser({ exe: this.getBrowser().path, profileDir: this.profileDir, url: this.loginUrl, plain: true, app: true, mode: 'card', card, netLog, extraArgs: this.extraArgs });
    this.cardChild = child;
    let spawnError = null;
    child.once('error', (e) => { spawnError = e; });
    const log = new browser.NetLogReader(netLog);
    let flow = false, rejected = false;
    const scan = () => {
      for (const u of log.read()) {
        if (this._isFlowUrl(u) && !u.startsWith(this.loginUrl)) flow = true;
        else if (browser.isLoginRejectedUrl(u)) rejected = true;
      }
    };
    try {
      while (Date.now() < end) {
        if (spawnError) throw new Error('BROWSER_LAUNCH_FAILED');
        if (shouldStop && shouldStop()) { await browser.closeGracefully(child, this.profileDir); return { ok: false, closed: true }; }
        scan();
        if (flow) {
          this._setLogin('done');
          await sleep(2500); // biarkan Flow selesai memuat & menyimpan sesinya
          await browser.closeGracefully(child, this.profileDir);
          return { ok: true };
        }
        if (rejected) {
          // Google: "This browser or app may not be secure" → tutup kartu ini, coba lagi di proses baru
          await sleep(1200);
          await browser.closeGracefully(child, this.profileDir, 5000);
          return { ok: false, rejected: true };
        }
        if (await browser.waitChild(child, 0)) {
          // kartu ditutup pengguna — mungkin setelah login selesai
          await browser.waitForExit(this.profileDir);
          scan();
          if (flow) { this._setLogin('done'); return { ok: true }; }
          if (rejected) return { ok: false, rejected: true };
          return { ok: false, closed: true };
        }
        await sleep(500);
      }
      await browser.closeGracefully(child, this.profileDir);
      throw new Error('LOGIN_TIMEOUT');
    } finally {
      if (this.cardChild === child) this.cardChild = null;
      await browser.waitForExit(this.profileDir);
      try { fs.rmSync(netLog, { force: true }); } catch { /* dihapus nanti */ }
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
      // proses berport debug yang "tertinggal" (file port hilang) → tutup dulu, jika tidak peluncuran baru diserahkan ke sana
      const orphans = await browser.profileProcesses(this.profileDir).catch(() => []);
      if (orphans.some((p) => p.debug)) await browser.killProfile(this.profileDir).catch(() => {});
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
    try {
      const u = new URL(t.url);
      // tab alat Flow (flow.google.com/shared/tool/…) bukan tab kerja Studio
      return t.type === 'page' && u.host === this.flowHost && !u.pathname.startsWith('/shared/');
    } catch { return false; }
  }

  /**
   * Buka alat Google Flow (flow.google.com/shared/tool/…) di tab baru browser akun ini — jendela DITAMPILKAN
   * karena alatnya interaktif. Tab kerja Studio tidak diganggu.
   */
  async openTool(url) {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:' || u.host !== this.flowHost || !/^\/shared\/tool\/[0-9a-f-]{36}$/.test(u.pathname)) throw new Error('INVALID_URL');
    await this.bringToFront();
    const b = await this._browser();
    const { targetId } = await b.send('Target.createTarget', { url: u.toString() });
    await b.send('Target.activateTarget', { targetId }).catch(() => {});
    return { targetId };
  }

  /**
   * Cookie akun Google profil ini (untuk jendela alat di dalam aplikasi — browser tetap tersembunyi).
   * Hanya domain Google; cookie terpartisi (CHIPS) dilewati.
   */
  async exportCookies() {
    const b = await this._browser();
    const r = await b.send('Storage.getCookies', {});
    return (r.cookies || []).filter((c) => isGoogleCookieDomain(c.domain) && !c.partitionKey);
  }

  /** User-Agent & Client Hints bersih (tanpa "HeadlessChrome") dari browser profil ini. */
  async userAgentInfo() {
    if (!this.ua) {
      const v = await (await this._browser()).send('Browser.getVersion');
      this.ua = browser.cleanUserAgent(v.product, (this.getBrowser() || {}).path || '');
    }
    return this.ua;
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

  /**
   * Isi project Flow: hasil generate saja (gambar referensi yang diunggah disaring), kecuali { uploads: true }.
   * Digabung dengan hasil yang sudah dikembalikan Flow ke aplikasi ({ known: false } untuk daftar Flow saja).
   */
  async listMedia(projectId, { uploads = false, known = true } = {}) {
    let items;
    const mine = known ? (this.known.get(projectId) || []) : [];
    try { items = await this.call('listMedia', [projectId]); } catch (e) { if (!mine.length) throw e; items = []; }
    if (mine.length) {
      const byId = new Map(items.map((i) => [i.mediaId, i]));
      for (const k of mine) {
        const cur = byId.get(k.mediaId);
        if (cur) { // lengkapi data daftar Flow dengan URL dari balasan generate
          if (!cur.image && k.image) cur.image = k.image;
          if (!cur.video && k.video) cur.video = k.video;
          cur.isVideo = !!k.isVideo; // hasil generate aplikasi: jenisnya pasti
          delete cur.upload;
          if (!cur.done && (k.image || k.video) && !cur.isVideo) cur.done = true;
        } else items.push({ ...k });
      }
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return uploads ? items : items.filter((i) => !i.upload && !this.uploads.has(i.mediaId) && !UPLOAD_TITLE.test((i.title || '').trim()));
  }

  /** Catat hasil generate yang dikembalikan Flow (maks. 200 per project). */
  _remember(projectId, items) {
    if (!projectId || !Array.isArray(items) || !items.length) return;
    const now = Date.now();
    const list = (this.known.get(projectId) || []).slice();
    items.forEach((it, i) => {
      if (!it || !/^[A-Za-z0-9-]{1,128}$/.test(it.mediaId || '') || this.uploads.has(it.mediaId)) return;
      const rec = { mediaId: it.mediaId, title: String(it.title || '').slice(0, 80), isVideo: !!it.isVideo, done: true, image: it.image || null, video: it.video || null, createdAt: it.createdAt || now - i };
      const at = list.findIndex((x) => x.mediaId === rec.mediaId);
      if (at >= 0) list[at] = { ...list[at], ...rec, createdAt: list[at].createdAt || rec.createdAt }; else list.unshift(rec);
    });
    this.known.set(projectId, list.slice(0, 200));
    this.emit('results', projectId, this.known.get(projectId));
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
    let got;
    try { got = await this.fetchMedia(url); } catch (e) {
      // URL bertanda tangan bisa kedaluwarsa → minta URL baru dari record media Flow
      const m = await this.getMedia(item.mediaId).catch(() => ({}));
      const fresh = item.isVideo ? (m.video || m.image) : (m.image || m.video);
      if (!fresh || fresh === url) throw e;
      got = await this.fetchMedia(fresh);
    }
    const { buffer, mime } = got;
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
    // kartu yang tidak bisa ditutup dengan Escape (mis. "What's new" Flow: panah → … → Get started)
    if (await this.call('overlayOpen').catch(() => false)) await this._dismissOnboarding();
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

  /**
   * Baca saldo kredit Google Flow akun ini: buka panel "Account details" → baca "N Google Flow credits"
   * (paket Google AI: "N AI credits") → tutup panel lewat "Close account panel" (panel ini tidak tertutup dengan Escape).
   * HANYA membaca — panel itu juga memuat "Sign out", jadi tidak ada klik lain selain tombol buka & tutup panel.
   * Gagal sekali → halaman Flow dimuat ulang lalu dicoba lagi. Galat CREDITS_NOT_FOUND membawa cuplikan isi panel.
   * @returns {Promise<number>}
   */
  readCredits({ timeoutMs = 8000 } = {}) {
    return this._exclusive(async () => {
      await this.beginWork();
      let detail = null;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt) {
            const st = await this.status().catch(() => ({}));
            await this.navigate(st.projectId ? `https://flow.google.com/project/${st.projectId}?hl=en` : this.flowUrl).catch(() => {});
            await sleep(2500);
          }
          await this._closeAccountPanel();
          await this.call('scrollTopPage').catch(() => {});
          let v = await this.call('creditsBalance').catch(() => null); // saldo kadang sudah tampil di halaman
          if (!v) {
            const b = await this._waitFor(() => this.call('accountDetailsButton'), 6000, 400);
            if (!b) { detail = 'tombol "Account details" tidak ditemukan di halaman Flow'; continue; }
            await this._click(b);
            v = await this._waitFor(() => this.call('creditsBalance'), timeoutMs, 300);
            if (!v) {
              const txt = await this.call('accountPanelText').catch(() => '');
              detail = txt ? `panel akun: "${txt}"` : 'panel akun tidak terbuka';
            }
            await this._closeAccountPanel();
          }
          if (v && Number.isFinite(v.credits)) return v.credits;
        }
        const e = new Error('CREDITS_NOT_FOUND');
        e.detail = detail;
        throw e;
      } finally { await this.endWork(); }
    });
  }

  /** Tutup panel akun Flow (tombol "Close account panel"), lalu menu/popover lain dengan Escape. */
  async _closeAccountPanel() {
    for (let i = 0; i < 2; i++) {
      const c = await this.call('accountPanelClose').catch(() => null);
      if (!c) break;
      await this._click(c);
      await sleep(400);
    }
    await this._closeOverlays();
  }

  /**
   * Buka project Flow baru yang kosong.
   * Dengan AI pembaca halaman (pageReader): setiap langkah halaman dibaca (teks, daftar tombol bernomor, tangkapan layar)
   * dan model AI memilih tombol — kartu sambutan / persetujuan / "What's new", bahasa akun apa pun. Pilihan AI diperiksa
   * ulang (id ada di daftar, label sama, bukan Sign out / langganan / beli) dan "New project" tidak pernah ditekan dua kali
   * sebelum klik pertama selesai diproses. AI tidak tersedia (tanpa lisensi, batas harian, jaringan) → cara biasa:
   * pola tombol yang dikenal, dialog sambutan ditutup, beranda berbahasa Inggris bila tombol tidak terbaca.
   * Flow tidak tersedia untuk akun ini → FLOW_UNAVAILABLE dengan teks dari Flow.
   */
  newProject({ timeoutMs = 25000 } = {}) {
    return this._exclusive(async () => {
      await this.beginWork();
      try {
        const st0 = await this.status();
        // dari dalam project: kembali ke beranda Flow dulu
        if (st0.projectId) await this.navigate(this.flowUrl);
        const ai = this._aiState();
        const done = async (st) => {
          await this.ensurePage(); await this.waitReady();
          // kartu "What's new" / sambutan sering muncul sesaat SETELAH project terbuka → tunggu sebentar
          await this._waitFor(async () => (await this.call('onboardingTarget')) || (ai.on() && await this.call('overlayOpen')), 3500, 400);
          if (ai.on()) await this._aiClear(ai);
          await this._dismissOnboarding();
          return { projectId: st.projectId, projectTitle: st.projectTitle, ...(ai.used ? { ai: { steps: ai.steps, model: ai.model } } : {}) };
        };
        // tunggu project terbuka; status selalu diperiksa sekali lagi sebelum menyerah → tidak pernah membuat 2 project.
        // onb: dialog sambutan ditangani dengan pola (hanya bila AI tidak dipakai)
        const opened = async (ms, onb = true) => {
          const end = Date.now() + ms;
          let lastOnb = Date.now();
          for (;;) {
            const x = await this.status().catch(() => ({}));
            if (x.projectId) return x;
            if (Date.now() >= end) return null;
            if (onb && Date.now() - lastOnb >= 3000) { // tidak di tengah navigasi sesaat setelah klik
              lastOnb = Date.now();
              const o = await this.call('onboardingTarget', [], 5000).catch(() => null);
              if (o) { await this._click(o).catch(() => {}); await sleep(rand(800, 1200)); continue; }
            }
            await sleep(500);
          }
        };
        let clicked = false, english = false, heur = 0, blockedVotes = 0, lastClick = null;
        for (let round = 0; round < 24 && heur < 6; round++) {
          // klik sebelumnya mungkin masih diproses (PC/jaringan lambat) → jangan sampai membuat 2 project
          if (clicked) { const late = await opened(4000, !ai.on()); if (late) return done(late); }
          // 1) AI membaca halaman dan memilih langkah berikutnya
          if (ai.on()) {
            const now = await this.status().catch(() => ({}));
            if (now.projectId) return done(now);
            const d = await this._aiDecide(GOALS.newProject, ai);
            if (d) {
              if (d.action === 'blocked') {
                const b = await this.call('flowBlocked').catch(() => null);
                if (b || ++blockedVotes >= 2) throw fail('FLOW_UNAVAILABLE', b ? b.text : d.reason);
                ai.note(`you said "blocked" (${d.reason}); look again — answer "blocked" again only if Flow really shows that message`);
                await sleep(1500);
                continue;
              }
              blockedVotes = 0;
              if (d.action === 'wait') { ai.note('waited'); await sleep(1800); await this.waitReady(6000); continue; }
              if (d.action === 'done') {
                const st = await this.status().catch(() => ({}));
                if (st.projectId) return done(st);
                ai.note('you said "done" but no project is open (the address has no /project/) — find the new project button');
                continue;
              }
              const t = await this.call('navTarget', [d.id, d.el.label]).catch(() => null);
              if (!t) { ai.note(`#${d.id} could not be clicked (the page changed); read the page again`); continue; }
              if (t.kind === 'new' && clicked) { const late = await opened(timeoutMs, false); if (late) return done(late); }
              // tombol yang sama dengan klik terakhir sementara halaman belum berubah sejak itu: klik pertama mungkin masih
              // diproses (mis. tombol project baru berbahasa lain) → tunggu dulu, baca ulang halaman, baru boleh klik lagi
              const key = `${d.el.role}|${d.el.label}|${d.el.icon}`;
              if (lastClick && lastClick.key === key && !lastClick.waited) {
                const cur = await this.call('pageSig').catch(() => null);
                if (cur && cur === lastClick.sig) {
                  lastClick.waited = true;
                  const st = await this._waitFor(async () => {
                    const x = await this.status().catch(() => ({}));
                    if (x.projectId) return x;
                    return (await this.call('pageSig').catch(() => cur)) !== cur ? { changed: true } : null;
                  }, 8000, 500);
                  if (st && st.projectId) return done(st);
                  ai.note(`you chose #${d.id} again right after clicking it; waited for the page — read it again`);
                  continue;
                }
              }
              const before = await this.call('pageSig').catch(() => null);
              await sleep(rand(250, 500));
              await this._click(t);
              const name = d.el.label ? `"${d.el.label}"` : `icon ${d.el.icon || '?'}`;
              if (t.kind === 'new') {
                clicked = true;
                ai.note(`clicked #${d.id} ${name} (new project button) — do not press it again; wait for the project to open`);
                const st = await opened(timeoutMs, false);
                if (st) return done(st);
                continue;
              }
              const st = await opened(2500, false);
              if (st) return done(st);
              await this.waitReady(6000);
              const after = await this.call('pageSig').catch(() => null);
              lastClick = { key, sig: after, waited: false };
              ai.note(`clicked #${d.id} ${name} → ${before && before === after ? 'nothing visible changed' : 'the page changed'}`);
              continue;
            }
            // jawaban AI tidak terpakai / AI tidak tersedia → langkah ini memakai cara biasa
          }
          // 2) cara biasa (tanpa AI): pola tombol yang dikenal
          heur++;
          await this._dismissOnboarding();
          const blocked = await this.call('flowBlocked').catch(() => null);
          if (blocked) throw fail('FLOW_UNAVAILABLE', blocked.text);
          let t = await this._waitFor(() => this.call('newProjectTarget'), 8000, 400);
          if (!t && await this._dismissOnboarding()) t = await this._waitFor(() => this.call('newProjectTarget'), 6000, 400);
          if (!t) {
            if (english) break;
            english = true; // bahasa akun yang tidak dikenali → beranda Flow berbahasa Inggris
            const u = new URL(this.flowUrl);
            u.searchParams.set('hl', 'en');
            await this.navigate(u.toString()).catch(() => {});
            await sleep(1500);
            continue;
          }
          await sleep(rand(250, 600));
          await this._click(t);
          if (t.kind === 'cta') { await sleep(2500); await this.waitReady(); continue; }
          clicked = true;
          const st = await opened(timeoutMs);
          if (st) return done(st);
        }
        if (clicked) { const late = await opened(4000); if (late) return done(late); }
        const fin = await this.status();
        if (!fin.signedIn) throw new Error('NOT_SIGNED_IN');
        const sum = await this.call('pageSummary').catch(() => null);
        throw fail('NEW_PROJECT_NOT_FOUND', sum ? `halaman ${sum.path}${sum.heading ? ` "${sum.heading}"` : ''}${sum.buttons.length ? ` · tombol: ${sum.buttons.join(', ')}` : ''}` : null,
          ai.lastError ? { aiError: ai.lastError } : undefined);
      } finally { await this.endWork(); }
    });
  }

  // ---------- AI pembaca halaman ----------
  _aiState() {
    const ai = {
      steps: 0, fails: 0, history: [], used: false, model: null, lastError: null,
      on: () => !!this.pageReader && ai.fails < 3 && ai.steps < 14 && !(this._aiOffUntil > Date.now()),
      note: (h) => { ai.history.push(String(h).slice(0, 200)); }
    };
    return ai;
  }

  /** Baca halaman (daftar elemen + tangkapan layar bernomor) → keputusan AI yang sudah diperiksa, atau null. */
  async _aiDecide(goal, ai) {
    ai.steps++;
    let map;
    try { map = await this.call('pageMap', [], 10000); } catch { ai.fails++; return null; }
    let image = null;
    if (!this._noShot) {
      try {
        await this.call('navMarks', [true], 5000);
        const page = await this.ensurePage();
        const scale = Math.min(1, 1280 / Math.max(1, map.vw));
        const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 55, clip: { x: 0, y: 0, width: map.vw, height: map.vh, scale } }, 8000);
        if (shot && shot.data && shot.data.length < 4000000) image = 'data:image/jpeg;base64,' + shot.data;
      } catch { this._noShot = true; /* jendela diperkecil tidak selalu bisa difoto → cukup teks halaman */ }
      finally { await this.call('navMarks', [false], 5000).catch(() => {}); }
    }
    let r;
    try {
      r = await this.pageReader({ text: formatPage(goal, ai.history, map), image });
    } catch (e) {
      ai.fails++;
      ai.lastError = e.message;
      // tidak ada lisensi / batas harian / dimatikan admin → jangan dicoba lagi selama 10 menit
      if (AI_FATAL.has(e.message)) { ai.fails = 99; this._aiOffUntil = Date.now() + 10 * 60 * 1000; }
      this.emit('ai', { error: e.message });
      return null;
    }
    ai.used = true;
    ai.model = (r && r.model && r.model.label) || ai.model;
    const d = parseDecision(r && r.reply, map);
    if (!d) {
      ai.fails++;
      ai.note('your previous answer could not be used — reply with ONE JSON object and only ids from the list');
      return null;
    }
    ai.fails = 0;
    this.emit('ai', { action: d.action, label: d.el ? (d.el.label || (d.el.icon ? `ikon ${d.el.icon}` : `#${d.id}`)) : '', reason: d.reason, model: ai.model });
    return d;
  }

  /** Setelah project terbuka: AI menutup kartu / dialog yang menutupi editor (hanya elemen di dalam dialog). */
  async _aiClear(ai) {
    for (let i = 0; i < 8 && ai.on(); i++) {
      if (!(await this.call('overlayOpen').catch(() => false))) return;
      const d = await this._aiDecide(GOALS.clearProject, ai);
      if (!d) continue;
      if (d.action === 'done' || d.action === 'blocked') return;
      if (d.action === 'wait') { await sleep(1200); continue; }
      if (!d.el.dialog) { ai.note(`#${d.id} is not inside the card/dialog — only close the card`); continue; }
      const t = await this.call('navTarget', [d.id, d.el.label]).catch(() => null);
      if (!t || t.kind === 'new') { ai.note(`#${d.id} could not be clicked`); continue; }
      await sleep(rand(200, 400));
      await this._click(t);
      await sleep(rand(800, 1100));
      ai.note(`clicked #${d.id} ${d.el.label ? `"${d.el.label}"` : `icon ${d.el.icon || '?'}`}`);
    }
  }

  /** Tutup dialog sambutan / persetujuan / kartu "What's new" Flow (maks. 16 langkah). Mengembalikan jumlah klik. */
  async _dismissOnboarding() {
    let n = 0;
    const cookie = await this.call('cookieReject').catch(() => null);
    if (cookie) { await this._click(cookie); await sleep(500); n++; }
    for (let i = 0; i < 16; i++) {
      const t = await this.call('onboardingTarget').catch(() => null);
      if (!t) break;
      await sleep(rand(200, 450));
      await this._click(t);
      n++;
      await sleep(rand(700, 1100));
    }
    return n;
  }

  /** Pilih radio/opsi di panel setelan Flow. Mengembalikan true bila sudah/berhasil dipilih. */
  async _pick(spec) {
    const t = await this.call('find', [spec]);
    if (!t || t.disabled) return false;
    if (!t.checked) { await this._click(t); await sleep(rand(300, 550)); }
    return true;
  }

  /** Durasi berupa penggeser ("Durasi 10 Dtk"): fokus lalu tombol keyboard asli (End/Home/panah). */
  async _setDuration(target) {
    const s0 = await this.call('durationSlider');
    if (!s0) return false;
    if (s0.now === target) return true;
    if (target < s0.min || target > s0.max) return false;
    await this.call('focusDurationSlider');
    await sleep(rand(120, 250));
    if (target === s0.max) await this._key('End');
    else if (target === s0.min) await this._key('Home');
    else {
      for (let i = 0; i < 30; i++) {
        const s = await this.call('durationSlider');
        if (!s || s.now === target) break;
        await this._key(s.now < target ? 'ArrowRight' : 'ArrowLeft');
        await sleep(rand(80, 160));
      }
    }
    await sleep(rand(250, 400));
    const s1 = await this.call('durationSlider');
    return !!s1 && s1.now === target;
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
   * opts: { kind:'video'|'image', sub:'frames'|'ingredients', model, ratio:'16:9', count:1-4, duration:8|10 }
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
    if (want.kind !== 'image' && Number(opts.duration) >= 1 && Number(opts.duration) <= 30) want.duration = Number(opts.duration);
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
      }
      // model dulu: rentang durasi (Omni 10 dtk / Veo 8 dtk) bergantung pada model
      if (want.model && await this._pickModel(want.model)) applied.model = want.model;
      if (want.ratio && await this._pick({ roles: ['radio', 'tab', 'option', 'menuitemradio', 'button'], re: '(^|[^\\d])' + want.ratio.replace(':', '\\s?:\\s?') + '([^\\d]|$)', scope: 'overlay' })) applied.ratio = want.ratio;
      if (want.count && await this._pick({ roles: ['radio', 'tab', 'option', 'menuitemradio', 'button'], re: '^(x\\s?' + want.count + '|' + want.count + 'x|' + want.count + ' (outputs?|hasil))$', scope: 'overlay' })) applied.count = want.count;
      if (want.duration && (await this._pick({ roles: ['radio', 'tab', 'option', 'menuitemradio', 'button'], re: '^' + want.duration + '\\s?(s|sec|secs|seconds?|detik|dtk|秒)$', scope: 'overlay' }) || await this._setDuration(want.duration))) applied.duration = want.duration;
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
    job = jobOptions(job);
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
        await this.ensureGrid(say);
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
        // tepat sebelum Generate: masih di grid? (bukan tampilan edit / kartu terpilih / Flow Agent) — kalau tidak, batal
        const vs = await this.call('viewState').catch(() => null);
        if (vs && ((vs.sub && vs.sub !== this._gridSub) || vs.agent)) {
          await this.ensureGrid(say).catch(() => {});
          throw fail('FLOW_EDIT_MODE', vs.sub ? vs.path : 'Flow Agent aktif');
        }
        const credits = await this.call('creditsWarning').catch(() => null);
        if (credits) throw fail('INSUFFICIENT_CREDITS', credits);
        const before = (await this.listMedia(st.projectId).catch(() => [])).map((i) => i.mediaId);
        const tiles0 = ((await this.call('failedTiles').catch(() => null)) || { count: 0 }).count;
        // pesan galat yang SUDAH tampil sebelum Generate (sisa tugas sebelumnya) tidak boleh menggagalkan tugas ini
        const errs0 = ((await this.call('pageErrors').catch(() => null)) || []).map((e) => e.text);
        const net = await this._net();
        const mark = net.mark();
        await sleep(rand(600, 1400));
        say('Menekan Generate…');
        const click = await this.clickGenerate();
        res = { click, settings, refs: prep.refs, mentions: prep.mentions, projectId: st.projectId, mode: this.mode, fellBack: attempt > 0 };
        say('Memastikan Flow mulai membuat…');
        // tunggu sampai permintaan generate benar-benar terkirim selagi jendela masih "aktif"
        obs = await this.observe({ mark, before, exclude: prep.refs.map((r) => r.mediaId), kind: spec.kind, prompt: job.prompt, wait: false, startMs: spec.startMs, tiles0, errs0, shouldStop: hooks.shouldStop });
        if (obs.ok && hooks.wait !== false) {
          await this.endWork();
          obs = await this.observe({ mark, before, exclude: prep.refs.map((r) => r.mediaId), kind: spec.kind, prompt: job.prompt, wait: true, timeoutMs: hooks.timeoutMs || 8 * 60000, imageMs: spec.imageMs, tiles0, errs0, onProgress: say, shouldStop: hooks.shouldStop });
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
      const projectId = obs.projectId || res.projectId;
      if (obs.items) this._remember(projectId, obs.items);
      return { ...res, items: obs.items || null, projectId };
    }
  }

  /**
   * Pastikan Flow berada di GRID project (generate biasa), bukan tampilan edit gambar/video (/project/<id>/edit/…),
   * tanpa kartu terpilih dan dengan "Flow Agent" mati. Di tampilan edit, prompt MENGEDIT gambar (mis. foto referensi
   * yang baru diunggah) dan hasilnya menumpuk sebagai versi di bawah satu kartu — itu yang tidak boleh terjadi.
   * → state akhir | throw FLOW_EDIT_MODE bila tetap tidak bisa keluar.
   */
  async ensureGrid(say = () => {}) {
    let vs = null;
    for (let a = 0; a < 3; a++) {
      vs = await this.call('viewState').catch(() => null);
      if (!vs) return null; // agen belum siap (halaman bukan Flow) — biarkan langkah berikut yang melapor
      if (a === 0 && !vs.composer) vs = (await this.waitComposer(15000)) || vs; // halaman masih menggambar
      if (vs.sub && vs.sub !== 'edit' && vs.sub === this._gridSub) vs.sub = null; // sub-halaman yang memang grid project
      if (!vs.sub && !vs.selected && !vs.agent) return vs;
      if (vs.sub) {
        say(`Flow sedang di tampilan ${vs.sub === 'edit' ? 'edit gambar' : vs.sub} — kembali ke grid project (tidak mengedit)…`);
        await this._closeOverlays();
        const st = await this.status();
        const u = new URL(st.url);
        const m = /^(.*\/project\/[A-Za-z0-9-]{1,128})/.exec(u.pathname);
        if (m) {
          u.pathname = m[1];
          await this.navigate(u.toString());
        } else if (vs.back) { await this._click(vs.back); await sleep(1500); }
        // halaman Flow (Angular) baru menggambar kotak prompt & tombol "+" beberapa detik SETELAH dimuat
        const after = await this.waitComposer();
        // Flow mengalihkan kembali ke sub-halaman yang sama (bukan tampilan edit) → itulah grid project-nya
        if (after && after.sub && after.sub !== 'edit' && after.path === vs.path) { this._gridSub = after.sub; return after; }
        continue;
      }
      if (vs.agent) {
        say('Mematikan Flow Agent (generate biasa)…');
        await this._click(vs.agent);
        await sleep(800);
      }
      if (vs.selected) {
        say('Membatalkan pilihan kartu di grid Flow…');
        if (vs.clearSel) await this._click(vs.clearSel); else await this._escape();
        await sleep(600);
      }
    }
    vs = await this.call('viewState').catch(() => vs);
    if (vs && vs.sub && vs.sub !== this._gridSub) throw fail('FLOW_EDIT_MODE', vs.path);
    return vs;
  }

  /** Tunggu kotak prompt & tombol "+" Flow tergambar (setelah memuat/berpindah halaman). → viewState | null */
  async waitComposer(timeoutMs = 25000) {
    const vs = await this._waitFor(async () => { const v = await this.call('viewState'); return v && v.composer && v.add ? v : null; }, timeoutMs, 400);
    if (vs) await sleep(rand(500, 900));
    return vs || this.call('viewState').catch(() => null);
  }

  /** MODE AMAN: siapkan Flow (setelan + unggah gambar + prompt ber-"@") — pengguna sendiri yang menekan Generate. */
  async prepare(job, say = () => {}) {
    job = jobOptions(job);
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
  async uploadReference(file, tag, { timeoutMs = 90000, say = () => {} } = {}) {
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
    // 1) "+" → menu "Upload" → dialog file (dicegat, diisi file). Halaman yang baru dimuat → tunggu tombolnya tergambar.
    let add = await this._waitFor(() => this.call('toolbarAdd'), 15000, 400);
    if (!add) {
      // masih belum ada: kembali ke grid project (bukan tampilan lain) lalu tunggu sekali lagi
      await this._closeOverlays();
      await this.ensureGrid(say).catch(() => {});
      const vs = await this.waitComposer(20000);
      add = vs && vs.add ? await this.call('toolbarAdd') : null;
    }
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
    if (!how) {
      const vs = await this.call('viewState').catch(() => null);
      throw fail('UPLOAD_BUTTON_NOT_FOUND', vs ? `${vs.path}${vs.composer ? '' : ' · kotak prompt belum tampil'}${vs.agent ? ' · Flow Agent aktif' : ''}` : null);
    }
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
    await sleep(rand(700, 1100));
    await this.ensureGrid(say); // Flow bisa membuka foto yang baru diunggah di tampilan edit → kembali ke grid
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
   *
   * job.reuseRefs (Bulk): gambar yang sudah diunggah ke project ini dipakai ulang lewat "@" tanpa diunggah lagi.
   * Bila Flow tidak lagi menawarkan gambar lama itu, semua gambar tugas ini diunggah ulang (sekali).
   */
  async prepareComposer(job, say = () => {}) {
    if (!job.reuseRefs) return this._prepareComposer(job, say, false);
    try { return await this._prepareComposer(job, say, true); } catch (e) {
      if (!e.cachedRef) throw e;
      say('Gambar lama tidak ditawarkan Flow — mengunggah ulang…');
      for (const k of e.cachedRef) this._refCache.delete(k);
      return this._prepareComposer(job, say, false);
    }
  }

  _refKey(projectId, file) {
    try { const st = fs.statSync(file); return `${projectId}|${file}|${st.size}|${Math.round(st.mtimeMs)}`; } catch { return null; }
  }

  async _prepareComposer(job, say, reuse) {
    const images = job.images || [];
    const tags = sanitizeTags(job.tags, images);
    const refs = [];
    const keep = job.reuseRefs ? ((await this.status().catch(() => ({}))).projectId || null) : null;
    const usedKeys = [];
    for (let i = 0; i < images.length; i++) {
      const key = keep ? this._refKey(keep, images[i]) : null;
      const hit = reuse && key ? this._refCache.get(key) : null;
      if (hit) {
        say(`Memakai gambar @${tags[i]} yang sudah ada di project…`);
        refs.push({ ...hit, tag: tags[i] });
        usedKeys.push(key);
        continue;
      }
      say(`Mengunggah gambar ${i + 1}/${images.length} ke Google Flow…`);
      const r = await this.uploadReference(images[i], tags[i], { say });
      refs.push(r);
      if (key) {
        if (this._refCache.size > 600) this._refCache.clear();
        this._refCache.set(key, { mediaId: r.mediaId, name: r.name, stem: r.stem, tag: r.tag });
      }
      await sleep(rand(800, 1600));
    }
    // setelah unggah: pastikan masih di grid (bukan tampilan edit foto yang baru diunggah) sebelum menulis prompt
    if (refs.length) await this.ensureGrid(say);
    // gambar pakai-ulang gagal dipasang → minta unggah ulang (lihat prepareComposer)
    const fromCache = (e) => { if (usedKeys.length) e.cachedRef = usedKeys; return e; };
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
      if (!(await this._attachFrame(r.stem))) throw fromCache(fail('FRAME_NOT_ATTACHED', '@' + r.tag));
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
        if (!(await this._mention(r.stem))) throw fromCache(fail('REFERENCE_NOT_ATTACHED', '@' + r.tag + (this.lastOffered && this.lastOffered.length ? ' (Flow menawarkan: ' + this.lastOffered.join(', ') + ')' : '')));
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
    if (chips.length < want) throw fromCache(fail('REFERENCE_NOT_ATTACHED', `${chips.length}/${want} chip`));
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
  async observe({ mark, before, exclude = [], kind, prompt, wait = true, timeoutMs = 8 * 60000, startMs = 25000, imageMs = 180000, tiles0 = 0, errs0 = [], onProgress, shouldStop }) {
    const net = await this._net();
    const say = onProgress || (() => {});
    const skip = new Set([...(before || []), ...exclude]);
    const t0 = Date.now();
    let cursor = mark, submitted = null, imageReply = null, lastList = 0, firstSeen = 0, lastSay = '';
    const ours = { wf: new Set(), media: new Set() };
    const imgs = [];
    const status = (t) => { if (t !== lastSay) { lastSay = t; say(t); } };
    const errOut = (code, detail, suspect = false) => ({ error: { code, detail: detail ? String(detail).slice(0, 300) : null, suspect } });
    let stale = new Set(errs0 || []); // pesan lama: diabaikan selama masih tampil; bila hilang lalu muncul lagi → dihitung
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
              let recs = wire.imageRecords(payload);
              if (!recs.length) recs = wire.looseImages(payload).filter((r) => !skip.has(r.mediaId)); // bentuk balasan berubah
              for (const r of recs) if (!imgs.some((x) => x.mediaId === r.mediaId)) imgs.push(r);
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
      const errs = (await this.call('pageErrors').catch(() => null)) || [];
      const perr = errs.find((x) => !stale.has(x.text));
      stale = new Set(errs.filter((x) => stale.has(x.text)).map((x) => x.text));
      // hanya "unusual activity"/captcha yang mengistirahatkan akun; "something went wrong" = gagal biasa (diulang)
      if (perr) return errOut(perr.unusual ? 'FLOW_UNUSUAL_ACTIVITY' : 'GENERATE_FAILED', perr.text, perr.suspect);
      const tiles = await this.call('failedTiles').catch(() => null);
      if (tiles && tiles.count > tiles0) return errOut('GENERATE_FAILED', tiles.texts[tiles.texts.length - 1]);
      // pindah ke tampilan edit saat menunggu → hasilnya versi editan, bukan generate baru: tidak dihitung
      if (!wait || Date.now() - lastList > 4000 || imageReply) {
        const vs = await this.call('viewState').catch(() => null);
        if (vs && vs.sub === 'edit') return errOut('FLOW_EDIT_MODE', vs.path);
      }
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
      if (imageReply && !imgs.length && Date.now() - imageReply.t > 45000 && !(fresh && fresh.length)) return errOut('GENERATE_FAILED', 'Flow tidak mengembalikan gambar (kemungkinan diblokir filter keamanan)');
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

module.exports = { FlowSession, DEFAULT_FLOW_URL, IMAGE_EXT, sleep, rand, fail, isGoogleCookieDomain };
