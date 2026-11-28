// pixelBento — gambar → pixel art (palet retro / otomatis / AI, dithering, garis tepi), editor piksel, ekspor sprite
// berskala tajam, dan lembar "bento" (beberapa karya dalam satu tata letak kotak-kotak).
import {
  h, ic, button, section, slider, chipField, check, color, textField, toast, ai, io, persisted, canvas, toBlob,
  palette, hex, rgb, validHex, canvasPoint, dataUrlFor, drawFit, roundRect, stamp, emptyStage, clamp
} from '../core.js';

export const PALETTES = {
  auto: { name: 'Otomatis', colors: [] },
  pico8: { name: 'PICO-8', colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'] },
  gameboy: { name: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  nes: { name: 'NES', colors: ['#000000', '#fcfcfc', '#bcbcbc', '#7c7c7c', '#a4e4fc', '#3cbcfc', '#0078f8', '#0000fc', '#b8b8f8', '#6888fc', '#0058f8', '#d8b8f8', '#9878f8', '#6844fc', '#f8b8f8', '#f878f8', '#d800cc', '#f8a4c0', '#f85898', '#e40058', '#f0d0b0', '#f87858', '#f83800', '#fce0a8', '#fca044', '#e45c10', '#f8d878', '#f8b800', '#ac7c00', '#d8f878', '#b8f818', '#00b800', '#58d854', '#00a800', '#58f898', '#00a844', '#00fcfc', '#00e8d8', '#008888'] },
  sweetie: { name: 'Sweetie 16', colors: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'] },
  mono: { name: '1-bit', colors: ['#111111', '#f2f2f2'] },
  c64: { name: 'C64', colors: ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'] }
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

/** Kuantisasi ImageData ke palet (rgb array) dengan dithering: none | bayer | floyd. Alfa < 128 → transparan. */
export function quantize(img, pal, dither = 'none', strength = 1) {
  const { width: W, height: H, data: d } = img;
  const P = pal.map((c) => (typeof c === 'string' ? rgb(c) : c));
  const near = (r, g, b) => { let bi = 0, bd = Infinity; for (let j = 0; j < P.length; j++) { const q = P[j]; const dr = r - q[0], dg = g - q[1], db = b - q[2]; const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (dd < bd) { bd = dd; bi = j; } } return P[bi]; };
  const buf = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { buf[i * 3] = d[i * 4]; buf[i * 3 + 1] = d[i * 4 + 1]; buf[i * 3 + 2] = d[i * 4 + 2]; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (d[i * 4 + 3] < 128) { d[i * 4 + 3] = 0; continue; }
    let r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
    if (dither === 'bayer') { const t = BAYER[(y & 3) * 4 + (x & 3)] * 64 * strength; r += t; g += t; b += t; }
    const q = near(r, g, b);
    d[i * 4] = q[0]; d[i * 4 + 1] = q[1]; d[i * 4 + 2] = q[2]; d[i * 4 + 3] = 255;
    if (dither === 'floyd') {
      const er = (r - q[0]) * strength, eg = (g - q[1]) * strength, eb = (b - q[2]) * strength;
      const push = (dx, dy, f) => { const xx = x + dx, yy = y + dy; if (xx < 0 || xx >= W || yy >= H) return; const k = (yy * W + xx) * 3; buf[k] += er * f; buf[k + 1] += eg * f; buf[k + 2] += eb * f; };
      push(1, 0, 7 / 16); push(-1, 1, 3 / 16); push(0, 1, 5 / 16); push(1, 1, 1 / 16);
    }
  }
  return img;
}

/** Garis tepi 1 piksel di sekeliling area tak transparan. */
export function outline(img, col) {
  const { width: W, height: H, data: d } = img;
  const [r, g, b] = rgb(col);
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0;
  const mark = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) mark.push(y * W + x);
  for (const i of mark) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  return img;
}

export async function mount(ctx) {
  const S = persisted('pixel', { size: 64, pal: 'auto', colors: 12, dither: 'none', dstr: 70, contrast: 10, sat: 15, outline: false, ocol: '#111111', bgCut: false, custom: [], customName: '', tool: 'pencil', ink: '#ff004d', grid: true, scale: 8, mood: '' });
  let src = null, srcName = 'pixel';
  let px = null; // canvas sebesar grid piksel (hasil akhir, bisa disunting)
  const bento = []; // {name, canvas}
  const view = h('canvas.checker.cross');
  const vg = view.getContext('2d');
  const undo = [];

  const activePal = () => {
    if (S.pal === 'custom' && S.custom.length) return S.custom;
    if (S.pal === 'auto') return src ? palette(adjusted(64), clamp(S.colors, 2, 32)) : PALETTES.pico8.colors;
    return (PALETTES[S.pal] || PALETTES.pico8).colors;
  };
  function adjusted(w) {
    const k = w / Math.max(src.width, src.height);
    const W = Math.max(1, Math.round(src.width * k)), H = Math.max(1, Math.round(src.height * k));
    const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.filter = `contrast(${100 + S.contrast}%) saturate(${100 + S.sat}%)`;
    g.drawImage(src, 0, 0, W, H);
    return c;
  }
  function convert() {
    if (!src) return;
    const small = adjusted(S.size);
    const g = small.getContext('2d', { willReadFrequently: true });
    let img = g.getImageData(0, 0, small.width, small.height);
    if (S.bgCut) {
      // latar dari warna sudut → transparan
      const d = img.data, W = small.width, H = small.height;
      const cs = [0, W - 1, (H - 1) * W, H * W - 1].map((i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
      const key = cs.reduce((a, c) => a.map((v, j) => v + c[j] / 4), [0, 0, 0]);
      const seen = new Uint8Array(W * H), st = [0, W - 1, (H - 1) * W, H * W - 1];
      while (st.length) { const p = st.pop(); if (seen[p]) continue; seen[p] = 1; const i = p * 4; if (Math.abs(d[i] - key[0]) + Math.abs(d[i + 1] - key[1]) + Math.abs(d[i + 2] - key[2]) > 90) continue; d[i + 3] = 0; const x = p % W; if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1); if (p >= W) st.push(p - W); if (p < W * H - W) st.push(p + W); }
    }
    quantize(img, activePal(), S.dither, S.dstr / 100);
    if (S.outline) img = outline(img, S.ocol);
    px = canvas(small.width, small.height);
    px.getContext('2d').putImageData(img, 0, 0);
    undo.length = 0;
    draw(); build();
  }
  function draw() {
    if (!px) return;
    const k = Math.max(1, Math.floor(Math.min(1400 / px.width, 1000 / px.height)));
    view.width = px.width * k; view.height = px.height * k;
    vg.imageSmoothingEnabled = false;
    vg.clearRect(0, 0, view.width, view.height);
    vg.drawImage(px, 0, 0, view.width, view.height);
    if (S.grid && k >= 6) {
      vg.strokeStyle = 'rgba(128,128,128,0.25)'; vg.lineWidth = 1; vg.beginPath();
      for (let x = 0; x <= px.width; x++) { vg.moveTo(x * k + 0.5, 0); vg.lineTo(x * k + 0.5, view.height); }
      for (let y = 0; y <= px.height; y++) { vg.moveTo(0, y * k + 0.5); vg.lineTo(view.width, y * k + 0.5); }
      vg.stroke();
    }
  }
  // penyuntingan piksel
  const cell = (e) => { const p = canvasPoint(view, e); return [Math.floor(p.x * px.width / view.width), Math.floor(p.y * px.height / view.height)]; };
  function paint(x, y) {
    const g = px.getContext('2d', { willReadFrequently: true });
    if (x < 0 || y < 0 || x >= px.width || y >= px.height) return;
    if (S.tool === 'pencil') { g.fillStyle = S.ink; g.fillRect(x, y, 1, 1); }
    else if (S.tool === 'eraser') g.clearRect(x, y, 1, 1);
    else if (S.tool === 'picker') { const d = g.getImageData(x, y, 1, 1).data; if (d[3]) { S.ink = hex([d[0], d[1], d[2]]); S.tool = 'pencil'; S.$save(); build(); } }
    else if (S.tool === 'fill') {
      const W = px.width, H = px.height, img = g.getImageData(0, 0, W, H), d = img.data;
      const i0 = (y * W + x) * 4, t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], f = rgb(S.ink);
      if (t[0] === f[0] && t[1] === f[1] && t[2] === f[2] && t[3] === 255) return;
      const st = [y * W + x], seen = new Uint8Array(W * H);
      while (st.length) { const p = st.pop(); if (seen[p]) continue; seen[p] = 1; const i = p * 4; if (d[i] !== t[0] || d[i + 1] !== t[1] || d[i + 2] !== t[2] || d[i + 3] !== t[3]) continue; d[i] = f[0]; d[i + 1] = f[1]; d[i + 2] = f[2]; d[i + 3] = 255; const xx = p % W; if (xx > 0) st.push(p - 1); if (xx < W - 1) st.push(p + 1); if (p >= W) st.push(p - W); if (p < W * H - W) st.push(p + W); }
      g.putImageData(img, 0, 0);
    }
    draw();
  }
  let down = false;
  view.addEventListener('pointerdown', (e) => { if (!px) return; down = true; view.setPointerCapture(e.pointerId); undo.push(px.getContext('2d').getImageData(0, 0, px.width, px.height)); if (undo.length > 40) undo.shift(); paint(...cell(e)); });
  view.addEventListener('pointermove', (e) => { if (down && (S.tool === 'pencil' || S.tool === 'eraser')) paint(...cell(e)); });
  view.addEventListener('pointerup', () => { down = false; });
  const doUndo = () => { if (undo.length && px) { px.getContext('2d').putImageData(undo.pop(), 0, 0); draw(); } };
  window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); } });

  async function load(p) {
    const im = await io.image(p);
    src = im.bmp; srcName = im.name.replace(/\.[^.]+$/, '');
    ctx.stage.replaceChildren(view);
    convert();
  }
  async function aiPalette() {
    if (!S.mood.trim() && !src) { toast('Tulis suasana/tema atau pilih gambar dulu.', 'err'); return; }
    const r = await ai(`Buat palet pixel art ${clamp(S.colors, 4, 24)} warna yang harmonis untuk tema: "${S.mood || 'sesuai gambar terlampir'}". Sertakan warna gelap untuk garis dan warna terang untuk sorotan.\nFormat: {"name":"nama palet singkat","colors":["#rrggbb", ...]}`, { json: true, image: src && !S.mood.trim() ? dataUrlFor(src, 512) : undefined });
    const cols = (Array.isArray(r.colors) ? r.colors : []).map((c) => String(c).trim().toLowerCase()).filter(validHex).slice(0, 32);
    if (cols.length < 2) throw new Error('AI_BAD_JSON');
    S.custom = cols; S.customName = String(r.name || 'Palet AI').slice(0, 40); S.pal = 'custom'; S.$save();
    toast(`Palet "${S.customName}" (${cols.length} warna).`, 'ok');
    if (src) convert(); else build();
  }
  const scaled = (k) => { const c = canvas(px.width * k, px.height * k), g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(px, 0, 0, c.width, c.height); return c; };
  async function exportPng() { if (!px) return; await io.save(`${srcName} pixel ${px.width}px x${S.scale}`, await toBlob(scaled(S.scale), 'png'), 'png'); }
  function addBento() {
    if (!px) return;
    const c = canvas(px.width, px.height); c.getContext('2d').drawImage(px, 0, 0);
    bento.push({ name: srcName, canvas: c }); build();
    toast(`Ditambahkan ke bento (${bento.length}).`, 'ok');
  }
  /** Tata letak bento: kotak besar pertama + sisanya mengisi grid. */
  async function exportBento() {
    const items = bento.length ? bento : px ? [{ name: srcName, canvas: px }] : [];
    if (!items.length) return;
    const W = 2000, gap = 24, pad = 48;
    const cols = items.length <= 1 ? 1 : items.length <= 3 ? 2 : items.length <= 5 ? 3 : 4;
    const cellW = (W - pad * 2 - gap * (cols - 1)) / cols;
    const slots = []; const occ = new Set();
    items.forEach((_, i) => {
      const span = i === 0 && cols > 1 && items.length > 2 ? 2 : 1;
      outer: for (let r = 0; ; r++) for (let cI = 0; cI < cols; cI++) {
        const fits = [...Array(span)].every((_, a) => [...Array(span)].every((_, b) => cI + a < cols && !occ.has(`${r + b},${cI + a}`)));
        if (fits) { for (let a = 0; a < span; a++) for (let b = 0; b < span; b++) occ.add(`${r + b},${cI + a}`); slots.push({ r, c: cI, span }); break outer; }
      }
    });
    const rows = Math.max(...slots.map((s) => s.r + s.span));
    const H = pad * 2 + rows * cellW + (rows - 1) * gap;
    const c = canvas(W, Math.round(H)), g = c.getContext('2d');
    g.fillStyle = '#14141c'; g.fillRect(0, 0, W, H);
    const bgs = ['#1f2235', '#26203a', '#1d2c2a', '#2e2420', '#22283a'];
    slots.forEach((s, i) => {
      const x = pad + s.c * (cellW + gap), y = pad + s.r * (cellW + gap), w = cellW * s.span + gap * (s.span - 1);
      g.save(); roundRect(g, x, y, w, w, 28); g.clip(); g.fillStyle = bgs[i % bgs.length]; g.fillRect(x, y, w, w);
      g.imageSmoothingEnabled = false; drawFit(g, items[i].canvas, x + w * 0.08, y + w * 0.08, w * 0.84, w * 0.84, 'contain'); g.restore();
    });
    await io.save(`pixelBento ${stamp()}`, await toBlob(c, 'png'), 'png');
  }

  function build() {
    const conv = () => { S.$save(); convert(); };
    const palKeys = [...Object.keys(PALETTES), ...(S.custom.length ? ['custom'] : [])];
    const pal = px ? activePal() : [];
    ctx.side.replaceChildren(
      section('Gambar', 'image', button(src ? 'Ganti gambar…' : 'Pilih gambar…', { icon: 'folder-open', cls: 'sm' + (src ? '' : ' primary'), onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await load(p); } }),
        src ? h('div.faint.small', { text: `${srcName} · grid ${px ? px.width + '×' + px.height : '-'}` }) : null),
      section('Piksel', 'grid-3x3',
        chipField('Ukuran grid', [[16, '16'], [32, '32'], [48, '48'], [64, '64'], [96, '96'], [128, '128']], S.size, (v) => { S.size = Number(v); conv(); }),
        h('div.row', slider('Kontras', { min: -30, max: 60, value: S.contrast, fmt: (v) => v + '%' }, (v) => { S.contrast = v; conv(); }), slider('Saturasi', { min: -50, max: 80, value: S.sat, fmt: (v) => v + '%' }, (v) => { S.sat = v; conv(); })),
        check('Hapus latar (warna sudut)', S.bgCut, (v) => { S.bgCut = v; conv(); }),
        h('div.row', check('Garis tepi', S.outline, (v) => { S.outline = v; conv(); }), S.outline ? color('', S.ocol, (v) => { S.ocol = v; conv(); }) : null)),
      section('Palet', 'palette',
        h('div.chips', palKeys.map((k) => h('button.chip' + (S.pal === k ? '.on' : ''), { type: 'button', onclick: () => { S.pal = k; conv(); } }, k === 'custom' ? S.customName || 'Kustom' : PALETTES[k].name))),
        S.pal === 'auto' ? slider('Jumlah warna', { min: 2, max: 32, value: S.colors }, (v) => { S.colors = v; conv(); }) : null,
        chipField('Dithering', [['none', 'Tanpa'], ['bayer', 'Bayer'], ['floyd', 'Floyd–Steinberg']], S.dither, (v) => { S.dither = v; conv(); }),
        S.dither !== 'none' ? slider('Kekuatan dither', { min: 10, max: 100, value: S.dstr, fmt: (v) => v + '%' }, (v) => { S.dstr = v; conv(); }) : null,
        pal.length ? h('div.swatches', pal.map((col) => h('button.sw', { type: 'button', title: col, style: { background: col }, onclick: () => { S.ink = col; S.tool = 'pencil'; S.$save(); build(); } }))) : null,
        textField('Tema palet (AI)', S.mood, (v) => { S.mood = v; S.$save(); }, { max: 200, placeholder: 'mis. senja cyberpunk, hutan musim gugur' }),
        button('Buat palet dengan AI', { icon: 'wand-sparkles', cls: 'ai block', onClick: aiPalette })),
      px ? section('Sunting piksel', 'pencil',
        h('div.chips', [['pencil', 'Pensil', 'pencil'], ['eraser', 'Hapus', 'eraser'], ['fill', 'Ember', 'paint-bucket'], ['picker', 'Ambil warna', 'pipette']].map(([v, l, i]) => h('button.chip' + (S.tool === v ? '.on' : ''), { type: 'button', onclick: () => { S.tool = v; S.$save(); build(); } }, ic(i), l))),
        h('div.row', color('Tinta', S.ink, (v) => { S.ink = v; S.$save(); }), check('Garis grid', S.grid, (v) => { S.grid = v; S.$save(); draw(); }), button('', { icon: 'undo-2', cls: 'sm subtle icon', title: 'Urungkan (Ctrl+Z)', onClick: doUndo }))) : null,
      section('Ekspor', 'download',
        chipField('Skala PNG', [[1, '1×'], [4, '4×'], [8, '8×'], [16, '16×']], S.scale, (v) => { S.scale = Number(v); S.$save(); }),
        h('div.row', button('Tambah ke bento', { icon: 'layout-grid', cls: 'sm', disabled: !px, onClick: addBento }), bento.length ? button(`Kosongkan (${bento.length})`, { icon: 'x', cls: 'sm subtle', onClick: () => { bento.length = 0; build(); } }) : null),
        bento.length ? h('div.files', bento.map((b) => { const t = canvas(b.canvas.width, b.canvas.height); t.getContext('2d').drawImage(b.canvas, 0, 0); return h('div.file', t, h('span.ellipsis.small', { text: b.name })); })) : null,
        button('Ekspor lembar bento', { icon: 'layout-dashboard', cls: 'sm block', disabled: !px && !bento.length, onClick: exportBento }))
    );
  }
  ctx.onDrop((s) => { if (s.images[0]) load(s.images[0]); });
  ctx.bar.append(h('span.faint.small', { text: 'Klik/seret di kanvas untuk menyunting piksel · Ctrl+Z urungkan' }), h('div.grow'), button('Ekspor PNG', { icon: 'download', cls: 'primary', onClick: () => (px ? exportPng() : toast('Pilih gambar dulu.', 'err')) }));
  ctx.stage.replaceChildren(emptyStage('grid-3x3', 'Ubah gambar jadi pixel art', 'Pilih atau seret gambar. Semua diproses offline; AI hanya untuk membuat palet dari tema.',
    button('Pilih gambar…', { icon: 'folder-open', cls: 'primary', onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await load(p); } })));
  build();
}
