'use strict';
// Bulk Generate: rencana kredit per akun, antre lintas akun, batas 300, perpindahan saat kredit habis, timer batch.
const test = require('node:test');
const assert = require('node:assert');
const { BulkRunner, planBulk, bulkUnits, jobImages, fmtDuration, bulkSummary, resumableJobs, MAX_BULK, MAX_ATTEMPTS, MAX_REPLACE } = require('../src/main/bulk');
const { creditCost, FREE_DAILY_CREDITS } = require('../src/main/catalog');

const ACCS = [1, 2, 3, 4, 5].map((i) => ({ id: 'a' + i, label: 'Akun ' + i }));
const mkStore = (accounts = ACCS) => ({ data: { mode: 'auto', autoAck: 1, accounts, auto: { timeoutMin: 1, autoDownload: false }, downloadDir: '/tmp/fc-bulk', bulk: null }, save() {} });
const done = (r) => new Promise((res) => r.once('finished', res));

/** sesi Flow palsu: catat panggilan per akun; `fail(id, nKe)` → galat */
function fakeSessions(fail = () => null, log = []) {
  const calls = {};
  let n = 0;
  return {
    calls, log,
    get: async (id) => ({
      newProject: async () => { log.push(['project', id]); },
      generate: async (job) => {
        calls[id] = (calls[id] || 0) + 1;
        log.push(['gen', id, job.prompt, job.options.count]);
        await new Promise((r) => setTimeout(r, 3));
        const code = fail(id, calls[id], job);
        if (code && typeof code === 'object') return { items: Array.from({ length: code.items }, () => ({ mediaId: 'm' + ++n })), projectId: 'p-' + id };
        if (code) throw new Error(code);
        return { items: Array.from({ length: job.options.count || 1 }, () => ({ mediaId: 'm' + ++n })), projectId: 'p-' + id };
      }
    })
  };
}

test('Biaya kredit 720p: Omni 1.1 Flash 10 dtk = 15, Omni 1.2 Flash = 30, Veo Lite 10, gambar 0', () => {
  assert.strictEqual(creditCost('video', 'Omni 1.1 Flash', 10), 15);
  assert.strictEqual(creditCost('video', 'Omni 1.2 Flash', 10), 30);
  assert.strictEqual(creditCost('video', 'Veo 3.1 - Lite', 8), 10);
  assert.strictEqual(creditCost('video', 'Veo 3.1 - Fast', 8), 20);
  assert.strictEqual(creditCost('video', 'Veo 3.1 - Quality', 8), 100);
  assert.strictEqual(creditCost('image', 'Nano Banana 2.1'), 0);
  assert.strictEqual(creditCost('video', 'Model Baru X'), null);
  assert.strictEqual(FREE_DAILY_CREDITS, 50);
});

test('Rencana video: 5 akun × 50 kredit, Omni 1.1 Flash (15) → 5 × 3 = 15 video, antre akun demi akun', () => {
  const p = planBulk({ kind: 'video', prompts: 2, accounts: ACCS.map((a) => ({ id: a.id, credits: 50 })), cost: 15 });
  assert.strictEqual(p.capacity, 15);
  assert.strictEqual(p.target, 15);
  assert.deepStrictEqual(p.accounts.map((a) => a.planned), [3, 3, 3, 3, 3]);
  assert.strictEqual(p.credits, 225);
  // minta 7 → akun 1 penuh (3), akun 2 penuh (3), akun 3 sisanya (1)
  const q = planBulk({ kind: 'video', count: 7, prompts: 1, accounts: ACCS.map((a) => ({ id: a.id, credits: 50 })), cost: 15 });
  assert.deepStrictEqual(q.accounts.map((a) => a.planned), [3, 3, 1, 0, 0]);
  // minta lebih dari kredit → dibatasi + peringatan
  const r = planBulk({ kind: 'video', count: 40, prompts: 1, accounts: ACCS.map((a) => ({ id: a.id, credits: 50 })), cost: 15 });
  assert.strictEqual(r.target, 15);
  assert.ok(r.warnings.includes('NOT_ENOUGH_CREDITS'));
  // kredit belum diketahui → kapasitas 0 untuk akun itu
  const u = planBulk({ kind: 'video', prompts: 1, accounts: [{ id: 'a1', credits: 50 }, { id: 'a2', credits: null }], cost: 30 });
  assert.strictEqual(u.target, 1);
  assert.ok(u.warnings.includes('UNKNOWN_CREDITS'));
});

