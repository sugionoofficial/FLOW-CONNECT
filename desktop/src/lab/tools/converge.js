// Converge — kanvas sketsa (kuas, penghapus, garis, kotak, elips, ember cat, urungkan) → AI membaca sketsa & menulis
// prompt render → dikirim ke Studio bersama sketsa sebagai referensi (dirender Nano Banana di Google Flow).
import {
  h, ic, button, section, slider, chipField, color, textField, toast, ai, io, persisted, call, canvas, toBlob,
  canvasPoint, sizeFor, drawFit, dataUrlFor, stamp, clamp
} from '../core.js';

export const STYLES = [
  ['photo', 'Foto realistis', 'photorealistic photograph, natural lighting, high detail, 35mm lens'],
  ['3d', 'Render 3D', 'high-end 3D render, soft global illumination, octane style, clean materials'],
  ['anime', 'Anime', 'anime illustration, clean line art, vibrant cel shading'],
  ['watercolor', 'Cat air', 'delicate watercolor painting on textured paper'],
  ['oil', 'Lukisan minyak', 'classical oil painting, rich brush strokes'],
  ['arch', 'Arsitektur', 'architectural visualization, realistic materials, golden hour'],
  ['product', 'Foto produk', 'studio product photography, seamless background, softbox lighting'],
  ['concept', 'Concept art', 'cinematic concept art, dramatic lighting, matte painting'],
  ['clay', 'Claymation', 'claymation style, handcrafted plasticine, stop-motion look'],
  ['pixar', 'Kartun 3D', 'stylized 3D cartoon, expressive, family animation film look']
];
const SWATCH = ['#111111', '#ffffff', '#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#457b9d', '#8338ec', '#ff006e', '#6b4f3a', '#90be6d'];

/** Ember cat (flood fill) dengan toleransi. */
export function floodFill(g, x0, y0, hexCol, tol = 32) {
  const W = g.canvas.width, H = g.canvas.height;
  const img = g.getImageData(0, 0, W, H), d = img.data;
  x0 = Math.floor(x0); y0 = Math.floor(y0);
  if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
  const i0 = (y0 * W + x0) * 4, tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], ta = d[i0 + 3];
  const n = parseInt(hexCol.slice(1), 16), fr = n >> 16 & 255, fg = n >> 8 & 255, fb = n & 255;
  if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 3 && ta === 255) return;
  const match = (i) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) + Math.abs(d[i + 3] - ta) <= tol * 3;
  const seen = new Uint8Array(W * H);
  const stack = [y0 * W + x0];
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!match(i)) continue;
    d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * H - W) stack.push(p + W);
  }
  g.putImageData(img, 0, 0);
}

