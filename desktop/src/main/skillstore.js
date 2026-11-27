'use strict';
// Skill buatan pengguna ("Skill saya") & skill dari admin: validasi bentuk data + ekspor/impor JSON.
// Skill = templat prompt + setelan Flow. Kolom isian dibuat tampilan dari templat:
//   {Nama isian}  ·  {Nama isian:opsi 1|opsi 2}  ·  {@1} / {@2} = tag @ foto referensi ke-1 / ke-2
const crypto = require('crypto');

const MAX_SKILLS = 200;
const RATIO_RE = /^(16:9|9:16|1:1|4:3|3:4)$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ICON_RE = /^[a-z0-9-]{1,40}$/;

// buang karakter kendali (kecuali tab & baris baru)
const str = (v, n) => [...String(v ?? '')].filter((c) => { const k = c.charCodeAt(0); return k === 9 || k === 10 || k === 13 || (k >= 32 && k !== 127); }).join('').trim().slice(0, n);

/**
 * Bersihkan satu skill. null bila tidak valid (nama / templat kosong).
 * @param {object} raw
 * @param {{ prefix?: string, keepId?: boolean }} [o]
 */
function sanitizeSkill(raw, { prefix = 'my', keepId = true } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = str(raw.name, 60);
  const template = str(raw.template, 4000).replace(/\r\n?/g, '\n');
  if (!name || !template) return null;
  const category = raw.category === 'video' ? 'video' : 'image';
  const s = raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings) ? raw.settings : {};
  const settings = { kind: s.kind === 'video' || s.kind === 'image' ? s.kind : category };
  if (settings.kind === 'video') settings.sub = s.sub === 'frames' ? 'frames' : 'ingredients';
  if (typeof s.model === 'string' && s.model.trim()) settings.model = str(s.model, 60).replace(/[<>"`]/g, '');
  if (typeof s.ratio === 'string' && RATIO_RE.test(s.ratio)) settings.ratio = s.ratio;
  if (settings.kind === 'video' && settings.ratio && !['16:9', '9:16'].includes(settings.ratio)) settings.ratio = '16:9';
  if ([1, 2, 3, 4].includes(Number(s.count))) settings.count = Number(s.count);
  const r = raw.refs && typeof raw.refs === 'object' && !Array.isArray(raw.refs) ? raw.refs : {};
  let max = Math.max(0, Math.min(10, Math.floor(Number(r.max) || 0)));
  let min = Math.max(0, Math.min(max, Math.floor(Number(r.min) || 0)));
  if (settings.kind === 'video' && settings.sub === 'frames') { min = 2; max = 2; } // Frame: foto awal & akhir wajib
  const id = keepId && typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : `${prefix}-${crypto.randomUUID()}`;
  return {
    id, name, description: str(raw.description, 200), category,
    icon: typeof raw.icon === 'string' && ICON_RE.test(raw.icon) ? raw.icon : 'sparkles',
    template, settings, refs: { min, max }
  };
}

/** Isi berkas ekspor (bisa diimpor di PC lain). */
function exportDoc(list) {
  return { app: 'FLOW CONNECT Desktop', type: 'skills', version: 1, exportedAt: new Date().toISOString(), skills: list.map((x) => sanitizeSkill(x)).filter(Boolean) };
}

/** Baca isi berkas impor (dokumen ekspor, array skill, atau satu skill) → skill valid. */
function parseImport(text) {
  let doc;
  try { doc = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch { throw new Error('INVALID_SKILL_FILE'); }
  const raw = Array.isArray(doc) ? doc : doc && Array.isArray(doc.skills) ? doc.skills : doc && doc.template ? [doc] : null;
  if (!raw) throw new Error('INVALID_SKILL_FILE');
  const list = raw.slice(0, MAX_SKILLS).map((x) => sanitizeSkill(x)).filter(Boolean);
  if (!list.length) throw new Error('INVALID_SKILL_FILE');
  return list;
}

/** Tambah / ganti skill di daftar (id sama = ganti). Mengembalikan daftar baru. */
function upsert(list, skill) {
  const out = (Array.isArray(list) ? list : []).filter((x) => x && x.id !== skill.id);
  const at = (Array.isArray(list) ? list : []).findIndex((x) => x && x.id === skill.id);
  const rec = { ...skill, updatedAt: Date.now() };
  if (at >= 0) out.splice(at, 0, rec); else out.unshift(rec);
  if (out.length > MAX_SKILLS) throw new Error('TOO_MANY_SKILLS');
  return out;
}

module.exports = { sanitizeSkill, exportDoc, parseImport, upsert, MAX_SKILLS };
