// Editor Gambar — layer gambar/teks/bentuk/kuas; geser, skala, putar, opasitas, mode campur, filter; urungkan/ulangi.
import {
  h, ic, button, section, slider, select, chipField, color, textField, check, toast, ai, io, persisted, clamp,
  canvas, toBlob, dataUrlFor, canvasPoint, roundRect, wrapText, stamp, emptyStage, sizeFor, dialog
} from '../core.js';
import { removeBackground } from '../../renderer/imagetools.js';

const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'], ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['luminosity', 'Luminosity']];
const FONTS = ['Segoe UI', 'Bahnschrift', 'Arial Black', 'Impact', 'Georgia', 'Trebuchet MS', 'Consolas', 'Comic Sans MS', 'Times New Roman', 'Verdana'];
const F0 = { b: 100, c: 100, s: 100, h: 0, blur: 0, gray: 0, sepia: 0 };
let uid = 1;
const nid = () => 'L' + (uid++) + '-' + Math.random().toString(36).slice(2, 6);

/** Transformasi titik dokumen → koordinat lokal layer (tanpa skala). */
export function toLocal(L, x, y) {
  const a = -L.rot * Math.PI / 180;
  const dx = x - L.x, dy = y - L.y;
  const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / (L.scale * (L.flipX ? -1 : 1));
  const ly = (dx * Math.sin(a) + dy * Math.cos(a)) / (L.scale * (L.flipY ? -1 : 1));
  return [lx, ly];
}
export function corners(L) {
  const a = L.rot * Math.PI / 180, s = L.scale;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
    const x = u * L.w / 2 * s, y = v * L.h / 2 * s;
    return [L.x + x * Math.cos(a) - y * Math.sin(a), L.y + x * Math.sin(a) + y * Math.cos(a)];
  });
}

