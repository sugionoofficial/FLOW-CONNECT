'use strict';
// SKILL "Generate Foto" — jalur khusus pembuatan gambar di Google Flow (Nano Banana / Imagen).
//
//  1. Setelan dipaksa ke mode Gambar (model, rasio, jumlah dari Studio).
//  2. Setiap foto referensi DIUNGGAH lewat pengunggah Flow dan ditunggu sampai Flow menyimpannya (media id).
//  3. Prompt ditulis dengan chip "@" yang menunjuk aset hasil unggahan (@tag di Studio → aset Flow).
//  4. Sebelum Generate diperiksa: semua foto terpasang. Bila tidak → berhenti (tidak menghasilkan gambar kosong).
//  5. Setelah Generate: balasan Flow diamati → ditolak / gagal / kredit habis langsung dilaporkan.
const { refTags, sanitizeTags, parsePrompt } = require('../refs');
const { IMAGE_MODELS, modelFor } = require('../catalog');
const MAX_REFS = 10;

/** Normalisasi tugas foto (dipakai juga oleh antrean & UI untuk validasi awal). */
function normalize(job) {
  const images = Array.isArray(job.images) ? job.images.slice(0, MAX_REFS) : [];
  const tags = sanitizeTags(job.tags, images);
  const o = { ...(job.options || {}) };
  o.kind = 'image';
  o.duration = 0;
  o.model = modelFor('image', o.model); // hanya model Nano Banana yang ada di Flow; bawaan Nano Banana 2.1
  const prompt = String(job.prompt || '').trim();
  if (!prompt && !images.length) throw new Error('INVALID_PROMPT');
  return { ...job, prompt, images, tags, options: o };
}

/** Ringkasan rencana: tag mana yang disebut, mana yang otomatis ditandai, "@" yang bukan foto. */
function plan(job) {
  const j = normalize(job);
  const p = parsePrompt(j.prompt, j.tags);
  return {
    tags: j.tags,
    mentioned: p.used.map((i) => j.tags[i]),
    autoTagged: j.tags.filter((t, i) => !p.used.includes(i)),
    otherMentions: p.mentions
  };
}

/**
 * Jalankan skill. session = FlowSession; hooks = { onLog, shouldStop, timeoutMs, wait, onFallback }.
 * → { items, projectId, refs, mentions, settings, … }
 */
async function run(session, job, hooks = {}) {
  const j = normalize(job);
  const say = hooks.onLog || (() => {});
  const pl = plan(j);
  if (j.images.length) say(`Skill Foto: ${j.images.length} referensi (${j.tags.map((t) => '@' + t).join(', ')})`);
  if (pl.autoTagged.length && j.images.length) say(`Tidak disebut di prompt → tetap dipakai: ${pl.autoTagged.map((t) => '@' + t).join(', ')}`);
  return session.runGeneration(j, hooks, {
    kind: 'image',
    startMs: 30000,
    imageMs: Math.min(hooks.timeoutMs || 300000, 300000),
    check(prep) {
      const missing = j.tags.filter((t) => !prep.mentions.ok.includes(t));
      if (missing.length) { const e = new Error('REFERENCE_NOT_ATTACHED'); e.detail = missing.map((t) => '@' + t).join(', '); throw e; }
      if (prep.refs.length !== j.images.length) { const e = new Error('UPLOAD_FAILED'); e.detail = `${prep.refs.length}/${j.images.length}`; throw e; }
    }
  });
}

module.exports = { run, plan, normalize, IMAGE_MODELS, MAX_REFS, refTags };
