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
const rand = (a, b) => a + Math.random() * (b - a);

class FlowSession extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.profileDir  folder profil browser untuk akun ini
   * @param {() => {path:string}} o.getBrowser  browser terpilih
   * @param {string} [o.flowUrl]
   * @param {{mediaHosts:string[], allowHttp?:boolean}} [o.agentCfg]
   * @param {string[]} [o.extraArgs]
   */
  constructor(o) {
    super();
    this.profileDir = o.profileDir;
    this.getBrowser = o.getBrowser;
    this.flowUrl = o.flowUrl || DEFAULT_FLOW_URL;
    this.flowHost = new URL(this.flowUrl).host;
    this.agentCfg = o.agentCfg || { mediaHosts: ['flow-content.google'] };
    this.extraArgs = o.extraArgs || [];
    this.port = null;
    this.page = null;      // CDPConnection ke tab Flow
    this.pageTarget = null;
    this.browserConn = null;
    this.busy = Promise.resolve();
  }

  get connected() { return !!this.port; }

  /** Buka browser TANPA kendali (untuk login Google pertama kali — paling aman dari pemblokiran login). */
  openForLogin() {
    const exe = this.getBrowser().path;
    const url = 'https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent(this.flowUrl);
    browser.launchBrowser({ exe, profileDir: this.profileDir, url, debug: false, extraArgs: this.extraArgs });
  }

  /** Sambungkan: pakai browser profil ini yang sudah berjalan, atau jalankan baru dengan port DevTools lokal. */
  async connect() {
    let port = await browser.existingDebugPort(this.profileDir);
    if (!port) {
      browser.launchBrowser({ exe: this.getBrowser().path, profileDir: this.profileDir, url: this.flowUrl, debug: true, extraArgs: this.extraArgs });
      port = await browser.waitForDebugPort(this.profileDir);
    }
    this.port = port;
    await this.ensurePage();
    this.emit('change');
    return port;
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
  async ensurePage() {
    if (!this.port) throw new Error('NOT_CONNECTED');
    const targets = await this._targets();
    const flows = targets.filter((t) => this._isFlow(t));
    let target = (this.pageTarget && flows.find((t) => t.id === this.pageTarget.id)) ||
      flows.find((t) => /\/project\//.test(t.url)) || flows[0];
    if (!target) {
      target = await browser.getJSON(this.port, '/json/new?' + encodeURI(this.flowUrl), 'PUT');
      await sleep(1500);
    }
    if (this.page && !this.page.closed && this.pageTarget && this.pageTarget.id === target.id) return this.page;
    if (this.page) this.page.close();
    this.page = await CDPConnection.connect(target.webSocketDebuggerUrl);
    this.pageTarget = target;
    this.page.on('close', () => { if (this.page && this.page.closed) this.page = null; });
    return this.page;
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

  async _windowState(state) {
    try {
      const b = await this._browser();
      const { windowId } = await b.send('Browser.getWindowForTarget', { targetId: this.pageTarget.id });
      await b.send('Browser.setWindowBounds', { windowId, bounds: { windowState: state } });
    } catch { /* tidak didukung */ }
  }
  minimize() { return this._windowState('minimized'); }
  restore() { return this._windowState('normal'); }

  async bringToFront() {
    await this.restore();
    const page = await this.ensurePage();
    await page.send('Page.bringToFront');
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
