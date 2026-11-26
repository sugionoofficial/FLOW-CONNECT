'use strict';
// Gambar referensi & penanda "@" di prompt Studio.
// Setiap gambar mendapat tag pendek dari nama filenya (mis. kucing-oren.png → @kucing-oren).
// Di Google Flow, "@" memunculkan pemilih aset; tag ini dipetakan ke aset hasil unggahan.
// Algoritme tag SAMA dengan renderer (app.js → refTags) agar yang ditampilkan = yang dipakai.

const MENTION = /(^|[\s([{"'“‘,;:])@([A-Za-z0-9_][A-Za-z0-9_-]{0,39})/g;

function baseTag(file) {
  const name = String(file).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  let t = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 20).replace(/-+$/, '');
  if (!t) t = 'gambar';
  if (/^[0-9]/.test(t)) t = 'img' + t;
  return t;
}

/** Tag unik per gambar, urutan sama dengan `paths`. */
function refTags(paths) {
  const seen = new Map();
  return paths.map((p) => {
    const b = baseTag(p);
    const n = (seen.get(b) || 0) + 1;
    seen.set(b, n);
    return n === 1 ? b : b + n;
  });
}

/** Tag dari renderer (bila ada & valid), selain itu dihitung ulang. */
function sanitizeTags(tags, paths) {
  const auto = refTags(paths);
  if (!Array.isArray(tags) || tags.length !== paths.length) return auto;
  const out = [];
  for (let i = 0; i < paths.length; i++) {
    const t = typeof tags[i] === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_-]{0,39}$/.test(tags[i]) ? tags[i] : auto[i];
    out.push(out.some((x) => x.toLowerCase() === t.toLowerCase()) ? auto[i] : t);
  }
  return out;
}

/**
 * Pecah prompt menjadi potongan teks & penanda.
 * → { segments: [{text}|{ref:i}|{mention:name}], used: [i…] (gambar yang disebut), mentions: [nama non-gambar] }
 * {ref:i} = gambar referensi ke-i; {mention:name} = aset/karakter Flow lain (mis. @me, @KaptenZoro).
 */
function parsePrompt(prompt, tags) {
  const text = String(prompt || '');
  const lower = tags.map((t) => t.toLowerCase());
  const segments = [];
  const used = [];
  const mentions = [];
  let last = 0;
  MENTION.lastIndex = 0;
  let m;
  while ((m = MENTION.exec(text))) {
    const start = m.index + m[1].length;
    if (start > last) segments.push({ text: text.slice(last, start) });
    const name = m[2];
    const i = lower.indexOf(name.toLowerCase());
    if (i >= 0) { segments.push({ ref: i }); if (!used.includes(i)) used.push(i); }
    else { segments.push({ mention: name }); mentions.push(name); }
    last = start + 1 + name.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return { segments: segments.filter((s) => s.text === undefined || s.text.length), used, mentions };
}

module.exports = { refTags, sanitizeTags, parsePrompt, baseTag };
