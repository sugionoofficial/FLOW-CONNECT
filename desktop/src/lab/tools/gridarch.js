// Grid Architect — 3 mode: Rancang (AI menulis satu prompt kisi N panel yang konsisten → Studio),
// Pecah (deteksi kisi otomatis pada gambar hasil, potong per panel, rapikan gutter → simpan / Studio / Bulk),
// Susun (gabungkan banyak gambar jadi kisi/contact sheet dengan jarak, sudut, label).
import {
  h, button, section, slider, chipField, check, color, textField, toast, ai, io, persisted, call, canvas, toBlob,
  drawFit, roundRect, stamp, emptyStage, clamp, tabs, sizeFor
} from '../core.js';

/** Profil gradien kolom/baris → deteksi jumlah kolom & baris (1–6). */
export function detectGrid(src) {
  const k = Math.min(1, 600 / Math.max(src.width, src.height));
  const W = Math.max(8, Math.round(src.width * k)), H = Math.max(8, Math.round(src.height * k));
  const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  const colP = new Float32Array(W), rowP = new Float32Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) colP[x] += Math.abs(L[y * W + x + 1] - L[y * W + x]) / H;
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) rowP[y] += Math.abs(L[(y + 1) * W + x] - L[y * W + x]) / W;
  return { cols: bestN(colP), rows: bestN(rowP) };
}
function bestN(p) {
  const n = p.length;
  const sorted = [...p].sort((a, b) => a - b);
  const med = sorted[Math.floor(n * 0.5)] + 1e-3, hi = sorted[Math.floor(n * 0.98)];
  let best = 1;
  for (let N = 2; N <= 6; N++) {
    let ok = true;
    for (let j = 1; j < N; j++) {
      const at = Math.round(j * n / N), win = Math.max(2, Math.round(n * 0.02));
      let m = 0;
      for (let x = Math.max(0, at - win); x <= Math.min(n - 1, at + win); x++) m = Math.max(m, p[x]);
      if (m < Math.max(med * 4, hi * 0.5)) { ok = false; break; }
    }
    if (ok) best = N; // kelipatan lebih besar hanya menang bila semua garisnya juga kuat
  }
  return best;
}
/** Potong gutter/bingkai polos (putih atau hitam) di tiap sisi panel — tiap sisi dinilai sendiri. */
export function trimUniform(c, tol = 18) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = c, d = g.getImageData(0, 0, W, H).data;
  const at = (x, y) => (y * W + x) * 4;
  const plain = (i) => { const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; return l > 232 || l < 22; };
  const line = (n, idx) => { const r = idx(0); if (!plain(r)) return false; for (let k = 2; k < n; k += 2) { const i = idx(k); if (Math.abs(d[i] - d[r]) + Math.abs(d[i + 1] - d[r + 1]) + Math.abs(d[i + 2] - d[r + 2]) > tol * 3) return false; } return true; };
  const rowPlain = (y) => line(W, (x) => at(x, y));
  const colPlain = (x) => line(H, (y) => at(x, y));
  let t = 0, b = H - 1, l = 0, r = W - 1;
  const lim = 0.12;
  while (t < H * lim && rowPlain(t)) t++;
  while (b > H * (1 - lim) && rowPlain(b)) b--;
  while (l < W * lim && colPlain(l)) l++;
  while (r > W * (1 - lim) && colPlain(r)) r--;
  if (!t && !l && b === H - 1 && r === W - 1) return c;
  const o = canvas(r - l + 1, b - t + 1); o.getContext('2d').drawImage(c, l, t, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
export function splitGrid(src, cols, rows, trim = true) {
  const out = [];
  const cw = src.width / cols, ch = src.height / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = Math.round(c * cw), y = Math.round(r * ch), w = Math.round((c + 1) * cw) - x, hh = Math.round((r + 1) * ch) - y;
    let cv = canvas(w, hh); cv.getContext('2d').drawImage(src, x, y, w, hh, 0, 0, w, hh);
    if (trim) cv = trimUniform(cv);
    out.push(cv);
  }
  return out;
}

