// Studio Storyboard — ide → naskah, pemeran, dan adegan (AI), kartu adegan bisa diedit & diberi gambar;
// kirim prompt ke Studio / Bulk, ekspor lembar storyboard (PNG), naskah (TXT), proyek (JSON).
import {
  h, ic, button, section, select, chipField, textField, check, toast, ai, io, persisted, call, canvas, toBlob,
  wrapText, roundRect, drawFit, stamp, clamp
} from '../core.js';

const STYLES = [['sinematik', 'Sinematik'], ['iklan', 'Iklan produk'], ['dokumenter', 'Dokumenter'], ['animasi 3D', 'Animasi 3D'], ['anime', 'Anime'], ['vlog', 'Vlog / UGC'], ['horor', 'Horor'], ['musik video', 'Musik video']];
const STYLE_EN = { sinematik: 'cinematic, anamorphic lens, film grain', iklan: 'premium commercial look, clean lighting', dokumenter: 'documentary style, natural light, handheld', 'animasi 3D': '3D animated film style, soft global illumination', anime: 'anime style, cel shading', vlog: 'smartphone vlog style, natural, authentic', horor: 'horror film mood, low key lighting, fog', 'musik video': 'music video style, bold colors, dynamic' };
const BEATS = [['Pembuka', 'Establishing wide shot', 'drone slowly pushing in'], ['Perkenalan', 'Medium shot', 'slow dolly in'], ['Detail', 'Close-up', 'macro slider move'], ['Konflik', 'Over-the-shoulder', 'handheld follow'], ['Aksi', 'Tracking shot', 'fast tracking'], ['Puncak', 'Low angle hero shot', 'crane up'], ['Reaksi', 'Close-up', 'static, shallow depth of field'], ['Penutup', 'Wide shot', 'slow pull back']];

export const sceneBlank = (o = {}) => ({ title: 'Adegan', shot: 'Medium shot', camera: '', action: '', dialogue: '', sound: '', prompt: '', image: null, ...o });

/** Rakit adegan dari templat (tanpa AI). */
export function templateScenes(idea, n, style) {
  const s = STYLE_EN[style] || '';
  return Array.from({ length: n }, (_, i) => {
    const [title, shot, camera] = BEATS[Math.round(i * (BEATS.length - 1) / Math.max(1, n - 1))];
    return sceneBlank({ title, shot, camera, action: `${title}: ${idea}`, prompt: `${shot} of ${idea}, ${camera}${s ? ', ' + s : ''}` });
  });
}

