'use strict';
// BULK GENERATE (Mode Otomatis) — sampai 300 gambar / video per batch, dibagi ke beberapa akun Google Flow.
// • Gambar (Nano Banana, 0 kredit): maks. 300 hasil per batch, dibagi rata ke akun terpilih.
// • Video: jumlahnya mengikuti saldo kredit tiap akun ÷ biaya per video, dipakai bergiliran (antre) dari
//   semua akun — mis. 5 akun × 50 kredit, Omni 1.1 Flash 10 dtk (15 kredit) → 5 × 3 = 15 video.
// • Satu tugas = satu kali Generate di Flow. Jeda acak per akun; jeda dilipatgandakan bila Flow menolak.
// • Kredit habis → tugas pindah ke akun lain yang masih punya kredit; "unusual activity" → akun diistirahatkan.
// • Gambar referensi: "shared" = gambar yang sama di semua tugas (maks. 10; Frame = 2 foto), atau
//   "each" = satu gambar per prompt (gambar ke-i ↔ prompt ke-i, bergiliran; Frame = berpasangan awal+akhir), maks. 300.
//   Gambar yang sama diunggah sekali per project lalu dipakai ulang (lihat FlowSession.prepareComposer reuseRefs).
// • Tugas gagal diulang maks. 3× (4 percobaan). Tetap gagal → dibiarkan "gagal", lalu dibuat TUGAS PENGGANTI baru
//   (prompt/gambar sama) agar jumlah hasil tetap genap sesuai permintaan — mis. minta 20, 12 berhasil → 8 tugas baru.
//   Hasil sebagian (mis. 3 dari 4) juga digenapi. Pengganti dibatasi (MAX_REPLACE per slot) agar tidak berulang tanpa akhir.
// • Batch menyimpan startedAt/finishedAt → SATU timer runtime untuk seluruh proses (termasuk ulangan & pengganti;
//   "Lanjutkan sisa" meneruskan timer yang sama, bukan mulai dari nol).
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { sleep, rand } = require('./flow');
const { sanitizeStudio } = require('./store');
const { sanitizeTags } = require('./refs');
const { checkFrames, creditCost, durationFor } = require('./catalog');

const MAX_BULK = 300;          // batas hasil per batch (gambar maupun video)
const MAX_PROMPTS = 300;
const MAX_SHARED_IMAGES = 10;
const MAX_EACH_IMAGES = 300;
const PROJECT_EVERY = 100;     // project Flow baru tiap 100 tugas per akun (project terlalu penuh → Flow melambat)
const DELAY = { image: [8, 20], video: [15, 40] }; // jeda bawaan (detik) antar tugas di akun yang sama
const MAX_BACKOFF = 4;          // jeda antar tugas maks. 4× lipat setelah gagal beruntun
const MAX_ATTEMPTS = 4;         // 1 percobaan + 3× ulang
const RETRY_DELAY = 10;         // detik × nomor percobaan (10, 20, 30) sebelum diulang
const MAX_REPLACE = 3;          // tugas pengganti maks. per slot (slot = tugas asli)
const COOL_EVERY = 5;           // tiap 5× gagal beruntun → akun istirahat sebentar (bukan dimatikan seperti dulu)
const COOL_DELAY = 60;          // detik
const RECOVER_EVERY = 2;        // tiap 2× gagal beruntun di satu akun → tugas berikutnya di project Flow baru (keadaan bersih)

// galat yang membuat TUGAS gagal permanen TANPA diulang/diganti: masukan/berkas tidak valid (mengulang pasti sama)
const JOB_FATAL = new Set(['INVALID_PROMPT', 'INVALID_IMAGE', 'FRAMES_REQUIRED', 'UPLOAD_REJECTED', 'UPLOAD_TERMS', 'NOTHING_TO_SEND']);
// FLOW_CONTENT_POLICY, GENERATE_FAILED ("tidak ada gambar" / filter keamanan), REFERENCE_NOT_ATTACHED, GENERATE_TIMEOUT, dst.
// sering berhasil bila diulang → diulang 3× lalu diganti tugas baru.
// galat yang membuat AKUN berhenti dipakai di batch ini (tugasnya dikembalikan ke antrean untuk akun lain)
const ACCOUNT_FATAL = new Set(['NOT_SIGNED_IN', 'BROWSER_NOT_FOUND', 'BROWSER_LAUNCH_FAILED', 'PROFILE_IN_USE', 'BROWSER_CLOSED',
  'CDP_CONNECT_FAILED', 'UNKNOWN_ACCOUNT', 'LOGIN_IN_PROGRESS']);