export async function mount(ctx) {
  const P = persisted('editor', { tool: 'select', brush: 24, brushColor: '#ff3b6b', fill: '#3b82f6', fmt: 'png', exportScale: 1 });
  const doc = { w: 1080, h: 1080, bg: '#ffffff' };
  let layers = [];
  const bitmaps = new Map(); // id sumber → ImageBitmap/canvas
  let sel = null;
  const c = h('canvas.checker');
  const g = c.getContext('2d');
  const hist = { list: [], i: -1 };

  // ---------- menggambar ----------
  function measureText(L) {
    const mg = c.getContext('2d');
    mg.save();
    mg.font = `${L.weight} ${L.size}px "${L.font}", "Segoe UI", sans-serif`;
    const lines = wrapText(mg, L.text || ' ', L.boxW || 100000);
    const w = Math.max(10, ...lines.map((l) => mg.measureText(l).width));
    mg.restore();
    L.w = w + L.size * 0.4; L.h = lines.length * L.size * 1.2 + L.size * 0.2;
    return lines;
  }
  function filterStr(f) {
    if (!f) return 'none';
    const parts = [];
    if (f.b !== 100) parts.push(`brightness(${f.b}%)`);
    if (f.c !== 100) parts.push(`contrast(${f.c}%)`);
    if (f.s !== 100) parts.push(`saturate(${f.s}%)`);
    if (f.h) parts.push(`hue-rotate(${f.h}deg)`);
    if (f.gray) parts.push(`grayscale(${f.gray}%)`);
    if (f.sepia) parts.push(`sepia(${f.sepia}%)`);
    if (f.blur) parts.push(`blur(${f.blur}px)`);
    return parts.join(' ') || 'none';
  }
  function drawLayer(gg, L) {
    if (!L.visible) return;
    gg.save();
    gg.globalAlpha = L.opacity; gg.globalCompositeOperation = L.blend;
    gg.translate(L.x, L.y); gg.rotate(L.rot * Math.PI / 180); gg.scale(L.scale * (L.flipX ? -1 : 1), L.scale * (L.flipY ? -1 : 1));
    gg.filter = filterStr(L.filters);
    if (L.shadow) { gg.shadowColor = 'rgba(0,0,0,0.45)'; gg.shadowBlur = 40; gg.shadowOffsetY = 14; }
    if (L.type === 'image') { const b = bitmaps.get(L.src); if (b) gg.drawImage(b, -L.w / 2, -L.h / 2, L.w, L.h); }
    else if (L.type === 'draw') gg.drawImage(L.canvas, -L.w / 2, -L.h / 2);
    else if (L.type === 'rect' || L.type === 'ellipse') {
      gg.beginPath();
      if (L.type === 'rect') roundRect(gg, -L.w / 2, -L.h / 2, L.w, L.h, L.radius || 0); else gg.ellipse(0, 0, L.w / 2, L.h / 2, 0, 0, Math.PI * 2);
      if (L.fillOn) { gg.fillStyle = L.fill; gg.fill(); }
      if (L.strokeW > 0) { gg.shadowColor = 'transparent'; gg.strokeStyle = L.stroke; gg.lineWidth = L.strokeW; gg.stroke(); }
    } else if (L.type === 'text') {
      const lines = measureText(L);
      gg.font = `${L.weight} ${L.size}px "${L.font}", "Segoe UI", sans-serif`;
      gg.textBaseline = 'middle'; gg.textAlign = L.align;
      const x = L.align === 'left' ? -L.w / 2 + L.size * 0.2 : L.align === 'right' ? L.w / 2 - L.size * 0.2 : 0;
      lines.forEach((ln, i) => {
        const y = -L.h / 2 + L.size * 0.1 + L.size * 1.2 * (i + 0.5);
        if (L.strokeW > 0) { gg.lineJoin = 'round'; gg.strokeStyle = L.stroke; gg.lineWidth = L.strokeW; gg.strokeText(ln, x, y); }
        gg.fillStyle = L.fill; gg.fillText(ln, x, y);
      });
    }
    gg.restore();
  }
  function renderTo(gg, W, H, scale = 1) {
    gg.save();
    gg.setTransform(scale, 0, 0, scale, 0, 0);
    gg.clearRect(0, 0, W, H);
    if (doc.bg !== 'transparent') { gg.fillStyle = doc.bg; gg.fillRect(0, 0, doc.w, doc.h); }
    for (const L of layers) drawLayer(gg, L);
    gg.restore();
  }
  function handles(L) {
    const k = c.width / Math.max(1, c.getBoundingClientRect().width || c.width);
    const cs = corners(L);
    const a = L.rot * Math.PI / 180;
    const top = [(cs[0][0] + cs[1][0]) / 2, (cs[0][1] + cs[1][1]) / 2];
    const rotH = [top[0] + Math.sin(a) * 36 * k, top[1] - Math.cos(a) * 36 * k];
    return { cs, rotH, k, top };
  }
  function draw() {
    if (c.width !== doc.w || c.height !== doc.h) { c.width = doc.w; c.height = doc.h; }
    renderTo(g, doc.w, doc.h);
    const L = layers.find((x) => x.id === sel);
    if (L && L.visible) {
      const { cs, rotH, k, top } = handles(L);
      g.save();
      g.strokeStyle = '#0a84ff'; g.lineWidth = 1.5 * k;
      g.beginPath(); cs.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(top[0], top[1]); g.lineTo(rotH[0], rotH[1]); g.stroke();
      g.fillStyle = '#fff';
      for (const [x, y] of cs) { g.beginPath(); g.rect(x - 5 * k, y - 5 * k, 10 * k, 10 * k); g.fill(); g.stroke(); }
      g.beginPath(); g.arc(rotH[0], rotH[1], 6 * k, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    }
  }
  let raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

  // ---------- riwayat ----------
  const snap = () => layers.map((L) => ({ ...L, filters: L.filters ? { ...L.filters } : null, canvas: L.canvas ? cloneCanvas(L.canvas) : undefined }));
  function cloneCanvas(src) { const x = canvas(src.width, src.height); x.getContext('2d').drawImage(src, 0, 0); return x; }
  let commitT = 0;
  function commit(now = false) {
    clearTimeout(commitT);
    const run = () => { hist.list = hist.list.slice(0, hist.i + 1); hist.list.push({ layers: snap(), doc: { ...doc }, sel }); if (hist.list.length > 40) hist.list.shift(); hist.i = hist.list.length - 1; updUndo(); };
    if (now) run(); else commitT = setTimeout(run, 350);
  }
  function restore(st) { layers = st.layers.map((L) => ({ ...L, filters: L.filters ? { ...L.filters } : null, canvas: L.canvas ? cloneCanvas(L.canvas) : undefined })); Object.assign(doc, st.doc); sel = layers.some((l) => l.id === st.sel) ? st.sel : null; build(); redraw(); }
  const undo = () => { if (hist.i > 0) { hist.i--; restore(hist.list[hist.i]); updUndo(); } };
  const redo = () => { if (hist.i < hist.list.length - 1) { hist.i++; restore(hist.list[hist.i]); updUndo(); } };
  const undoBtn = button('', { icon: 'undo-2', cls: 'sm subtle icon', title: 'Urungkan (Ctrl+Z)', onClick: undo });
  const redoBtn = button('', { icon: 'redo-2', cls: 'sm subtle icon', title: 'Ulangi (Ctrl+Y)', onClick: redo });
  const updUndo = () => { undoBtn.disabled = hist.i <= 0; redoBtn.disabled = hist.i >= hist.list.length - 1; };

  // ---------- layer ----------
  const base = (o) => ({ id: nid(), name: 'Layer', x: doc.w / 2, y: doc.h / 2, w: 100, h: 100, scale: 1, rot: 0, opacity: 1, blend: 'source-over', visible: true, locked: false, flipX: false, flipY: false, shadow: false, filters: { ...F0 }, ...o });
  function addLayer(L, select = true) { layers.push(L); if (select) sel = L.id; commit(true); build(); redraw(); return L; }
  async function addImages(paths) {
    for (const p of paths) {
      const im = await io.image(p);
      const id = nid();
      bitmaps.set(id, im.bmp);
      if (!layers.length) { doc.w = im.bmp.width; doc.h = im.bmp.height; while (doc.w > 4096 || doc.h > 4096) { doc.w = Math.round(doc.w / 2); doc.h = Math.round(doc.h / 2); } }
      const k = Math.min(1, doc.w / im.bmp.width, doc.h / im.bmp.height);
      addLayer(base({ type: 'image', src: id, name: im.name.replace(/\.[^.]+$/, ''), w: im.bmp.width, h: im.bmp.height, scale: k }));
    }
    showCanvas();
  }
  const addText = (x = doc.w / 2, y = doc.h / 2, text = 'Teks baru') => addLayer(base({ type: 'text', name: 'Teks', text, font: 'Segoe UI', weight: 800, size: Math.round(doc.h / 10), fill: '#ffffff', stroke: '#000000', strokeW: 0, align: 'center', shadow: true, x, y, boxW: Math.round(doc.w * 0.9) }));
  const addShape = (type, x, y, w = doc.w / 3, hh = doc.w / 3) => addLayer(base({ type, name: type === 'rect' ? 'Kotak' : 'Elips', fill: P.fill, fillOn: true, stroke: '#ffffff', strokeW: 0, radius: type === 'rect' ? 24 : 0, x, y, w, h: hh }));
  function drawLayerFor() {
    let L = layers.find((x) => x.id === sel && x.type === 'draw');
    if (!L) { L = base({ type: 'draw', name: 'Coretan', w: doc.w, h: doc.h, canvas: canvas(doc.w, doc.h) }); layers.push(L); sel = L.id; build(); }
    return L;
  }
  const cur = () => layers.find((x) => x.id === sel) || null;

  // ---------- interaksi ----------
  let act = null;
  function hit(x, y) { for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; if (!L.visible || L.locked) continue; const [lx, ly] = toLocal(L, x, y); if (Math.abs(lx) <= L.w / 2 && Math.abs(ly) <= L.h / 2) return L; } return null; }
  c.addEventListener('pointerdown', (e) => {
    const p = canvasPoint(c, e);
    c.setPointerCapture(e.pointerId);
    const tool = P.tool;
    if (tool === 'brush' || tool === 'eraser') {
      const L = drawLayerFor();
      const [lx, ly] = toLocal(L, p.x, p.y);
      act = { kind: 'paint', L, last: [lx + L.w / 2, ly + L.h / 2] };
      paint(act, act.last);
      return;
    }
    if (tool === 'text') { addText(p.x, p.y); setTool('select'); return; }
    if (tool === 'rect' || tool === 'ellipse') { const L = addShape(tool, p.x, p.y, 1, 1); act = { kind: 'shape', L, p0: p }; return; }
    const L = cur();
    if (L) {
      const { cs, rotH, k } = handles(L);
      if (Math.hypot(p.x - rotH[0], p.y - rotH[1]) < 12 * k) { act = { kind: 'rot', L, a0: Math.atan2(p.y - L.y, p.x - L.x), r0: L.rot }; return; }
      if (cs.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < 12 * k)) { act = { kind: 'scale', L, d0: Math.hypot(p.x - L.x, p.y - L.y), s0: L.scale }; return; }
    }
    const H = hit(p.x, p.y);
    sel = H ? H.id : null;
    if (H) act = { kind: 'move', L: H, p0: p, x0: H.x, y0: H.y };
    build(); redraw();
  });
  c.addEventListener('pointermove', (e) => {
    if (!act) return;
    const p = canvasPoint(c, e), L = act.L;
    if (act.kind === 'move') { L.x = act.x0 + p.x - act.p0.x; L.y = act.y0 + p.y - act.p0.y; }
    else if (act.kind === 'rot') { let r = act.r0 + (Math.atan2(p.y - L.y, p.x - L.x) - act.a0) * 180 / Math.PI; if (e.shiftKey) r = Math.round(r / 15) * 15; L.rot = ((r + 540) % 360) - 180; }
    else if (act.kind === 'scale') L.scale = clamp(act.s0 * Math.hypot(p.x - L.x, p.y - L.y) / Math.max(1, act.d0), 0.02, 40);
    else if (act.kind === 'shape') { L.w = Math.max(4, Math.abs(p.x - act.p0.x)); L.h = e.shiftKey ? L.w : Math.max(4, Math.abs(p.y - act.p0.y)); L.x = (p.x + act.p0.x) / 2; L.y = e.shiftKey ? act.p0.y + Math.sign(p.y - act.p0.y || 1) * L.w / 2 : (p.y + act.p0.y) / 2; }
    else if (act.kind === 'paint') { const [lx, ly] = toLocal(L, p.x, p.y); paint(act, [lx + L.w / 2, ly + L.h / 2]); }
    redraw();
  });
  c.addEventListener('pointerup', () => { if (act) { const k = act.kind; act = null; commit(true); if (k === 'shape') setTool('select'); else build(); redraw(); } });
  function paint(a, pt) {
    const gg = a.L.canvas.getContext('2d');
    gg.save();
    gg.globalCompositeOperation = P.tool === 'eraser' ? 'destination-out' : 'source-over';
    gg.strokeStyle = P.brushColor; gg.lineWidth = P.brush / a.L.scale; gg.lineCap = 'round'; gg.lineJoin = 'round';
    gg.beginPath(); gg.moveTo(a.last[0], a.last[1]); gg.lineTo(pt[0] + 0.01, pt[1]); gg.stroke();
    gg.restore();
    a.last = pt;
  }
  c.addEventListener('wheel', (e) => {
    const L = cur(); if (!L) return;
    e.preventDefault();
    if (e.shiftKey) L.rot = ((L.rot + (e.deltaY < 0 ? 2 : -2) + 540) % 360) - 180; else L.scale = clamp(L.scale * (e.deltaY < 0 ? 1.04 : 0.96), 0.02, 40);
    commit(); redraw(); build();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    const L = cur();
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'd' && L) { e.preventDefault(); duplicate(L); return; }
    if ((k === 'delete' || k === 'backspace') && L) { remove(L); return; }
    if (L && k.startsWith('arrow')) { const d = e.shiftKey ? 10 : 1; if (k === 'arrowleft') L.x -= d; if (k === 'arrowright') L.x += d; if (k === 'arrowup') L.y -= d; if (k === 'arrowdown') L.y += d; commit(); redraw(); e.preventDefault(); return; }
    const t = { v: 'select', b: 'brush', e: 'eraser', t: 'text', r: 'rect', o: 'ellipse' }[k];
    if (t && !e.ctrlKey) setTool(t);
  });
  const duplicate = (L) => { const n = { ...L, id: nid(), name: L.name + ' salinan', x: L.x + 30, y: L.y + 30, filters: L.filters ? { ...L.filters } : null, canvas: L.canvas ? cloneCanvas(L.canvas) : undefined }; layers.splice(layers.indexOf(L) + 1, 0, n); sel = n.id; commit(true); build(); redraw(); };
  const remove = (L) => { layers = layers.filter((x) => x !== L); if (sel === L.id) sel = null; commit(true); build(); redraw(); };
  const move = (L, d) => { const i = layers.indexOf(L), j = clamp(i + d, 0, layers.length - 1); layers.splice(i, 1); layers.splice(j, 0, L); commit(true); build(); redraw(); };

  // ---------- AI & otomatis ----------
  function autoEnhance(L) {
    const b = bitmaps.get(L.src); if (!b) return;
    const t = canvas(128, 128 * b.height / b.width), tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(b, 0, 0, t.width, t.height);
    const d = tg.getImageData(0, 0, t.width, t.height).data;
    const hist2 = new Array(256).fill(0); let n = 0, sum = 0, sat = 0;
    for (let i = 0; i < d.length; i += 4) { const y = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114); hist2[y]++; n++; sum += y; sat += (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])); }
    let acc = 0, lo = 0, hi = 255;
    for (let i = 0; i < 256; i++) { acc += hist2[i]; if (acc < n * 0.01) lo = i; if (acc < n * 0.99) hi = i; }
    L.filters.c = Math.round(clamp(100 * 230 / Math.max(40, hi - lo), 90, 150));
    L.filters.b = Math.round(clamp(100 * 125 / Math.max(30, sum / n), 85, 135));
    L.filters.s = Math.round(clamp(100 * 70 / Math.max(15, sat / n), 95, 140));
    commit(true); build(); redraw();
    toast('Koreksi otomatis diterapkan.', 'ok');
  }
  async function aiSuggest() {
    const L = cur();
    const flat = canvas(doc.w, doc.h); renderTo(flat.getContext('2d'), doc.w, doc.h);
    const r = await ai('Kamu editor foto profesional. Lihat gambar ini dan sarankan koreksi warna agar lebih menarik untuk konten media sosial, plus satu judul pendek (Bahasa Indonesia, maks 6 kata) yang cocok ditaruh di gambar. Nilai dalam persen CSS filter (100 = tidak berubah), hue dalam derajat. Format: {"brightness":105,"contrast":110,"saturation":115,"hue":0,"sepia":0,"headline":"...","textColor":"#ffffff","position":"top|center|bottom","reason":"alasan singkat"}', { json: true, image: dataUrlFor(flat, 768) });
    const target = L && L.type === 'image' ? L : layers.find((x) => x.type === 'image');
    if (target) {
      const f = target.filters;
      f.b = clamp(Number(r.brightness) || 100, 50, 160); f.c = clamp(Number(r.contrast) || 100, 50, 180); f.s = clamp(Number(r.saturation) || 100, 0, 200);
      f.h = clamp(Number(r.hue) || 0, -180, 180); f.sepia = clamp(Number(r.sepia) || 0, 0, 100);
    }
    const msg = h('div.chat', h('div.note.ai', { text: String(r.reason || 'Saran AI diterapkan.') }), r.headline ? h('div', h('b', { text: 'Judul usulan: ' }), String(r.headline)) : null);
    commit(true); build(); redraw();
    const add = await dialog({ title: 'Saran AI diterapkan', body: msg, buttons: [r.headline ? { label: 'Tambahkan judul', value: true, primary: true } : null, { label: 'Selesai', value: false }].filter(Boolean) });
    if (add && r.headline) {
      const y = r.position === 'top' ? doc.h * 0.14 : r.position === 'center' ? doc.h / 2 : doc.h * 0.86;
      const T = addText(doc.w / 2, y, String(r.headline).slice(0, 120));
      if (/^#[0-9a-f]{6}$/i.test(String(r.textColor || ''))) T.fill = r.textColor;
      commit(true); build(); redraw();
    }
  }
  async function cutBg(L, mode) {
    const b = bitmaps.get(L.src); if (!b) return;
    const out = removeBackground(b, { mode, tolerance: 30, edgeOnly: true });
    const id = nid(); bitmaps.set(id, out); L.src = id;
    commit(true); redraw();
    toast('Latar polos dihapus.', 'ok');
  }

  // ---------- ekspor ----------
  async function exportImage() {
    const s = P.exportScale, out = canvas(doc.w * s, doc.h * s);
    renderTo(out.getContext('2d'), out.width, out.height, s);
    await io.save(`Editor ${stamp()}`, await toBlob(out, P.fmt, 0.92), P.fmt);
  }

  // ---------- panel ----------
  const layerBox = h('div.layers');
  const propBox = h('div');
  const right = ctx.right();
  const toolBtns = h('div.chips');
  function build() {
    toolBtns.replaceChildren(...[['select', 'Pilih', 'mouse-pointer-2', 'V'], ['brush', 'Kuas', 'brush', 'B'], ['eraser', 'Hapus', 'eraser', 'E'], ['text', 'Teks', 'type', 'T'], ['rect', 'Kotak', 'square', 'R'], ['ellipse', 'Elips', 'circle', 'O']]
      .map(([v, l, ico, key]) => h('button.chip' + (P.tool === v ? '.on' : ''), { type: 'button', title: `${l} (${key})`, onclick: () => setTool(v) }, ic(ico), l)));
    c.className = 'checker ' + (P.tool === 'select' ? 'grab' : 'cross');
    layerBox.replaceChildren(...[...layers].reverse().map((L) => h('div.layer' + (L.id === sel ? '.on' : ''), { onclick: () => { sel = L.id; build(); redraw(); } },
      ic({ image: 'image', text: 'type', rect: 'square', ellipse: 'circle', draw: 'brush' }[L.type]),
      h('span.ellipsis.small', { text: L.type === 'text' ? (L.text || 'Teks') : L.name }),
      button('', { icon: L.visible ? 'eye' : 'eye-off', cls: 'sm subtle icon', title: 'Tampil/sembunyi', onClick: (e) => { e.stopPropagation(); L.visible = !L.visible; commit(true); build(); redraw(); } }),
      button('', { icon: L.locked ? 'lock' : 'lock-open', cls: 'sm subtle icon', title: 'Kunci', onClick: (e) => { e.stopPropagation(); L.locked = !L.locked; build(); } }))));
    const L = cur();
    propBox.replaceChildren(L ? props(L) : h('div.faint.small', { text: 'Pilih layer untuk mengatur posisi, ukuran, warna, dan filter.' }));
    right.replaceChildren(
      section('Layer', 'layers', h('div.row', undoBtn, redoBtn, h('span.grow'), L ? button('', { icon: 'arrow-up', cls: 'sm subtle icon', title: 'Naikkan', onClick: () => move(L, 1) }) : null, L ? button('', { icon: 'arrow-down', cls: 'sm subtle icon', title: 'Turunkan', onClick: () => move(L, -1) }) : null,
        L ? button('', { icon: 'copy', cls: 'sm subtle icon', title: 'Duplikat (Ctrl+D)', onClick: () => duplicate(L) }) : null, L ? button('', { icon: 'trash-2', cls: 'sm subtle icon danger', title: 'Hapus (Del)', onClick: () => remove(L) }) : null),
      layers.length ? layerBox : h('div.faint.small', { text: 'Belum ada layer.' })),
      section('Properti', 'sliders-horizontal', propBox)
    );
    updUndo();
  }
  function props(L) {
    const up = () => { commit(); redraw(); };
    const f = L.filters || (L.filters = { ...F0 });
    const common = [
      h('div.row', slider('Skala', { min: 2, max: 400, value: Math.round(L.scale * 100), fmt: (v) => v + '%' }, (v) => { L.scale = v / 100; up(); }), slider('Putar', { min: -180, max: 180, value: Math.round(L.rot), fmt: (v) => v + '°' }, (v) => { L.rot = v; up(); })),
      slider('Opasitas', { min: 0, max: 100, value: Math.round(L.opacity * 100), fmt: (v) => v + '%' }, (v) => { L.opacity = v / 100; up(); }),
      select('Mode campur', BLENDS, L.blend, (v) => { L.blend = v; up(); }),
      h('div.row', check('Bayangan', L.shadow, (v) => { L.shadow = v; up(); }), check('Balik H', L.flipX, (v) => { L.flipX = v; up(); }), check('Balik V', L.flipY, (v) => { L.flipY = v; up(); })),
      h('div.row', button('Tengahkan', { icon: 'locate', cls: 'sm', onClick: () => { L.x = doc.w / 2; L.y = doc.h / 2; commit(true); redraw(); } }), button('Pas kanvas', { icon: 'maximize-2', cls: 'sm', onClick: () => { L.scale = Math.min(doc.w / L.w, doc.h / L.h); L.x = doc.w / 2; L.y = doc.h / 2; L.rot = 0; commit(true); build(); redraw(); } }), button('Penuhi', { icon: 'scaling', cls: 'sm', onClick: () => { L.scale = Math.max(doc.w / L.w, doc.h / L.h); L.x = doc.w / 2; L.y = doc.h / 2; L.rot = 0; commit(true); build(); redraw(); } }))
    ];
    const filters = h('div',
      h('div.row', slider('Kecerahan', { min: 0, max: 200, value: f.b, fmt: (v) => v + '%' }, (v) => { f.b = v; up(); }), slider('Kontras', { min: 0, max: 200, value: f.c, fmt: (v) => v + '%' }, (v) => { f.c = v; up(); })),
      h('div.row', slider('Saturasi', { min: 0, max: 250, value: f.s, fmt: (v) => v + '%' }, (v) => { f.s = v; up(); }), slider('Rona', { min: -180, max: 180, value: f.h, fmt: (v) => v + '°' }, (v) => { f.h = v; up(); })),
      h('div.row', slider('Abu-abu', { min: 0, max: 100, value: f.gray, fmt: (v) => v + '%' }, (v) => { f.gray = v; up(); }), slider('Sepia', { min: 0, max: 100, value: f.sepia, fmt: (v) => v + '%' }, (v) => { f.sepia = v; up(); })),
      slider('Blur', { min: 0, max: 30, step: 0.5, value: f.blur, fmt: (v) => v + ' px' }, (v) => { f.blur = v; up(); }),
      button('Reset filter', { icon: 'rotate-ccw', cls: 'sm subtle', onClick: () => { L.filters = { ...F0 }; commit(true); build(); redraw(); } }));
    if (L.type === 'text') {
      return h('div.chat',
        textField('Teks', L.text, (v) => { L.text = v; up(); }, { rows: 3, max: 500 }),
        h('div.row', select('Huruf', FONTS.map((x) => [x, x]), L.font, (v) => { L.font = v; up(); }), select('Tebal', [[400, 'Normal'], [600, 'Semi'], [800, 'Tebal'], [900, 'Hitam']], L.weight, (v) => { L.weight = Number(v); up(); })),
        slider('Ukuran huruf', { min: 8, max: 600, value: L.size }, (v) => { L.size = v; up(); }),
        slider('Lebar kotak', { min: 100, max: doc.w * 2, value: L.boxW, fmt: (v) => v + ' px' }, (v) => { L.boxW = v; up(); }),
        h('div.row', color('Isi', L.fill, (v) => { L.fill = v; up(); }), color('Garis', L.stroke, (v) => { L.stroke = v; up(); }), slider('Tebal garis', { min: 0, max: 40, value: L.strokeW }, (v) => { L.strokeW = v; up(); })),
        chipField('Rata', [['left', 'Kiri'], ['center', 'Tengah'], ['right', 'Kanan']], L.align, (v) => { L.align = v; up(); }),
        ...common);
    }
    if (L.type === 'rect' || L.type === 'ellipse') {
      return h('div.chat',
        h('div.row', check('Isi', L.fillOn, (v) => { L.fillOn = v; up(); }), color('Warna isi', L.fill, (v) => { L.fill = v; P.fill = v; P.$save(); up(); })),
        h('div.row', color('Garis', L.stroke, (v) => { L.stroke = v; up(); }), slider('Tebal garis', { min: 0, max: 60, value: L.strokeW }, (v) => { L.strokeW = v; up(); })),
        h('div.row', slider('Lebar', { min: 4, max: doc.w * 2, value: Math.round(L.w) }, (v) => { L.w = v; up(); }), slider('Tinggi', { min: 4, max: doc.h * 2, value: Math.round(L.h) }, (v) => { L.h = v; up(); })),
        L.type === 'rect' ? slider('Sudut bulat', { min: 0, max: 400, value: L.radius }, (v) => { L.radius = v; up(); }) : null,
        ...common);
    }
    if (L.type === 'image') {
      return h('div.chat', ...common, h('div.sec-t', ic('sliders-horizontal'), h('span', { text: 'Filter' })), filters,
        h('div.row', button('Koreksi otomatis', { icon: 'wand-sparkles', cls: 'sm', onClick: () => autoEnhance(L) }), button('Hapus latar polos', { icon: 'eraser', cls: 'sm', onClick: () => cutBg(L, 'auto') }), button('Latar hijau', { icon: 'eraser', cls: 'sm subtle', onClick: () => cutBg(L, 'green') })));
    }
    return h('div.chat', ...common, filters);
  }
  function side() {
    ctx.side.replaceChildren(
      section('Alat', 'mouse-pointer-2', toolBtns,
        P.tool === 'brush' || P.tool === 'eraser' ? h('div.row', slider('Ukuran kuas', { min: 1, max: 200, value: P.brush }, (v) => { P.brush = v; P.$save(); }), P.tool === 'brush' ? color('Warna', P.brushColor, (v) => { P.brushColor = v; P.$save(); }) : null) : null,
        h('div.faint.small', { text: 'Seret untuk memindah · sudut = skala · bulatan atas = putar (Shift = 15°) · roda mouse = skala, Shift+roda = putar.' })),
      section('Tambah', 'plus',
        h('div.row', button('Gambar…', { icon: 'image-plus', cls: 'sm primary', onClick: async () => addImages((await io.pick('image', true)).images) }), button('Teks', { icon: 'type', cls: 'sm', onClick: () => addText() }), button('Kotak', { icon: 'square', cls: 'sm', onClick: () => addShape('rect', doc.w / 2, doc.h / 2) }), button('Elips', { icon: 'circle', cls: 'sm', onClick: () => addShape('ellipse', doc.w / 2, doc.h / 2) }))),
      section('Kanvas', 'frame',
        chipField('Ukuran', [['1:1', '1:1'], ['4:5', '4:5'], ['9:16', '9:16'], ['16:9', '16:9'], ['img', 'Ikuti gambar']], '', (v) => {
          if (v === 'img') { const L = layers.find((x) => x.type === 'image'); if (!L) return; doc.w = Math.round(L.w * L.scale); doc.h = Math.round(L.h * L.scale); }
          else { const [w, hh] = sizeFor(v, 1080); const ox = (w - doc.w) / 2, oy = (hh - doc.h) / 2; layers.forEach((L) => { L.x += ox; L.y += oy; }); doc.w = w; doc.h = hh; }
          commit(true); redraw();
        }),
        h('div.row', textField('Lebar', doc.w, (v) => { if (v >= 16 && v <= 8192) { doc.w = Math.round(v); commit(); redraw(); } }, { type: 'number', min: 16, maxNum: 8192 }), textField('Tinggi', doc.h, (v) => { if (v >= 16 && v <= 8192) { doc.h = Math.round(v); commit(); redraw(); } }, { type: 'number', min: 16, maxNum: 8192 })),
        h('div.row', check('Latar transparan', doc.bg === 'transparent', (v) => { doc.bg = v ? 'transparent' : '#ffffff'; commit(true); side(); redraw(); }), doc.bg !== 'transparent' ? color('Warna latar', doc.bg, (v) => { doc.bg = v; commit(); redraw(); }) : null)),
      section('Bantuan AI', 'wand-sparkles', h('div.faint.small', { text: 'AI melihat gambarmu, menyarankan koreksi warna, dan menulis judul yang cocok.' }), button('Saran edit AI', { icon: 'wand-sparkles', cls: 'sm ai', disabled: !layers.length, onClick: aiSuggest })),
      section('Ekspor', 'download', chipField('Format', [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']], P.fmt, (v) => { P.fmt = v; P.$save(); }), chipField('Skala', [[1, '1×'], [2, '2×']], P.exportScale, (v) => { P.exportScale = Number(v); P.$save(); }))
    );
  }
  function setTool(v) { P.tool = v; P.$save(); side(); build(); }
  function showCanvas() { if (c.parentNode !== ctx.stage) ctx.stage.replaceChildren(c); side(); redraw(); }
  ctx.onDrop((s) => addImages(s.images));
  ctx.bar.append(button('Buka gambar…', { icon: 'folder-open', cls: 'sm', onClick: async () => addImages((await io.pick('image', true)).images) }), h('div.grow'), button('Ekspor gambar', { icon: 'download', cls: 'primary', onClick: exportImage }));
  ctx.stage.replaceChildren(emptyStage('layers', 'Mulai mengedit', 'Buka gambar (bisa beberapa — tiap gambar jadi layer) atau mulai dari kanvas kosong.',
    h('div.row', button('Buka gambar…', { icon: 'folder-open', cls: 'primary', onClick: async () => addImages((await io.pick('image', true)).images) }), button('Kanvas kosong', { icon: 'square-dashed', onClick: () => { commit(true); showCanvas(); } }))));
  commit(true);
  side(); build();
}