export async function mount(ctx) {
  const S = persisted('storyboard', { idea: '', style: 'sinematik', count: 6, ratio: '16:9', dur: 8, lang: 'Indonesia', cast: [], title: '', logline: '', scenes: [], addStyle: true, kind: 'video' });
  if (!Array.isArray(S.scenes)) S.scenes = [];
  if (!Array.isArray(S.cast)) S.cast = [];
  const urls = new Map(); // path → blob URL pratinjau
  ctx.stage.classList.add('scroll');
  const board = h('div.board');
  const head = h('div.sheet');

  async function urlFor(p) {
    if (!p) return null;
    if (urls.has(p)) return urls.get(p);
    try { const b = await io.blob(p); const u = URL.createObjectURL(b.blob); urls.set(p, u); return u; } catch { return null; }
  }
  const styled = (sc) => (S.addStyle && STYLE_EN[S.style] && !sc.prompt.includes(STYLE_EN[S.style]) ? `${sc.prompt}, ${STYLE_EN[S.style]}` : sc.prompt).trim();
  const castText = () => S.cast.filter((c) => c.name).map((c) => `${c.name}: ${c.look}`).join('; ');

  async function aiCast() {
    if (!S.idea.trim()) { toast('Tulis ide cerita dulu.', 'err'); return; }
    const r = await ai(`Kamu casting director. Dari ide cerita berikut, buat 1–4 tokoh utama dengan deskripsi penampilan visual yang spesifik dan konsisten (umur, wajah, rambut, pakaian, warna khas) agar bisa dipakai ulang di prompt video AI.\nIde: "${S.idea}"\nGaya: ${S.style}. Bahasa deskripsi: ${S.lang}.\nFormat: {"cast":[{"name":"...","look":"..."}]}`, { json: true });
    const list = (r.cast || r || []).filter((c) => c && c.name).slice(0, 6).map((c) => ({ name: String(c.name).slice(0, 40), look: String(c.look || c.description || '').slice(0, 300) }));
    if (!list.length) throw new Error('AI_BAD_JSON');
    S.cast = list; S.$save(); buildSide();
    toast(`${list.length} pemeran dibuat AI.`, 'ok');
  }
  async function aiWrite() {
    if (!S.idea.trim()) { toast('Tulis ide cerita dulu.', 'err'); return; }
    const r = await ai(`Kamu penulis naskah & sutradara storyboard untuk video AI (Google Flow, tiap klip ${S.dur} detik, rasio ${S.ratio}).
Ide: "${S.idea}"
Gaya visual: ${S.style}. Jumlah adegan: ${S.count}. Bahasa naskah/dialog: ${S.lang}.
${castText() ? 'Pemeran (pakai deskripsi ini apa adanya di setiap prompt agar konsisten): ' + castText() : 'Buat pemeran bila perlu.'}
Untuk setiap adegan isi: title (judul singkat), shot (jenis bidikan), camera (gerak kamera), action (apa yang terjadi, ${S.lang}), dialogue (boleh kosong), sound (suara/musik), prompt (BAHASA INGGRIS, satu paragraf siap pakai untuk generator video: subjek + deskripsi pemeran lengkap, aksi, latar, cahaya, gerak kamera, gaya).
Format: {"title":"...","logline":"...","cast":[{"name":"...","look":"..."}],"scenes":[{"title":"","shot":"","camera":"","action":"","dialogue":"","sound":"","prompt":""}]}`, { json: true });
    const scenes = (r.scenes || []).filter((x) => x && (x.prompt || x.action)).slice(0, 24).map((x) => sceneBlank(Object.fromEntries(['title', 'shot', 'camera', 'action', 'dialogue', 'sound', 'prompt'].map((k) => [k, String(x[k] || '').slice(0, 1500)]))));
    if (!scenes.length) throw new Error('AI_BAD_JSON');
    S.title = String(r.title || S.title || '').slice(0, 120); S.logline = String(r.logline || '').slice(0, 400);
    if (Array.isArray(r.cast) && r.cast.length && !S.cast.length) S.cast = r.cast.filter((c) => c && c.name).slice(0, 6).map((c) => ({ name: String(c.name).slice(0, 40), look: String(c.look || '').slice(0, 300) }));
    S.scenes = scenes; S.$save(); buildSide(); renderBoard();
    toast(`Storyboard ${scenes.length} adegan siap.`, 'ok');
  }
  async function aiFix(sc) {
    const r = await ai(`Perbaiki prompt video berikut agar lebih sinematik, spesifik, dan konsisten dengan pemeran. Tetap BAHASA INGGRIS, satu paragraf.\nAdegan: ${sc.title} — ${sc.action}\nBidikan: ${sc.shot}, kamera: ${sc.camera}\n${castText() ? 'Pemeran: ' + castText() + '\n' : ''}Prompt lama: ${sc.prompt || '(kosong)'}\nFormat: {"prompt":"..."}`, { json: true });
    if (!r.prompt) throw new Error('AI_BAD_JSON');
    sc.prompt = String(r.prompt).slice(0, 1500); S.$save(); renderBoard();
  }

  function sceneCard(sc, i) {
    const up = () => S.$save();
    const img = h('div.scene-img' + (S.ratio === '9:16' ? '.r916' : S.ratio === '1:1' ? '.r11' : ''), h('span.num', { text: String(i + 1) }), h('span.shot', { text: sc.shot || 'Adegan' }));
    if (sc.image) urlFor(sc.image).then((u) => { if (u) img.append(h('img', { src: u, alt: '' })); });
    const field = (k, label, rows) => textField('', sc[k], (v) => { sc[k] = v; up(); }, { rows, placeholder: label, max: 1500 });
    return h('div.scene',
      img,
      h('div.scene-b',
        h('div.row', field('title', 'Judul adegan'), field('shot', 'Bidikan')),
        field('camera', 'Gerak kamera'),
        field('action', 'Aksi / apa yang terjadi', 2),
        field('dialogue', 'Dialog / narasi (opsional)', 1),
        h('div.faint.small', { text: 'Prompt untuk Flow (Inggris)' }),
        field('prompt', 'Prompt video…', 3)),
      h('div.scene-f',
        button('Ke Studio', { icon: 'send', cls: 'sm primary', title: 'Pasang prompt (+ gambar adegan) di Studio', onClick: () => toStudio(sc) }),
        button('', { icon: 'wand-sparkles', cls: 'sm ai icon', title: 'Perbaiki prompt dengan AI', onClick: () => aiFix(sc) }),
        button('', { icon: 'image-plus', cls: 'sm icon', title: 'Pasang gambar adegan (frame / referensi)', onClick: async () => { const p = (await io.pick('image')).images[0]; if (p) { sc.image = p; up(); renderBoard(); } } }),
        sc.image ? button('', { icon: 'x', cls: 'sm subtle icon', title: 'Lepas gambar', onClick: () => { sc.image = null; up(); renderBoard(); } }) : null,
        h('span.grow'),
        button('', { icon: 'arrow-up', cls: 'sm subtle icon', title: 'Geser ke kiri', disabled: i === 0, onClick: () => { S.scenes.splice(i - 1, 0, S.scenes.splice(i, 1)[0]); up(); renderBoard(); } }),
        button('', { icon: 'arrow-down', cls: 'sm subtle icon', title: 'Geser ke kanan', disabled: i === S.scenes.length - 1, onClick: () => { S.scenes.splice(i + 1, 0, S.scenes.splice(i, 1)[0]); up(); renderBoard(); } }),
        button('', { icon: 'trash-2', cls: 'sm subtle icon danger', title: 'Hapus adegan', onClick: () => { S.scenes.splice(i, 1); up(); renderBoard(); } })));
  }
  function renderBoard() {
    head.replaceChildren(
      textField('', S.title, (v) => { S.title = v; S.$save(); }, { placeholder: 'Judul proyek', max: 120 }),
      textField('', S.logline, (v) => { S.logline = v; S.$save(); }, { placeholder: 'Logline — ringkasan cerita satu kalimat', max: 400 }),
      S.scenes.length ? null : h('div.empty', ic('layout-panel-top', 'xl'), h('b', { text: 'Belum ada adegan' }), h('span.small', { text: 'Tulis ide di kiri lalu tekan "Tulis naskah & storyboard (AI)", atau "Templat cepat" untuk versi offline.' })),
      board);
    head.firstChild.el.classList.add('title-in');
    board.replaceChildren(...S.scenes.map(sceneCard), S.scenes.length ? h('button.scene', { type: 'button', onclick: () => { S.scenes.push(sceneBlank({ title: `Adegan ${S.scenes.length + 1}` })); S.$save(); renderBoard(); } }, h('div.empty', ic('plus', 'xl'), h('span', { text: 'Tambah adegan' }))) : null);
    sumLbl.textContent = S.scenes.length ? `${S.scenes.length} adegan · ±${S.scenes.length * S.dur} detik` : '';
  }

  async function toStudio(sc) {
    if (!sc.prompt.trim()) { toast('Prompt adegan masih kosong.', 'err'); return; }
    await call('lab:toStudio', { prompt: styled(sc), images: sc.image ? [sc.image] : [], kind: S.kind });
    toast('Prompt adegan dipasang di Studio (jendela utama).', 'ok');
  }
  async function toBulk() {
    const prompts = S.scenes.map(styled).filter(Boolean);
    if (!prompts.length) { toast('Belum ada prompt.', 'err'); return; }
    await call('lab:toBulk', { prompts, kind: S.kind });
    toast(`${prompts.length} prompt dikirim ke Bulk (jendela utama).`, 'ok');
  }
  function scriptText() {
    const lines = [`${S.title || 'Storyboard'}`, S.logline ? `\n${S.logline}` : '', `\nGaya: ${S.style} · Rasio ${S.ratio} · ${S.scenes.length} adegan × ${S.dur} detik`];
    if (S.cast.length) lines.push('\nPEMERAN', ...S.cast.map((c) => `- ${c.name}: ${c.look}`));
    S.scenes.forEach((sc, i) => {
      lines.push(`\n${String(i + 1).padStart(2, '0')}. ${(sc.title || 'Adegan').toUpperCase()} — ${sc.shot}${sc.camera ? ` (${sc.camera})` : ''}`);
      if (sc.action) lines.push(sc.action);
      if (sc.dialogue) lines.push(`    "${sc.dialogue}"`);
      if (sc.sound) lines.push(`    [Suara: ${sc.sound}]`);
      if (sc.prompt) lines.push(`    Prompt: ${styled(sc)}`);
    });
    return lines.filter((x) => x !== '').join('\n') + '\n';
  }
  async function exportSheet() {
    if (!S.scenes.length) return;
    const cols = S.ratio === '9:16' ? 4 : 3, W = 2400, pad = 48, gap = 32;
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
    const [rw, rh] = S.ratio === '9:16' ? [9, 16] : S.ratio === '1:1' ? [1, 1] : [16, 9];
    const ih = cw * rh / rw;
    const mg = canvas(10, 10).getContext('2d');
    mg.font = '26px "Segoe UI", sans-serif';
    const textH = (sc) => 44 + 34 * Math.min(4, wrapText(mg, sc.action || '', cw - 32).length) + (sc.dialogue ? 34 * Math.min(2, wrapText(mg, '“' + sc.dialogue + '”', cw - 32).length) : 0) + 24;
    const rows = Math.ceil(S.scenes.length / cols);
    const rowH = Array.from({ length: rows }, (_, r) => ih + Math.max(...S.scenes.slice(r * cols, r * cols + cols).map(textH)));
    const headH = 170;
    const H = headH + rowH.reduce((a, b) => a + b + gap, 0) + pad;
    const c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#f4f4f6'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111'; g.font = '600 56px "Segoe UI Variable Display", "Segoe UI", sans-serif'; g.fillText(S.title || 'Storyboard', pad, 92);
    g.fillStyle = '#555'; g.font = '28px "Segoe UI", sans-serif'; g.fillText((S.logline || '').slice(0, 150), pad, 138);
    let y = headH;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const i = r * cols + k, sc = S.scenes[i]; if (!sc) break;
        const x = pad + k * (cw + gap);
        g.save(); g.shadowColor = 'rgba(0,0,0,0.12)'; g.shadowBlur = 24; g.fillStyle = '#fff'; roundRect(g, x, y, cw, rowH[r], 18); g.fill(); g.restore();
        g.save(); roundRect(g, x, y, cw, ih, 18); g.clip();
        const gr = g.createLinearGradient(x, y, x + cw, y + ih); gr.addColorStop(0, '#334155'); gr.addColorStop(1, '#6d28d9'); g.fillStyle = gr; g.fillRect(x, y, cw, ih);
        if (sc.image) { try { const im = await io.image(sc.image); drawFit(g, im.bmp, x, y, cw, ih, 'cover'); } catch { /* gambar hilang */ } }
        else { g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '600 30px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.fillText(sc.shot || '', x + cw / 2, y + ih / 2); g.textAlign = 'left'; }
        g.restore();
        g.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(g, x + 14, y + 14, 64, 40, 20); g.fill();
        g.fillStyle = '#fff'; g.font = '600 24px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), x + 46, y + 42); g.textAlign = 'left';
        let ty = y + ih + 44;
        g.fillStyle = '#111'; g.font = '600 28px "Segoe UI", sans-serif'; g.fillText(`${sc.title}${sc.shot ? ' · ' + sc.shot : ''}`.slice(0, 60), x + 16, ty);
        g.fillStyle = '#444'; g.font = '26px "Segoe UI", sans-serif';
        for (const ln of wrapText(g, sc.action || '', cw - 32).slice(0, 4)) { ty += 34; g.fillText(ln, x + 16, ty); }
        if (sc.dialogue) { g.fillStyle = '#6d28d9'; g.font = 'italic 26px "Segoe UI", sans-serif'; for (const ln of wrapText(g, '“' + sc.dialogue + '”', cw - 32).slice(0, 2)) { ty += 34; g.fillText(ln, x + 16, ty); } }
      }
      y += rowH[r] + gap;
    }
    await io.save(`Storyboard ${S.title || stamp()}`, await toBlob(c, 'png'), 'png');
  }

  const sumLbl = h('span.faint.small');
  function buildSide() {
    ctx.side.replaceChildren(
      section('Ide cerita', 'lightbulb',
        textField('', S.idea, (v) => { S.idea = v; S.$save(); }, { rows: 4, max: 2000, placeholder: 'mis. Iklan 45 detik kopi susu gula aren: barista muda di Jogja membuat kopi pertama pagi hari untuk ibunya.' }),
        select('Gaya visual', STYLES, S.style, (v) => { S.style = v; S.$save(); }),
        h('div.row', select('Jumlah adegan', [3, 4, 5, 6, 8, 10, 12].map((n) => [n, String(n)]), S.count, (v) => { S.count = Number(v); S.$save(); }), select('Detik / klip', [[8, '8 (Veo)'], [10, '10 (Omni)'], [6, '6'], [4, '4']], S.dur, (v) => { S.dur = Number(v); S.$save(); renderBoard(); })),
        h('div.row', select('Rasio', [['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1']], S.ratio, (v) => { S.ratio = v; S.$save(); renderBoard(); }), select('Bahasa naskah', [['Indonesia', 'Indonesia'], ['English', 'English'], ['Jawa', 'Jawa'], ['Sunda', 'Sunda']], S.lang, (v) => { S.lang = v; S.$save(); })),
        button('Tulis naskah & storyboard (AI)', { icon: 'wand-sparkles', cls: 'ai block', onClick: aiWrite }),
        button('Templat cepat (offline)', { icon: 'layout-panel-top', cls: 'sm block', onClick: () => { if (!S.idea.trim()) { toast('Tulis ide cerita dulu.', 'err'); return; } S.scenes = templateScenes(S.idea.trim(), S.count, S.style); S.$save(); renderBoard(); } })),
      section('Pemeran', 'users',
        h('div.chat', S.cast.map((c, i) => h('div.sec',
          h('div.row', textField('', c.name, (v) => { c.name = v; S.$save(); }, { placeholder: 'Nama', max: 40 }), button('', { icon: 'trash-2', cls: 'sm subtle icon danger', title: 'Hapus pemeran', onClick: () => { S.cast.splice(i, 1); S.$save(); buildSide(); } })),
          textField('', c.look, (v) => { c.look = v; S.$save(); }, { rows: 2, placeholder: 'Penampilan: umur, rambut, pakaian, warna khas…', max: 300 })))),
        h('div.row', button('Tambah', { icon: 'plus', cls: 'sm', onClick: () => { S.cast.push({ name: '', look: '' }); S.$save(); buildSide(); } }), button('Buat pemeran (AI)', { icon: 'wand-sparkles', cls: 'sm ai', onClick: aiCast }))),
      section('Kirim & ekspor', 'send',
        chipField('Jenis di Studio', [['video', 'Video'], ['image', 'Gambar (frame)']], S.kind, (v) => { S.kind = v; S.$save(); }),
        check('Tambahkan gaya visual ke tiap prompt', S.addStyle, (v) => { S.addStyle = v; S.$save(); }),
        button('Semua prompt → Bulk', { icon: 'layers', cls: 'sm block', onClick: toBulk }),
        h('div.row', button('Lembar PNG', { icon: 'image-down', cls: 'sm', onClick: exportSheet }), button('Naskah TXT', { icon: 'file-text', cls: 'sm', onClick: () => io.save(`Naskah ${S.title || stamp()}`, scriptText(), 'txt') }),
          button('Proyek JSON', { icon: 'file-json', cls: 'sm', onClick: () => io.save(`Storyboard ${S.title || stamp()}`, JSON.stringify({ app: 'FLOW CONNECT Storyboard', ...Object.fromEntries(Object.entries(S).filter(([k]) => k !== '$save')) }, null, 2), 'json') })),
        button('Kosongkan storyboard', { icon: 'trash-2', cls: 'sm subtle danger', onClick: () => { S.scenes = []; S.title = ''; S.logline = ''; S.$save(); renderBoard(); } }))
    );
  }
  ctx.stage.append(head);
  ctx.bar.append(sumLbl, h('div.grow'), button('Lembar PNG', { icon: 'image-down', cls: 'sm', onClick: exportSheet }), button('Semua prompt → Bulk', { icon: 'layers', cls: 'primary', onClick: toBulk }));
  ctx.onDrop((s) => { const free = S.scenes.find((x) => !x.image); if (free && s.images[0]) { free.image = s.images[0]; S.$save(); renderBoard(); } });
  buildSide(); renderBoard();
  void clamp;
}