/**
 * Satuan kerja dari prompt + gambar.
 * @returns {{ refMode:'shared'|'each', images:string[], groups:number[][]|null, prompts:string[], units:number }}
 */
function bulkUnits(input, options) {
  const refMode = input.refMode === 'each' ? 'each' : 'shared';
  const frames = options.kind === 'video' && options.sub === 'frames';
  const prompts = cleanPrompts(input.prompts);
  const images = (Array.isArray(input.images) ? input.images : []).filter((x) => typeof x === 'string').slice(0, refMode === 'each' ? MAX_EACH_IMAGES : MAX_SHARED_IMAGES);
  let groups = null;
  if (refMode === 'each' && images.length) {
    const size = frames ? 2 : 1;
    if (images.length % size) {
      const e = new Error('FRAMES_REQUIRED');
      e.detail = `${images.length} foto — mode Frame per prompt butuh pasangan foto awal + akhir`;
      throw e;
    }
    groups = [];
    for (let i = 0; i + size <= images.length; i += size) groups.push(size === 2 ? [i, i + 1] : [i]);
  } else checkFrames(options, images);
  return { refMode, images, groups, prompts, units: Math.max(prompts.length, groups ? groups.length : 0, images.length && !groups ? 1 : 0) };
}

const clampInt = (v, lo, hi, def) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

/**
 * Rencana batch (murni, tanpa efek samping) — dipakai untuk pratinjau & saat mulai.
 * @param {object} p
 * @param {'image'|'video'} p.kind
 * @param {number} [p.count]       jumlah hasil yang diminta (kosong = 1 per prompt untuk gambar / maks. kredit untuk video)
 * @param {number} [p.perJob]      hasil per Generate (gambar 1–4; video selalu 1 agar hitungan kredit tepat)
 * @param {number} p.prompts       banyaknya prompt
 * @param {{id:string, credits:number|null}[]} p.accounts  urutan = urutan antre
 * @param {number|null} p.cost     kredit per video
 */
function planBulk({ kind, count, perJob, prompts, accounts, cost }) {
  const video = kind === 'video';
  const per = video ? 1 : clampInt(perJob, 1, 4, 1);
  const accs = (accounts || []).map((a) => {
    const credits = a.credits === null || a.credits === undefined || a.credits === '' ? null : clampInt(a.credits, 0, 1e7, null);
    const capacity = !video ? Infinity : credits === null || !(cost > 0) ? 0 : Math.floor(credits / cost);
    return { id: a.id, credits, capacity, planned: 0 };
  });
  const capacity = video ? accs.reduce((s, a) => s + a.capacity, 0) : MAX_BULK;
  const wanted = clampInt(count, 0, 100000, 0) || (video ? capacity : Math.max(1, prompts || 0) * per);
  const target = Math.max(0, Math.min(wanted, MAX_BULK, capacity));
  const jobs = Math.ceil(target / per);
  // pembagian awal: video → antre akun demi akun sesuai kapasitas; gambar → rata ke semua akun
  if (accs.length) {
    if (video) {
      let left = jobs;
      for (const a of accs) { a.planned = Math.min(a.capacity, left); left -= a.planned; }
    } else {
      accs.forEach((a, i) => { a.planned = Math.floor(jobs / accs.length) + (i < jobs % accs.length ? 1 : 0); });
    }
  }
  const warnings = [];
  if (!accs.length) warnings.push('NO_ACCOUNTS');
  if (video && !(cost > 0)) warnings.push('UNKNOWN_COST');
  if (video && accs.some((a) => a.credits === null)) warnings.push('UNKNOWN_CREDITS');
  if (wanted > MAX_BULK) warnings.push('MAX_BULK');
  if (video && wanted > capacity) warnings.push('NOT_ENOUGH_CREDITS');
  return { kind, perJob: per, cost: video ? cost : 0, wanted, target, jobs, capacity: video ? capacity : MAX_BULK, credits: video ? jobs * cost : 0,
    accounts: accs.map((a) => ({ ...a, capacity: a.capacity === Infinity ? null : a.capacity })), warnings };
}

