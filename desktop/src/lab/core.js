// Alat Kreatif — inti bersama: elemen UI, berkas (lewat jembatan window.lab), bantuan AI, perekam video, utilitas gambar.
// Tanpa akses Node/jaringan: semua berkas lewat proses utama, AI lewat fungsi prompt-chat (model terdaftar di admin).
import { icon } from '../renderer/icons.js';

export { icon };

// ---------- DOM ----------
/** h('div.a.b', {onclick, text, html, ...attr}, ...anak) */
// Anak kondisional (null/false) di replaceChildren/append diabaikan — bukan dijadikan teks "null".
for (const m of ['replaceChildren', 'append', 'prepend']) {
  const f = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return f.apply(this, kids.filter((x) => x != null && x !== false)); };
}

export function h(sel, props, ...kids) {
  const [tag, ...cls] = String(sel).split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const ic = (name, cls = '') => { const t = document.createElement('template'); t.innerHTML = icon(name, cls); return t.content.firstChild; };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ease = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
};

export function button(label, opts = {}) {
  const b = h('button.btn' + (opts.cls ? '.' + opts.cls.split(' ').join('.') : ''), { type: 'button', title: opts.title || null, disabled: opts.disabled || null });
  const setLabel = (ico, text) => { b.replaceChildren(...[ico && ic(ico, ico === 'loader-circle' ? 'spin' : ''), text && h('span', { text })].filter(Boolean)); };
  setLabel(opts.icon, label);
  b._label = label; b._icon = opts.icon;
  if (opts.onClick) {
    b.addEventListener('click', async (e) => {
      if (b._busy) return;
      try {
        const r = opts.onClick(e);
        if (r && typeof r.then === 'function') { b.busy(true); await r; }
      } catch (err) { toast(errText(err), 'err'); } finally { if (b._busy) b.busy(false); }
    });
  }
  b.busy = (on, text) => { b._busy = !!on; b.disabled = !!on; setLabel(on ? 'loader-circle' : b._icon, on ? (text || b._label) : b._label); };
  b.setText = (t) => { b._label = t; setLabel(b._icon, t); };
  return b;
}

export function section(title, iconName, ...kids) {
  return h('div.sec', h('div.sec-t', iconName ? ic(iconName) : null, h('span.grow', { text: title })), ...kids);
}

export function slider(label, o, onInput) {
  const fmt = o.fmt || ((v) => String(v));
  const out = h('b', { text: fmt(o.value) });
  const r = h('input', { type: 'range', min: o.min, max: o.max, step: o.step ?? 1, value: o.value, 'aria-label': label });
  r.addEventListener('input', () => { const v = Number(r.value); out.textContent = fmt(v); onInput(v); });
  const f = h('label.field', h('span', label, out), r);
  f.set = (v) => { r.value = v; out.textContent = fmt(Number(v)); };
  f.input = r;
  return f;
}

export function select(label, options, value, onChange) {
  const s = h('select.input', { 'aria-label': label }, options.map(([v, l]) => h('option', { value: v, text: l, selected: String(v) === String(value) || null })));
  s.addEventListener('change', () => onChange(s.value));
  const f = label ? h('label.field', h('span', label), s) : s;
  f.set = (v) => { s.value = v; };
  f.el = s;
  return f;
}

export function chips(options, value, onChange) {
  const box = h('div.chips');
  let cur = value;
  const draw = () => box.replaceChildren(...options.map(([v, l, ico]) => h('button.chip' + (String(v) === String(cur) ? '.on' : ''), { type: 'button', onclick: () => { cur = v; draw(); onChange(v); } }, ico ? ic(ico) : null, l)));
  draw();
  box.set = (v) => { cur = v; draw(); };
  box.setOptions = (o, v) => { options = o; if (v !== undefined) cur = v; draw(); };
  return box;
}
export const chipField = (label, options, value, onChange) => { const c = chips(options, value, onChange); const f = h('div.field', h('span', label), c); f.set = c.set; f.chips = c; return f; };

