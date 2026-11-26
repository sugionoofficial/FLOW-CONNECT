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

module.exports = { IMAGE_MODELS, VIDEO_MODELS, DEFAULT_MODEL, VIDEO_SUBS, DEFAULT_SUB, modelFor, durationFor, checkFrames };
