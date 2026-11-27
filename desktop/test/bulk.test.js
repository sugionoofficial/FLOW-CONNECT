'use strict';
// Bulk Generate: rencana kredit per akun, antre lintas akun, batas 300, perpindahan saat kredit habis, timer batch.
const test = require('node:test');
const assert = require('node:assert');
const { BulkRunner, planBulk, fmtDuration, MAX_BULK } = require('../src/main/bulk');
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
        const code = fail(id, calls[id]);
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

test('Bulk gambar: jumlah per Generate terakhir disesuaikan (10 hasil, 4 per Generate → 4+4+2); galat kebijakan tidak diulang', async () => {
  const store = mkStore(ACCS.slice(0, 1));
  const fs = fakeSessions();
  const r = new BulkRunner({ store, getSession: fs.get, unitMs: 1 });
  r.start({ prompts: ['x'], count: 10, options: { kind: 'image', count: 4 }, accounts: [{ id: 'a1' }], minDelay: 3, maxDelay: 3 });
  const res = await done(r);
  assert.strictEqual(res.items, 10);
  assert.deepStrictEqual(fs.log.filter((x) => x[0] === 'gen').map((x) => x[3]), [4, 4, 2]);

  const store2 = mkStore(ACCS.slice(0, 1));
  const fs2 = fakeSessions((id, n) => (n === 1 ? 'FLOW_CONTENT_POLICY' : n === 2 ? 'GENERATE_FAILED' : null));
  const r2 = new BulkRunner({ store: store2, getSession: fs2.get, unitMs: 1 });
  r2.start({ prompts: ['p1', 'p2'], options: { kind: 'image', count: 1 }, accounts: [{ id: 'a1' }], minDelay: 3, maxDelay: 3 });
  const res2 = await done(r2);
  assert.strictEqual(res2.failed, 1); // kebijakan → gagal permanen
  assert.strictEqual(res2.done, 1); // GENERATE_FAILED → diulang lalu berhasil
  assert.strictEqual(store2.data.bulk.jobs.find((j) => j.status === 'failed').error, 'FLOW_CONTENT_POLICY');
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
  r.resume();
  b.minDelay = b.maxDelay = 3;
  await done(r);
  assert.strictEqual(store.data.bulk.jobs.filter((j) => j.status === 'done').length, 50);
  assert.ok(before < 50);
  assert.strictEqual(fmtDuration(65000), '01:05');
  assert.strictEqual(fmtDuration(3723000), '1:02:03');
});