export function tabs(options, value, onChange) {
  const box = h('div.tabs');
  let cur = value;
  const draw = () => box.replaceChildren(...options.map(([v, l, ico]) => h('button.tab' + (v === cur ? '.on' : ''), { type: 'button', onclick: () => { cur = v; draw(); onChange(v); } }, ico ? ic(ico) : null, l)));
  draw();
  box.set = (v) => { cur = v; draw(); };
  return box;
}

export function color(label, value, onInput) {
  const c = h('input.input', { type: 'color', value, 'aria-label': label });
  c.addEventListener('input', () => onInput(c.value));
  const f = h('label.field', h('span', label), c);
  f.set = (v) => { c.value = v; };
  return f;
}

export function textField(label, value, onInput, o = {}) {
  const t = o.rows ? h('textarea.input', { rows: o.rows, placeholder: o.placeholder || null, maxlength: o.max || null }) : h('input.input', { type: o.type || 'text', placeholder: o.placeholder || null, maxlength: o.max || null, min: o.min ?? null, max: o.maxNum ?? null, step: o.step ?? null });
  t.value = value ?? '';
  t.addEventListener('input', () => onInput(o.type === 'number' ? Number(t.value) : t.value));
  const f = label ? h('label.field', h('span', label), t) : t;
  f.set = (v) => { t.value = v ?? ''; };
  f.el = t;
  return f;
}

export function check(label, value, onChange) {
  const c = h('input', { type: 'checkbox', checked: value });
  c.addEventListener('change', () => onChange(c.checked));
  const f = h('label.check', c, h('span', { text: label }));
  f.set = (v) => { c.checked = !!v; };
  return f;
}

export function progress() {
  const i = h('i');
  const p = h('div.progress', i);
  p.set = (f) => { i.style.width = clamp(f, 0, 1) * 100 + '%'; };
  return p;
}

// ---------- toast & dialog ----------
export function toast(text, kind = 'info', action) {
  const box = document.getElementById('toasts');
  const t = h('div.toast.' + kind, ic(kind === 'ok' ? 'circle-check' : kind === 'err' ? 'circle-x' : 'info'), h('span', { text }), action ? button(action.label, { cls: 'sm', onClick: action.run }) : null);
  box.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : action ? 8000 : 4000);
}

/** Dialog sederhana: resolve nilai tombol yang ditekan (null bila ditutup). */
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, primary: true }] }) {
  const d = document.getElementById('dlg');
  return new Promise((resolve) => {
    const done = (v) => { d.close(); resolve(v); };
    d.replaceChildren(
      h('div.dlg-b', h('h3', { text: title }), body instanceof Node ? body : h('div', { html: body || '' })),
      h('div.dlg-f', buttons.map((b) => button(b.label, { cls: b.primary ? 'primary' : '', onClick: () => done(b.value) })))
    );
    d.onclose = () => resolve(null);
    d.showModal();
  });
}