test('Rencana gambar: maks. 300 hasil, 4 per Generate → 75 tugas dibagi rata', () => {
  const p = planBulk({ kind: 'image', count: 999, perJob: 4, prompts: 10, accounts: [{ id: 'a1' }, { id: 'a2' }] });
  assert.strictEqual(MAX_BULK, 300);
  assert.strictEqual(p.target, 300);
  assert.strictEqual(p.jobs, 75);
  assert.deepStrictEqual(p.accounts.map((a) => a.planned), [38, 37]);
  assert.ok(p.warnings.includes('MAX_BULK'));
  // tanpa jumlah → 1 Generate per prompt
  const q = planBulk({ kind: 'image', perJob: 2, prompts: 6, accounts: [{ id: 'a1' }] });
  assert.strictEqual(q.target, 12);
  assert.strictEqual(q.jobs, 6);
});

test('Bulk video berjalan lintas akun; kredit habis lebih awal → sisa dipindah / terlewat; timer batch tercatat', async () => {
  const store = mkStore();
  const fs = fakeSessions((id, n) => (id === 'a2' && n === 2 ? 'INSUFFICIENT_CREDITS' : null));
  const r = new BulkRunner({ store, getSession: fs.get, unitMs: 1 });
  const st = r.start({ prompts: ['kucing', 'anjing'], options: { kind: 'video', model: 'Omni 1.1 Flash' }, accounts: ACCS.map((a) => ({ id: a.id, credits: 50 })), minDelay: 3, maxDelay: 3, parallel: true });
  assert.strictEqual(st.batch.jobs.length, 15);
  assert.strictEqual(st.batch.cost, 15);
  assert.ok(st.batch.startedAt > 0 && !st.batch.finishedAt);
  const res = await done(r);
  const b = store.data.bulk;
  assert.strictEqual(res.done, 13);
  assert.strictEqual(res.skipped, 2);
  assert.ok(b.finishedAt >= b.startedAt);
  const a2 = b.accounts.find((a) => a.id === 'a2');
  assert.strictEqual(a2.status, 'exhausted');
  assert.strictEqual(a2.credits, 0);
  assert.deepStrictEqual(b.accounts.filter((a) => a.id !== 'a2').map((a) => a.done), [3, 3, 3, 3]);
  assert.ok(b.accounts.filter((a) => a.id !== 'a2').every((a) => a.credits === 5 && a.used === 45));
  assert.ok(b.jobs.filter((j) => j.status === 'skipped').every((j) => j.error === 'NO_CREDITS_LEFT'));
  // prompt bergiliran
  assert.deepStrictEqual([...new Set(fs.log.filter((x) => x[0] === 'gen').map((x) => x[2]))].sort(), ['anjing', 'kucing']);
});

test('Bulk berurutan: satu Generate pada satu waktu, akun bergiliran; akun yang menolak diistirahatkan', async () => {
  const store = mkStore(ACCS.slice(0, 3));
  let active = 0, peak = 0;
  const base = fakeSessions((id) => (id === 'a3' ? 'FLOW_UNUSUAL_ACTIVITY' : null));
  const get = async (id) => {
    const s = await base.get(id);
    return { ...s, generate: async (job) => { active++; peak = Math.max(peak, active); try { return await s.generate(job); } finally { active--; } } };
  };
  const r = new BulkRunner({ store, getSession: get, unitMs: 1 });
  r.start({ prompts: ['a', 'b', 'c'], count: 10, options: { kind: 'image', count: 1 }, accounts: ACCS.slice(0, 3).map((a) => ({ id: a.id })), minDelay: 3, maxDelay: 3 });
  const res = await done(r);
  assert.strictEqual(peak, 1);
  assert.strictEqual(res.items, 10);
  const b = store.data.bulk;
  assert.strictEqual(b.accounts[2].status, 'paused');
  assert.strictEqual(b.accounts[0].done + b.accounts[1].done, 10);
  assert.ok(Math.abs(b.accounts[0].done - b.accounts[1].done) <= 1, 'dua akun tersisa bergiliran');
  // project baru dibuat sekali per akun di awal batch
  assert.ok(base.log.filter((x) => x[0] === 'project' && x[1] === 'a1').length === 1);
});

