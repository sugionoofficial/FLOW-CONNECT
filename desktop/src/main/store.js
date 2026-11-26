'use strict';
// Penyimpanan pengaturan sederhana (JSON) di folder data aplikasi pengguna.
const fs = require('fs');
const path = require('path');

const SCHEMA = 2;
const STUDIO = { kind: 'video', sub: 'text', model: 'auto', ratio: '16:9', count: 1, duration: 0, apply: true };

const DEFAULTS = {
  schema: SCHEMA,
  accounts: [],            // { id, label, email, createdAt, signedInAt, headlessFailedAt }
  activeAccountId: null,
  theme: 'dark',           // system | light | dark
  browser: { prefer: 'auto', customPath: '' },
  browserWindow: 'hidden', // hidden (headless, eksperimental) | minimized | normal
  autoProject: true,       // buat project baru otomatis setelah terhubung
  studio: STUDIO,          // setelan Flow terakhir di Studio
  downloadDir: '',
  mode: 'safe',            // safe | auto
  autoAck: null,           // waktu pengguna menyetujui risiko Mode Otomatis
  auto: { minDelay: 45, maxDelay: 120, maxPerRun: 10, timeoutMin: 8, autoDownload: true, stopOnError: true },
  downloads: [],           // { path, name, mediaId, accountId, at }
  queue: [],               // tugas Mode Otomatis
  deviceId: null,          // ID acak PC ini (untuk slot perangkat lisensi)
  license: null            // { key (terenkripsi), hint, info, checkedAt, error }
};

/** Validasi setelan Studio → setelan Flow (mode, model, rasio, jumlah, durasi). */
function sanitizeStudio(p = {}, base = STUDIO) {
  const o = { ...base };
  if (['video', 'image'].includes(p.kind)) o.kind = p.kind;
  if (['text', 'frames', 'ingredients'].includes(p.sub)) o.sub = p.sub;
  if (typeof p.model === 'string') o.model = p.model.replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'auto';
  if (typeof p.ratio === 'string' && /^(16:9|9:16|1:1|4:3|3:4)$/.test(p.ratio)) o.ratio = p.ratio;
  if ([1, 2, 3, 4].includes(Number(p.count))) o.count = Number(p.count);
  if ([0, 4, 6, 8].includes(Number(p.duration))) o.duration = Number(p.duration);
  if (typeof p.apply === 'boolean') o.apply = p.apply;
  return o;
}

const LIMITS = { minDelay: [20, 3600], maxDelay: [20, 7200], maxPerRun: [1, 50], timeoutMin: [1, 30] };

class Store {
  constructor(dir, defaultDownloadDir) {
    this.file = path.join(dir, 'settings.json');
    let data = {};
    try { data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* baru */ }
    this.data = { ...structuredClone(DEFAULTS), ...data };
    this.data.auto = { ...DEFAULTS.auto, ...(data.auto || {}) };
    this.data.browser = { ...DEFAULTS.browser, ...(data.browser || {}) };
    this.data.studio = sanitizeStudio(data.studio || {});
    // v1.2: browser disembunyikan & tampilan gelap premium sebagai bawaan
    if ((data.schema || 1) < SCHEMA) {
      if (data.browserWindow !== 'minimized') this.data.browserWindow = 'hidden';
      if (!data.theme || data.theme === 'system') this.data.theme = 'dark';
      this.data.schema = SCHEMA;
    }
    if (this.data.browserWindow === 'background') this.data.browserWindow = 'normal';
    if (!this.data.downloadDir) this.data.downloadDir = defaultDownloadDir;
    // tugas yang "berjalan" saat aplikasi ditutup dianggap menunggu lagi
    for (const j of this.data.queue) if (j.status === 'running') j.status = 'pending';
    this._timer = null;
  }

  get(key) { return key ? this.data[key] : this.data; }

  set(patch) {
    const d = this.data;
    if (patch.theme && ['system', 'light', 'dark'].includes(patch.theme)) d.theme = patch.theme;
    if (patch.browserWindow && ['hidden', 'minimized', 'normal'].includes(patch.browserWindow)) d.browserWindow = patch.browserWindow;
    if (typeof patch.autoProject === 'boolean') d.autoProject = patch.autoProject;
    if (patch.studio && typeof patch.studio === 'object') d.studio = sanitizeStudio(patch.studio, d.studio);
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

module.exports = { Store, DEFAULTS, LIMITS, STUDIO, sanitizeStudio };
