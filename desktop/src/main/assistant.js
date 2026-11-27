'use strict';
// Asisten Prompt: chat pembuat prompt lewat Edge Function Supabase `prompt-chat`.
// Aplikasi hanya mengirim kunci lisensi + ID perangkat; kunci API provider AI (mis. OpenCode)
// disimpan admin di server dan tidak pernah sampai ke PC.

const SUPABASE_URL = 'https://zpuubgziohvqavmihgls.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NivmzCFYl2Rcy8qdJD_7zA_t2ZQnBTI';
const CATALOG_TTL = 60 * 1000; // model baru dari admin muncul paling lambat 1 menit (atau langsung lewat tombol muat ulang)
const MAX_MESSAGES = 24;
const MAX_CHARS = 6000;

// galat server → kode yang dikenali tampilan
const KNOWN = new Set(['INVALID_IMAGE', 'INVALID_KEY', 'REVOKED', 'EXPIRED', 'INVALID_DEVICE', 'LICENSE_REQUIRED', 'DAILY_LIMIT', 'NO_MODEL', 'NO_API_KEY',
  'PROVIDER_ERROR', 'UNSUPPORTED_PROVIDER', 'EMPTY_MESSAGE']);

class Assistant {
  /**
   * @param {object} o
   * @param {object} o.license  LicenseManager (dipakai _key() & deviceId)
   * @param {Function} [o.fetch]
   * @param {Function} [o.now]
   */
  constructor({ license, fetch: f, now, url = SUPABASE_URL, key = SUPABASE_KEY }) {
    this.license = license;
    this.fetch = f || globalThis.fetch;
    this.now = now || Date.now;
    this.url = url;
    this.apiKey = key;
    this._catalog = null;
    this._skills = null;
  }

  /** Skill dari admin (situs → Admin → Skill): [{id, name, description, category, icon, template, settings, refs}] */
  async skills(force = false) {
    if (!force && this._skills && this.now() - this._skills.at < CATALOG_TTL) return this._skills.list;
    let res;
    try {
      res = await this.fetch(`${this.url}/rest/v1/rpc/ai_skills_catalog`, {
        method: 'POST',
        headers: { apikey: this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      if (this._skills) return this._skills.list;
      throw new Error('NETWORK');
    }
    if (!res.ok) {
      if (this._skills) return this._skills.list;
      throw new Error('NETWORK');
    }
    const list = await res.json().catch(() => []);
    this._skills = { at: this.now(), list: Array.isArray(list) ? list : [] };
    return this._skills.list;
  }

  /** Daftar model aktif dari admin: [{id, provider, model, label, category, is_default, ready}] */
  async catalog(force = false) {
    if (!force && this._catalog && this.now() - this._catalog.at < CATALOG_TTL) return this._catalog.list;
    let res;
    try {
      res = await this.fetch(`${this.url}/rest/v1/rpc/ai_catalog`, {
        method: 'POST',
        headers: { apikey: this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(15000)
      });
    } catch {
      if (this._catalog) return this._catalog.list;
      throw new Error('NETWORK');
    }
    if (!res.ok) {
      if (this._catalog) return this._catalog.list;
      throw new Error('NETWORK');
    }
    const list = await res.json();
    this._catalog = { at: this.now(), list: Array.isArray(list) ? list : [] };
    return this._catalog.list;
  }

  /**
   * @param {object} o
   * @param {{role:'user'|'assistant', content:string}[]} o.messages
   * @param {string} [o.model]  id model (uuid dari katalog) — kosong = bawaan admin
   * @param {'image'|'video'} [o.mode]
   * @param {string} [o.image]  data URL gambar (JPEG/PNG/WebP) untuk model yang mendukung gambar
   * @returns {Promise<{reply:string, model:{id:string,label:string}, prompts:string[]}>}
   */
  async chat({ messages, model, mode, image } = {}) {
    const key = this.license._key();
    if (!key) throw new Error('LICENSE_REQUIRED');
    const msgs = (Array.isArray(messages) ? messages : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-MAX_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new Error('EMPTY_MESSAGE');
    let res;
    try {
      res = await this.fetch(`${this.url}/functions/v1/prompt-chat`, {
        method: 'POST',
        headers: { apikey: this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          license_key: key, device_id: this.license.deviceId, messages: msgs,
          model: typeof model === 'string' && model ? model : undefined,
          mode: mode === 'image' || mode === 'video' ? mode : undefined,
          image: typeof image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(image) ? image : undefined
        }),
        signal: AbortSignal.timeout(100000)
      });
    } catch {
      throw new Error('NETWORK');
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || typeof body.reply !== 'string') {
      const code = body && KNOWN.has(body.error) ? body.error : res.status >= 500 ? 'PROVIDER_ERROR' : 'NETWORK';
      const e = new Error(code);
      if (body && body.limit) e.detail = String(body.limit);
      throw e;
    }
    return { reply: body.reply, model: body.model || null, prompts: extractPrompts(body.reply) };
  }
}

/** Ambil isi blok ```prompt …``` (atau blok kode pertama) dari jawaban asisten. */
function extractPrompts(text) {
  const out = [];
  const re = /```([a-z]*)\s*\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const lang = m[1].toLowerCase();
    const body = m[2].trim();
    if (body && (lang === 'prompt' || lang === '' || lang === 'text')) out.push(body);
  }
  return out;
}

module.exports = { Assistant, extractPrompts };
