'use strict';
// Penyimpanan pengaturan sederhana (JSON) di folder data aplikasi pengguna.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  accounts: [],            // { id, label, email, createdAt }
  activeAccountId: null,
  theme: 'system',         // system | light | dark
  browser: { prefer: 'auto', customPath: '' },
  browserWindow: 'normal', // normal | background | minimized
  downloadDir: '',
  mode: 'safe',            // safe | auto
  autoAck: null,           // waktu pengguna menyetujui risiko Mode Otomatis
  auto: { minDelay: 45, maxDelay: 120, maxPerRun: 10, timeoutMin: 8, autoDownload: true, stopOnError: true },
  downloads: [],           // { path, name, mediaId, accountId, at }
  queue: [],               // tugas Mode Otomatis
  deviceId: null,          // ID acak PC ini (untuk slot perangkat lisensi)
  license: null            // { key (terenkripsi), hint, info, checkedAt, error }
};

const LIMITS = { minDelay: [20, 3600], maxDelay: [20, 7200], maxPerRun: [1, 50], timeoutMin: [1, 30] };

class Store {
  constructor(dir, defaultDownloadDir) {
    this.file = path.join(dir, 'settings.json');
    let data = {};
    try { data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* baru */ }
    this.data = { ...structuredClone(DEFAULTS), ...data };
    this.data.auto = { ...DEFAULTS.auto, ...(data.auto || {}) };
    this.data.browser = { ...DEFAULTS.browser, ...(data.browser || {}) };
    if (!this.data.downloadDir) this.data.downloadDir = defaultDownloadDir;
    // tugas yang "berjalan" saat aplikasi ditutup dianggap menunggu lagi
    for (const j of this.data.queue) if (j.status === 'running') j.status = 'pending';
    this._timer = null;
  }

  get(key) { return key ? this.data[key] : this.data; }

  set(patch) {
    const d = this.data;
    if (patch.theme && ['system', 'light', 'dark'].includes(patch.theme)) d.theme = patch.theme;
    if (patch.browserWindow && ['normal', 'background', 'minimized'].includes(patch.browserWindow)) d.browserWindow = patch.browserWindow;
    if (patch.browser) {
      const p = patch.browser;
      if (['auto', 'chrome', 'edge', 'brave', 'chromium', 'custom'].includes(p.prefer)) d.browser.prefer = p.prefer;
      if (typeof p.customPath === 'string') d.browser.customPath = p.customPath.slice(0, 1000);
    }
    if (typeof patch.downloadDir === 'string' && patch.downloadDir) d.downloadDir = patch.downloadDir;
    if (patch.mode === 'safe') d.mode = 'safe';
    if (patch.mode === 'auto' && d.autoAck) d.mode = 'auto';
    if (typeof patch.activeAccountId === 'string' && d.accounts.some((a) => a.id === patch.activeAccountId)) d.activeAccountId = patch.activeAccountId;
    if (patch.auto) {
      for (const k of Object.keys(LIMITS)) {
        const v = Number(patch.auto[k]);
        if (Number.isFinite(v)) d.auto[k] = Math.round(Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], v)));
      }
      if (d.auto.maxDelay < d.auto.minDelay) d.auto.maxDelay = d.auto.minDelay;
      for (const k of ['autoDownload', 'stopOnError']) if (typeof patch.auto[k] === 'boolean') d.auto[k] = patch.auto[k];
    }
    this.save();
    return d;
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this._timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, DEFAULTS, LIMITS };