export async function mount(ctx) {
  const S = persisted('gridarch', { mode: 'plan', idea: '', cols: 2, rows: 2, kind: 'story', ratio: '1:1', style: '', plan: null, trim: true, gap: 16, radius: 12, bg: '#ffffff', labels: false, ccols: 3, cratio: '1:1', cellRatio: 'auto' });
  let grid = null, gridName = 'grid', cells = [], picked = new Set();
  const comp = []; // {name, bmp}
  const head = h('div.row');
  const stageBox = h('div.sheet');
  ctx.stage.classList.add('scroll');
  ctx.stage.replaceChildren(stageBox);

  // ---------- Rancang ----------
  const KINDS = [['story', 'Alur cerita'], ['angles', 'Sudut kamera'], ['expr', 'Ekspresi'], ['product', 'Variasi produk'], ['outfit', 'Variasi gaya'], ['seasons', 'Waktu / musim']];
  async function aiPlan() {
    if (!S.idea.trim()) { toast('Tulis ide dulu.', 'err'); return; }
    const n = S.cols * S.rows;
    const kind = KINDS.find((k) => k[0] === S.kind)[1];
    const r = await ai(`Rancang SATU gambar berupa kisi ${S.cols} kolom × ${S.rows} baris (${n} panel) untuk generator gambar (Nano Banana). Ide: "${S.idea}". Jenis variasi antar-panel: ${kind}. ${S.style ? 'Gaya: ' + S.style + '.' : ''}
Subjek/karakter, gaya, palet, dan pencahayaan HARUS konsisten di semua panel; tiap panel berbeda sesuai jenis variasi. Panel dipisah garis putih tipis, tanpa teks.
Format: {"title":"(Bahasa Indonesia)","prompt":"(BAHASA INGGRIS, satu prompt lengkap yang menjelaskan kisi dan isi tiap panel berurutan kiri-ke-kanan, atas-ke-bawah)","cells":[{"label":"(Indonesia, singkat)","prompt":"(BAHASA INGGRIS, prompt mandiri untuk panel ini)"}]}`, { json: true });
    const cl = (Array.isArray(r.cells) ? r.cells : []).slice(0, n).map((c, i) => (typeof c === 'string' ? { label: c.slice(0, 60), prompt: c.slice(0, 1500) } : { label: String((c && c.label) || `Panel ${i + 1}`).slice(0, 60), prompt: String((c && c.prompt) || '').slice(0, 1500) }));
    if (!r.prompt) throw new Error('AI_BAD_JSON');
    S.plan = { title: String(r.title || S.idea).slice(0, 80), prompt: String(r.prompt).slice(0, 4000), cells: cl, cols: S.cols, rows: S.rows };
    S.$save(); render(); build();
  }
  function planOffline() {
    if (!S.idea.trim()) { toast('Tulis ide dulu.', 'err'); return; }
    const n = S.cols * S.rows;
    const vary = { story: (i) => `story beat ${i + 1} of ${n}`, angles: (i) => ['front view', 'three-quarter view', 'side profile', 'back view', 'low angle', 'high angle', 'close-up', 'wide shot', 'over the shoulder'][i % 9], expr: (i) => ['happy', 'sad', 'angry', 'surprised', 'thinking', 'laughing', 'scared', 'determined', 'sleepy'][i % 9], product: (i) => ['on white', 'lifestyle scene', 'close-up detail', 'in hand', 'flat lay', 'outdoor', 'night neon', 'pastel set', 'luxury marble'][i % 9], outfit: (i) => ['casual', 'formal', 'sporty', 'traditional', 'winter', 'summer', 'streetwear', 'vintage', 'futuristic'][i % 9], seasons: (i) => ['spring morning', 'summer noon', 'autumn afternoon', 'winter night', 'rainy evening', 'foggy dawn', 'golden hour', 'blue hour', 'stormy'][i % 9] }[S.kind];
    const cl = Array.from({ length: n }, (_, i) => ({ label: vary(i), prompt: `${S.idea}, ${vary(i)}${S.style ? ', ' + S.style : ''}` }));
    const prompt = `A single image arranged as a ${S.cols}x${S.rows} grid of ${n} panels separated by thin white borders, no text. Same subject, style, colors and lighting in every panel: ${S.idea}${S.style ? ', ' + S.style : ''}. Panels in order (left to right, top to bottom): ${cl.map((c, i) => `(${i + 1}) ${c.label}`).join(', ')}.`;
    S.plan = { title: S.idea.slice(0, 80), prompt, cells: cl, cols: S.cols, rows: S.rows }; S.$save(); render(); build();
  }

  // ---------- Pecah ----------
  async function loadGrid(p) {
    const im = await io.image(p);
    grid = im.bmp; gridName = im.name.replace(/\.[^.]+$/, '');
    const d = detectGrid(grid);
    S.cols = d.cols; S.rows = d.rows; S.$save();
    split();
    toast(`Kisi terdeteksi ${d.cols}×${d.rows}.`, 'ok');
  }
  function split() { if (!grid) return; cells = splitGrid(grid, S.cols, S.rows, S.trim); picked = new Set(cells.map((_, i) => i)); render(); build(); }
  async function saveCells(sel) {
    const files = [];
    for (const i of sel) files.push(await io.saveQuiet(`${gridName} panel ${i + 1}`, await toBlob(cells[i], 'png'), 'png'));
    return files;
  }

  // ---------- Susun ----------
  async function addComp(sel) { for (const p of sel.images) { try { const im = await io.image(p); comp.push({ name: im.name, bmp: im.bmp }); } catch (e) { toast(String(e.message), 'err'); } } render(); build(); }
  function composeCanvas() {
    const cols = clamp(S.ccols, 1, 8), rows = Math.ceil(comp.length / cols);
    const W = 2400, gap = S.gap * 2, pad = gap;
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
    const [rw, rh] = S.cratio === 'auto' ? [comp[0].bmp.width, comp[0].bmp.height] : sizeFor(S.cratio, 100);
    const ch = cw * rh / rw, lab = S.labels ? 56 : 0;
    const H = Math.round(pad * 2 + rows * (ch + lab) + (rows - 1) * gap);
    const c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = S.bg; g.fillRect(0, 0, W, H);
    comp.forEach((it, i) => {
      const x = pad + (i % cols) * (cw + gap), y = pad + Math.floor(i / cols) * (ch + lab + gap);
      g.save(); roundRect(g, x, y, cw, ch, S.radius * 2); g.clip(); drawFit(g, it.bmp, x, y, cw, ch, 'cover'); g.restore();
      if (S.labels) { const dark = parseInt(S.bg.slice(1), 16) < 0x808080; g.fillStyle = dark ? '#eee' : '#222'; g.font = '600 30px "Segoe UI", sans-serif'; g.textBaseline = 'middle'; g.fillText(`${i + 1}. ${it.name.replace(/\.[^.]+$/, '')}`.slice(0, 48), x + 4, y + ch + lab / 2); }
    });
    return c;
  }

  function render() {
    if (S.mode === 'plan') {
      const p = S.plan;
      stageBox.replaceChildren(p ? h('div.chat',
        h('h2', { text: p.title }),
        h('div.row', h('b.small', { text: `Prompt kisi ${p.cols}×${p.rows}` }), h('span.grow'),
          button('Salin', { icon: 'clipboard-copy', cls: 'sm subtle', onClick: () => navigator.clipboard.writeText(p.prompt).then(() => toast('Disalin.', 'ok')) }),
          button('Ke Studio', { icon: 'send', cls: 'sm primary', onClick: async () => { await call('lab:toStudio', { prompt: p.prompt, images: [], kind: 'image' }); toast('Prompt kisi dipasang di Studio. Setelah jadi, pecah di tab "Pecah".', 'ok'); } })),
        h('div.prompt-box', { text: p.prompt }),
        h('div.row', h('b.small', { text: `Panel (${p.cells.length})` }), h('span.grow'), p.cells.length ? button('Prompt panel → Bulk', { icon: 'layers', cls: 'sm', onClick: async () => { await call('lab:toBulk', { prompts: p.cells.map((c) => c.prompt).filter(Boolean), kind: 'image' }); toast(`${p.cells.length} prompt dikirim ke Bulk.`, 'ok'); } }) : null),
        h('div.board', p.cells.map((c, i) => h('div.scene', h('div.scene-img.r11', h('span.num', { text: String(i + 1) }), h('span.shot', { text: c.label })), h('div.scene-b', h('span.small', { text: c.prompt })))))
      ) : emptyStage('layout-grid', 'Rancang gambar kisi', 'Tulis ide di kiri, pilih jumlah kolom × baris, lalu biarkan AI menulis satu prompt kisi yang konsisten.'));
    } else if (S.mode === 'split') {
      if (!grid) { stageBox.replaceChildren(emptyStage('grid-2x2', 'Pecah gambar kisi', 'Pilih gambar kisi (mis. hasil Nano Banana 2×2). Jumlah kolom & baris dideteksi otomatis.', button('Pilih gambar kisi…', { icon: 'folder-open', cls: 'primary', onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await loadGrid(p); } }))); return; }
      stageBox.replaceChildren(h('div.board', cells.map((cv, i) => {
        const t = canvas(cv.width, cv.height); t.getContext('2d').drawImage(cv, 0, 0);
        const on = picked.has(i);
        return h('div.scene' + (on ? '.on' : ''), h('div.scene-img.r11', h('span.num', { text: String(i + 1) }), t),
          h('div.scene-f', check('Pilih', on, (v) => { if (v) picked.add(i); else picked.delete(i); build(); }), h('span.grow'), h('span.faint.small', { text: `${cv.width}×${cv.height}` }),
            button('', { icon: 'download', cls: 'sm subtle icon', title: 'Simpan panel ini', onClick: async () => io.save(`${gridName} panel ${i + 1}`, await toBlob(cv, 'png'), 'png') })));
      })));
      stageBox.querySelectorAll('.scene-img canvas').forEach((cv) => { cv.classList.add('fill'); });
    } else {
      stageBox.replaceChildren(comp.length ? (() => { const c = composeCanvas(); c.classList.add('view'); return h('div.row', c); })() : emptyStage('images', 'Susun gambar jadi kisi', 'Tambahkan beberapa gambar (seret ke sini juga bisa) untuk dijadikan kisi / contact sheet.', button('Tambah gambar…', { icon: 'folder-open', cls: 'primary', onClick: async () => addComp(await io.pick('image', true)) })));
    }
  }

  function build() {
    const n = picked.size;
    const sideKids = {
      plan: [
        section('Ide', 'lightbulb',
          textField('Ide gambar kisi', S.idea, (v) => { S.idea = v; S.$save(); }, { rows: 3, max: 600, placeholder: 'mis. kucing oranye astronot menjelajah bulan' }),
          chipField('Variasi antar panel', KINDS, S.kind, (v) => { S.kind = v; S.$save(); }),
          textField('Gaya (opsional)', S.style, (v) => { S.style = v; S.$save(); }, { max: 160, placeholder: 'mis. ilustrasi cat air, warna pastel' })),
        section('Kisi', 'grid-3x3',
          chipField('Kolom', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], S.cols, (v) => { S.cols = Number(v); S.$save(); }),
          chipField('Baris', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], S.rows, (v) => { S.rows = Number(v); S.$save(); }),
          button('Rancang dengan AI', { icon: 'wand-sparkles', cls: 'ai block', onClick: aiPlan }),
          button('Rancang cepat (offline)', { icon: 'zap', cls: 'sm block', onClick: planOffline }))
      ],
      split: [
        section('Gambar kisi', 'image', button(grid ? 'Ganti gambar…' : 'Pilih gambar kisi…', { icon: 'folder-open', cls: 'sm' + (grid ? '' : ' primary'), onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await loadGrid(p); } }),
          grid ? h('div.faint.small', { text: `${gridName} · ${grid.width}×${grid.height}` }) : null),
        grid ? section('Potongan', 'scissors',
          chipField('Kolom', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], S.cols, (v) => { S.cols = Number(v); S.$save(); split(); }),
          chipField('Baris', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], S.rows, (v) => { S.rows = Number(v); S.$save(); split(); }),
          button('Deteksi ulang', { icon: 'scan-line', cls: 'sm subtle', onClick: () => { const d = detectGrid(grid); S.cols = d.cols; S.rows = d.rows; S.$save(); split(); } }),
          check('Rapikan gutter / bingkai', S.trim, (v) => { S.trim = v; S.$save(); split(); })) : null,
        cells.length ? section(`Dipilih ${n} dari ${cells.length}`, 'check-check',
          h('div.row', button('Pilih semua', { cls: 'sm subtle', onClick: () => { picked = new Set(cells.map((_, i) => i)); render(); build(); } }), button('Kosongkan', { cls: 'sm subtle', onClick: () => { picked.clear(); render(); build(); } })),
          button(`Simpan ${n} panel`, { icon: 'download', cls: 'sm block', disabled: !n, onClick: async () => { const f = await saveCells([...picked].sort((a, b) => a - b)); toast(`${f.length} panel tersimpan (Unduhan → Alat).`, 'ok', { label: 'Tampilkan', run: () => call('lab:show', f[0]) }); } }),
          button('Panel → Studio (referensi)', { icon: 'send', cls: 'sm block', disabled: !n, onClick: async () => { const f = await saveCells([...picked].slice(0, 10)); await call('lab:toStudio', { images: f, prompt: '', kind: 'image' }); toast(`${f.length} panel dipasang sebagai referensi di Studio.`, 'ok'); } }),
          button('2 panel → Video Frame (awal & akhir)', { icon: 'clapperboard', cls: 'sm block', title: 'Pilih tepat 2 panel: ke-1 frame awal, ke-2 frame akhir', disabled: n !== 2, onClick: async () => {
            const sel = [...picked].sort((a, b) => a - b), f = await saveCells(sel);
            const pr = S.plan && S.plan.cells[sel[1]] ? `Smooth cinematic transition. ${S.plan.cells[sel[1]].prompt}` : 'Smooth cinematic transition between the two frames, consistent subject, gentle camera motion.';
            await call('lab:toStudio', { images: f, prompt: pr, kind: 'video' }); toast('Frame awal & akhir dipasang di Studio (Video → Frame).', 'ok');
          } })) : null
      ],
      compose: [
        section('Gambar', 'images', button('Tambah gambar…', { icon: 'folder-open', cls: 'sm' + (comp.length ? '' : ' primary'), onClick: async () => addComp(await io.pick('image', true)) }),
          comp.length ? h('div.files', comp.map((it, i) => h('div.file', h('span.kbd', { text: String(i + 1) }), h('span.ellipsis.small', { text: it.name }),
            button('', { icon: 'arrow-up', cls: 'sm subtle icon', title: 'Naikkan', disabled: !i, onClick: () => { [comp[i - 1], comp[i]] = [comp[i], comp[i - 1]]; render(); build(); } }),
            button('', { icon: 'x', cls: 'sm subtle icon', title: 'Hapus', onClick: () => { comp.splice(i, 1); render(); build(); } })))) : null),
        section('Tata letak', 'layout-grid',
          chipField('Kolom', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], S.ccols, (v) => { S.ccols = Number(v); S.$save(); render(); }),
          chipField('Rasio panel', [['auto', 'Ikut gambar 1'], ['1:1', '1:1'], ['16:9', '16:9'], ['9:16', '9:16'], ['4:5', '4:5']], S.cratio, (v) => { S.cratio = v; S.$save(); render(); }),
          slider('Jarak', { min: 0, max: 60, value: S.gap }, (v) => { S.gap = v; S.$save(); render(); }),
          slider('Sudut', { min: 0, max: 60, value: S.radius }, (v) => { S.radius = v; S.$save(); render(); }),
          h('div.row', color('Latar', S.bg, (v) => { S.bg = v; S.$save(); render(); }), check('Label', S.labels, (v) => { S.labels = v; S.$save(); render(); })),
          button('Ekspor kisi PNG', { icon: 'image-down', cls: 'primary block', disabled: !comp.length, onClick: async () => io.save(`Kisi ${comp.length} ${stamp()}`, await toBlob(composeCanvas(), 'png'), 'png') }))
      ]
    }[S.mode];
    ctx.side.replaceChildren(head, ...sideKids);
  }
  head.replaceChildren(tabs([['plan', 'Rancang', 'pencil-ruler'], ['split', 'Pecah', 'scissors'], ['compose', 'Susun', 'layout-grid']], S.mode, (v) => { S.mode = v; S.$save(); render(); build(); }));
  ctx.onDrop(async (s) => {
    if (!s.images.length) return;
    if (S.mode === 'compose') await addComp(s);
    else { S.mode = 'split'; S.$save(); head.firstChild.set('split'); await loadGrid(s.images[0]); }
  });
  ctx.bar.append(h('span.faint.small', { text: 'Rancang → render di Studio → Pecah panelnya → animasikan di Bulk' }), h('div.grow'));
  render(); build();
}
