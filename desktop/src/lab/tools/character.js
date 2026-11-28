// Character X-ray — bedah karakter dari gambar (palet, garis/x-ray, siluet) + AI membuat lembar karakter,
// latar cerita, dan prompt konsisten (tanda tangan, turnaround, ekspresi) → Studio / Bulk; ekspor lembar PNG / TXT.
import {
  h, button, section, chipField, textField, toast, ai, io, persisted, call, canvas, toBlob, palette,
  dataUrlFor, drawFit, roundRect, wrapText, stamp, emptyStage, validHex, select
} from '../core.js';
import { removeBackground } from '../../renderer/imagetools.js';

const VIEWS = [['orig', 'Asli'], ['xray', 'X-ray'], ['edge', 'Garis'], ['sil', 'Siluet'], ['pal', 'Palet']];

/** Tampilan x-ray: tepi Sobel bercahaya di atas latar gelap kebiruan. */
export function xray(src, mode = 'xray') {
  const k = Math.min(1, 900 / Math.max(src.width, src.height));
  const W = Math.round(src.width * k), H = Math.round(src.height * k);
  const c = canvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, W, H);
  const im = g.getImageData(0, 0, W, H), d = im.data;
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  const out = g.createImageData(W, H), o = out.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const at = (dx, dy) => L[Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))];
    const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
    const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
    const e = Math.min(255, Math.hypot(gx, gy) * 0.9);
    if (mode === 'edge') { const v = 255 - e; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; }
    else { const inv = 255 - L[i]; o[i * 4] = e * 0.35 + inv * 0.05; o[i * 4 + 1] = e * 0.85 + inv * 0.18; o[i * 4 + 2] = Math.min(255, e + inv * 0.35 + 20); }
    o[i * 4 + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

export async function mount(ctx) {
  const S = persisted('character', { view: 'orig', sheet: null, idea: '', lang: 'Indonesia' });
  let img = null, path = null, pal = [], views = {};
  ctx.stage.classList.add('scroll');
  const body = h('div.sheet');

  async function load(p) {
    const im = await io.image(p);
    img = im.bmp; path = p; views = {};
    pal = palette(img, 6);
    S.view = 'orig'; S.$save();
    render(); build();
  }
  function viewCanvas(v) {
    if (views[v]) return views[v];
    if (v === 'xray' || v === 'edge') views[v] = xray(img, v);
    else if (v === 'sil') {
      const cut = removeBackground(img, { mode: 'auto', tolerance: 28, edgeOnly: true });
      const c = canvas(cut.width, cut.height), g = c.getContext('2d');
      g.fillStyle = '#f1f1f4'; g.fillRect(0, 0, c.width, c.height);
      const t = canvas(cut.width, cut.height), tg = t.getContext('2d'); tg.drawImage(cut, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#16161a'; tg.fillRect(0, 0, t.width, t.height);
      g.drawImage(t, 0, 0); views[v] = c;
    } else if (v === 'pal') {
      const c = canvas(900, 900 * img.height / img.width), g = c.getContext('2d');
      drawFit(g, img, 0, 0, c.width, c.height, 'cover');
      const sw = c.width / pal.length;
      pal.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * sw, c.height - 110, sw, 110); g.fillStyle = luminance(col) > 0.55 ? '#000' : '#fff'; g.font = '600 22px "Segoe UI", sans-serif'; g.fillText(col.toUpperCase(), i * sw + 12, c.height - 20); });
      views[v] = c;
    } else { const c = canvas(img.width, img.height); c.getContext('2d').drawImage(img, 0, 0); views[v] = c; }
    return views[v];
  }
  const luminance = (hx) => { const n = parseInt(hx.slice(1), 16); return ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114) / 255; };

  function render() {
    const sh = S.sheet;
    const vc = img ? viewCanvas(S.view) : null;
    if (vc) { vc.classList.add('view'); vc.style.maxHeight = '62vh'; vc.style.maxWidth = '100%'; vc.style.borderRadius = '10px'; }
    const kv = (k, v) => (v ? [h('b', { text: k }), h('span', { text: Array.isArray(v) ? v.join(', ') : String(v) })] : []);
    const promptBox = (label, text) => (text ? h('div.chat', h('div.row', h('b.small', { text: label }), h('span.grow'),
      button('Salin', { icon: 'clipboard-copy', cls: 'sm subtle', onClick: () => { navigator.clipboard.writeText(text).then(() => toast('Disalin.', 'ok'), () => toast('Gagal menyalin.', 'err')); } }),
      button('Ke Studio', { icon: 'send', cls: 'sm', onClick: () => toStudio(text) })), h('div.prompt-box', { text })) : null);
    body.replaceChildren(
      img ? h('div.row', h('div.tabs', VIEWS.map(([v, l]) => h('button.tab' + (S.view === v ? '.on' : ''), { type: 'button', onclick: () => { S.view = v; S.$save(); render(); } }, l)))) : null,
      vc ? h('div.row', vc) : null,
      img ? h('div.swatches', pal.map((col) => h('div.sw', { title: col, style: { background: col, width: '44px', height: '44px' } }))) : null,
      sh ? h('div.sec',
        h('h2', { text: sh.name || 'Karakter' }), sh.archetype ? h('div.tags', h('span.tag', { text: sh.archetype }), sh.age ? h('span.tag', { text: sh.age }) : null, ...(sh.personality || []).map((p) => h('span.tag', { text: p }))) : null,
        h('div.kv', ...kv('Wajah', sh.appearance && sh.appearance.face), ...kv('Rambut', sh.appearance && sh.appearance.hair), ...kv('Mata', sh.appearance && sh.appearance.eyes), ...kv('Tubuh', sh.appearance && sh.appearance.body),
          ...kv('Pakaian', sh.appearance && sh.appearance.outfit), ...kv('Aksesori', sh.appearance && sh.appearance.accessories), ...kv('Suara', sh.voice)),
        sh.backstory ? h('div', h('b.small', { text: 'Latar cerita' }), h('p', { text: sh.backstory })) : null,
        promptBox('Prompt tanda tangan (pakai di setiap adegan)', sh.signature_prompt),
        promptBox('Prompt turnaround (depan, samping, belakang)', sh.turnaround_prompt),
        (sh.expression_prompts || []).length ? h('div.chat', h('div.row', h('b.small', { text: `Ekspresi (${sh.expression_prompts.length})` }), h('span.grow'), button('Semua → Bulk', { icon: 'layers', cls: 'sm', onClick: () => toBulk(sh.expression_prompts) })),
          ...sh.expression_prompts.map((p) => h('div.prompt-box', { text: p }))) : null)
        : img ? h('div.note.ai', { text: 'Tekan "X-ray karakter (AI)" untuk membuat lembar karakter lengkap dari gambar ini.' }) : null
    );
    if (!img && !sh) ctx.stage.replaceChildren(emptyStage('user-round-search', 'Pilih gambar karakter', 'Foto/ilustrasi tokoh — atau kembangkan karakter dari deskripsi saja lewat AI di panel kiri.',
      button('Pilih gambar…', { icon: 'folder-open', cls: 'primary', onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await load(p); } })));
    else if (body.parentNode !== ctx.stage) ctx.stage.replaceChildren(body);
  }

  const FORMAT = `{"name":"","archetype":"","age":"","appearance":{"face":"","hair":"","eyes":"","body":"","outfit":"","accessories":""},"palette":["#hex"],"personality":["",""],"backstory":"(3-5 kalimat)","voice":"","signature_prompt":"(BAHASA INGGRIS, deskripsi visual lengkap & konsisten untuk dipakai ulang)","turnaround_prompt":"(BAHASA INGGRIS)","expression_prompts":["(BAHASA INGGRIS) 4-6 prompt ekspresi/pose berbeda dengan karakter yang sama"]}`;
  async function analyzeImage() {
    if (!img) { toast('Pilih gambar karakter dulu.', 'err'); return; }
    const r = await ai(`Kamu desainer karakter & penulis cerita. "X-ray" karakter pada gambar ini: bedah detail visualnya serinci mungkin (agar bisa digambar ulang konsisten), lalu kembangkan kepribadian dan latar ceritanya${S.idea ? ` dengan arahan: "${S.idea}"` : ''}. Bahasa: ${S.lang} (kecuali prompt). Palet warna terdeteksi: ${pal.join(', ')}.\nFormat: ${FORMAT}`, { json: true, image: dataUrlFor(img, 900, 0.88) });
    setSheet(r);
  }
  async function fromText() {
    if (!S.idea.trim()) { toast('Tulis deskripsi/ide karakter dulu.', 'err'); return; }
    const r = await ai(`Kamu desainer karakter & penulis cerita. Kembangkan karakter orisinal dari ide: "${S.idea}". Buat penampilan visual yang spesifik & konsisten, kepribadian, dan latar cerita. Bahasa: ${S.lang} (kecuali prompt).\nFormat: ${FORMAT}`, { json: true });
    setSheet(r);
  }
  function setSheet(r) {
    if (!r || typeof r !== 'object' || !(r.name || r.signature_prompt)) throw new Error('AI_BAD_JSON');
    const str = (v, n = 600) => String(v || '').slice(0, n);
    S.sheet = {
      name: str(r.name, 60), archetype: str(r.archetype, 60), age: str(r.age, 40), voice: str(r.voice, 200), backstory: str(r.backstory, 2000),
      appearance: Object.fromEntries(['face', 'hair', 'eyes', 'body', 'outfit', 'accessories'].map((k) => [k, str(r.appearance && r.appearance[k], 300)])),
      personality: (Array.isArray(r.personality) ? r.personality : []).slice(0, 8).map((x) => str(x, 40)),
      palette: (Array.isArray(r.palette) ? r.palette : []).filter(validHex).slice(0, 8),
      signature_prompt: str(r.signature_prompt, 2000), turnaround_prompt: str(r.turnaround_prompt, 2000),
      expression_prompts: (Array.isArray(r.expression_prompts) ? r.expression_prompts : []).slice(0, 8).map((x) => str(x, 1000))
    };
    if (!pal.length && S.sheet.palette.length) pal = S.sheet.palette;
    S.$save(); render(); build();
    toast(`Lembar karakter "${S.sheet.name || 'tanpa nama'}" siap.`, 'ok');
  }
  async function toStudio(prompt) {
    await call('lab:toStudio', { prompt, images: path ? [path] : [], kind: 'image' });
    toast('Prompt' + (path ? ' + gambar referensi' : '') + ' dipasang di Studio.', 'ok');
  }
  async function toBulk(prompts) { await call('lab:toBulk', { prompts, kind: 'image' }); toast(`${prompts.length} prompt dikirim ke Bulk.`, 'ok'); }

  function sheetText() {
    const s = S.sheet; if (!s) return '';
    const a = s.appearance || {};
    return [`${s.name} — ${s.archetype} (${s.age})`, '', 'PENAMPILAN', `Wajah: ${a.face}`, `Rambut: ${a.hair}`, `Mata: ${a.eyes}`, `Tubuh: ${a.body}`, `Pakaian: ${a.outfit}`, `Aksesori: ${a.accessories}`,
      '', `Kepribadian: ${(s.personality || []).join(', ')}`, `Suara: ${s.voice}`, '', 'LATAR CERITA', s.backstory, '', 'PROMPT TANDA TANGAN', s.signature_prompt, '', 'TURNAROUND', s.turnaround_prompt, '', 'EKSPRESI', ...(s.expression_prompts || []).map((p) => '- ' + p), '', `Palet: ${pal.join(' ')}`].join('\n') + '\n';
  }
  async function exportSheet() {
    const s = S.sheet;
    const W = 2400, H = 1500, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#0e1116'; g.fillRect(0, 0, W, H);
    if (img) {
      g.save(); roundRect(g, 60, 60, 900, 1180, 28); g.clip(); g.fillStyle = '#1b1f27'; g.fillRect(60, 60, 900, 1180); drawFit(g, img, 60, 60, 900, 1180, 'contain'); g.restore();
      const xr = viewCanvas('xray'); g.save(); roundRect(g, 1000, 60, 420, 560, 20); g.clip(); drawFit(g, xr, 1000, 60, 420, 560, 'cover'); g.restore();
      const sl = viewCanvas('sil'); g.save(); roundRect(g, 1000, 660, 420, 580, 20); g.clip(); drawFit(g, sl, 1000, 660, 420, 580, 'contain'); g.restore();
    }
    const sw = 900 / Math.max(1, pal.length);
    pal.forEach((col, i) => { g.fillStyle = col; g.fillRect(60 + i * sw, 1280, sw, 160); });
    let y = 120; const x = 1480, maxW = W - x - 60;
    g.fillStyle = '#ffffff'; g.font = '700 72px "Segoe UI Variable Display", "Segoe UI", sans-serif'; g.fillText(s ? s.name || 'Karakter' : 'Karakter', x, y);
    y += 56; g.fillStyle = '#7dd3fc'; g.font = '600 32px "Segoe UI", sans-serif'; g.fillText(s ? [s.archetype, s.age].filter(Boolean).join(' · ') : '', x, y);
    const para = (title, text) => {
      if (!text) return;
      y += 64; g.fillStyle = '#94a3b8'; g.font = '600 26px "Segoe UI", sans-serif'; g.fillText(title.toUpperCase(), x, y);
      g.fillStyle = '#e2e8f0'; g.font = '28px "Segoe UI", sans-serif';
      for (const ln of wrapText(g, text, maxW).slice(0, 7)) { y += 38; if (y > H - 60) return; g.fillText(ln, x, y); }
    };
    if (s) {
      const a = s.appearance || {};
      para('Penampilan', [a.face, a.hair, a.eyes, a.outfit, a.accessories].filter(Boolean).join(' · '));
      para('Kepribadian', (s.personality || []).join(', '));
      para('Latar cerita', s.backstory);
      para('Prompt', s.signature_prompt);
    }
    await io.save(`Karakter ${s && s.name ? s.name : stamp()}`, await toBlob(c, 'png'), 'png');
  }

  function build() {
    ctx.side.replaceChildren(
      section('Gambar karakter', 'image',
        button(img ? 'Ganti gambar…' : 'Pilih gambar…', { icon: 'folder-open', cls: 'sm' + (img ? '' : ' primary'), onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) await load(p); } }),
        img ? h('div.faint.small', { text: `${img.width}×${img.height} · palet ${pal.length} warna (offline)` }) : null),
      section('X-ray & pengembangan', 'scan-face',
        textField('Arahan cerita (opsional)', S.idea, (v) => { S.idea = v; S.$save(); }, { rows: 3, max: 800, placeholder: 'mis. pahlawan super dari Bandung, punya adik kembar, takut ketinggian' }),
        select('Bahasa', [['Indonesia', 'Indonesia'], ['English', 'English']], S.lang, (v) => { S.lang = v; S.$save(); }),
        button('X-ray karakter (AI)', { icon: 'scan-face', cls: 'ai block', disabled: !img, onClick: analyzeImage }),
        button('Kembangkan dari deskripsi (AI)', { icon: 'wand-sparkles', cls: 'sm block', onClick: fromText })),
      section('Simpan', 'download',
        h('div.row', button('Lembar PNG', { icon: 'image-down', cls: 'sm', disabled: !img && !S.sheet, onClick: exportSheet }), button('Profil TXT', { icon: 'file-text', cls: 'sm', disabled: !S.sheet, onClick: () => io.save(`Karakter ${S.sheet.name || stamp()}`, sheetText(), 'txt') })),
        S.sheet ? button('Hapus lembar', { icon: 'trash-2', cls: 'sm subtle danger', onClick: () => { S.sheet = null; S.$save(); render(); build(); } }) : null,
        img ? chipField('Tampilan', VIEWS, S.view, (v) => { S.view = v; S.$save(); render(); }) : null)
    );
  }
  ctx.onDrop((s) => { if (s.images[0]) load(s.images[0]); });
  ctx.bar.append(h('div.grow'), button('Ekspor lembar karakter', { icon: 'download', cls: 'primary', onClick: () => (img || S.sheet ? exportSheet() : toast('Pilih gambar dulu.', 'err')) }));
  render(); build();
}