class BulkRunner extends EventEmitter {
  /**
   * @param {object} o
   * @param {import('./store').Store} o.store
   * @param {(accountId:string) => Promise<import('./flow').FlowSession>} o.getSession
   * @param {(file:object) => void} [o.onDownloaded]
   * @param {(accountId:string, info:object) => void} [o.onFallback]
   * @param {() => boolean} [o.isBusy]  antrean otomatis lain sedang berjalan?
   * @param {number} [o.unitMs]
   */
  constructor(o) {
    super();
    this.store = o.store;
    this.getSession = o.getSession;
    this.onDownloaded = o.onDownloaded || (() => {});
    this.onFallback = o.onFallback || (() => {});
    this.isBusy = o.isBusy || (() => false);
    this.unitMs = o.unitMs || 1000; // satuan jeda (tes memakai 1 ms)
    this.running = false;
    this.stopRequested = false;
    this.activity = '';
    this._gate = Promise.resolve();
    // batch yang "berjalan" saat aplikasi ditutup → dianggap dihentikan
    const b = this.batch;
    if (b && !b.finishedAt) {
      for (const j of b.jobs) if (j.status === 'running' || j.status === 'pending') j.status = 'stopped';
      b.finishedAt = b.updatedAt || Date.now();
      b.stopped = true;
    }
  }

  get batch() { return this.store.data.bulk || null; }

  state() { return { running: this.running, activity: this.activity, batch: this.batch, now: Date.now() }; }

  _emit() { this.store.save(); this.emit('update', this.state()); }

  _log(text) { this.activity = text; this.emit('activity', text); }

  /** Biaya per video untuk setelan ini (bisa ditimpa pengguna). */
  static costFor(options, override) {
    const o = sanitizeStudio(options || {});
    const ov = Number(override);
    if (Number.isFinite(ov) && ov > 0) return Math.min(10000, Math.round(ov));
    return creditCost(o.kind, o.model, o.duration || durationFor(o.kind, o.model));
  }

  plan(input) {
    const o = sanitizeStudio(input.options || {});
    let u, refError = null;
    try { u = bulkUnits(input, o); } catch (e) {
      refError = { code: e.message, detail: e.detail || null };
      u = { units: cleanPrompts(input.prompts).length, groups: null, refMode: input.refMode === 'each' ? 'each' : 'shared' };
    }
    const plan = planBulk({ kind: o.kind, count: input.count, perJob: o.count, prompts: u.units, accounts: this._accounts(input.accounts), cost: BulkRunner.costFor(o, input.cost) });
    return { ...plan, refMode: u.refMode, units: u.units, groups: u.groups ? u.groups.length : 0, refError };
  }

  _accounts(list) {
    const known = new Map(this.store.data.accounts.map((a) => [a.id, a]));
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter((a) => a && known.has(a.id) && !seen.has(a.id) && seen.add(a.id))
      .slice(0, 50).map((a) => ({ id: a.id, label: known.get(a.id).label, credits: a.credits }));
  }

