'use strict';
// Pengamat lalu lintas `batchexecute` tab Google Flow lewat CDP Network domain.
// Hanya MEMBACA balasan yang diterima halaman (unggah selesai? generate ditolak? status video gagal?).
// Network.enable tidak terlihat oleh halaman (berbeda dengan Runtime.enable).
const { rpcidsOf } = require('./wire');

const MAX_EVENTS = 300;

class NetWatch {
  constructor(page) {
    this.page = page;
    this.seq = 0;
    this.events = [];      // {seq, kind:'request'|'reply'|'failed', rpcids, status, text, t}
    this.pending = new Map(); // requestId → {rpcids, status}
    this.waiters = new Set();
    this.enabled = false;
  }

  async enable() {
    if (this.enabled) return this;
    const p = this.page;
    p.on('Network.requestWillBeSent', (e) => {
      const rpcids = rpcidsOf(e.request && e.request.url);
      if (!rpcids.length) return;
      this.pending.set(e.requestId, { rpcids, status: 0 });
      this._push({ kind: 'request', rpcids });
    });
    p.on('Network.responseReceived', (e) => {
      const r = this.pending.get(e.requestId);
      if (r) r.status = e.response ? e.response.status : 0;
    });
    p.on('Network.loadingFinished', async (e) => {
      const r = this.pending.get(e.requestId);
      if (!r) return;
      this.pending.delete(e.requestId);
      let text = '';
      try {
        const b = await p.send('Network.getResponseBody', { requestId: e.requestId }, 15000);
        text = b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body;
      } catch { text = null; }
      this._push({ kind: 'reply', rpcids: r.rpcids, status: r.status, text });
    });
    p.on('Network.loadingFailed', (e) => {
      const r = this.pending.get(e.requestId);
      if (!r) return;
      this.pending.delete(e.requestId);
      this._push({ kind: 'failed', rpcids: r.rpcids, status: 0, text: null, error: e.errorText });
    });
    await p.send('Network.enable', { maxResourceBufferSize: 8 * 1024 * 1024, maxTotalBufferSize: 64 * 1024 * 1024 });
    this.enabled = true;
    return this;
  }

  _push(ev) {
    ev.seq = ++this.seq;
    ev.t = Date.now();
    this.events.push(ev);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    for (const w of [...this.waiters]) if (w.test(ev)) { this.waiters.delete(w); w.resolve(ev); }
  }

  /** Penanda posisi: event setelah ini saja yang dihitung. */
  mark() { return this.seq; }

  /** Event setelah `mark` yang cocok `pred`. */
  since(mark, pred = () => true) { return this.events.filter((e) => e.seq > mark && pred(e)); }

  /** Tunggu event (setelah `mark`) yang cocok; null bila habis waktu. */
  wait(mark, pred, timeoutMs) {
    const hit = this.events.find((e) => e.seq > mark && pred(e));
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve) => {
      const w = { test: (e) => e.seq > mark && pred(e), resolve };
      this.waiters.add(w);
      setTimeout(() => { if (this.waiters.delete(w)) resolve(null); }, timeoutMs);
    });
  }
}

const has = (ids) => (e) => e.rpcids.some((r) => ids.includes(r));

module.exports = { NetWatch, has };