test('Bulk gambar: jumlah per Generate terakhir disesuaikan (10 hasil, 4 per Generate → 4+4+2); masukan tidak valid tidak diulang', async () => {
  const store = mkStore(ACCS.slice(0, 1));
  const fs = fakeSessions();
  const r = new BulkRunner({ store, getSession: fs.get, unitMs: 1 });
  r.start({ prompts: ['x'], count: 10, options: { kind: 'image', count: 4 }, accounts: [{ id: 'a1' }], minDelay: 3, maxDelay: 3 });
  const res = await done(r);
  assert.strictEqual(res.items, 10);
  assert.deepStrictEqual(fs.log.filter((x) => x[0] === 'gen').map((x) => x[3]), [4, 4, 2]);

  const store2 = mkStore(ACCS.slice(0, 1));
  const fs2 = fakeSessions((id, n) => (n === 1 ? 'INVALID_PROMPT' : n === 2 ? 'GENERATE_FAILED' : null));
  const r2 = new BulkRunner({ store: store2, getSession: fs2.get, unitMs: 1 });
  r2.start({ prompts: ['p1', 'p2'], options: { kind: 'image', count: 1 }, accounts: [{ id: 'a1' }], minDelay: 3, maxDelay: 3 });
  const res2 = await done(r2);
  assert.strictEqual(res2.failed, 1); // masukan tidak valid → gagal permanen, tanpa pengganti
  assert.strictEqual(res2.done, 1); // GENERATE_FAILED → diulang lalu berhasil
  assert.strictEqual(store2.data.bulk.jobs.find((j) => j.status === 'failed').error, 'INVALID_PROMPT');
  assert.strictEqual(store2.data.bulk.jobs.length, 2);
});

test('Bulk: wajib Mode Otomatis, akun & kredit; berhenti → tugas "dihentikan"; lanjutkan memakai sisa', async () => {
  const store = mkStore(ACCS.slice(0, 2));
  const fs = fakeSessions();
  const r = new BulkRunner({ store, getSession: fs.get, unitMs: 1 });
  assert.throws(() => r.start({ prompts: ['x'], options: { kind: 'image' }, accounts: [] }), /NO_ACCOUNTS/);
  assert.throws(() => r.start({ prompts: ['x'], options: { kind: 'video', model: 'Omni 1.1 Flash' }, accounts: [{ id: 'a1', credits: 10 }] }), /NOT_ENOUGH_CREDITS/);
  assert.throws(() => r.start({ prompts: ['x'], options: { kind: 'video', model: 'Omni 1.2 Flash', sub: 'frames' }, accounts: [{ id: 'a1', credits: 50 }] }), /FRAMES_REQUIRED/);
  store.data.mode = 'safe';
  assert.throws(() => r.start({ prompts: ['x'], options: { kind: 'image' }, accounts: [{ id: 'a1' }] }), /AUTO_MODE_DISABLED/);
  store.data.mode = 'auto';
  r.start({ prompts: ['x'], count: 50, options: { kind: 'image', count: 1 }, accounts: [{ id: 'a1' }], minDelay: 50, maxDelay: 50 });
  await new Promise((res) => setTimeout(res, 30));
  r.stop();
  const res = await done(r);
  assert.ok(res.stopped);
  const b = store.data.bulk;
  assert.ok(b.jobs.some((j) => j.status === 'stopped'));
  const before = b.jobs.filter((j) => j.status === 'done').length;
  const ran1 = b.finishedAt - b.startedAt;
  await new Promise((res) => setTimeout(res, 120)); // jeda saat aplikasi diam: tidak ikut dihitung
  r.resume();
  assert.ok(Date.now() - b.startedAt >= ran1 && Date.now() - b.startedAt < ran1 + 100, 'satu runtime: timer diteruskan, bukan mulai dari nol');
  b.minDelay = b.maxDelay = 3;
  await done(r);
  assert.strictEqual(store.data.bulk.jobs.filter((j) => j.status === 'done').length, 50);
  assert.ok(before < 50);
  assert.strictEqual(fmtDuration(65000), '01:05');
  assert.strictEqual(fmtDuration(3723000), '1:02:03');
});