  /** Susun batch baru lalu jalankan di latar belakang. */
  start(input) {
    const s = this.store.data;
    if (s.mode !== 'auto' || !s.autoAck) throw new Error('AUTO_MODE_DISABLED');
    if (this.running) throw new Error('BULK_RUNNING');
    if (this.isBusy()) throw new Error('QUEUE_RUNNING');
    const options = sanitizeStudio(input.options || {});
    const video = options.kind === 'video';
    const { refMode, images, groups, prompts, units } = bulkUnits(input, options);
    if (!units) throw new Error('NOTHING_TO_SEND');
    if (prompts.some((p) => p.length > 8000)) throw new Error('INVALID_PROMPT');
    const accounts = this._accounts(input.accounts);
    if (!accounts.length) throw new Error('NO_ACCOUNTS');
    const cost = video ? BulkRunner.costFor(options, input.cost) : 0;
    if (video && !(cost > 0)) throw new Error('UNKNOWN_COST');
    const plan = planBulk({ kind: options.kind, count: input.count, perJob: options.count, prompts: units, accounts, cost });
    if (!plan.jobs) throw new Error(video ? 'NOT_ENOUGH_CREDITS' : 'NOTHING_TO_SEND');
    const list = prompts.length ? prompts : [''];
    const jobs = [];
    let left = plan.target;
    for (let i = 0; i < plan.jobs; i++) {
      const n = Math.min(plan.perJob, left);
      left -= n;
      jobs.push({ id: crypto.randomUUID(), n: i + 1, p: i % list.length, g: groups ? i % groups.length : null, count: n, status: 'pending', accountId: null, attempts: 0, results: [], error: null, detail: null, slot: i + 1, gen: 0, replaces: null, replacedBy: null });
    }
    const [dmin, dmax] = DELAY[options.kind];
    const minDelay = clampInt(input.minDelay, 3, 600, dmin);
    const now = Date.now();
    const stamp = new Date(now);
    const pad = (x) => String(x).padStart(2, '0');
    this.store.data.bulk = {
      id: crypto.randomUUID(), createdAt: now, startedAt: now, finishedAt: null, updatedAt: now, stopped: false, runs: 1, retries: 0, replaced: 0,
      kind: options.kind, model: options.model, duration: options.duration, cost, perJob: plan.perJob, target: plan.target,
      options: { ...options, count: plan.perJob }, images, refMode, groups, tags: groups ? null : sanitizeTags(input.tags, images), prompts: list,
      parallel: !!input.parallel, newProject: input.newProject !== false, autoDownload: s.auto.autoDownload,
      minDelay, maxDelay: Math.max(minDelay, clampInt(input.maxDelay, 3, 1200, dmax)),
      folder: `Bulk ${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}.${pad(stamp.getMinutes())}.${pad(stamp.getSeconds())}`,
      accounts: accounts.map((a, i) => ({ id: a.id, label: a.label, credits: video ? plan.accounts[i].credits : null, startCredits: video ? plan.accounts[i].credits : null,
        planned: plan.accounts[i].planned, done: 0, failed: 0, used: 0, status: 'ready', note: null, backoff: 1, fails: 0, jobsRun: 0 })),
      jobs
    };
    this._run().catch((e) => this._log('Bulk berhenti: ' + e.message));
    return this.state();
  }

  stop() {
    if (!this.running) return;
    this.stopRequested = true;
    this._log('Menghentikan bulk setelah langkah ini…');
    this._emit();
  }

  clear() {
    if (this.running) throw new Error('BULK_RUNNING');
    this.store.data.bulk = null;
    this.activity = '';
    this._emit();
  }

  /** Ulangi tugas yang gagal / dihentikan / terlewat dari batch terakhir (memakai saldo kredit tersisa). */
  resume({ accounts } = {}) {
    const b = this.batch;
    if (!b) throw new Error('NO_BATCH');
    if (this.running) throw new Error('BULK_RUNNING');
    if (this.isBusy()) throw new Error('QUEUE_RUNNING');
    const s = this.store.data;
    if (s.mode !== 'auto' || !s.autoAck) throw new Error('AUTO_MODE_DISABLED');
    let n = 0;
    for (const j of resumableJobs(b)) { j.status = 'pending'; j.error = null; j.detail = null; j.attempts = 0; j.retryAt = null; n++; }
    if (!n) throw new Error('NOTHING_TO_SEND');
    const upd = new Map((Array.isArray(accounts) ? accounts : []).map((a) => [a.id, a]));
    for (const a of b.accounts) {
      const u = upd.get(a.id);
      if (u && b.kind === 'video' && u.credits !== undefined && u.credits !== null) a.credits = clampInt(u.credits, 0, 1e7, a.credits);
      if (a.status !== 'exhausted' || b.kind !== 'video' || a.credits >= b.cost) { a.status = 'ready'; a.note = null; }
      a.backoff = 1; a.fails = 0; a.jobsRun = 0;
    }
    // satu runtime: timer diteruskan dari durasi sebelumnya (jeda saat aplikasi diam tidak dihitung)
    const ran = b.finishedAt && b.startedAt ? Math.max(0, b.finishedAt - b.startedAt) : 0;
    b.startedAt = Date.now() - ran; b.finishedAt = null; b.stopped = false; b.runs = (b.runs || 1) + 1;
    this._run().catch((e) => this._log('Bulk berhenti: ' + e.message));
    return this.state();
  }

