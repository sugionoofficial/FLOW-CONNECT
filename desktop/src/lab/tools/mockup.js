// Mockup — desain ditempatkan di perangkat/benda (digambar prosedural) dengan kemiringan 3D, atau di fotomu sendiri (4 sudut).
import {
  h, ic, button, section, slider, select, chipField, color, textField, check, toast, ai, io, persisted, canvas,
  toBlob, drawFit, roundRect, sizeFor, palette, dataUrlFor, canvasPoint, clamp, emptyStage, validHex, rgb, hex
} from '../core.js';
import { warpQuad, tiltQuad } from '../gl.js';

export const TEMPLATES = [
  ['phone', 'Ponsel', 'smartphone'], ['tablet', 'Tablet', 'tablet'], ['laptop', 'Laptop', 'laptop'], ['monitor', 'Monitor', 'monitor'],
  ['browser', 'Jendela browser', 'app-window'], ['poster', 'Poster berbingkai', 'frame'], ['polaroid', 'Polaroid', 'camera'],
  ['card', 'Kartu nama', 'id-card'], ['billboard', 'Billboard', 'layout-template'], ['photo', 'Foto saya (4 sudut)', 'scan-line']
];

/** Lukis perangkat + desain di kanvas tersendiri (datar, sebelum dimiringkan). */
export function deviceCanvas(tpl, design, o = {}) {
  const fit = o.fit || 'cover';
  const dw = design ? design.width : 1600, dh = design ? design.height : 1000;
  const put = (g, x, y, w, hh, r = 0) => {
    g.save(); roundRect(g, x, y, w, hh, r); g.clip();
    g.fillStyle = '#111'; g.fillRect(x, y, w, hh);
    if (design) drawFit(g, design, x, y, w, hh, fit);
    if (o.gloss) { const gr = g.createLinearGradient(x, y, x + w * 0.7, y + hh); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.04)'); gr.addColorStop(0.46, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, hh); }
    g.restore();
  };
  const body = o.body || '#1c1c1f';
  let c, g;
  const mk = (w, hh) => { c = canvas(w, hh); g = c.getContext('2d'); };
  switch (tpl) {
    case 'phone': {
      mk(900, 1860);
      const gr = g.createLinearGradient(0, 0, 900, 0); gr.addColorStop(0, '#3a3a3f'); gr.addColorStop(0.5, body); gr.addColorStop(1, '#3a3a3f');
      g.fillStyle = gr; roundRect(g, 0, 0, 900, 1860, 140); g.fill();
      g.fillStyle = '#050505'; roundRect(g, 14, 14, 872, 1832, 128); g.fill();
      put(g, 38, 38, 824, 1784, 106);
      g.fillStyle = '#000'; roundRect(g, 330, 70, 240, 70, 35); g.fill();
      g.fillStyle = '#2a2a2e'; g.fillRect(896, 420, 6, 180); g.fillRect(-2, 360, 6, 110); g.fillRect(-2, 500, 6, 110);
      break;
    }
    case 'tablet': {
      mk(1300, 1760);
      g.fillStyle = '#9aa0a6'; roundRect(g, 0, 0, 1300, 1760, 90); g.fill();
      g.fillStyle = '#0b0b0d'; roundRect(g, 10, 10, 1280, 1740, 82); g.fill();
      put(g, 70, 70, 1160, 1620, 24);
      g.fillStyle = '#1d1d20'; g.beginPath(); g.arc(650, 40, 10, 0, 7); g.fill();
      break;
    }
    case 'laptop': {
      mk(2400, 1580);
      g.fillStyle = '#2b2b30'; roundRect(g, 200, 0, 2000, 1300, 50); g.fill();
      g.fillStyle = '#050505'; roundRect(g, 212, 12, 1976, 1276, 42); g.fill();
      put(g, 262, 62, 1876, 1176, 6);
      g.fillStyle = '#111'; g.beginPath(); g.arc(1200, 36, 8, 0, 7); g.fill();
      const gr = g.createLinearGradient(0, 1300, 0, 1580); gr.addColorStop(0, '#d9dbe0'); gr.addColorStop(1, '#8d9096');
      g.fillStyle = gr; g.beginPath(); g.moveTo(120, 1300); g.lineTo(2280, 1300); g.lineTo(2400, 1520); g.quadraticCurveTo(2400, 1580, 2330, 1580); g.lineTo(70, 1580); g.quadraticCurveTo(0, 1580, 0, 1520); g.closePath(); g.fill();
      g.fillStyle = '#b5b8be'; roundRect(g, 1020, 1300, 360, 26, 13); g.fill();
      break;
    }
    case 'monitor': {
      mk(2200, 1800);
      g.fillStyle = '#18181b'; roundRect(g, 0, 0, 2200, 1300, 36); g.fill();
      put(g, 40, 40, 2120, 1192, 8);
      g.fillStyle = '#a1a1aa'; g.beginPath(); g.moveTo(980, 1300); g.lineTo(1220, 1300); g.lineTo(1260, 1700); g.lineTo(940, 1700); g.closePath(); g.fill();
      g.fillStyle = '#d4d4d8'; roundRect(g, 700, 1690, 800, 60, 30); g.fill();
      break;
    }
    case 'browser': {
      mk(2000, 1300);
      g.fillStyle = '#f1f3f4'; roundRect(g, 0, 0, 2000, 1300, 28); g.fill();
      ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(50 + i * 44, 50, 14, 0, 7); g.fill(); });
      g.fillStyle = '#ffffff'; roundRect(g, 240, 22, 1520, 56, 28); g.fill();
      g.fillStyle = '#5f6368'; g.font = '28px "Segoe UI", sans-serif'; g.fillText(o.url || 'www.bisnisanda.id', 290, 60);
      put(g, 0, 100, 2000, 1200, 0);
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; roundRect(g, 1, 1, 1998, 1298, 28); g.stroke();
      break;
    }
    case 'poster': {
      const k = 1600 / Math.max(dw, dh), w = Math.round(dw * k), hh = Math.round(dh * k);
      mk(w + 260, hh + 260);
      g.fillStyle = o.frame || '#1a1a1a'; g.fillRect(0, 0, w + 260, hh + 260);
      g.fillStyle = '#fafafa'; g.fillRect(40, 40, w + 180, hh + 180);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(126, 126, w + 8, hh + 8);
      put(g, 130, 130, w, hh, 0);
      break;
    }
    case 'polaroid': {
      mk(1200, 1440);
      g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, 1200, 1440);
      put(g, 70, 70, 1060, 1060, 0);
      g.fillStyle = '#333'; g.font = '64px "Segoe Print", "Comic Sans MS", cursive'; g.textAlign = 'center'; g.fillText(o.caption || '', 600, 1300);
      break;
    }
    case 'card': {
      mk(1750, 1000);
      put(g, 0, 0, 1750, 1000, 50);
      break;
    }
    case 'billboard': {
      mk(2400, 1700);
      g.fillStyle = '#3f3f46'; g.fillRect(560, 1150, 60, 550); g.fillRect(1780, 1150, 60, 550);
      g.fillStyle = '#27272a'; g.fillRect(0, 0, 2400, 1200);
      put(g, 40, 40, 2320, 1120, 0);
      g.fillStyle = '#52525b'; g.fillRect(200, 1200, 2000, 24);
      for (let i = 0; i < 4; i++) { g.fillStyle = '#71717a'; g.fillRect(380 + i * 520, 1180, 80, 40); }
      break;
    }
    default: { mk(dw, dh); if (design) g.drawImage(design, 0, 0); }
  }
  return c;
}