test('Gambar referensi Bulk: "sama untuk semua" (maks. 10) vs "satu per prompt" (maks. 300, Frame = pasangan)', async () => {
  const img = (n) => Array.from({ length: n }, (_, i) => `/r/foto ${i + 1}.png`);
  const IMG = { kind: 'image' }, FR = { kind: 'video', sub: 'frames' }, ING = { kind: 'video', sub: 'ingredients' };
  // sama untuk semua: dibatasi 10, satu set untuk semua tugas
  let u = bulkUnits({ prompts: ['a', 'b'], images: img(12) }, IMG);
  assert.strictEqual(u.refMode, 'shared');
  assert.strictEqual(u.images.length, 10);
  assert.strictEqual(u.groups, null);
  assert.strictEqual(u.units, 2);
  assert.strictEqual(bulkUnits({ prompts: [], images: img(1) }, IMG).units, 1); // gambar saja tanpa prompt → 1 variasi
  assert.throws(() => bulkUnits({ prompts: ['a'], images: img(3) }, FR), /FRAMES_REQUIRED/);
  // satu per prompt: gambar i ↔ prompt i, jumlah variasi = yang terbanyak
  u = bulkUnits({ prompts: ['a', 'b'], images: img(5), refMode: 'each' }, ING);
  assert.deepStrictEqual(u.groups, [[0], [1], [2], [3], [4]]);
  assert.strictEqual(u.units, 5);
  assert.strictEqual(bulkUnits({ prompts: [], images: img(320), refMode: 'each' }, IMG).units, 300);
  // Frame per prompt: pasangan awal+akhir; ganjil → galat dengan rincian
  u = bulkUnits({ prompts: ['gerak'], images: img(6), refMode: 'each' }, FR);
  assert.deepStrictEqual(u.groups, [[0, 1], [2, 3], [4, 5]]);
  assert.strictEqual(u.units, 3);
  assert.throws(() => bulkUnits({ prompts: ['x'], images: img(5), refMode: 'each' }, FR), (e) => e.message === 'FRAMES_REQUIRED' && /5 foto/.test(e.detail));
  // jobImages: kelompok per tugas; tag dari nama file
  const b = { images: img(4), groups: [[0, 1], [2, 3]], tags: null };
  assert.deepStrictEqual(jobImages(b, { g: 1 }).images, ['/r/foto 3.png', '/r/foto 4.png']);
  assert.strictEqual(jobImages(b, { g: 1 }).tags.length, 2);
  assert.deepStrictEqual(jobImages({ images: img(2), groups: null, tags: ['a', 'b'] }, { g: null }), { images: img(2), tags: ['a', 'b'] });

  // rencana: refError tidak melempar, jumlah variasi ikut gambar
  const store = mkStore(ACCS.slice(0, 2));
  const seen = [];
  const get = async (id) => ({
    newProject: async () => {},
    generate: async (job) => { seen.push([id, job.prompt, job.images, job.reuseRefs]); return { items: [{ mediaId: 'm' + seen.length }], projectId: 'p' }; }
  });
  const r = new BulkRunner({ store, getSession: get, unitMs: 1 });
  let p = r.plan({ prompts: ['x'], images: img(3), refMode: 'each', options: FR, accounts: [{ id: 'a1', credits: 50 }] });
  assert.strictEqual(p.refError.code, 'FRAMES_REQUIRED');
  p = r.plan({ prompts: ['x'], images: img(4), refMode: 'each', options: IMG, accounts: [{ id: 'a1' }] });
  assert.deepStrictEqual([p.refError, p.refMode, p.units, p.groups, p.target], [null, 'each', 4, 4, 4]);
  // berjalan: tiap tugas memakai gambarnya sendiri, prompt bergiliran
  r.start({ prompts: ['p1', 'p2'], images: img(4), refMode: 'each', options: { kind: 'image', count: 1 }, accounts: [{ id: 'a1' }, { id: 'a2' }], minDelay: 3, maxDelay: 3 });
  const res = await done(r);
  assert.strictEqual(res.done, 4);
  const byImg = Object.fromEntries(seen.map((x) => [x[2][0], x[1]]));
  assert.deepStrictEqual(byImg, { '/r/foto 1.png': 'p1', '/r/foto 2.png': 'p2', '/r/foto 3.png': 'p1', '/r/foto 4.png': 'p2' });
  assert.ok(seen.every((x) => x[2].length === 1 && x[3] === true));
  // sama untuk semua: setiap tugas membawa set yang sama
  seen.length = 0;
  r.start({ prompts: ['p1', 'p2', 'p3'], images: img(2), options: { kind: 'image', count: 1 }, accounts: [{ id: 'a1' }], minDelay: 3, maxDelay: 3 });
  await done(r);
  assert.strictEqual(seen.length, 3);
  assert.ok(seen.every((x) => x[2].length === 2));
});

