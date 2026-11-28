// Teks Animasi — teks bergerak di atas video / gambar / latar warna; beberapa lapisan teks dengan waktu masing-masing.
import {
  h, ic, button, section, slider, select, chipField, color, textField, check, progress, toast, errText, ai,
  io, sourcePicker, record, audioGraph, videoFormatChips, preferredVideoFormat, persisted, sizeFor, wrapText,
  ease, clamp, roundRect, drawFit, toBlob, seek, fmtTime, stamp, canvasPoint, dialog
} from '../core.js';

export const PRESETS = [
  ['rise', 'Naik per kata'], ['pop', 'Pop huruf'], ['typewriter', 'Mesin ketik'], ['fade', 'Muncul halus'], ['slide', 'Sapuan'],
  ['zoom', 'Zoom masuk'], ['bounce', 'Jatuh memantul'], ['wave', 'Gelombang'], ['glitch', 'Glitch RGB'], ['neon', 'Neon berkedip'], ['kinetic', 'Kinetik (kata demi kata)']
];
const FONTS = [
  ['Segoe UI', 'Segoe UI'], ['Bahnschrift', 'Bahnschrift'], ['Arial Black', 'Arial Black'], ['Impact', 'Impact'], ['Georgia', 'Georgia'],
  ['Trebuchet MS', 'Trebuchet MS'], ['Consolas', 'Consolas'], ['Comic Sans MS', 'Comic Sans MS'], ['Times New Roman', 'Times New Roman'], ['Verdana', 'Verdana']
];
const fontStack = (f) => `"${f}", "Segoe UI", system-ui, Arial, sans-serif`;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const newItem = (o = {}) => ({
  text: 'Teks bergerak', preset: 'rise', font: 'Segoe UI', weight: 800, size: 110, color: '#ffffff', stroke: '#000000', strokeW: 0,
  glow: 0, shadow: true, align: 'center', x: 0.5, y: 0.5, start: 0, end: 4, inDur: 0.8, outDur: 0.5, box: false, boxColor: '#000000', boxAlpha: 0.55,
  upper: false, spacing: 0, ...o
});

/** Hitung posisi tiap huruf (pusat) untuk satu lapisan teks. */
export function layoutText(g, it, W, H) {
  const size = it.size * Math.min(W, H) / 1080;
  g.font = `${it.weight} ${size}px ${fontStack(it.font)}`;
  const maxW = W * 0.86;
  const text = it.upper ? String(it.text).toUpperCase() : String(it.text);
  const lines = wrapText(g, text, maxW);
  const lh = size * 1.2;
  const blockH = lines.length * lh;
  const cx = it.x * W, cy = it.y * H;
  const sp = it.spacing * size / 100;
  const chars = [];
  let wi = 0, minX = Infinity, maxX = -Infinity;
  lines.forEach((line, li) => {
    const ws = [...line].map((ch) => g.measureText(ch).width);
    const lw = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, ws.length - 1);
    let x = it.align === 'left' ? cx - maxW / 2 : it.align === 'right' ? cx + maxW / 2 - lw : cx - lw / 2;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x + lw);
    const y = cy - blockH / 2 + lh * (li + 0.5);
    [...line].forEach((ch, k) => {
      if (ch === ' ') wi++;
      chars.push({ ch, x: x + ws[k] / 2, y, w: ws[k], li, wi });
      x += ws[k] + sp;
    });
    wi++;
  });
  return { chars, lines, size, lh, blockH, cx, cy, words: wi, box: { x: minX, y: cy - blockH / 2, w: maxX - minX, h: blockH } };
}