export async function mount(ctx) {
  const S = persisted('mockup', { tpl: 'phone', ratio: '16:9', bgMode: 'gradient', bg1: '#0f172a', bg2: '#6d28d9', angle: 135, scale: 78, x: 50, y: 52, rx: 0, ry: -14, rz: 0, shadow: 60, fit: 'cover', gloss: true, body: '#1c1c1f', headline: '', sub: '', textColor: '#ffffff', textPos: 'left', url: 'www.bisnisanda.id', caption: '', blend: 'multiply', opacity: 100, fmt: 'png', twin: false });
  let designs = []; // {name, bmp}
  let di = 0;
  let bgImg = null, photo = null, quad = null;
  const c = h('canvas');
  const g = c.getContext('2d');

  const design = () => (designs[di] ? designs[di].bmp : null);
  function outSize() {
    if (S.tpl === 'photo' && photo) { const k = Math.min(1, 2400 / Math.max(photo.width, photo.height)); return [Math.round(photo.width * k), Math.round(photo.height * k)]; }
    return sizeFor(S.ratio, 1080 * 1.5);
  }
  function compose(gg, W, H, d) {
    if (S.tpl === 'photo') {
      if (!photo) { gg.fillStyle = '#222'; gg.fillRect(0, 0, W, H); return; }
      gg.drawImage(photo, 0, 0, W, H);
      if (!quad) quad = [[0.3, 0.25], [0.7, 0.25], [0.7, 0.75], [0.3, 0.75]];
      if (d) {
        const q = quad.map(([x, y]) => [x * W, y * H]);
        const wc = warpQuad(d, q, W, H);
        gg.save(); gg.globalCompositeOperation = S.blend; gg.globalAlpha = S.opacity / 100; gg.drawImage(wc, 0, 0); gg.restore();
      }
      return;
    }
    if (S.bgMode === 'image' && bgImg) { gg.fillStyle = '#000'; gg.fillRect(0, 0, W, H); gg.filter = 'blur(8px) brightness(0.8)'; drawFit(gg, bgImg, -20, -20, W + 40, H + 40, 'cover'); gg.filter = 'none'; }
    else if (S.bgMode === 'solid') { gg.fillStyle = S.bg1; gg.fillRect(0, 0, W, H); }
    else {
      const a = S.angle * Math.PI / 180, r = Math.hypot(W, H) / 2;
      const gr = gg.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
      gr.addColorStop(0, S.bg1); gr.addColorStop(1, S.bg2); gg.fillStyle = gr; gg.fillRect(0, 0, W, H);
      const rg = gg.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, Math.max(W, H) * 0.6); rg.addColorStop(0, 'rgba(255,255,255,0.12)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = rg; gg.fillRect(0, 0, W, H);
    }
    const dev = deviceCanvas(S.tpl, d, { fit: S.fit, gloss: S.gloss, body: S.body, url: S.url, caption: S.caption });
    const hasText = !!(S.headline || S.sub);
    const area = hasText && S.textPos !== 'top' ? { x: S.textPos === 'left' ? W * 0.42 : 0, w: W * 0.58 } : { x: 0, w: W };
    const k = Math.min(area.w * 0.86 / dev.width, H * (hasText && S.textPos === 'top' ? 0.62 : 0.84) / dev.height) * S.scale / 100;
    const dwid = dev.width * k, dhgt = dev.height * k;
    const cx = area.x + area.w * S.x / 100, cy = H * S.y / 100 + (hasText && S.textPos === 'top' ? H * 0.12 : 0);
    const copies = S.twin && ['phone', 'card', 'polaroid', 'tablet'].includes(S.tpl) ? [[-0.32, 6, 0.92], [0.18, -4, 1]] : [[0, 0, 1]];
    for (const [ox, rot, sc] of copies) {
      const q = tiltQuad(cx + ox * dwid * 1.6, cy, dwid * sc, dhgt * sc, S.rx * Math.PI / 180, S.ry * Math.PI / 180, (S.rz + rot) * Math.PI / 180, Math.max(W, H) * 1.4);
      if (S.shadow > 0) {
        gg.save();
        gg.shadowColor = `rgba(0,0,0,${S.shadow / 100 * 0.6})`; gg.shadowBlur = Math.max(W, H) * 0.04; gg.shadowOffsetY = Math.max(W, H) * 0.025;
        gg.fillStyle = 'rgba(0,0,0,0.01)';
        gg.beginPath(); q.forEach(([x, y], i) => (i ? gg.lineTo(x, y) : gg.moveTo(x, y))); gg.closePath(); gg.fill();
        gg.restore();
      }
      gg.drawImage(warpQuad(dev, q, W, H), 0, 0);
    }
    if (hasText) {
      gg.save();
      gg.fillStyle = S.textColor; gg.textBaseline = 'top';
      const big = Math.round(H * 0.075), small = Math.round(H * 0.032);
      const tx = S.textPos === 'top' ? W / 2 : W * 0.07;
      gg.textAlign = S.textPos === 'top' ? 'center' : 'left';
      const maxW = S.textPos === 'top' ? W * 0.84 : W * 0.36;
      gg.font = `700 ${big}px "Segoe UI Variable Display", "Segoe UI", sans-serif`;
      const lines = (S.headline ? (function wrap() { const out = []; let line = ''; for (const w of S.headline.split(/\s+/)) { const t = line ? line + ' ' + w : w; if (gg.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); return out; })() : []);
      const totalH = lines.length * big * 1.12 + (S.sub ? small * 2.2 : 0);
      let y = S.textPos === 'top' ? H * 0.07 : H / 2 - totalH / 2;
      lines.forEach((ln) => { gg.fillText(ln, tx, y); y += big * 1.12; });
      if (S.sub) { gg.globalAlpha = 0.82; gg.font = `400 ${small}px "Segoe UI", sans-serif`; gg.fillText(S.sub, tx, y + small * 0.6); }
      gg.restore();
    }
  }
  let raf = 0;
  const redraw = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const [W, H] = outSize(); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } compose(g, W, H, design()); if (S.tpl === 'photo' && photo && quad) drawHandles(); }); };
  function drawHandles() {
    const k = c.width / Math.max(1, c.getBoundingClientRect().width || c.width);
    g.save(); g.strokeStyle = '#0a84ff'; g.lineWidth = 2 * k; g.fillStyle = '#fff';
    g.beginPath(); quad.forEach(([x, y], i) => (i ? g.lineTo(x * c.width, y * c.height) : g.moveTo(x * c.width, y * c.height))); g.closePath(); g.stroke();
    for (const [x, y] of quad) { g.beginPath(); g.arc(x * c.width, y * c.height, 9 * k, 0, 7); g.fill(); g.stroke(); }
    g.restore();
  }
  let dragI = -1;
  c.addEventListener('pointerdown', (e) => {
    if (S.tpl !== 'photo' || !quad) return;
    const p = canvasPoint(c, e);
    dragI = quad.findIndex(([x, y]) => Math.hypot(x * c.width - p.x, y * c.height - p.y) < 22 * p.k);
    if (dragI >= 0) c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', (e) => { if (dragI < 0) return; const p = canvasPoint(c, e); quad[dragI] = [clamp(p.x / c.width, -0.2, 1.2), clamp(p.y / c.height, -0.2, 1.2)]; redraw(); });
  c.addEventListener('pointerup', () => { dragI = -1; });

  async function addDesigns(paths) {
    for (const p of paths) { const im = await io.image(p); designs.push({ name: im.name, bmp: im.bmp }); }
    if (designs.length) { di = designs.length - 1; ctx.stage.replaceChildren(c); }
    build(); redraw();
  }
  ctx.onDrop((s) => { if (S.tpl === 'photo' && !photo && s.images[0]) io.image(s.images[0]).then((im) => { photo = im.bmp; quad = null; build(); redraw(); }); else addDesigns(s.images); });

  function autoPalette() {
    const d = design(); if (!d) return;
    const p = palette(d, 5);
    const dark = (hx, f) => hex(rgb(hx).map((v) => v * f));
    S.bg1 = dark(p[0], 0.35); S.bg2 = dark(p[1] || p[0], 0.9); S.$save(); build(); redraw();
  }
  async function aiIdea() {
    const d = design(); if (!d) { toast('Pilih desain dulu.', 'err'); return; }
    const r = await ai(`Kamu art director. Lihat desain ini lalu sarankan mockup pemasaran: warna latar gradasi yang serasi (2 warna hex), judul pendek (Bahasa Indonesia, maks 5 kata), subjudul (maks 9 kata), dan perangkat terbaik dari: ${TEMPLATES.filter(([v]) => v !== 'photo').map(([v]) => v).join(', ')}.\nFormat: {"bg1":"#hex","bg2":"#hex","headline":"...","sub":"...","template":"phone","textColor":"#ffffff"}`, { json: true, image: dataUrlFor(d, 768) });
    if (validHex(r.bg1)) S.bg1 = r.bg1;
    if (validHex(r.bg2)) S.bg2 = r.bg2;
    if (validHex(r.textColor)) S.textColor = r.textColor;
    if (r.headline) S.headline = String(r.headline).slice(0, 80);
    if (r.sub) S.sub = String(r.sub).slice(0, 120);
    if (TEMPLATES.some(([v]) => v === r.template && v !== 'photo')) S.tpl = r.template;
    S.bgMode = 'gradient'; S.$save(); build(); redraw();
    toast('Saran AI diterapkan.', 'ok');
  }
  async function exportOne(i) {
    const [W, H] = outSize(), out = canvas(W, H);
    compose(out.getContext('2d'), W, H, designs[i] ? designs[i].bmp : null);
    const nm = designs[i] ? designs[i].name.replace(/\.[^.]+$/, '') : 'desain';
    await io.save(`Mockup ${S.tpl} ${nm}`, await toBlob(out, S.fmt), S.fmt);
  }

  function build() {
    const up = () => { S.$save(); redraw(); };
    const photoMode = S.tpl === 'photo';
    ctx.side.replaceChildren(
      section('Desain', 'image',
        designs.length ? h('div.files', designs.map((d, i) => h('div.file' + (i === di ? '.on' : ''), { onclick: () => { di = i; build(); redraw(); } }, ic('file-image'), h('span.ellipsis.small', { text: d.name }),
          button('', { icon: 'x', cls: 'sm subtle icon', title: 'Hapus', onClick: (e) => { e.stopPropagation(); designs.splice(i, 1); di = Math.max(0, Math.min(di, designs.length - 1)); build(); redraw(); } })))) : null,
        button(designs.length ? 'Tambah desain…' : 'Pilih desain…', { icon: 'folder-open', cls: 'sm' + (designs.length ? '' : ' primary'), onClick: async () => addDesigns((await io.pick('image', true)).images) }),
        h('div.faint.small', { text: 'Bisa beberapa desain — "Ekspor semua" memakai setelan yang sama.' })),
      section('Perangkat / tempat', 'frame',
        h('div.chips', TEMPLATES.map(([v, l, i]) => h('button.chip' + (S.tpl === v ? '.on' : ''), { type: 'button', onclick: () => { S.tpl = v; S.$save(); build(); redraw(); } }, ic(i), l))),
        photoMode ? h('div.chat',
          button(photo ? 'Ganti foto…' : 'Pilih foto lokasi…', { icon: 'camera', cls: 'sm' + (photo ? '' : ' primary'), onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) { photo = (await io.image(p)).bmp; quad = null; ctx.stage.replaceChildren(c); build(); redraw(); } } }),
          h('div.faint.small', { text: 'Seret 4 titik biru ke sudut layar/papan/kertas di foto. Mode Multiply menjaga bayangan & tekstur foto.' }),
          select('Campur', [['source-over', 'Normal'], ['multiply', 'Multiply (realistis)'], ['screen', 'Screen (layar menyala)'], ['overlay', 'Overlay']], S.blend, (v) => { S.blend = v; up(); }),
          slider('Opasitas', { min: 10, max: 100, value: S.opacity, fmt: (v) => v + '%' }, (v) => { S.opacity = v; up(); }))
          : h('div.chat',
            chipField('Isi layar', [['cover', 'Penuh'], ['contain', 'Utuh']], S.fit, (v) => { S.fit = v; up(); }),
            h('div.row', check('Kilap layar', S.gloss, (v) => { S.gloss = v; up(); }), ['phone', 'card', 'polaroid', 'tablet'].includes(S.tpl) ? check('Dua salinan', S.twin, (v) => { S.twin = v; up(); }) : null),
            S.tpl === 'phone' ? color('Warna bodi', S.body, (v) => { S.body = v; up(); }) : null,
            S.tpl === 'browser' ? textField('Alamat', S.url, (v) => { S.url = v; up(); }, { max: 60 }) : null,
            S.tpl === 'polaroid' ? textField('Tulisan', S.caption, (v) => { S.caption = v; up(); }, { max: 40 }) : null)),
      photoMode ? null : section('Posisi & kemiringan 3D', 'rotate-cw',
        h('div.row', slider('Ukuran', { min: 20, max: 140, value: S.scale, fmt: (v) => v + '%' }, (v) => { S.scale = v; up(); }), slider('Bayangan', { min: 0, max: 100, value: S.shadow, fmt: (v) => v + '%' }, (v) => { S.shadow = v; up(); })),
        h('div.row', slider('Posisi X', { min: 0, max: 100, value: S.x, fmt: (v) => v + '%' }, (v) => { S.x = v; up(); }), slider('Posisi Y', { min: 0, max: 100, value: S.y, fmt: (v) => v + '%' }, (v) => { S.y = v; up(); })),
        h('div.row', slider('Miring kiri-kanan', { min: -45, max: 45, value: S.ry, fmt: (v) => v + '°' }, (v) => { S.ry = v; up(); }), slider('Miring atas-bawah', { min: -45, max: 45, value: S.rx, fmt: (v) => v + '°' }, (v) => { S.rx = v; up(); })),
        slider('Putar', { min: -45, max: 45, value: S.rz, fmt: (v) => v + '°' }, (v) => { S.rz = v; up(); }),
        h('div.row', button('Lurus', { icon: 'rotate-ccw', cls: 'sm subtle', onClick: () => { Object.assign(S, { rx: 0, ry: 0, rz: 0 }); S.$save(); build(); redraw(); } }), button('Gaya 3D', { icon: 'cuboid', cls: 'sm subtle', onClick: () => { Object.assign(S, { rx: 10, ry: -22, rz: 4 }); S.$save(); build(); redraw(); } }))),
      photoMode ? null : section('Latar & teks', 'palette',
        chipField('Rasio', [['16:9', '16:9'], ['1:1', '1:1'], ['4:5', '4:5'], ['9:16', '9:16']], S.ratio, (v) => { S.ratio = v; up(); }),
        chipField('Latar', [['gradient', 'Gradasi'], ['solid', 'Polos'], ['image', 'Gambar (blur)']], S.bgMode, async (v) => { S.bgMode = v; if (v === 'image' && !bgImg) { const p = (await io.pick('image')).images[0]; if (p) bgImg = (await io.image(p)).bmp; } up(); build(); }),
        S.bgMode !== 'image' ? h('div.row', color('Warna 1', S.bg1, (v) => { S.bg1 = v; up(); }), S.bgMode === 'gradient' ? color('Warna 2', S.bg2, (v) => { S.bg2 = v; up(); }) : null, S.bgMode === 'gradient' ? slider('Sudut', { min: 0, max: 360, value: S.angle, fmt: (v) => v + '°' }, (v) => { S.angle = v; up(); }) : null) : null,
        h('div.row', button('Warna dari desain', { icon: 'pipette', cls: 'sm', onClick: autoPalette }), button('Ide AI', { icon: 'wand-sparkles', cls: 'sm ai', onClick: aiIdea })),
        textField('Judul', S.headline, (v) => { S.headline = v; up(); }, { max: 80, placeholder: 'opsional — mis. Aplikasi Kasir Baru' }),
        textField('Subjudul', S.sub, (v) => { S.sub = v; up(); }, { max: 120, placeholder: 'opsional' }),
        h('div.row', chipField('Letak teks', [['left', 'Kiri'], ['top', 'Atas']], S.textPos, (v) => { S.textPos = v; up(); }), color('Warna teks', S.textColor, (v) => { S.textColor = v; up(); }))),
      section('Ekspor', 'download', chipField('Format', [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']], S.fmt, (v) => { S.fmt = v; S.$save(); }), h('div.faint.small', { text: `Ukuran: ${outSize().join(' × ')} px` }))
    );
    allBtn.disabled = designs.length < 2;
    allBtn.setText(designs.length > 1 ? `Ekspor semua (${designs.length})` : 'Ekspor semua');
  }
  const allBtn = button('Ekspor semua', { icon: 'layers', cls: 'sm', onClick: async () => { for (let i = 0; i < designs.length; i++) await exportOne(i); } });
  ctx.bar.append(h('div.grow'), allBtn, button('Ekspor mockup', { icon: 'download', cls: 'primary', onClick: () => exportOne(di) }));
  ctx.stage.replaceChildren(emptyStage('frame', 'Pilih desain', 'Gambar desain, tangkapan layar aplikasi, atau poster. Bisa juga langsung lihat contoh perangkat.',
    h('div.row', button('Pilih desain…', { icon: 'folder-open', cls: 'primary', onClick: async () => addDesigns((await io.pick('image', true)).images) }), button('Lihat contoh', { icon: 'eye', onClick: () => { ctx.stage.replaceChildren(c); redraw(); } }))));
  build();
}