  async _run() {
    const b = this.batch;
    this.running = true;
    this.stopRequested = false;
    this._emit();
    this._log(`Bulk dimulai: ${b.target} ${b.kind === 'video' ? 'video' : 'gambar'} · ${b.jobs.length} tugas · ${b.accounts.length} akun`);
    try {
      await Promise.all(b.accounts.map((a, i) => this._worker(a, i)));
    } finally {
      const stopped = this.stopRequested;
      for (const j of b.jobs) {
        if (j.status === 'pending' || j.status === 'running') {
          j.status = stopped ? 'stopped' : 'skipped';
          if (!stopped) j.error = b.kind === 'video' ? 'NO_CREDITS_LEFT' : 'NO_ACCOUNTS_LEFT';
        }
      }
      for (const a of b.accounts) if (a.status === 'running' || a.status === 'waiting' || a.status === 'ready') a.status = 'done';
      b.finishedAt = Date.now();
      b.updatedAt = b.finishedAt;
      b.stopped = stopped;
      this.running = false;
      this.stopRequested = false;
      const sum = bulkSummary(b);
      const { items, failed, skipped, ms } = sum;
      const unit = b.kind === 'video' ? 'video' : 'gambar';
      this._log(`${stopped ? 'Bulk dihentikan' : 'Bulk selesai'}: ${items}/${b.target} ${unit} dari ${sum.done} tugas${failed ? `, ${failed} gagal` : ''}${sum.replaced ? ` (${sum.replaced} diganti tugas baru)` : ''}${skipped ? `, ${skipped} terlewat` : ''} · total durasi ${fmtDuration(ms)}${items ? ` · rata-rata ${fmtDuration(ms / items)} per ${unit}` : ''}.`);
      this._emit();
      this.emit('finished', { done: sum.done, items, failed, skipped, stopped, ms, target: b.target, replaced: sum.replaced, retries: sum.retries, perItemMs: sum.perItemMs, kind: b.kind });
    }
  }

  // giliran global (mode berurutan): hanya satu akun yang menekan Generate pada satu waktu
  _lock() {
    let release;
    const next = new Promise((r) => { release = r; });
    const prev = this._gate;
    this._gate = prev.then(() => next);
    return prev.then(() => release);
  }

  async _wait(ms, acct) {
    acct.nextAt = Date.now() + ms;
    this._emit();
    const end = Date.now() + ms;
    while (Date.now() < end && !this.stopRequested) await sleep(Math.min(500, end - Date.now()));
    acct.nextAt = null;
  }

  /** Tugas berikutnya; untuk `acct`, tugas yang pernah gagal DI AKUN ITU didahulukan untuk akun lain. */
  _nextJob(acct) {
    const now = Date.now();
    const ready = this.batch.jobs.filter((j) => j.status === 'pending' && !(j.retryAt > now));
    if (!acct) return ready[0] || null;
    const fresh = ready.find((j) => !(j.failedOn || []).includes(acct.id));
    if (fresh) return fresh;
    // tugas yang sudah gagal di akun ini diserahkan ke akun lain yang masih aktif; hanya diambil sendiri bila tak ada
    const others = this.batch.accounts.some((a) => a.id !== acct.id && !['exhausted', 'paused', 'error', 'done'].includes(a.status));
    return others ? null : ready[0] || null;
  }

