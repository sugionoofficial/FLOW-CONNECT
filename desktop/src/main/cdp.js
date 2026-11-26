'use strict';
// Klien Chrome DevTools Protocol minimal (WebSocket bawaan Node ≥ 22, tanpa dependensi).
// Sengaja TIDAK memanggil Runtime.enable / Console.enable (sering dipakai situs untuk mendeteksi DevTools).
const { EventEmitter } = require('events');

class CDPConnection extends EventEmitter {
  constructor(ws) {
    super();
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.closed = false;
    ws.addEventListener('message', (ev) => this._onMessage(ev.data));
    ws.addEventListener('close', () => this._onClose());
    ws.addEventListener('error', () => this._onClose());
  }

  static connect(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      const t = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error('CDP_TIMEOUT')); }, timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(t); resolve(new CDPConnection(ws)); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('CDP_CONNECT_FAILED')); }, { once: true });
    });
  }

  _onMessage(data) {
    let msg;
    try { msg = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8')); } catch { return; }
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message || 'CDP_ERROR'));
      else p.resolve(msg.result);
    } else if (msg.method) {
      this.emit(msg.method, msg.params);
    }
  }

  _onClose() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP_CLOSED')); }
    this.pending.clear();
    this.emit('close');
  }

  send(method, params = {}, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('CDP_CLOSED'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP_TIMEOUT')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.ws.close(); } catch { /* */ }
    this._onClose();
  }
}

module.exports = { CDPConnection };
