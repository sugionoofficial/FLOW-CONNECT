'use strict';
// Katalog model Google Flow yang tersedia (nama persis seperti label di Flow).
// Gambar: hanya 3 model Nano Banana; bawaan Nano Banana 2.1 (0 kredit / tanpa batas).
// Video: mode Frame (wajib frame awal + akhir) atau Bahan; durasi mengikuti model
//   (Omni → 10 detik, Veo → 8 detik).

const IMAGE_MODELS = ['Nano Banana 2.1', 'Nano Banana Pro', 'Nano Banana 2 Lite'];
const VIDEO_MODELS = ['Omni 1.2 Flash', 'Omni 1.1 Flash', 'Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality'];
const DEFAULT_MODEL = { image: 'Nano Banana 2.1', video: 'Omni 1.2 Flash' };
const VIDEO_SUBS = ['frames', 'ingredients'];
const DEFAULT_SUB = 'ingredients';

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const KIND_RE = { image: /nano|banana/i, video: /veo|omni/i };

/** Model tersimpan → model yang sah untuk jenis ini (nama katalog bila cocok; selain itu bawaan). */
function modelFor(kind, model) {
  const list = kind === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
  const n = norm(model);
  const hit = list.find((m) => norm(m) === n);
  if (hit) return hit;
  // nama baru yang dibaca dari Flow (tombol "Baca daftar model") tetap boleh selama jenisnya cocok
  if (n && KIND_RE[kind].test(model) && !/^(nanobanana2|nanobanana|veo2fast|veo2quality|geminiomniflash)$/.test(n)) return String(model);
  return DEFAULT_MODEL[kind];
}

/** Durasi video per model: Omni = 10 dtk, Veo = 8 dtk. 0 = biarkan Flow (gambar / model tak dikenal). */
function durationFor(kind, model) {
  if (kind !== 'video') return 0;
  if (/omni/i.test(model)) return 10;
  if (/veo/i.test(model)) return 8;
  return 0;
}

/** Mode Frame wajib tepat 2 foto: frame awal & frame akhir. */
function checkFrames(options, images) {
  const n = (images || []).length;
  if (options && options.kind === 'video' && options.sub === 'frames' && n !== 2) {
    const e = new Error('FRAMES_REQUIRED');
    e.detail = `${n}/2`;
    throw e;
  }
}

/**
 * Perkiraan biaya kredit Google Flow per 1 hasil (resolusi 720p, harga Flow Nov 2026).
 * Gambar Nano Banana = 0 kredit. Video:
 *   Omni 1.1 Flash 10 dtk = 15 · Omni 1.2 Flash 3/dtk (s.d. 10 dtk) → 10 dtk = 30
 *   Veo 3.1 Lite 10 · Veo 3.1 Fast 20 · Veo 3.1 Quality 100 (8 dtk)
 * Model tak dikenal → null (pengguna mengisi biaya sendiri di Bulk Generate).
 */
const OMNI11 = { 4: 7, 6: 10, 8: 12, 10: 15 };
function creditCost(kind, model, duration) {
  if (kind !== 'video') return 0;
  const n = norm(model);
  const d = Number(duration) || durationFor(kind, model);
  if (n.includes('omni11')) return OMNI11[d] || 15;
  if (n.includes('omni12')) return d <= 10 ? 3 * d : 30 + 6 * (d - 10);
  if (n.includes('veo31lite') || n === 'veolite') return 10;
  if (n.includes('veo31fast')) return 20;
  if (n.includes('veo31quality')) return 100;
  return null;
}
const FREE_DAILY_CREDITS = 50; // paket gratis Google Flow: 50 kredit / hari / akun

module.exports = { IMAGE_MODELS, VIDEO_MODELS, DEFAULT_MODEL, VIDEO_SUBS, DEFAULT_SUB, FREE_DAILY_CREDITS, modelFor, durationFor, checkFrames, creditCost };