  async _worker(acct, index) {
    const b = this.batch;
    const video = b.kind === 'video';
    if (index && !b.parallel) await sleep(0.3 * this.unitMs * index); // urutan giliran awal = urutan akun
    while (!this.stopRequested) {
      if (['exhausted', 'paused', 'error'].includes(acct.status)) return;
      if (video && !(acct.credits >= b.cost)) { acct.status = 'exhausted'; acct.note = acct.note || 'Kredit habis'; this._emit(); return; }
      let job = this._nextJob(acct);
      if (!job) {
        // tugas yang sedang menunggu jeda-ulang / dipegang akun lain bisa kembali ke antrean
        const open = b.jobs.some((j) => j.status === 'pending' || (j.status === 'running' && j.accountId !== acct.id));
        if (!open) { if (['running', 'waiting', 'ready'].includes(acct.status)) { acct.status = 'done'; this._emit(); } return; }
        const soon = b.jobs.filter((j) => j.status === 'pending' && j.retryAt).reduce((m, j) => Math.min(m, j.retryAt), Infinity);
        await sleep(Math.max(20, Math.min(1000, soon - Date.now())));
        continue;
      }
      job.status = 'running';
      job.accountId = acct.id;
      const release = b.parallel ? null : await this._lock();
      try {
        if (this.stopRequested) { job.status = 'pending'; job.accountId = null; return; }
        if (['exhausted', 'paused', 'error'].includes(acct.status)) { job.status = 'pending'; job.accountId = null; return; }
        acct.status = 'running';
        job.startedAt = Date.now(); job.error = null; job.detail = null;
        this._emit();
        const ok = await this._runJob(job, acct);
        if (!ok) continue;
      } finally { if (release) release(); }
      if (this.stopRequested) return;
      if (!this._nextJob() && !b.jobs.some((j) => j.status === 'pending')) continue; // tak ada tugas lagi → keluar di putaran berikut
      const cool = acct.fails && acct.fails % COOL_EVERY === 0;
      const wait = Math.round((rand(b.minDelay, b.maxDelay) * acct.backoff + (cool ? COOL_DELAY : 0)) * this.unitMs);
      acct.status = 'waiting';
      this._log(cool ? `[${acct.label}] ${acct.fails}× gagal berturut-turut — istirahat ${Math.round(wait / 1000)} detik lalu dilanjutkan…`
        : `[${acct.label}] Jeda ${Math.round(wait / 1000)} detik sebelum tugas berikutnya…`);
      await this._wait(wait, acct);
    }
  }