// ---------- galat ----------
const ERR = {
  LICENSE_REQUIRED: 'Lisensi belum aktif — buka aplikasi utama dan aktifkan lisensi.',
  DAILY_LIMIT: 'Batas harian bantuan AI tercapai. Coba lagi besok — fitur offline tetap bisa dipakai.',
  NO_MODEL: 'Belum ada model AI aktif di admin. Fitur offline tetap bisa dipakai.',
  NO_API_KEY: 'Kunci API model AI belum diatur admin.',
  PROVIDER_ERROR: 'Model AI sedang bermasalah. Coba lagi sebentar lagi.',
  NETWORK: 'Tidak bisa terhubung ke server AI. Periksa internet — fitur offline tetap bisa dipakai.',
  EMPTY_MESSAGE: 'Isi teks dulu.',
  INVALID_IMAGE: 'Gambar tidak valid untuk AI.',
  INVALID_FILE: 'Berkas tidak bisa dibuka.',
  UNSUPPORTED_FORMAT: 'Format berkas belum didukung.',
  FILE_TOO_LARGE: 'Berkas terlalu besar.',
  INVALID_OUTPUT: 'Hasil tidak valid.',
  IMAGE_DECODE_FAILED: 'Gambar tidak bisa dibaca.',
  VIDEO_DECODE_FAILED: 'Video tidak bisa diputar (codec tidak didukung).',
  AUDIO_DECODE_FAILED: 'Audio tidak bisa dibaca.',
  AI_BAD_JSON: 'Jawaban AI tidak bisa dibaca. Coba lagi.',
  RECORDER_UNSUPPORTED: 'Perekam video tidak didukung di PC ini.',
  WEBGL_UNSUPPORTED: 'WebGL tidak tersedia (kartu grafis/driver).',
  FORBIDDEN: 'Akses ditolak.'
};
export function errText(e) {
  const m = e && e.message ? e.message : String(e || '');
  return ERR[m] || m || 'Terjadi kesalahan.';
}

// ---------- jembatan ----------
const bridge = window.lab;
export async function call(ch, ...args) {
  if (!bridge) throw new Error('FORBIDDEN');
  const r = await bridge.call(ch, ...args);
  if (!r || !r.ok) { const e = new Error((r && r.error) || 'FORBIDDEN'); if (r && r.detail) e.detail = r.detail; throw e; }
  return r.data;
}

// ---------- berkas ----------
export const io = {
  /** kind: image | video | audio | media → {images, videos, audios} */
  pick: (kind = 'image', multi = false) => call('lab:pick', kind, multi),
  register: (paths) => call('lab:register', paths),
  async blob(p) { const r = await call('lab:read', p); return { name: r.name, mime: r.mime, blob: new Blob([r.data], { type: r.mime }) }; },
  async image(p) {
    const { name, blob } = await io.blob(p);
    let bmp;
    try { bmp = await createImageBitmap(blob); } catch { throw new Error('IMAGE_DECODE_FAILED'); }
    return { name, path: p, bmp, blob };
  },
  async video(p) {
    const { name, blob } = await io.blob(p);
    const v = await loadVideoBlob(blob);
    return { name, path: p, video: v };
  },
  async audio(p, ac) {
    const { name, blob } = await io.blob(p);
    const buf = await blob.arrayBuffer();
    const ctx = ac || new AudioContext();
    try { return { name, path: p, buffer: await ctx.decodeAudioData(buf), blob }; } catch { throw new Error('AUDIO_DECODE_FAILED'); }
  },
  /** Simpan ke Unduhan → Alat. data: Blob | Uint8Array | string. */
  async save(name, data, format) {
    const bytes = typeof data === 'string' ? data : data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
    const file = await call('lab:save', { name, data: bytes, format });
    toast(`Tersimpan: ${file.split(/[\\/]/).pop()} (Unduhan → Alat)`, 'ok', { label: 'Tampilkan', run: () => call('lab:show', file) });
    return file;
  },
  /** Simpan diam-diam (untuk dikirim ke Studio). */
  async saveQuiet(name, data, format) {
    const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
    return call('lab:save', { name, data: bytes, format });
  }
};

