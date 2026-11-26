'use strict';
// MODE OTOMATIS — antrean tugas: lampirkan gambar → tulis prompt → klik Generate → tunggu → unduh.
// Diberi jeda acak antar tugas & batas jumlah per sesi untuk mengurangi pola "robot".
// Risiko pembatasan akun Google tetap ada; pengguna wajib menyetujui peringatan dulu.
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { sleep, rand } = require('./flow');
const { sanitizeStudio } = require('./store');
const { sanitizeTags } = require('./refs');
const { checkFrames } = require('./catalog');

class AutomationQueue extends EventEmitter {
  /**
   * @param {object} o
   * @param {import('./store').Store} o.store
   * @param {(accountId:string) => Promise<import('./flow').FlowSession>} o.getSession  sesi yang sudah tersambung
   * @param {(file:object) => void} [o.onDownloaded]
   * @param {(accountId:string, info:object) => void} [o.onFallback]  mode tersembunyi ditolak Flow → jendela diperkecil
   */
  constructor(o) {
    super();
    this.store = o.store;
    this.getSession = o.getSession;
    this.onDownloaded = o.onDownloaded || (() => {});
    this.onFallback = o.onFallback || (() => {});
    this.running = false;
    this.stopRequested = false;
    this.activity = '';
    this.nextAt = null;
  }

  get jobs() { return this.store.data.queue; }

  state() {
    return { running: this.running, activity: this.activity, nextAt: this.nextAt, jobs: this.jobs };
  }

  _emit() { this.store.save(); this.emit('update', this.state()); }

  _log(text) { this.activity = text; this._emit(); }

  add({ prompts, images = [], tags, accountId, options }) {
    const list = (Array.isArray(prompts) ? prompts : [prompts]).map((p) => String(p || '').trim()).filter(Boolean);
    if (!list.length) throw new Error('INVALID_PROMPT');
    if (list.length > 200 || this.jobs.length + list.length > 500) throw new Error('QUEUE_FULL');
    if (!this.store.data.accounts.some((a) => a.id === accountId)) throw new Error('UNKNOWN_ACCOUNT');
    checkFrames(options ? sanitizeStudio(options) : null, images);
    for (const prompt of list) {
      if (prompt.length > 8000) throw new Error('INVALID_PROMPT');
      this.jobs.push({ id: crypto.randomUUID(), prompt, images: images.slice(0, 10), tags: sanitizeTags(tags, images.slice(0, 10)), accountId, options: options ? sanitizeStudio(options) : null, status: 'pending', results: [], error: null, createdAt: Date.now() });
    }
    this._emit();
  }

  remove(id) {
    const i = this.jobs.findIndex((j) => j.id === id && j.status !== 'running');
    if (i >= 0) this.jobs.splice(i, 1);
    this._emit();
  }

  clearFinished() {
    this.store.data.queue = this.jobs.filter((j) => j.status === 'pending' || j.status === 'running');
    this._emit();
  }

  retry(id) {
    const j = this.jobs.find((x) => x.id === id);
    if (j && (j.status === 'failed' || j.status === 'stopped')) { j.status = 'pending'; j.error = null; }
    this._emit();
  }

  stop() {
    if (!this.running) return;
    this.stopRequested = true;
    this._log('Menghentikan setelah langkah ini…');
  }

  _shouldStop() { return this.stopRequested; }

  async _wait(ms) {
    this.nextAt = Date.now() + ms;
    this._emit();
    const end = Date.now() + ms;
    while (Date.now() < end && !this.stopRequested) await sleep(Math.min(500, end - Date.now()));
    this.nextAt = null;
  }

  async start() {
    const s = this.store.data;
    if (s.mode !== 'auto' || !s.autoAck) throw new Error('AUTO_MODE_DISABLED');
    if (this.running) return;
    this.running = true;
    this.stopRequested = false;
    let done = 0, failed = 0;
    try {
      const cfg = s.auto;
      while (!this.stopRequested) {
        const job = this.jobs.find((j) => j.status === 'pending');
        if (!job) break;
        if (done + failed >= cfg.maxPerRun) { this._log(`Batas ${cfg.maxPerRun} tugas per sesi tercapai. Lanjutkan nanti.`); break; }
        if (done + failed > 0) {
          const wait = Math.round(rand(cfg.minDelay, cfg.maxDelay) * 1000);
          this._log(`Jeda ${Math.round(wait / 1000)} detik sebelum tugas berikutnya…`);
          await this._wait(wait);
          if (this.stopRequested) break;
        }
        job.status = 'running'; job.error = null; job.detail = null; job.startedAt = Date.now();
        try {
          await this._runJob(job, cfg);
          job.status = 'done'; done++;
          this.emit('job-done', job);
        } catch (e) {
          const stopped = e.message === 'STOPPED';
          job.status = stopped ? 'stopped' : 'failed';
          job.error = stopped ? null : e.message;
          job.detail = stopped ? null : (e.detail || null);
          if (!stopped) { failed++; this.emit('job-failed', job); }
          if (!stopped && cfg.stopOnError) { this._log('Dihentikan karena tugas gagal: ' + e.message); break; }
        }
        job.finishedAt = Date.now();
        this._emit();
      }
    } finally {
      this.running = false;
      this.stopRequested = false;
      this.nextAt = null;
      if (!this.activity.startsWith('Dihentikan') && !this.activity.startsWith('Batas')) this.activity = `Selesai: ${done} berhasil, ${failed} gagal.`;
      this._emit();
      this.emit('finished', { done, failed });
    }
  }

  async _runJob(job, cfg) {
    const acc = this.store.data.accounts.find((a) => a.id === job.accountId);
    const tag = acc ? acc.label : 'akun';
    this._log(`[${tag}] Menyambungkan ke Google Flow…`);
    const session = await this.getSession(job.accountId);
    const res = await session.generate({ prompt: job.prompt, images: job.images, tags: job.tags, options: job.options }, {
      onLog: (t) => this._log(`[${tag}] ${t}`),
      shouldStop: () => this._shouldStop(),
      timeoutMs: cfg.timeoutMin * 60000,
      onFallback: (v) => this.onFallback(job.accountId, v)
    });
    if (!res.items || !res.items.length) throw new Error('NO_RESULTS');
    if (res.settings && res.settings.missing.length) job.note = 'Setelan tidak ditemukan di Flow: ' + res.settings.missing.join(', ');
    job.projectId = res.projectId;
    job.results = [];
    if (cfg.autoDownload) {
      const dir = path.join(this.store.data.downloadDir, safeName(tag));
      for (const item of res.items) {
        this._log(`[${tag}] Mengunduh hasil…`);
        const file = await session.download(item, dir);
        job.results.push(file);
        this.onDownloaded({ path: file, name: path.basename(file), mediaId: item.mediaId, accountId: job.accountId, at: Date.now() });
      }
    } else {
      job.results = res.items.map((i) => i.mediaId);
    }
  }
}

function safeName(s) { return String(s).replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 60) || 'akun'; }

module.exports = { AutomationQueue, safeName };
