'use strict';
// Lisensi aplikasi: kunci dibuat pengguna di situs FLOW CONNECT (/app/lisensi), lalu diaktifkan di sini.
// Verifikasi lewat RPC Supabase `activate_license` (hanya pemegang kunci yang bisa memakainya).
// Tanpa internet aplikasi tetap bisa dipakai selama masa tenggang sejak verifikasi terakhir.
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const SUPABASE_URL = 'https://zpuubgziohvqavmihgls.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NivmzCFYl2Rcy8qdJD_7zA_t2ZQnBTI';
const GRACE_MS = 7 * 24 * 3600 * 1000;   // boleh offline 7 hari
const RECHECK_MS = 6 * 3600 * 1000;      // verifikasi ulang tiap 6 jam
const KEY_RE = /^FC(-[A-Z0-9]{5}){5}$/;
// Galat dari server yang berarti kunci tidak boleh dipakai lagi (bukan masalah jaringan)
const FATAL = ['INVALID_KEY', 'REVOKED', 'EXPIRED', 'DEVICE_LIMIT', 'INVALID_DEVICE'];

function normalizeKey(k) {
  const raw = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = raw.startsWith('FC') ? raw.slice(2) : raw;
  if (body.length !== 25) return String(k || '').trim().toUpperCase();
  return 'FC-' + body.match(/.{5}/g).join('-');
}

class LicenseManager extends EventEmitter {
  /**
   * @param {object} o
   * @param {object} o.store      Store (data.license, data.deviceId)
   * @param {string} o.version    versi aplikasi
   * @param {object} [o.crypt]    { encrypt(str)→str, decrypt(str)→str } (safeStorage)
   * @param {Function} [o.fetch]
   * @param {Function} [o.now]
   */
  constructor({ store, version, crypt, fetch: f, now, url = SUPABASE_URL, key = SUPABASE_KEY }) {
    super();
    this.store = store;
    this.version = version;
    this.crypt = crypt || { encrypt: (s) => s, decrypt: (s) => s };
    this.fetch = f || globalThis.fetch;
    this.now = now || Date.now;
    this.url = url;
    this.apiKey = key;
    this.checking = false;
    this.lastError = null;
    this._timer = null;
    if (!store.data.deviceId) { store.data.deviceId = crypto.randomUUID(); store.save(); }
  }

  get deviceId() { return this.store.data.deviceId; }

  _saved() { return this.store.data.license || null; }

  _key() {
    const l = this._saved();
    if (!l || !l.key) return null;
    try { return this.crypt.decrypt(l.key); } catch { return null; }
  }

  /** Status untuk tampilan. state: none | valid | offline | invalid */
  state() {
    const l = this._saved();
    if (!l || !l.key) return { state: 'none', error: this.lastError, deviceId: this.deviceId };
    const base = { info: l.info || null, hint: l.hint || null, checkedAt: l.checkedAt || null, deviceId: this.deviceId };
    if (l.error) return { ...base, state: 'invalid', error: l.error };
    const expires = l.info && l.info.expires_at ? Date.parse(l.info.expires_at) : null;
    if (expires && expires < this.now()) return { ...base, state: 'invalid', error: 'EXPIRED' };
    if (l.checkedAt && this.now() - l.checkedAt < GRACE_MS) {
      return { ...base, state: this.lastError === 'NETWORK' ? 'offline' : 'valid', graceUntil: l.checkedAt + GRACE_MS };
    }
    return { ...base, state: 'invalid', error: this.lastError === 'NETWORK' ? 'OFFLINE_TOO_LONG' : 'NOT_VERIFIED' };
  }

  get licensed() { const s = this.state().state; return s === 'valid' || s === 'offline'; }

  async _rpc(fn, body) {
    let res;
    try {
      res = await this.fetch(`${this.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      throw new Error('NETWORK');
    }
    if (!res.ok) throw new Error(res.status >= 500 || res.status === 429 ? 'NETWORK' : `SERVER_${res.status}`);
    return res.json();
  }

  _payload(key) {
    return { p_key: key, p_device_id: this.deviceId, p_device_name: os.hostname().slice(0, 100), p_platform: process.platform, p_app_version: this.version };
  }

  /** Aktifkan kunci baru. Melempar Error(kode) bila gagal; kunci lama tidak diubah bila gagal. */
  async activate(rawKey) {
    const key = normalizeKey(rawKey);
    if (!KEY_RE.test(key)) throw new Error('INVALID_KEY');
    const r = await this._rpc('activate_license', this._payload(key));
    if (!r || !r.ok) throw new Error((r && r.error) || 'INVALID_KEY');
    this.lastError = null;
    this.store.data.license = { key: this.crypt.encrypt(key), hint: key.slice(0, 8) + '…' + key.slice(-5), info: r, checkedAt: this.now(), error: null };
    this.store.save();
    this._emit();
    return this.state();
  }

  /** Verifikasi ulang kunci tersimpan (saat mulai & berkala). Tidak melempar. */
  async verify() {
    const key = this._key();
    if (!key || this.checking) return this.state();
    this.checking = true;
    try {
      const r = await this._rpc('activate_license', this._payload(key));
      const l = this.store.data.license;
      if (r && r.ok) { l.info = r; l.checkedAt = this.now(); l.error = null; this.lastError = null; }
      else { const e = (r && r.error) || 'INVALID_KEY'; this.lastError = e; if (FATAL.includes(e)) l.error = e; }
      this.store.save();
    } catch (e) {
      this.lastError = e.message === 'NETWORK' ? 'NETWORK' : e.message;
    } finally {
      this.checking = false;
    }
    this._emit();
    return this.state();
  }

  /** Keluar dari lisensi di PC ini (melepas slot perangkat bila online). */
  async deactivate() {
    const key = this._key();
    if (key) await this._rpc('deactivate_license', { p_key: key, p_device_id: this.deviceId }).catch(() => {});
    this.store.data.license = null;
    this.lastError = null;
    this.store.save();
    this._emit();
    return this.state();
  }

  start() {
    this.verify();
    clearInterval(this._timer);
    this._timer = setInterval(() => this.verify(), RECHECK_MS);
    if (this._timer.unref) this._timer.unref();
  }

  stop() { clearInterval(this._timer); }

  _emit() { this.emit('change', this.state()); }
}

module.exports = { LicenseManager, normalizeKey, KEY_RE, GRACE_MS, SUPABASE_URL, SUPABASE_KEY };