/** Lukis satu lapisan teks pada waktu lokal lt (detik sejak mulai lapisan). */
export function drawItem(g, it, lt, W, H) {
  const total = Math.max(0.1, it.end - it.start);
  if (lt < 0 || lt > total) return;
  const L = layoutText(g, it, W, H);
  const n = Math.max(1, L.chars.length);
  const pin = clamp(lt / Math.max(0.01, it.inDur), 0, 1);
  const pout = it.outDur > 0 ? clamp((total - lt) / it.outDur, 0, 1) : 1;
  const outE = ease.out(pout);
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (it.box) {
    const pad = L.size * 0.35;
    g.globalAlpha = it.boxAlpha * Math.min(ease.out(pin), outE);
    g.fillStyle = it.boxColor;
    const bw = (L.box.w + pad * 2) * (it.preset === 'slide' ? ease.out(pin) : 1);
    roundRect(g, L.box.x - pad, L.box.y - pad * 0.6, bw, L.box.h + pad * 1.2, L.size * 0.25);
    g.fill();
    g.globalAlpha = 1;
  }
  if (it.shadow) { g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = L.size * 0.12; g.shadowOffsetY = L.size * 0.04; }
  if (it.glow > 0 || it.preset === 'neon') { g.shadowColor = it.color; g.shadowBlur = L.size * (0.2 + it.glow / 40); g.shadowOffsetY = 0; }
  if (it.preset === 'slide') {
    const e = ease.inOut(pin);
    g.beginPath(); g.rect(L.box.x - 4, L.box.y - L.lh, L.box.w * e + 8, L.blockH + L.lh * 2); g.clip();
  }
  const kinetic = it.preset === 'kinetic';
  let curWord = -1, wordT = 0;
  if (kinetic) { const per = total / Math.max(1, L.words); curWord = Math.min(L.words - 1, Math.floor(lt / per)); wordT = (lt - curWord * per) / per; }
  const typeN = it.preset === 'typewriter' ? Math.floor(clamp(lt / Math.max(0.05, it.inDur), 0, 1) * n + 0.0001) : n;
  L.chars.forEach((c, i) => {
    if (c.ch === ' ') return;
    let a = outE, dx = 0, dy = (1 - outE) * -L.size * 0.25, sc = 1, rot = 0;
    const stag = (k, spread = 0.6) => clamp((lt - (k / n) * spread * it.inDur) / Math.max(0.01, it.inDur * (1 - spread)), 0, 1);
    switch (it.preset) {
      case 'fade': a *= ease.out(pin); break;
      case 'rise': { const p = clamp((lt - (c.wi / Math.max(1, L.words)) * 0.6 * it.inDur) / Math.max(0.01, it.inDur * 0.4), 0, 1); a *= ease.out(p); dy += (1 - ease.out(p)) * L.size * 0.9; break; }
      case 'pop': { const p = stag(i); sc = Math.max(0, ease.back(p)); a *= Math.min(1, p * 2); break; }
      case 'bounce': { const p = stag(i, 0.7); dy += -(1 - ease.elastic(p)) * L.size * 2; a *= Math.min(1, p * 3); break; }
      case 'typewriter': if (i >= typeN) return; break;
      case 'zoom': { const e = ease.out(pin); sc = 1 + (1 - e) * 1.6; a *= e; break; }
      case 'wave': a *= ease.out(pin); dy += Math.sin(lt * 5 + i * 0.55) * L.size * 0.12; break;
      case 'glitch': {
        const burst = lt < it.inDur || (lt % 2.2) < 0.18;
        a *= lt < it.inDur ? (hash(Math.floor(lt * 24) + i) > 0.3 ? 1 : 0) : 1;
        if (burst) { dx = (hash(Math.floor(lt * 30) + i * 7) - 0.5) * L.size * 0.3; }
        break;
      }
      case 'neon': {
        const on = lt > it.inDur || hash(Math.floor(lt * 18) + i * 3) > 0.45;
        a *= on ? 1 : 0.15;
        break;
      }
      case 'kinetic': {
        if (c.wi !== curWord) return;
        const p = clamp(wordT * 4, 0, 1);
        sc = 0.6 + ease.back(p) * 0.4; a = Math.min(1, p * 2);
        break;
      }
      case 'slide': break;
      default: a *= ease.out(pin);
    }
    if (a <= 0.003) return;
    let x = c.x + dx, y = c.y + dy;
    if (kinetic) {
      // kata aktif dipusatkan & diperbesar
      const ws = L.chars.filter((q) => q.wi === curWord && q.ch !== ' ');
      const mid = (ws[0].x - ws[0].w / 2 + ws[ws.length - 1].x + ws[ws.length - 1].w / 2) / 2;
      x = L.cx + (c.x - mid) * 1.5; y = L.cy; sc *= 1.5;
    }
    g.save();
    g.globalAlpha = clamp(a, 0, 1);
    g.translate(x, y); if (rot) g.rotate(rot); if (sc !== 1) g.scale(sc, sc);
    if (it.preset === 'glitch' && (lt < it.inDur || (lt % 2.2) < 0.18)) {
      const o = L.size * 0.05;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = '#ff0040'; g.fillText(c.ch, -o, 0);
      g.fillStyle = '#00e5ff'; g.fillText(c.ch, o, 0);
      g.globalCompositeOperation = 'source-over';
    }
    if (it.strokeW > 0) { g.lineJoin = 'round'; g.strokeStyle = it.stroke; g.lineWidth = it.strokeW * L.size / 50; g.strokeText(c.ch, 0, 0); }
    g.fillStyle = it.color;
    g.fillText(c.ch, 0, 0);
    g.restore();
  });
  if (it.preset === 'typewriter' && lt < total - it.outDur && Math.floor(lt * 2.5) % 2 === 0) {
    const last = L.chars[Math.max(0, typeN - 1)];
    if (last) { g.fillStyle = it.color; g.globalAlpha = outE; g.fillRect(last.x + last.w / 2 + L.size * 0.06, last.y - L.size * 0.45, L.size * 0.07, L.size * 0.9); }
  }
  g.restore();
}

