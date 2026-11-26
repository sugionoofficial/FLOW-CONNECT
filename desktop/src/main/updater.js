'use strict';
// Pembaruan otomatis lewat GitHub Releases (electron-updater).
// Versi installer (NSIS): unduh di latar → mulai ulang → terpasang otomatis, tanpa instal ulang manual.
// Versi portable: hanya pemberitahuan + tautan unduh (file portable tidak bisa memperbarui dirinya sendiri).
const { EventEmitter } = require('events');

const PORTABLE_URL = 'https://github.com/sugionoofficial/FLOW-CONNECT/releases/latest/download/FLOW-CONNECT-Desktop-Portable.exe';
const CHECK_EVERY_MS = 4 * 3600 * 1000;

function cleanNotes(n) {
  const text = Array.isArray(n) ? n.map((x) => x.note || '').join('\n') : String(n || '');
  return text.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 600);
}

class Updater extends EventEmitter {
  constructor({ app, log = console }) {
    super();
    this.app = app;
    this.log = log;
    this.portable = !!process.env.PORTABLE_EXECUTABLE_FILE;
    this.supported = app.isPackaged && process.platform === 'win32';
    this.s = { state: this.supported ? 'idle' : 'unsupported', current: app.getVersion(), version: null, notes: '', percent: 0, error: null, portable: this.portable, checkedAt: null };
    this.au = null;
    this._timer = null;
  }

  state() { return { ...this.s }; }

  _set(patch) {
    this.s = { ...this.s, ...patch };
    this.emit('change', this.state());
  }

  _init() {
    if (this.au) return this.au;
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = !this.portable;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = { info: () => {}, warn: (m) => this.log.warn('[update]', m), error: (m) => this.log.error('[update]', m), debug: () => {} };
    autoUpdater.on('checking-for-update', () => this._set({ state: 'checking', error: null }));
    autoUpdater.on('update-not-available', () => this._set({ state: 'none', checkedAt: Date.now() }));
    autoUpdater.on('update-available', (i) => {
      const fresh = this.s.version !== i.version;
      this._set({ state: 'available', version: i.version, notes: cleanNotes(i.releaseNotes), checkedAt: Date.now() });
      if (fresh) this.emit('available', this.state());
    });
    autoUpdater.on('download-progress', (p) => this._set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (i) => { this._set({ state: 'ready', version: i.version, percent: 100 }); this.emit('ready', this.state()); });
    autoUpdater.on('error', (e) => this._set({ state: 'error', error: (e && e.message ? e.message : String(e)).split('\n')[0].slice(0, 200) }));
    this.au = autoUpdater;
    return autoUpdater;
  }

  async check() {
    if (!this.supported) return this.state();
    if (['checking', 'downloading', 'ready'].includes(this.s.state)) return this.state();
    try { await this._init().checkForUpdates(); } catch (e) { this._set({ state: 'error', error: String(e.message || e).split('\n')[0].slice(0, 200) }); }
    return this.state();
  }

  /** Klik "Update sekarang": unduh pembaruan di latar. Portable → kembalikan tautan unduh. */
  async download() {
    if (!this.supported) throw new Error('UPDATE_UNSUPPORTED');
    if (this.portable) return { url: PORTABLE_URL };
    if (this.s.state === 'ready') return this.state();
    if (this.s.state !== 'available' && this.s.state !== 'error') throw new Error('NO_UPDATE');
    this._set({ state: 'downloading', percent: 0, error: null });
    this._init().downloadUpdate().catch((e) => this._set({ state: 'error', error: String(e.message || e).split('\n')[0].slice(0, 200) }));
    return this.state();
  }

  /** Tutup aplikasi, pasang pembaruan tanpa wizard, lalu buka lagi. */
  install(beforeQuit) {
    if (this.s.state !== 'ready') throw new Error('NOT_READY');
    if (beforeQuit) beforeQuit();
    setImmediate(() => this.au.quitAndInstall(true, true));
  }

  start(delayMs = 8000) {
    if (!this.supported) return;
    setTimeout(() => this.check(), delayMs);
    this._timer = setInterval(() => this.check(), CHECK_EVERY_MS);
  }
}

module.exports = { Updater, cleanNotes, PORTABLE_URL };