test('Bulk 20 gambar, 1 akun: gagal diulang 3×, tetap gagal → dibiarkan gagal + tugas baru menggenapi 20; satu runtime', async () => {
  assert.strictEqual(MAX_ATTEMPTS, 4);
  const store = mkStore(ACCS.slice(0, 1));
  const prompts = Array.from({ length: 20 }, (_, i) => 'p' + (i + 1));
  const tries = {};
  // prompt p13–p20 gagal pada 4 percobaan pertama (tugas asli), lalu berhasil di tugas pengganti
  const fs = fakeSessions((id, n, job) => {
    tries[job.prompt] = (tries[job.prompt] || 0) + 1;
    return Number(job.prompt.slice(1)) > 12 && tries[job.prompt] <= 4 ? (tries[job.prompt] % 2 ? 'GENERATE_FAILED' : 'FLOW_CONTENT_POLICY') : null;
  });
  const r = new BulkRunner({ store, getSession: fs.get, unitMs: 1 });
  const logs = [];
  r.on('activity', (t) => logs.push(t));
  r.start({ prompts, options: { kind: 'image', count: 1 }, accounts: [{ id: 'a1' }], minDelay: 3, maxDelay: 3 });
  const res = await done(r);
  const b = store.data.bulk;
  assert.strictEqual(res.items, 20, 'permintaan 20 gambar tetap genap');
  assert.strictEqual(res.target, 20);
  assert.strictEqual(res.failed, 8, 'tugas yang tetap gagal dibiarkan gagal');
  assert.strictEqual(res.replaced, 8);
  assert.strictEqual(res.skipped, 0, 'akun tidak lagi dimatikan setelah 3× gagal beruntun');
  assert.strictEqual(b.jobs.length, 28);
  const failed = b.jobs.filter((j) => j.status === 'failed');
  assert.ok(failed.every((j) => j.attempts === 4 && j.replacedBy), '1 percobaan + 3× ulang');
  const extra = b.jobs.filter((j) => j.replaces);
  assert.deepStrictEqual(extra.map((j) => b.prompts[j.p]).sort(), failed.map((j) => b.prompts[j.p]).sort(), 'pengganti memakai prompt yang sama');
  assert.ok(extra.every((j) => j.status === 'done' && j.gen === 1 && j.n > 20));
  assert.strictEqual(fs.log.filter((x) => x[0] === 'gen').length, 12 + 8 * 4 + 8);
  assert.strictEqual(res.retries, 8 * 3);
  assert.strictEqual(b.accounts[0].status, 'done');
  // satu runtime untuk seluruh proses + rata-rata per gambar
  assert.strictEqual(res.ms, b.finishedAt - b.startedAt);
  assert.strictEqual(res.perItemMs, Math.round(res.ms / 20));
  assert.strictEqual(b.runs, 1);
  assert.ok(logs.some((t) => /Bulk selesai: 20\/20 gambar .*8 gagal \(8 diganti tugas baru\).*total durasi .*rata-rata .* per gambar/.test(t)), logs.slice(-1)[0]);
  assert.ok(logs.some((t) => /diulang ke-3 dari 3/.test(t)));
  assert.strictEqual(resumableJobs(b).length, 0, 'gagal yang sudah diganti tidak diulang lagi oleh "Lanjutkan sisa"');
  const sum = bulkSummary(b);
  assert.strictEqual(sum.items, 20);
});