export function loadVideoBlob(blob) {
  const open = (bl) => new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous';
    v.onloadeddata = () => { v.onloadeddata = null; v.onerror = null; resolve(v); };
    v.onerror = () => reject(new Error('VIDEO_DECODE_FAILED'));
    v.src = URL.createObjectURL(bl);
  });
  return open(blob).then(async (v) => {
    if (Number.isFinite(v.duration)) return v;
    // WebM dari MediaRecorder / perekam layar sering tanpa durasi (tak bisa digeser) → baca dari cluster terakhir & tulis ke header
    const ms = webmDurationMs(new Uint8Array(await blob.arrayBuffer()));
    if (!ms) return v;
    const fixed = await fixWebmDuration(blob, ms);
    if (fixed === blob) return v;
    try { const v2 = await open(fixed); URL.revokeObjectURL(v.src); return v2; } catch { return v; }
  });
}
/** Perkiraan durasi WebM (ms) dari Timecode cluster terakhir + timecode blok terakhir. 0 bila tak terbaca. */
export function webmDurationMs(b) {
  const id = (i) => readVint(b, i, true);
  let scale = 1e6; // TimecodeScale (ns) — bawaan 1 ms
  for (let i = 0; i < Math.min(b.length - 4, 8192); i++) {
    if (b[i] === 0x2a && b[i + 1] === 0xd7 && b[i + 2] === 0xb1) { const s = readVint(b, i + 3); if (s && s.v <= 8) { let v = 0; for (let k = 0; k < s.v; k++) v = v * 256 + b[i + 3 + s.len + k]; if (v > 0) scale = v; } break; }
  }
  for (let i = b.length - 8; i >= 0; i--) {
    if (b[i] !== 0x1f || b[i + 1] !== 0x43 || b[i + 2] !== 0xb6 || b[i + 3] !== 0x75) continue;
    const cs = readVint(b, i + 4); if (!cs) continue;
    let p = i + 4 + cs.len;
    const t = id(p); if (!t || t.v !== 0xe7) continue; // cluster sah dimulai dengan Timecode
    const ts = readVint(b, p + 1); if (!ts || ts.v > 8) continue;
    let tc = 0; for (let k = 0; k < ts.v; k++) tc = tc * 256 + b[p + 1 + ts.len + k];
    p += 1 + ts.len + ts.v;
    let rel = 0;
    while (p < b.length - 4) {
      const e = id(p); if (!e) break;
      const s = readVint(b, p + e.len); if (!s || s.unknown) break;
      const body = p + e.len + s.len;
      let blk = -1;
      if (e.v === 0xa3) blk = body; // SimpleBlock
      else if (e.v === 0xa0 && b[body] === 0xa1) { const bs = readVint(b, body + 1); if (bs) blk = body + 1 + bs.len; } // BlockGroup → Block
      if (blk >= 0) { const tr = readVint(b, blk); if (tr && blk + tr.len + 1 < b.length) { const r = (b[blk + tr.len] << 8 | b[blk + tr.len + 1]) << 16 >> 16; if (r > rel) rel = r; } }
      p = body + s.v;
    }
    const ms = (tc + rel) * scale / 1e6 + 33;
    return ms > 0 && ms < 24 * 3600 * 1000 ? ms : 0;
  }
  return 0;
}
export function seek(v, t) {
  return new Promise((resolve) => {
    const tt = clamp(t, 0, Math.max(0, (v.duration || 0) - 0.01));
    if (Math.abs(v.currentTime - tt) < 0.001 && v.readyState >= 2) return resolve();
    const done = () => { v.removeEventListener('seeked', done); resolve(); };
    v.addEventListener('seeked', done);
    v.currentTime = tt;
  });
}

/** Seret & lepas berkas dari Explorer ke jendela alat → {images, videos, audios}. */
export function onDropFiles(fn) {
  const hint = h('div.drop-hint', { text: 'Lepaskan berkas di sini' });
  document.body.append(hint);
  let depth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; document.body.classList.add('dragging'); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dragging'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
    const paths = [...(e.dataTransfer ? e.dataTransfer.files : [])].map((f) => bridge.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    try { fn(await io.register(paths)); } catch (err) { toast(errText(err), 'err'); }
  });
}