export async function mount(ctx) {
  const S = persisted('textanim', { ratio: '16:9', short: 1080, bg: 'gradient', bg1: '#141e30', bg2: '#5b2a86', dur: 6, format: preferredVideoFormat(), items: [newItem({ text: 'Halo dari FLOW CONNECT', end: 5 })], sel: 0, fit: 'cover', dim: 0 });
  if (!Array.isArray(S.items) || !S.items.length) S.items = [newItem()];
  S.items = S.items.map((x) => newItem(x));
  S.sel = clamp(S.sel | 0, 0, S.items.length - 1);
  let media = null; // {type, el}
  let playing = true, t = 0, last = performance.now(), recording = false;
  let ag = null; // satu jalur audio per jendela (elemen video hanya bisa disambungkan sekali)
  const c = h('canvas.grab');
  const g = c.getContext('2d');
  const dims = () => (media && S.bg === 'media' && S.ratio === 'asli' ? [Math.round(media.w / 2) * 2, Math.round(media.h / 2) * 2] : sizeFor(S.ratio === 'asli' ? '16:9' : S.ratio, S.short));
  const duration = () => (media && media.type === 'video' && S.bg === 'media' ? media.dur : S.dur);
  const resize = () => { const [w, hh] = dims(); if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; } };

  function drawBg(tt) {
    const W = c.width, H = c.height;
    if (S.bg === 'media' && media) {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      drawFit(g, media.el, 0, 0, W, H, S.fit);
    } else if (S.bg === 'gradient') {
      const a = (tt * 0.15) % (Math.PI * 2);
      const gr = g.createLinearGradient(W / 2 - Math.cos(a) * W, H / 2 - Math.sin(a) * H, W / 2 + Math.cos(a) * W, H / 2 + Math.sin(a) * H);
      gr.addColorStop(0, S.bg1); gr.addColorStop(1, S.bg2);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    } else if (S.bg === 'transparent') {
      g.clearRect(0, 0, W, H);
    } else { g.fillStyle = S.bg1; g.fillRect(0, 0, W, H); }
    if (S.dim > 0) { g.fillStyle = `rgba(0,0,0,${S.dim / 100})`; g.fillRect(0, 0, W, H); }
  }
  function draw(tt) {
    resize();
    drawBg(tt);
    for (const it of S.items) drawItem(g, it, tt - it.start, c.width, c.height);
    if (!recording && !playing) {
      const it = S.items[S.sel];
      if (it) { const L = layoutText(g, it, c.width, c.height); g.save(); g.strokeStyle = 'rgba(0,150,255,0.9)'; g.setLineDash([10, 8]); g.lineWidth = Math.max(2, c.width / 640); g.strokeRect(L.box.x - 10, L.box.y - 10, L.box.w + 20, L.box.h + 20); g.restore(); }
    }
  }
  const loop = () => {
    const now = performance.now();
    if (!recording) {
      if (media && media.type === 'video' && S.bg === 'media') { t = media.el.currentTime; if (playing && media.el.paused) media.el.play().catch(() => {}); if (!playing && !media.el.paused) media.el.pause(); }
      else if (playing) { t += (now - last) / 1000; if (t > duration()) t = 0; }
      draw(t);
      scrub.set(t); timeLbl.textContent = `${fmtTime(t)} / ${fmtTime(duration())}`;
    }
    last = now;
    requestAnimationFrame(loop);
  };

  // seret teks di panggung untuk memindahkan
  let drag = null;
  c.addEventListener('pointerdown', (e) => {
    const p = canvasPoint(c, e);
    const hit = [...S.items].map((it, i) => [it, i]).reverse().find(([it]) => { const L = layoutText(g, it, c.width, c.height); return p.x >= L.box.x - 20 && p.x <= L.box.x + L.box.w + 20 && p.y >= L.box.y - 20 && p.y <= L.box.y + L.box.h + 20; });
    if (!hit) return;
    if (S.sel !== hit[1]) { S.sel = hit[1]; buildSide(); }
    drag = { p, x: hit[0].x, y: hit[0].y };
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = canvasPoint(c, e), it = S.items[S.sel];
    it.x = clamp(drag.x + (p.x - drag.p.x) / c.width, 0, 1); it.y = clamp(drag.y + (p.y - drag.p.y) / c.height, 0, 1);
    S.$save();
  });
  c.addEventListener('pointerup', () => { drag = null; });

  // ----- panel -----
  const scrub = slider('Waktu', { min: 0, max: 1, step: 0.01, value: 0, fmt: () => '' }, (v) => { playing = false; playBtn.setText('Putar'); t = v * duration(); if (media && media.type === 'video') media.el.currentTime = t; });
  const origSet = scrub.set; scrub.set = (v) => origSet(duration() ? v / duration() : 0);
  const timeLbl = h('span.faint.small.mono', { text: '0:00.0' });
  const playBtn = button('Jeda', { icon: 'play', cls: 'sm', onClick: () => { playing = !playing; playBtn.setText(playing ? 'Jeda' : 'Putar'); } });
  const prog = progress(); prog.classList.add('hidden');
  const exportBtn = button('Ekspor video', { icon: 'download', cls: 'primary', onClick: exportVideo });
  const pngBtn = button('PNG frame ini', { icon: 'image-down', cls: 'sm', onClick: async () => { const was = playing; playing = false; draw(t); await io.save(`Teks animasi ${stamp()}`, await toBlob(c, 'png'), 'png'); playing = was; } });
  ctx.stage.append(c);
  ctx.bar.append(playBtn, h('div.grow', scrub.input), timeLbl, pngBtn, exportBtn);
  ctx.bar.append(prog);

  const srcBox = sourcePicker('media', async (src) => {
    if (media && media.type === 'video') { media.el.pause(); URL.revokeObjectURL(media.el.src); }
    media = src; S.bg = 'media'; t = 0;
    if (src.type === 'video') { src.el.loop = true; src.el.muted = true; await seek(src.el, 0); const d = src.dur || 5; S.items.forEach((it) => { if (it.end > d) it.end = d; }); }
    S.$save(); buildSide();
  }, { primary: false, empty: 'Opsional: video / gambar sebagai latar' });
  ctx.onDrop((sel) => srcBox.load(sel));

  function itemControls(it) {
    const up = () => S.$save();
    const box = h('div.sec');
    box.append(
      h('div.sec-t', ic('type'), h('span.grow', { text: `Teks ${S.sel + 1}` }), button('', { icon: 'copy-plus', cls: 'sm subtle icon', title: 'Duplikat', onClick: () => { S.items.splice(S.sel + 1, 0, newItem({ ...it, start: it.end, end: Math.min(duration(), it.end + (it.end - it.start)) })); S.sel++; up(); buildSide(); } }),
        button('', { icon: 'trash-2', cls: 'sm subtle icon danger', title: 'Hapus', disabled: S.items.length < 2, onClick: () => { S.items.splice(S.sel, 1); S.sel = Math.max(0, S.sel - 1); up(); buildSide(); } })),
      textField('', it.text, (v) => { it.text = v; up(); }, { rows: 2, max: 300, placeholder: 'Ketik teks…' }),
      select('Animasi', PRESETS, it.preset, (v) => { it.preset = v; up(); }),
      h('div.row', select('Huruf', FONTS, it.font, (v) => { it.font = v; up(); }), select('Tebal', [[400, 'Normal'], [600, 'Semi'], [800, 'Tebal'], [900, 'Hitam']], it.weight, (v) => { it.weight = Number(v); up(); })),
      slider('Ukuran', { min: 24, max: 320, value: it.size }, (v) => { it.size = v; up(); }),
      h('div.row', color('Warna', it.color, (v) => { it.color = v; up(); }), color('Garis', it.stroke, (v) => { it.stroke = v; up(); }), slider('Tebal garis', { min: 0, max: 12, value: it.strokeW }, (v) => { it.strokeW = v; up(); })),
      h('div.row', slider('Cahaya', { min: 0, max: 40, value: it.glow }, (v) => { it.glow = v; up(); }), slider('Spasi', { min: -10, max: 60, value: it.spacing }, (v) => { it.spacing = v; up(); })),
      chipField('Rata', [['left', 'Kiri'], ['center', 'Tengah'], ['right', 'Kanan']], it.align, (v) => { it.align = v; up(); }),
      chipField('Posisi', [['t', 'Atas'], ['c', 'Tengah'], ['b', 'Bawah'], ['l3', 'Sepertiga bawah']], '', (v) => { it.y = { t: 0.15, c: 0.5, b: 0.85, l3: 0.78 }[v]; up(); }),
      h('div.row', check('Huruf besar', it.upper, (v) => { it.upper = v; up(); }), check('Bayangan', it.shadow, (v) => { it.shadow = v; up(); }), check('Kotak latar', it.box, (v) => { it.box = v; up(); buildSide(); })),
      it.box ? h('div.row', color('Warna kotak', it.boxColor, (v) => { it.boxColor = v; up(); }), slider('Transparansi', { min: 0, max: 100, value: Math.round(it.boxAlpha * 100) }, (v) => { it.boxAlpha = v / 100; up(); })) : null,
      h('div.row', textField('Mulai (dtk)', it.start, (v) => { it.start = clamp(v || 0, 0, it.end - 0.2); up(); renderTimeline(); }, { type: 'number', step: 0.1, min: 0 }),
        textField('Selesai (dtk)', it.end, (v) => { it.end = Math.max(it.start + 0.2, v || 0); up(); renderTimeline(); }, { type: 'number', step: 0.1, min: 0 })),
      h('div.row', slider('Durasi masuk', { min: 0.1, max: 3, step: 0.05, value: it.inDur, fmt: (v) => v.toFixed(2) + ' s' }, (v) => { it.inDur = v; up(); }), slider('Durasi keluar', { min: 0, max: 2, step: 0.05, value: it.outDur, fmt: (v) => v.toFixed(2) + ' s' }, (v) => { it.outDur = v; up(); }))
    );
    return box;
  }
  const timeline = h('div.timeline');
  function renderTimeline() {
    timeline.replaceChildren(...S.items.map((it, i) => h('div.tl-item' + (i === S.sel ? '.on' : ''), { onclick: () => { S.sel = i; buildSide(); } },
      h('span.ellipsis.small', { text: `${i + 1}. ${it.text || '(kosong)'}` }), h('span.faint.small.mono', { text: it.start.toFixed(1) + 's' }), h('span.faint.small.mono', { text: it.end.toFixed(1) + 's' }), ic('sparkle'))));
  }

  async function aiWrite() {
    const topic = textField('Tentang apa?', '', () => {}, { rows: 2, placeholder: 'mis. Promo kopi susu gula aren diskon 20% akhir pekan' });
    const tone = select('Gaya', [['energik', 'Energik'], ['elegan', 'Elegan'], ['lucu', 'Lucu'], ['sinematik', 'Sinematik'], ['informatif', 'Informatif']], 'energik', () => {});
    const lang = select('Bahasa', [['Indonesia', 'Indonesia'], ['English', 'English']], 'Indonesia', () => {});
    const n = select('Jumlah baris', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], 3, () => {});
    const ok = await dialog({ title: 'Tulis teks dengan AI', body: h('div.chat', topic, h('div.row', tone, lang, n)), buttons: [{ label: 'Tulis', value: true, primary: true }, { label: 'Batal', value: false }] });
    if (!ok) return;
    const q = topic.el.value.trim();
    if (!q) { toast('Isi topik dulu.', 'err'); return; }
    const count = Number(n.el.value);
    const r = await ai(`Kamu penulis copy video pendek. Buat ${count} baris teks animasi berurutan untuk video tentang: "${q}". Gaya: ${tone.el.value}. Bahasa: ${lang.el.value}. Tiap baris maksimal 7 kata, kuat dan mudah dibaca. Sertakan juga gaya animasi yang cocok per baris dari daftar: ${PRESETS.map(([v]) => v).join(', ')}.\nFormat: {"lines":[{"text":"...","preset":"rise"}]}`, { json: true });
    const lines = (Array.isArray(r) ? r : r.lines || []).map((x) => (typeof x === 'string' ? { text: x } : x)).filter((x) => x && x.text).slice(0, 8);
    if (!lines.length) throw new Error('AI_BAD_JSON');
    const D = duration(), per = D / lines.length;
    const base = S.items[S.sel] || newItem();
    S.items = lines.map((x, i) => newItem({ ...base, text: String(x.text).slice(0, 200), preset: PRESETS.some(([v]) => v === x.preset) ? x.preset : base.preset, start: +(i * per).toFixed(2), end: +((i + 1) * per).toFixed(2) }));
    S.sel = 0; S.$save(); buildSide();
    toast(`AI menulis ${lines.length} baris teks.`, 'ok');
  }

  function buildSide() {
    const it = S.items[S.sel];
    renderTimeline();
    ctx.side.replaceChildren(
      section('Latar', 'image',
        chipField('Jenis', [['gradient', 'Gradasi'], ['color', 'Warna'], ['transparent', 'Transparan'], ['media', 'Video / gambar']], S.bg, (v) => { S.bg = v; if (v === 'media' && !media) toast('Pilih video atau gambar di bawah.', 'info'); S.$save(); buildSide(); }),
        S.bg === 'media' ? srcBox : null,
        S.bg === 'media' && media ? chipField('Isi', [['cover', 'Penuh (potong)'], ['contain', 'Utuh']], S.fit, (v) => { S.fit = v; S.$save(); }) : null,
        S.bg === 'gradient' || S.bg === 'color' ? h('div.row', color(S.bg === 'gradient' ? 'Warna 1' : 'Warna', S.bg1, (v) => { S.bg1 = v; S.$save(); }), S.bg === 'gradient' ? color('Warna 2', S.bg2, (v) => { S.bg2 = v; S.$save(); }) : null) : null,
        S.bg === 'transparent' ? h('div.note', { text: 'Video tidak menyimpan transparansi — gunakan untuk PNG, atau pilih latar.' }) : null,
        slider('Gelapkan latar', { min: 0, max: 80, value: S.dim, fmt: (v) => v + '%' }, (v) => { S.dim = v; S.$save(); }),
        chipField('Rasio', [['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['4:5', '4:5'], ...(media && S.bg === 'media' ? [['asli', 'Asli']] : [])], S.ratio, (v) => { S.ratio = v; S.$save(); }),
        chipField('Resolusi', [[720, '720p'], [1080, '1080p']], S.short, (v) => { S.short = Number(v); S.$save(); }),
        media && media.type === 'video' && S.bg === 'media' ? h('div.note', { text: `Durasi mengikuti video: ${media.dur.toFixed(1)} dtk (audio ikut terekam).` })
          : slider('Durasi', { min: 2, max: 60, step: 0.5, value: S.dur, fmt: (v) => v + ' dtk' }, (v) => { S.dur = v; S.items.forEach((x) => { x.end = Math.min(x.end, v); x.start = Math.min(x.start, Math.max(0, x.end - 0.2)); }); S.$save(); renderTimeline(); })
      ),
      section('Lapisan teks', 'list', timeline, h('div.row', button('Tambah teks', { icon: 'plus', cls: 'sm', onClick: () => { const lastEnd = Math.max(0, ...S.items.map((x) => x.end)); const st = lastEnd >= duration() ? 0 : lastEnd; S.items.push(newItem({ ...S.items[S.sel], text: 'Teks baru', start: st, end: Math.min(duration(), st + 3) })); S.sel = S.items.length - 1; S.$save(); buildSide(); } }),
        button('Tulis dengan AI', { icon: 'wand-sparkles', cls: 'sm ai', onClick: aiWrite })), h('div.faint.small', { text: 'Seret teks di pratinjau untuk memindahkan. Jeda untuk melihat kotak teks terpilih.' })),
      it ? itemControls(it) : null,
      section('Ekspor', 'download', videoFormatChips(S.format, (v) => { S.format = v; S.$save(); }), h('div.faint.small', { text: 'Video direkam waktu-nyata (lama ekspor = durasi video). Hasil tersimpan di Unduhan → Alat.' }))
    );
  }

  async function exportVideo() {
    if (recording) return;
    recording = true; playing = false;
    prog.classList.remove('hidden'); prog.set(0);
    try {
      resize();
      const D = duration();
      const vid = media && media.type === 'video' && S.bg === 'media' ? media.el : null;
      const audio = [];
      if (vid) { vid.pause(); vid.loop = false; vid.muted = false; await seek(vid, 0); ag = ag || audioGraph(); await ag.ac.resume(); ag.fromElement(vid, false); audio.push(ag.track()); }
      const r = await record(c, {
        duration: D, fps: 30, format: S.format, audio,
        start: async () => { if (vid) await vid.play(); },
        draw: (tt) => { const tv = vid ? vid.currentTime : tt; drawBg(tv); for (const it of S.items) drawItem(g, it, tv - it.start, c.width, c.height); return !(vid && vid.ended); },
        onProgress: (f) => prog.set(f)
      });
      if (vid) { vid.pause(); vid.muted = true; vid.loop = true; }
      await io.save(`Teks animasi ${stamp()}`, r.blob, r.format);
    } catch (e) { toast(errText(e), 'err'); } finally {
      recording = false; playing = true; playBtn.setText('Jeda'); prog.classList.add('hidden');
    }
  }

  buildSide();
  requestAnimationFrame(loop);
}