test('Bulk: hasil sebagian digenapi; pengganti dibatasi per slot; galat lama di halaman diabaikan Flow', async () => {
  // 4 per Generate, Generate pertama hanya memberi 3 → tugas baru 1 gambar
  const store = mkStore(ACCS.slice(0, 1));
  const fs = fakeSessions((id, n) => (n === 1 ? { items: 3 } : null));
  const r = new BulkRunner({ store, getSession: fs.get, unitMs: 1 });
  r.start({ prompts: ['x'], count: 8, options: { kind: 'image', count: 4 }, accounts: [{ id: 'a1' }], minDelay: 3, maxDelay: 3 });
  const res = await done(r);
  assert.strictEqual(res.items, 8);
  assert.deepStrictEqual(fs.log.filter((x) => x[0] === 'gen').map((x) => x[3]), [4, 4, 1]);

  // prompt yang selalu gagal: 1 tugas asli + maks. MAX_REPLACE pengganti, masing-masing 4 percobaan → berhenti
  const store2 = mkStore(ACCS.slice(0, 1));
  const fs2 = fakeSessions((id, n, job) => (job.prompt === 'buruk' ? 'FLOW_CONTENT_POLICY' : null));
  const r2 = new BulkRunner({ store: store2, getSession: fs2.get, unitMs: 1 });
  const logs = [];
  r2.on('activity', (t) => logs.push(t));
  r2.start({ prompts: ['baik', 'buruk'], options: { kind: 'image', count: 1 }, accounts: [{ id: 'a1' }], minDelay: 3, maxDelay: 3 });
  const res2 = await done(r2);
  const b2 = store2.data.bulk;
  assert.strictEqual(res2.items, 1);
  assert.strictEqual(res2.failed, 1 + MAX_REPLACE);
  assert.strictEqual(fs2.log.filter((x) => x[0] === 'gen' && x[2] === 'buruk').length, (1 + MAX_REPLACE) * 4);
  assert.ok(logs.some((t) => /batas 3 tugas pengganti/.test(t)));
  assert.strictEqual(resumableJobs(b2).length, 1, 'hanya pengganti terakhir yang bisa dilanjutkan');
  assert.strictEqual(b2.accounts[0].status, 'done', 'akun tetap dipakai sampai akhir');
});

test('Bulk: akun yang gagal dipulihkan (project baru), ulangan diambil akun lain, alasan gagal tampil; FLOW_EDIT_MODE diulang', async () => {
  const store = mkStore(ACCS.slice(0, 3));
  const prompts = Array.from({ length: 12 }, (_, i) => 'p' + (i + 1));
  // a2: 2 percobaan pertama gagal (mis. tersangkut di tampilan edit) lalu pulih; a3: sekali FLOW_EDIT_MODE
  const fs = fakeSessions((id, n) => (id === 'a2' && n <= 2 ? 'GENERATE_TIMEOUT' : id === 'a3' && n === 1 ? 'FLOW_EDIT_MODE' : null));
  const r = new BulkRunner({ store, getSession: fs.get, unitMs: 1 });
  r.start({ prompts, options: { kind: 'image', count: 1 }, accounts: ACCS.slice(0, 3).map((a) => ({ id: a.id })), minDelay: 3, maxDelay: 3, parallel: true });
  const res = await done(r);
  const b = store.data.bulk;
  assert.strictEqual(res.items, 12);
  assert.strictEqual(res.failed, 0, 'semua tugas yang gagal berhasil saat diulang');
  const [a1, a2, a3] = b.accounts;
  assert.ok(a2.done > 0 && a3.done > 0, `semua akun ikut bekerja (a1 ${a1.done}, a2 ${a2.done}, a3 ${a3.done})`);
  const projects = fs.log.filter((x) => x[0] === 'project').map((x) => x[1]);
  const nProj = (id) => projects.filter((x) => x === id).length;
  const base = nProj('a1'); // project awal batch (bila diaktifkan) — akun sehat tidak dapat project tambahan
  assert.ok(base <= 1, 'akun yang sehat tidak diganggu');
  assert.strictEqual(nProj('a2'), base + 1, 'a2 dipulihkan dengan project baru setelah 2× gagal beruntun');
  assert.strictEqual(nProj('a3'), base + 1, 'tampilan edit → project baru yang bersih');
  const retried = b.jobs.filter((j) => (j.failedOn || []).length);
  assert.ok(retried.length >= 3);
  assert.ok(retried.every((j) => j.status === 'done' && !j.failedOn.includes(j.accountId)), 'ulangan diselesaikan akun lain');
  assert.strictEqual(a2.note, null, 'catatan galat hilang setelah akun berhasil lagi');
  // alasan gagal tampil di tabel akun selama belum pulih
  const store2 = mkStore(ACCS.slice(0, 2));
  const fs2 = fakeSessions((id) => (id === 'a2' ? 'REFERENCE_NOT_ATTACHED' : null));
  const r2 = new BulkRunner({ store: store2, getSession: fs2.get, unitMs: 1 });
  r2.start({ prompts: ['x', 'y', 'z', 'w'], options: { kind: 'image', count: 1 }, accounts: ACCS.slice(0, 2).map((a) => ({ id: a.id })), minDelay: 3, maxDelay: 3, parallel: true });
  await done(r2);
  assert.strictEqual(store2.data.bulk.accounts[1].note, 'REFERENCE_NOT_ATTACHED');
  assert.strictEqual(bulkSummary(store2.data.bulk).items, 4);
});