  /** @returns {Promise<boolean>} true bila tugas selesai (berhasil/gagal permanen) → jeda; false bila langsung lanjut. */
  async _runJob(job, acct) {
    const b = this.batch;
    const video = b.kind === 'video';
    const tag = `${acct.label} · #${job.n}/${b.jobs.length}`;
    const prompt = b.prompts[job.p] || '';
    const { images, tags } = jobImages(b, job);
    try {
      this._log(`[${tag}] Menyambungkan ke Google Flow…`);
      const session = await this.getSession(acct.id);
      if (b.newProject && acct.jobsRun % PROJECT_EVERY === 0) {
        this._log(`[${tag}] Membuat project baru untuk batch ini…`);
        await session.newProject().catch((e) => this._log(`[${tag}] Project baru belum dibuat: ${e.message}`));
        acct.fresh = false;
      } else if (acct.fresh) {
        // akun ini gagal beruntun / Flow tersangkut di tampilan edit → mulai lagi di project baru yang bersih
        // (gambar referensi diunggah ulang ke project itu), agar akun tetap ikut bekerja, tidak diam
        acct.fresh = false;
        this._log(`[${tag}] Memulihkan akun: membuka project Flow baru yang bersih…`);
        await Promise.resolve().then(() => session.newProject()).catch((e) => this._log(`[${tag}] Project baru belum dibuat: ${e.message}`));
      }
      acct.jobsRun++;
      const res = await session.generate({ prompt, images, tags, reuseRefs: true, options: { ...b.options, count: job.count } }, {
        onLog: (t) => this._log(`[${tag}] ${t}`),
        shouldStop: () => this.stopRequested,
        timeoutMs: this.store.data.auto.timeoutMin * 60000,
        onFallback: (v) => this.onFallback(acct.id, v)
      });
      if (!res.items || !res.items.length) throw new Error('NO_RESULTS');
      job.projectId = res.projectId;
      job.results = [];
      if (b.autoDownload) {
        const dir = path.join(this.store.data.downloadDir, b.folder);
        const label = b.groups && images.length ? path.basename(images[0]).replace(/\.[^.]+$/, '') : prompt.replace(/\s+/g, ' ');
        const base = `${String(job.n).padStart(3, '0')} ${label.slice(0, 40)}`.trim();
        for (const item of res.items) {
          this._log(`[${tag}] Mengunduh hasil…`);
          const file = await session.download({ ...item, title: base }, dir);
          job.results.push(file);
          this.onDownloaded({ path: file, name: path.basename(file), mediaId: item.mediaId, accountId: acct.id, at: Date.now() });
        }
      } else job.results = res.items.map((i) => i.mediaId);
      job.status = 'done';
      job.finishedAt = Date.now();
      // hasil sebagian (mis. 3 dari 4) → genapi kekurangannya dengan tugas baru
      const got = job.results.length || res.items.length;
      if (got < job.count) this._replace(job, job.count - got, `hanya ${got}/${job.count} hasil`);
      acct.done++;
      acct.fails = 0;
      if (acct.note && acct.status === 'running') acct.note = null; // catatan galat terakhir sudah tidak berlaku
      acct.backoff = Math.max(1, acct.backoff / 2);
      if (video) { acct.credits = Math.max(0, acct.credits - b.cost * job.count); acct.used += b.cost * job.count; }
      b.updatedAt = Date.now();
      this._emit();
      this.emit('job-done', job);
      return true;
    } catch (e) {
      const code = e.message || 'ERROR';
      job.detail = e.detail ? String(e.detail).slice(0, 300) : null;
      b.updatedAt = Date.now();
      if (code === 'STOPPED' || this.stopRequested) {
        job.status = 'pending'; job.accountId = null; job.error = null;
        this._emit();
        return false;
      }
      if (code === 'INSUFFICIENT_CREDITS') {
        // saldo sebenarnya lebih kecil dari perkiraan → akun ini selesai, tugas dipindah ke akun lain
        job.status = 'pending'; job.accountId = null;
        acct.credits = 0; acct.status = 'exhausted'; acct.note = 'Kredit Flow habis';
        this._log(`[${acct.label}] Kredit habis — tugas berikutnya dipindah ke akun lain.`);
        this._emit();
        return false;
      }
      if (code === 'FLOW_UNUSUAL_ACTIVITY') {
        job.status = 'pending'; job.accountId = null;
        acct.status = 'paused'; acct.note = 'Flow mendeteksi aktivitas tidak biasa — akun diistirahatkan (coba lagi ±1 jam lagi)';
        this._log(`[${acct.label}] ${acct.note}.`);
        this._emit();
        return false;
      }
      if (ACCOUNT_FATAL.has(code)) {
        job.status = 'pending'; job.accountId = null;
        acct.status = 'error'; acct.note = code;
        this._log(`[${acct.label}] Akun dilewati: ${code}.`);
        this._emit();
        return false;
      }
      job.attempts = (job.attempts || 0) + 1;
      acct.fails++;
      acct.backoff = Math.min(MAX_BACKOFF, acct.backoff * 2);
      acct.note = code; // tampil di tabel akun: kenapa akun ini gagal
      job.failedOn = [...new Set([...(job.failedOn || []), acct.id])];
      if (code === 'FLOW_EDIT_MODE' || acct.fails % RECOVER_EVERY === 0) acct.fresh = true;
      // video yang melewati batas tunggu mungkin tetap dibuat Flow (kredit terpakai) → jangan diulang otomatis
      const spent = video && code === 'GENERATE_TIMEOUT';
      if (spent) { acct.credits = Math.max(0, acct.credits - b.cost * job.count); acct.used += b.cost * job.count; }
      if (!JOB_FATAL.has(code) && !spent && job.attempts < MAX_ATTEMPTS) {
        // ulangi (maks. 3×) setelah jeda singkat — boleh diambil akun mana pun
        job.status = 'pending'; job.accountId = null; job.error = code;
        job.retryAt = Date.now() + RETRY_DELAY * job.attempts * this.unitMs;
        b.retries = (b.retries || 0) + 1;
        this._log(`[${tag}] Gagal (${code}) — diulang ke-${job.attempts} dari ${MAX_ATTEMPTS - 1}…`);
      } else {
        job.status = 'failed'; job.error = code; job.finishedAt = Date.now();
        acct.failed++;
        this._log(`[${tag}] Tetap gagal setelah ${job.attempts} percobaan (${code}).`);
        this.emit('job-failed', { ...job, prompt });
        if (!JOB_FATAL.has(code)) this._replace(job, job.count, code);
      }
      // gagal beruntun TIDAK lagi mematikan akun (dulu 3× → sisa batch "terlewat" = penyebab 8 gagal);
      // jeda diperpanjang (backoff) + istirahat singkat tiap COOL_EVERY× gagal. Jumlah percobaan tetap terbatas.
      this._emit();
      return true;
    }
  }