// ---------- AI ----------
export const aiState = { model: null, listeners: new Set() };
/** Ambil JSON dari jawaban model (blok ```json, atau objek/array pertama). */
export function parseJSON(text) {
  const s = String(text || '');
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const tries = [fence && fence[1], s];
  for (const t of tries) {
    if (!t) continue;
    try { return JSON.parse(t.trim()); } catch { /* lanjut */ }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    const c = t.indexOf('['), d = t.lastIndexOf(']');
    const cands = [];
    if (a >= 0 && b > a) cands.push(t.slice(a, b + 1));
    if (c >= 0 && d > c) cands.push(t.slice(c, d + 1));
    cands.sort((x, y) => (t.indexOf(x) - t.indexOf(y)));
    for (const x of cands) {
      try { return JSON.parse(x); } catch { /* lanjut */ }
      try { return JSON.parse(x.replace(/,\s*([}\]])/g, '$1')); } catch { /* lanjut */ }
    }
  }
  throw new Error('AI_BAD_JSON');
}
/**
 * Tanya model AI terdaftar. o.image = data URL (opsional, untuk model yang bisa melihat gambar), o.json = harapkan JSON.
 * @returns {Promise<any>} teks jawaban, atau objek JSON bila o.json
 */
export async function ai(prompt, o = {}) {
  const full = o.json ? `${prompt}\n\nJawab HANYA dengan JSON valid (tanpa penjelasan, tanpa markdown).` : prompt;
  const r = await call('lab:ai', { prompt: full, image: o.image, history: o.history, mode: o.mode });
  if (r && r.model) { aiState.model = r.model.label || null; aiState.listeners.forEach((f) => f(aiState.model)); }
  const reply = String((r && r.reply) || '');
  if (!o.json) return reply;
  try { return parseJSON(reply); } catch (e) {
    if (o.retry === false) throw e;
    // satu kali minta ulang dengan penegasan format
    const r2 = await call('lab:ai', { prompt: full + '\nPENTING: keluaran harus JSON murni yang bisa di-parse.', image: o.image, mode: o.mode });
    return parseJSON(r2 && r2.reply);
  }
}

// ---------- gambar ----------
export function canvas(w, h2) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h2));
  return c;
}
export const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
export function toBlob(c, format = 'png', quality = 0.92) {
  let src = c;
  if (format === 'jpg') { src = canvas(c.width, c.height); const g = src.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0); }
  return new Promise((resolve, reject) => src.toBlob((b) => (b ? resolve(b) : reject(new Error('INVALID_OUTPUT'))), MIME[format] || 'image/png', quality));
}
/** Sumber (bitmap/canvas/video) → data URL JPEG kecil untuk model AI yang bisa melihat gambar. */
export function dataUrlFor(src, max = 768, q = 0.82) {
  const w = src.videoWidth || src.width, hh = src.videoHeight || src.height;
  const k = Math.min(1, max / Math.max(w, hh));
  const c = canvas(w * k, hh * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
/** Gambar sumber ke kotak tujuan: cover (penuh, terpotong) / contain (utuh). fx, fy = titik fokus 0..1. */
export function drawFit(g, src, x, y, w, hh, mode = 'cover', fx = 0.5, fy = 0.5, zoom = 1) {
  const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
  if (!sw || !sh) return;
  const k = (mode === 'cover' ? Math.max(w / sw, hh / sh) : Math.min(w / sw, hh / sh)) * zoom;
  const dw = sw * k, dh = sh * k;
  const dx = x + (w - dw) * clamp(fx, 0, 1), dy = y + (hh - dh) * clamp(fy, 0, 1);
  g.save(); g.beginPath(); g.rect(x, y, w, hh); g.clip();
  g.drawImage(src, dx, dy, dw, dh);
  g.restore();
}
export function roundRect(g, x, y, w, hh, r) {
  const rr = Math.max(0, Math.min(r, w / 2, hh / 2));
  g.beginPath();
  g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + hh, rr); g.arcTo(x + w, y + hh, x, y + hh, rr); g.arcTo(x, y + hh, x, y, rr); g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
export const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '4:3': [4, 3], '3:4': [3, 4], '21:9': [21, 9], '2:1': [2, 1] };
/** Ukuran keluaran dari rasio & sisi pendek (mis. 1080). */
export function sizeFor(ratio, short = 1080) {
  const [a, b] = RATIOS[ratio] || RATIOS['16:9'];
  const even = (n) => Math.round(n / 2) * 2;
  return a >= b ? [even(short * a / b), short] : [short, even(short * b / a)];
}
/** Bungkus teks ke lebar maksimum → baris. */
export function wrapText(g, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Palet warna dominan (k-means sederhana) → ['#rrggbb', …] urut terbanyak. */
export function palette(src, k = 6) {
  const c = canvas(64, 64);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return ['#000000'];
  let cen = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) * px.length / k)].slice());
  let cnt = new Array(k).fill(0);
  for (let it = 0; it < 10; it++) {
    const sum = cen.map(() => [0, 0, 0]); cnt = new Array(k).fill(0);
    for (const p of px) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const q = cen[j]; const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; bi = j; } }
      sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2] += p[2]; cnt[bi]++;
    }
    cen = cen.map((q, j) => (cnt[j] ? sum[j].map((s) => s / cnt[j]) : q));
  }
  return cen.map((q, j) => [q, cnt[j]]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]).map(([q]) => hex(q));
}
export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
export const rgb = (s) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim()); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
export const validHex = (s) => /^#[0-9a-f]{6}$/i.test(String(s || '').trim());

