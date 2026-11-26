'use strict';
// Katalog model Flow & validasi setelan Studio: model yang benar-benar ada di Flow, durasi per model, mode Frame/Bahan.
const test = require('node:test');
const assert = require('node:assert');
const { IMAGE_MODELS, VIDEO_MODELS, modelFor, durationFor, checkFrames } = require('../src/main/catalog');
const { sanitizeStudio, STUDIO } = require('../src/main/store');

test('katalog: 3 model gambar (bawaan Nano Banana 2.1), 5 model video', () => {
  assert.deepStrictEqual(IMAGE_MODELS, ['Nano Banana 2.1', 'Nano Banana Pro', 'Nano Banana 2 Lite']);
  assert.deepStrictEqual(VIDEO_MODELS, ['Omni 1.2 Flash', 'Omni 1.1 Flash', 'Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality']);
  for (const old of ['auto', 'Imagen 4', 'Nano Banana 2', '', 'Veo 3.1 - Fast']) assert.strictEqual(modelFor('image', old), 'Nano Banana 2.1', old);
  assert.strictEqual(modelFor('image', '🍌 nano banana pro'), 'Nano Banana Pro');
  for (const old of ['auto', 'Gemini Omni Flash', 'Veo 2 - Fast', 'Nano Banana 2.1']) assert.strictEqual(modelFor('video', old), 'Omni 1.2 Flash', old);
});

test('durasi: semua Omni 10 detik, semua Veo 8 detik', () => {
  for (const m of VIDEO_MODELS) assert.strictEqual(durationFor('video', m), /Omni/.test(m) ? 10 : 8, m);
  assert.strictEqual(durationFor('image', 'Nano Banana 2.1'), 0);
  // durasi yang dikirim diabaikan — selalu mengikuti model
  assert.strictEqual(sanitizeStudio({ kind: 'video', model: 'Veo 3.1 - Lite', duration: 4 }).duration, 8);
  assert.strictEqual(sanitizeStudio({ kind: 'video', model: 'Omni 1.1 Flash', duration: 6 }).duration, 10);
});

test('setelan lama dimigrasi: mode Teks → Bahan, model "auto" → bawaan', () => {
  assert.strictEqual(STUDIO.sub, 'ingredients');
  assert.strictEqual(STUDIO.model, 'Omni 1.2 Flash');
  const old = sanitizeStudio({ kind: 'video', sub: 'text', model: 'auto', ratio: '16:9', count: 2, duration: 0, apply: true });
  assert.deepStrictEqual([old.sub, old.model, old.duration, old.count], ['ingredients', 'Omni 1.2 Flash', 10, 2]);
  const img = sanitizeStudio({ kind: 'image', model: 'Imagen 4', ratio: '1:1' });
  assert.deepStrictEqual([img.model, img.duration, img.ratio], ['Nano Banana 2.1', 0, '1:1']);
  // rasio gambar tidak dibawa ke video
  assert.strictEqual(sanitizeStudio({ kind: 'video' }, img).ratio, '16:9');
});

test('model terakhir per jenis diingat saat pindah Video ↔ Gambar', () => {
  let s = sanitizeStudio({ kind: 'video', model: 'Veo 3.1 - Fast' });
  s = sanitizeStudio({ ...s, kind: 'image' }, s);
  assert.strictEqual(s.model, 'Nano Banana 2.1');
  s = sanitizeStudio({ ...s, model: 'Nano Banana Pro' }, s);
  s = sanitizeStudio({ ...s, kind: 'video' }, s);
  assert.deepStrictEqual([s.model, s.duration], ['Veo 3.1 - Fast', 8]);
  s = sanitizeStudio({ ...s, kind: 'image' }, s);
  assert.strictEqual(s.model, 'Nano Banana Pro');
});

test('mode Frame wajib tepat 2 foto (awal & akhir); Bahan bebas', () => {
  const f = { kind: 'video', sub: 'frames' };
  assert.throws(() => checkFrames(f, []), (e) => e.message === 'FRAMES_REQUIRED' && e.detail === '0/2');
  assert.throws(() => checkFrames(f, ['a.png']), /FRAMES_REQUIRED/);
  assert.throws(() => checkFrames(f, ['a.png', 'b.png', 'c.png']), /FRAMES_REQUIRED/);
  checkFrames(f, ['a.png', 'b.png']);
  checkFrames({ kind: 'video', sub: 'ingredients' }, []);
  checkFrames({ kind: 'image', sub: 'frames' }, []);
  checkFrames(null, []);
});