  /**
   * Genapi permintaan: tambahkan tugas baru (prompt/gambar sama) untuk `count` hasil yang kurang.
   * Dibatasi MAX_REPLACE per slot. → tugas baru | null
   */
  _replace(job, count, why) {
    const b = this.batch;
    if (this.stopRequested || !(count > 0)) return null;
    const gen = (job.gen || 0) + 1;
    if (gen > MAX_REPLACE) { this._log(`Slot #${job.slot || job.n}: batas ${MAX_REPLACE} tugas pengganti tercapai — tidak digenapi lagi.`); return null; }
    const nj = { id: crypto.randomUUID(), n: b.jobs.length + 1, p: job.p, g: job.g, count, status: 'pending', accountId: null, attempts: 0, results: [],
      error: null, detail: null, slot: job.slot || job.n, gen, replaces: job.n, replacedBy: null };
    b.jobs.push(nj);
    job.replacedBy = nj.n;
    b.replaced = (b.replaced || 0) + 1;
    this._log(`Menggenapi permintaan: tugas baru #${nj.n} (${count} ${b.kind === 'video' ? 'video' : 'gambar'}) menggantikan #${job.n} — ${why}.`);
    return nj;
  }
}

/** Tugas yang diulang oleh "Lanjutkan sisa": dihentikan / terlewat / gagal yang belum punya pengganti. */
function resumableJobs(b) {
  return (b && b.jobs ? b.jobs : []).filter((j) => j.status === 'stopped' || j.status === 'skipped' || (j.status === 'failed' && !j.replacedBy));
}

/** Ringkasan batch: hasil vs target, total durasi (satu runtime) & rata-rata per hasil. */
function bulkSummary(b) {
  const jobs = b && b.jobs ? b.jobs : [];
  const done = jobs.filter((j) => j.status === 'done');
  const items = done.reduce((s, j) => s + (j.results.length || j.count), 0);
  const ms = b && b.startedAt ? Math.max(0, (b.finishedAt || Date.now()) - b.startedAt) : 0;
  return {
    done: done.length, items, target: b ? b.target : 0, ms, perItemMs: items ? Math.round(ms / items) : 0,
    failed: jobs.filter((j) => j.status === 'failed').length,
    skipped: jobs.filter((j) => j.status === 'skipped').length,
    replaced: jobs.filter((j) => j.replacedBy).length,
    retries: b ? b.retries || 0 : 0
  };
}

/** Gambar referensi sebuah tugas: semua gambar (shared) atau kelompoknya sendiri (each). */
function jobImages(b, job) {
  if (b.groups && b.groups.length && job.g !== null && job.g !== undefined) {
    const images = (b.groups[job.g] || []).map((i) => b.images[i]).filter(Boolean);
    return { images, tags: sanitizeTags(null, images) };
  }
  return { images: b.images || [], tags: b.tags || sanitizeTags(null, b.images || []) };
}

function cleanPrompts(list) {
  const arr = Array.isArray(list) ? list : String(list || '').split(/\r?\n/);
  return arr.map((p) => String(p || '').trim()).filter(Boolean).slice(0, MAX_PROMPTS);
}

function fmtDuration(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

module.exports = { BulkRunner, planBulk, bulkUnits, jobImages, cleanPrompts, fmtDuration, bulkSummary, resumableJobs, MAX_BULK, DELAY, MAX_ATTEMPTS, MAX_REPLACE };