// ---------- perekam video ----------
export function recorderFormats() {
  const MR = window.MediaRecorder;
  if (!MR) return [];
  const list = [
    ['mp4', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2'], ['mp4', 'video/mp4;codecs=avc1.42E01F'], ['mp4', 'video/mp4'],
    ['webm', 'video/webm;codecs=vp9,opus'], ['webm', 'video/webm;codecs=vp8,opus'], ['webm', 'video/webm']
  ];
  const seen = new Set();
  return list.filter(([f, m]) => { if (seen.has(f) || !MR.isTypeSupported(m)) return false; seen.add(f); return true; }).map(([format, mime]) => ({ format, mime }));
}

/**
 * Rekam canvas secara waktu-nyata. draw(t, dt) dipanggil tiap frame (t detik sejak mulai); kembalikan false untuk berhenti.
 * @param {HTMLCanvasElement} c
 * @param {{duration:number, fps?:number, format?:'webm'|'mp4', audio?:MediaStreamTrack[], draw:(t:number)=>any, onProgress?:(f:number)=>void, start?:()=>any, signal?:{stop:boolean}}} o
 * @returns {Promise<{blob:Blob, format:string}>}
 */
export async function record(c, o) {
  const fmts = recorderFormats();
  if (!fmts.length || !c.captureStream) throw new Error('RECORDER_UNSUPPORTED');
  const f = fmts.find((x) => x.format === o.format) || fmts.find((x) => x.format === 'webm') || fmts[0];
  const fps = o.fps || 30;
  const stream = c.captureStream(fps);
  for (const tr of o.audio || []) stream.addTrack(tr);
  const pixels = c.width * c.height;
  const rec = new MediaRecorder(stream, { mimeType: f.mime, videoBitsPerSecond: Math.round(clamp(pixels * fps * 0.18, 2e6, 16e6)), audioBitsPerSecond: 192000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  o.draw(0);
  rec.start(1000);
  if (o.start) await o.start();
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      const more = !(o.signal && o.signal.stop) && t < o.duration && o.draw(Math.min(t, o.duration)) !== false;
      if (o.onProgress) o.onProgress(Math.min(1, t / o.duration));
      if (more) setTimeout(tick, Math.max(1, 1000 / fps - 4)); else resolve();
    };
    tick();
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((tr) => { if (!(o.audio || []).includes(tr)) tr.stop(); });
  let blob = new Blob(chunks, { type: f.mime.split(';')[0] });
  if (f.format === 'webm') blob = await fixWebmDuration(blob, (performance.now() - t0));
  return { blob, format: f.format };
}

// WebM dari MediaRecorder tidak menulis durasi (pemutar tak bisa seek) → sisipkan elemen Duration ke Segment/Info.
function readVint(b, i, keepMarker = false) {
  const first = b[i];
  let len = 1, mask = 0x80;
  while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
  if (len > 8) return null;
  let v = keepMarker ? first : first & (mask - 1);
  for (let j = 1; j < len; j++) v = v * 256 + b[i + j];
  return { v, len, unknown: !keepMarker && v === Math.pow(2, 7 * len) - 1 };
}
function sizeVint(n, len) {
  const out = new Uint8Array(len);
  let v = n;
  for (let j = len - 1; j >= 0; j--) { out[j] = v % 256; v = Math.floor(v / 256); }
  out[0] |= 1 << (8 - len);
  return out;
}
export async function fixWebmDuration(blob, ms) {
  try {
    const b = new Uint8Array(await blob.arrayBuffer());
    const id = (i) => readVint(b, i, true);
    // EBML header
    let i = 0;
    const h0 = id(0); if (!h0 || h0.v !== 0x1a45dfa3) return blob;
    const hs = readVint(b, h0.len); i = h0.len + hs.len + hs.v;
    const seg = id(i); if (!seg || seg.v !== 0x18538067) return blob;
    const ss = readVint(b, i + seg.len);
    let p = i + seg.len + ss.len;
    const end = Math.min(b.length, p + 4096);
    while (p < end) {
      const e = id(p); if (!e) return blob;
      const s = readVint(b, p + e.len); if (!s) return blob;
      const body = p + e.len + s.len;
      if (e.v === 0x1549a966) { // Info
        let q = body;
        while (q < body + s.v) {
          const ce = id(q); const cs = readVint(b, q + ce.len);
          if (ce.v === 0x4489) { // sudah ada Duration → timpa nilainya
            const at = q + ce.len + cs.len;
            const dv = new DataView(b.buffer, b.byteOffset);
            if (cs.v === 8) dv.setFloat64(at, ms); else if (cs.v === 4) dv.setFloat32(at, ms); else return blob;
            return new Blob([b], { type: blob.type });
          }
          q += ce.len + cs.len + cs.v;
        }
        const dur = new Uint8Array(11);
        dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88;
        new DataView(dur.buffer).setFloat64(3, ms);
        const newSize = s.v + dur.length;
        const lenNeeded = Math.max(s.len, newSize < 127 ? 1 : newSize < 16383 ? 2 : newSize < 2097151 ? 3 : 4);
        const out = new Uint8Array(b.length + dur.length + (lenNeeded - s.len));
        let o2 = 0;
        out.set(b.subarray(0, p + e.len), o2); o2 += p + e.len;
        out.set(sizeVint(newSize, lenNeeded), o2); o2 += lenNeeded;
        out.set(b.subarray(body, body + s.v), o2); o2 += s.v;
        out.set(dur, o2); o2 += dur.length;
        out.set(b.subarray(body + s.v), o2);
        return new Blob([out], { type: blob.type });
      }
      if (s.unknown) return blob;
      p = body + s.v;
    }
    return blob;
  } catch { return blob; }
}

/** Jalur audio untuk perekaman: elemen media / AudioBuffer → track MediaStream (+ tetap terdengar bila monitor). */
export function audioGraph() {
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  const elSources = new WeakMap();
  return {
    ac, dest,
    track: () => dest.stream.getAudioTracks()[0],
    fromElement(el, monitor = true) {
      let s = elSources.get(el);
      if (!s) { s = ac.createMediaElementSource(el); elSources.set(el, s); }
      try { s.disconnect(); } catch { /* belum tersambung */ }
      s.connect(dest);
      if (monitor) s.connect(ac.destination);
      return s;
    },
    playBuffer(buf, offset = 0, monitor = true) {
      const s = ac.createBufferSource();
      s.buffer = buf;
      s.connect(dest);
      if (monitor) s.connect(ac.destination);
      s.start(0, offset);
      return s;
    }
  };
}

/** Pilihan format ekspor video yang didukung PC ini. */
export function videoFormatChips(value, onChange) {
  const f = recorderFormats();
  const opts = f.map((x) => [x.format, x.format.toUpperCase()]);
  if (!opts.length) return h('div.note.warn', { text: 'Perekam video tidak tersedia di PC ini.' });
  return chipField('Format video', opts, opts.some(([v]) => v === value) ? value : opts[0][0], onChange);
}
export const preferredVideoFormat = () => { const f = recorderFormats(); return (f.find((x) => x.format === 'mp4') || f[0] || { format: 'webm' }).format; };

/** Simpan otomatis setelan alat di localStorage. */
export function persisted(key, defaults) {
  let v = {};
  try { v = JSON.parse(localStorage.getItem('lab.' + key) || '{}') || {}; } catch { /* rusak → bawaan */ }
  const state = { ...defaults, ...v };
  let t = 0;
  state.$save = () => { clearTimeout(t); t = setTimeout(() => { try { const o = { ...state }; delete o.$save; localStorage.setItem('lab.' + key, JSON.stringify(o)); } catch { /* penuh */ } }, 300); };
  return state;
}

/** Koordinat pointer → koordinat piksel canvas (memperhitungkan skala CSS). */
export function canvasPoint(c, e) {
  const r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height, k: c.width / r.width };
}

export const fmtTime = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
export const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

/**
 * Kotak sumber media (pilih / seret). kind: image | video | media | audio.
 * onLoad(src) dengan src = {type:'image'|'video'|'audio', el (ImageBitmap|HTMLVideoElement|AudioBuffer), name, path, w, h, dur}
 */
export function sourcePicker(kind, onLoad, o = {}) {
  const info = h('span.faint.small.ellipsis.grow', { text: o.empty || 'Belum ada berkas' });
  const label = { image: 'Pilih gambar…', video: 'Pilih video…', media: 'Pilih gambar / video…', audio: 'Pilih musik…' }[kind];
  const load = async (sel) => {
    const p = kind === 'audio' ? sel.audios[0] : kind === 'image' ? sel.images[0] : kind === 'video' ? sel.videos[0] : (sel.videos[0] && (!sel.images[0] || o.preferVideo) ? sel.videos[0] : sel.images[0]);
    if (!p) { if ((sel.images.length + sel.videos.length + sel.audios.length) > 0) toast('Jenis berkas tidak cocok untuk alat ini.', 'err'); return false; }
    let src;
    if (sel.audios.includes(p)) { const a = await io.audio(p, o.audioContext); src = { type: 'audio', el: a.buffer, name: a.name, path: p, dur: a.buffer.duration }; }
    else if (sel.videos.includes(p)) { const v = await io.video(p); src = { type: 'video', el: v.video, name: v.name, path: p, w: v.video.videoWidth, h: v.video.videoHeight, dur: v.video.duration }; }
    else { const im = await io.image(p); src = { type: 'image', el: im.bmp, name: im.name, path: p, w: im.bmp.width, h: im.bmp.height }; }
    info.textContent = src.name + (src.w ? ` · ${src.w}×${src.h}` : '') + (src.dur ? ` · ${src.dur.toFixed(1)} dtk` : '');
    info.title = src.path;
    await onLoad(src);
    return true;
  };
  const pickBtn = button(label, { icon: 'folder-open', cls: 'sm' + (o.primary === false ? '' : ' primary'), onClick: async () => { const sel = await io.pick(kind, false); await load(sel); } });
  const box = h('div.row', pickBtn, info);
  box.load = load;
  box.clear = () => { info.textContent = o.empty || 'Belum ada berkas'; };
  return box;
}

/** Panggung kosong dengan ajakan memilih berkas. */
export function emptyStage(iconName, title, text, action) {
  return h('div.empty', ic(iconName, 'xl'), h('b', { text: title }), h('span.small', { text }), action || null);
}
