'use strict';
// Pembaruan otomatis lewat GitHub Releases (electron-updater).
// Versi installer (NSIS): unduh di latar → mulai ulang → terpasang otomatis, tanpa instal ulang manual.
// Versi portable: hanya pemberitahuan + tautan unduh (file portable tidak bisa memperbarui dirinya sendiri).
const { EventEmitter } = require('events');

const PORTABLE_URL = 'https://github.com/sugionoofficial/FLOW-CONNECT/releases/latest/download/FLOW-CONNECT-Desktop-Portable.exe';
const CHECK_EVERY_MS = 30 * 60 * 1000;      // periksa berkala selama aplikasi terbuka
const NUDGE_AFTER_MS = 10 * 60 * 1000;      // saat jendela difokuskan / PC bangun: periksa bila terakhir > 10 mnt lalu
const RETRY_MS = [60e3, 3 * 60e3, 10 * 60e3]; // gagal (mis. internet belum siap saat Windows baru menyala) → coba lagi cepat

function cleanNotes(n) {
  const text = Array.isArray(n) ? n.map((x) => x.note || '').join('\n') : String(n || '');
  return text.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 600);
}

class Updater extends EventEmitter {
  constructor({ app, log = console, autoUpdater = null, platform = process.platform }) {
    super();
    this.app = app;
    this.log = log;
    this.portable = !!process.env.PORTABLE_EXECUTABLE_FILE;
    this.supported = app.isPackaged && platform === 'win32';
    this._injected = autoUpdater; // untuk pengujian
    this.s = { state: this.supported ? 'idle' : 'unsupported', current: app.getVersion(), version: null, notes: '', percent: 0, error: null, portable: this.portable, checkedAt: null };
    this.au = null;
    this._timer = null;
    this._retry = null;
    this._fails = 0;
    this._lastTry = 0;
  }

  state() { return { ...this.s }; }

  _set(patch) {
    this.s = { ...this.s, ...patch };
    this.emit('change', this.state());
  }

  _init() {
    if (this.au) return this.au;
    const autoUpdater = this._injected || require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = !this.portable;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = { info: () => {}, warn: (m) => this.log.warn('[update]', m), error: (m) => this.log.error('[update]', m), debug: () => {} };
    // pembaruan yang sudah ditawarkan tetap tampil selama pemeriksaan ulang berkala
    autoUpdater.on('checking-for-update', () => { if (this.s.state !== 'available') this._set({ state: 'checking', error: null }); });
    autoUpdater.on('update-not-available', () => { this._fails = 0; this._set({ state: 'none', checkedAt: Date.now() }); });
    autoUpdater.on('update-available', (i) => {
      this._fails = 0;
      const fresh = this._notified !== i.version;
      this._notified = i.version;
      this._set({ state: 'available', version: i.version, notes: cleanNotes(i.releaseNotes), checkedAt: Date.now(), error: null });
      if (fresh) this.emit('available', this.state());
    });
    autoUpdater.on('download-progress', (p) => this._set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (i) => { this._set({ state: 'ready', version: i.version, percent: 100 }); this.emit('ready', this.state()); });
    autoUpdater.on('error', (e) => this._fail(e));
    this.au = autoUpdater;
    return autoUpdater;
  }

  _fail(e) {
    const error = (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 200);
    // pembaruan yang sudah diketahui tetap ditawarkan walau pemeriksaan ulang gagal
    // (juga bila unduhan gagal → tombol "Update sekarang" tetap ada untuk mencoba lagi)
    if (this.s.version && this._notified === this.s.version && this.s.state !== 'ready') this._set({ state: 'available', percent: 0, error });
    else { this._set({ state: 'error', error }); this._scheduleRetry(); }
  }

  _scheduleRetry() {
    if (this._retry || !this.started) return;
    const wait = RETRY_MS[Math.min(this._fails, RETRY_MS.length - 1)];
    this._fails++;
    this._retry = setTimeout(() => { this._retry = null; this.check(); }, wait);
  }

  async check() {
    if (!this.supported) return this.state();
    if (['checking', 'downloading', 'ready'].includes(this.s.state)) return this.state();
    this._lastTry = Date.now();
    const prev = this.s.state;
    try {
      await this._init().checkForUpdates();
    } catch (e) { this._fail(e); }
    if (this.s.state === 'checking') this._set({ state: prev === 'available' ? 'available' : 'idle' }); // jaga-jaga event tidak datang
    return this.state();
  }

  /** Jendela difokuskan / PC bangun dari tidur → periksa bila sudah lama. */
  nudge() {
    if (!this.supported || !this.started) return;
    if (Date.now() - this._lastTry < NUDGE_AFTER_MS) return;
    this.check();
  }

  /** Klik "Update sekarang": unduh pembaruan di latar. Portable → kembalikan tautan unduh. */
  async download() {
    if (!this.supported) throw new Error('UPDATE_UNSUPPORTED');
    if (this.portable) return { url: PORTABLE_URL };
    if (this.s.state === 'ready') return this.state();
    if (this.s.state !== 'available' && this.s.state !== 'error') throw new Error('NO_UPDATE');
    this._set({ state: 'downloading', percent: 0, error: null });
    this._init().downloadUpdate().catch((e) => this._fail(e));
    return this.state();
  }

  /** Tutup aplikasi, pasang pembaruan tanpa wizard, lalu buka lagi. */
  install(beforeQuit) {
    if (this.s.state !== 'ready') throw new Error('NOT_READY');
    if (beforeQuit) beforeQuit();
    setImmediate(() => this.au.quitAndInstall(true, true));
  }

  start(delayMs = 5000) {
    if (!this.supported || this.started) return;
    this.started = true;
    setTimeout(() => this.check(), delayMs);
    this._timer = setInterval(() => this.check(), CHECK_EVERY_MS);
  }

  stop() {
    clearInterval(this._timer);
    clearTimeout(this._retry);
    this._timer = this._retry = null;
    this.started = false;
  }
}

module.exports = { Updater, cleanNotes, PORTABLE_URL, CHECK_EVERY_MS, NUDGE_AFTER_MS, RETRY_MS };