export async function mount(ctx) {
  const P = persisted('converge', { tool: 'brush', size: 8, color: '#111111', ratio: '1:1', style: 'photo', strict: 70, subject: '', prompt: '', guide: 40 });
  const [W0, H0] = sizeFor(P.ratio, 1024);
  const paper = canvas(W0, H0); // lapisan sketsa
  const pg = paper.getContext('2d', { willReadFrequently: true });
  pg.fillStyle = '#ffffff'; pg.fillRect(0, 0, W0, H0);
  let guide = null; // gambar panduan (dijiplak, tidak ikut dikirim)
  const c = h('canvas.cross');
  const g = c.getContext('2d');
  const undo = [], redo = [];
  const pushUndo = () => { undo.push(pg.getImageData(0, 0, paper.width, paper.height)); if (undo.length > 30) undo.shift(); redo.length = 0; };

  function draw(preview) {
    if (c.width !== paper.width || c.height !== paper.height) { c.width = paper.width; c.height = paper.height; }
    g.drawImage(paper, 0, 0);
    if (guide && P.guide > 0) { g.save(); g.globalAlpha = P.guide / 100; g.globalCompositeOperation = 'multiply'; drawFit(g, guide, 0, 0, c.width, c.height, 'contain'); g.restore(); }
    if (preview) preview(g);
  }
  function stroke(gg, a, b) {
    gg.save();
    gg.globalCompositeOperation = 'source-over';
    gg.strokeStyle = P.tool === 'eraser' ? '#ffffff' : P.color; gg.lineWidth = P.tool === 'eraser' ? P.size * 3 : P.size; gg.lineCap = 'round'; gg.lineJoin = 'round';
    gg.beginPath(); gg.moveTo(a.x, a.y); gg.lineTo(b.x + 0.01, b.y); gg.stroke();
    gg.restore();
  }
  const shape = (gg, a, b) => {
    gg.save(); gg.strokeStyle = P.color; gg.lineWidth = P.size; gg.lineCap = 'round';
    gg.beginPath();
    if (P.tool === 'line') { gg.moveTo(a.x, a.y); gg.lineTo(b.x, b.y); }
    else if (P.tool === 'rect') gg.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    else if (P.tool === 'ellipse') gg.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
    gg.stroke(); gg.restore();
  };
  let act = null;
  c.addEventListener('pointerdown', (e) => {
    const p = canvasPoint(c, e);
    c.setPointerCapture(e.pointerId);
    pushUndo();
    if (P.tool === 'fill') { floodFill(pg, p.x, p.y, P.color); draw(); updBtns(); return; }
    act = { a: p, last: p };
    if (P.tool === 'brush' || P.tool === 'eraser') stroke(pg, p, p);
    draw(); updBtns();
  });
  c.addEventListener('pointermove', (e) => {
    if (!act) return;
    const p = canvasPoint(c, e);
    if (P.tool === 'brush' || P.tool === 'eraser') { stroke(pg, act.last, p); act.last = p; draw(); }
    else draw((gg) => shape(gg, act.a, p));
  });
  c.addEventListener('pointerup', (e) => {
    if (!act) return;
    const p = canvasPoint(c, e);
    if (!['brush', 'eraser'].includes(P.tool)) shape(pg, act.a, p);
    act = null; draw();
  });
  window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); } });
  const doUndo = () => { if (!undo.length) return; redo.push(pg.getImageData(0, 0, paper.width, paper.height)); pg.putImageData(undo.pop(), 0, 0); draw(); updBtns(); };
  const doRedo = () => { if (!redo.length) return; undo.push(pg.getImageData(0, 0, paper.width, paper.height)); pg.putImageData(redo.pop(), 0, 0); draw(); updBtns(); };
  const undoBtn = button('', { icon: 'undo-2', cls: 'sm subtle icon', title: 'Urungkan (Ctrl+Z)', onClick: doUndo });
  const redoBtn = button('', { icon: 'redo-2', cls: 'sm subtle icon', title: 'Ulangi (Ctrl+Y)', onClick: doRedo });
  const updBtns = () => { undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length; };

  function setRatio(r) {
    pushUndo();
    const [W, H] = sizeFor(r, 1024);
    const old = canvas(paper.width, paper.height); old.getContext('2d').drawImage(paper, 0, 0);
    paper.width = W; paper.height = H;
    pg.fillStyle = '#fff'; pg.fillRect(0, 0, W, H);
    drawFit(pg, old, 0, 0, W, H, 'contain');
    undo.length = 0; P.ratio = r; P.$save(); draw(); updBtns();
  }
  async function loadSketch(p, asGuide) {
    const im = await io.image(p);
    if (asGuide) { guide = im.bmp; } else { pushUndo(); pg.fillStyle = '#fff'; pg.fillRect(0, 0, paper.width, paper.height); drawFit(pg, im.bmp, 0, 0, paper.width, paper.height, 'contain'); }
    draw(); updBtns(); build();
  }
  /** Rapikan garis: ambang + tebalkan sedikit (offline). */
  function cleanup() {
    pushUndo();
    const img = pg.getImageData(0, 0, paper.width, paper.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const sat = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
      if (sat < 40) { const v = l < 170 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
    }
    pg.putImageData(img, 0, 0); draw(); updBtns();
    toast('Garis sketsa dirapikan.', 'ok');
  }
  const styleOf = () => STYLES.find((s) => s[0] === P.style) || STYLES[0];
  async function aiRead() {
    const st = styleOf();
    const r = await ai(`Ini sketsa kasar buatan pengguna${P.subject ? ` (katanya: "${P.subject}")` : ''}. Pahami isi, komposisi, pose, dan tata letak objek. Tulis prompt BAHASA INGGRIS untuk generator gambar (Nano Banana) yang memakai sketsa terlampir sebagai referensi komposisi, lalu merendernya dengan gaya: ${st[2]}. Kepatuhan pada sketsa: ${P.strict}% (100 = ikuti garis persis, 0 = bebas berkreasi). Sebutkan subjek, material, warna, latar, pencahayaan, dan sudut kamera.\nFormat: {"subject":"(Bahasa Indonesia, singkat)","description":"(Bahasa Indonesia, 1 kalimat)","render_prompt":"..."}`, { json: true, image: dataUrlFor(paper, 768, 0.9) });
    if (!r.render_prompt) throw new Error('AI_BAD_JSON');
    P.prompt = String(r.render_prompt).slice(0, 4000);
    if (!P.subject && r.subject) P.subject = String(r.subject).slice(0, 120);
    P.$save(); build();
    toast(`AI membaca sketsa: ${String(r.description || r.subject || '').slice(0, 100)}`, 'ok');
  }
  const promptFinal = () => {
    const st = styleOf();
    const base = P.prompt.trim() || `${P.subject || 'the subject in the sketch'}, ${st[2]}`;
    const keep = P.strict >= 70 ? 'Strictly follow the composition, shapes and layout of the attached sketch.' : P.strict >= 35 ? 'Use the attached sketch as a loose composition guide.' : 'Use the attached sketch only as inspiration.';
    return `${keep} ${base}`;
  };
  async function sendStudio() {
    const file = await io.saveQuiet(`Sketsa ${stamp()}`, await toBlob(paper, 'png'), 'png');
    await call('lab:toStudio', { prompt: promptFinal(), images: [file], kind: 'image' });
    toast('Sketsa + prompt dipasang di Studio → tekan Generate dengan Nano Banana.', 'ok');
  }

  const toolChips = h('div.chips');
  function build() {
    toolChips.replaceChildren(...[['brush', 'Kuas', 'brush'], ['eraser', 'Penghapus', 'eraser'], ['line', 'Garis', 'minus'], ['rect', 'Kotak', 'square'], ['ellipse', 'Elips', 'circle'], ['fill', 'Ember', 'paint-bucket']]
      .map(([v, l, i]) => h('button.chip' + (P.tool === v ? '.on' : ''), { type: 'button', onclick: () => { P.tool = v; P.$save(); build(); } }, ic(i), l)));
    ctx.side.replaceChildren(
      section('Sketsa', 'pen-tool', toolChips,
        slider('Ukuran', { min: 1, max: 60, value: P.size }, (v) => { P.size = v; P.$save(); }),
        h('div.swatches', SWATCH.map((col) => h('button.sw', { type: 'button', title: col, style: { background: col, outline: P.color === col ? '2px solid var(--accent)' : 'none' }, onclick: () => { P.color = col; P.$save(); build(); } })), color('', P.color, (v) => { P.color = v; P.$save(); })),
        h('div.row', undoBtn, redoBtn, button('Bersihkan', { icon: 'trash-2', cls: 'sm subtle', onClick: () => { pushUndo(); pg.fillStyle = '#fff'; pg.fillRect(0, 0, paper.width, paper.height); draw(); updBtns(); } }), button('Rapikan garis', { icon: 'wand', cls: 'sm subtle', onClick: cleanup })),
        chipField('Kanvas', [['1:1', '1:1'], ['16:9', '16:9'], ['9:16', '9:16'], ['4:3', '4:3']], P.ratio, setRatio),
        h('div.row', button('Buka sketsa…', { icon: 'folder-open', cls: 'sm', onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await loadSketch(p, false); } }), button('Gambar jiplakan…', { icon: 'image', cls: 'sm', title: 'Gambar panduan transparan (tidak ikut dikirim)', onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await loadSketch(p, true); } })),
        guide ? slider('Jiplakan', { min: 0, max: 100, value: P.guide, fmt: (v) => v + '%' }, (v) => { P.guide = v; P.$save(); draw(); }) : null),
      section('Render', 'sparkles',
        textField('Ini gambar apa? (opsional)', P.subject, (v) => { P.subject = v; P.$save(); }, { max: 120, placeholder: 'mis. rumah kayu di tepi danau' }),
        h('div.field', h('span', 'Gaya render'), h('div.chips', STYLES.map(([v, l]) => h('button.chip' + (P.style === v ? '.on' : ''), { type: 'button', onclick: () => { P.style = v; P.$save(); build(); } }, l)))),
        slider('Ikuti sketsa', { min: 0, max: 100, value: P.strict, fmt: (v) => (v >= 70 ? 'ketat ' : v >= 35 ? 'sedang ' : 'bebas ') + v + '%' }, (v) => { P.strict = clamp(v, 0, 100); P.$save(); }),
        button('Baca sketsa & tulis prompt (AI)', { icon: 'wand-sparkles', cls: 'ai block', onClick: aiRead }),
        textField('Prompt render', P.prompt, (v) => { P.prompt = v; P.$save(); }, { rows: 6, max: 4000, placeholder: 'Ditulis AI, atau ketik sendiri (Inggris lebih akurat).' }),
        button('Render di Studio (Nano Banana)', { icon: 'send', cls: 'primary block', onClick: sendStudio }),
        h('div.faint.small', { text: 'Sketsa disimpan ke Unduhan → Alat lalu dipasang sebagai gambar referensi di Studio (jendela utama).' }))
    );
    updBtns();
  }
  ctx.stage.append(c);
  ctx.onDrop((s) => { if (s.images[0]) loadSketch(s.images[0], false); });
  ctx.bar.append(h('span.faint.small', { text: 'Ctrl+Z urungkan · Ctrl+Y ulangi' }), h('div.grow'), button('Simpan sketsa PNG', { icon: 'image-down', cls: 'sm', onClick: async () => io.save(`Sketsa ${stamp()}`, await toBlob(paper, 'png'), 'png') }), button('Render di Studio', { icon: 'send', cls: 'primary', onClick: sendStudio }));
  build(); draw();
}
