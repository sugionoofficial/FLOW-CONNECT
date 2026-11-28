// Ubah Ukuran Video — rasio baru dengan potong pintar (titik fokus), latar blur, latar warna, atau regang. Banyak video sekaligus.
import {
  h, ic, button, section, slider, chipField, color, check, progress, toast, errText, ai, io, record, audioGraph,
  videoFormatChips, preferredVideoFormat, persisted, sizeFor, drawFit, clamp, seek, fmtTime, canvas, dataUrlFor,
  emptyStage, canvasPoint, stamp
} from '../core.js';

/** Titik fokus lokal: pusat massa energi tepi + saturasi (subjek biasanya paling "ramai" & berwarna). */
export function saliencyCenter(src) {
  const c = canvas(96, 96 * (src.videoHeight || src.height) / (src.videoWidth || src.width));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, c.width, c.height);
  const { data, width: W, height: H } = g.getImageData(0, 0, c.width, c.height);
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  let sx = 0, sy = 0, sw = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const gx = L[i + 1] - L[i - 1], gy = L[i + W] - L[i - W];
    const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
    const sat = (Math.max(r, gg, b) - Math.min(r, gg, b)) / 255;
    // pusat sedikit diutamakan (komposisi)
    const cw = 1 - 0.5 * Math.hypot(x / W - 0.5, y / H - 0.5);
    const w = (Math.hypot(gx, gy) * (0.6 + sat)) ** 1.5 * cw;
    sx += x * w; sy += y * w; sw += w;
  }
  return sw ? { x: clamp(sx / sw / W, 0, 1), y: clamp(sy / sw / H, 0, 1) } : { x: 0.5, y: 0.5 };
}

export async function mount(ctx) {
  const S = persisted('resize', { ratio: '9:16', short: 1080, mode: 'crop', fx: 0.5, fy: 0.5, zoom: 1, pad: '#000000', blur: 40, format: preferredVideoFormat(), audio: true });
  const queue = []; // {path, name, video, start, end}
  let cur = null, recording = false;
  const c = h('canvas.grab');
  const g = c.getContext('2d');
  const tmp = canvas(2, 2), tg = tmp.getContext('2d');
  const info = h('span.faint.small.mono', { text: '' });
  const prog = progress(); prog.classList.add('hidden');

  function render(v) {
    const [W, H] = sizeFor(S.ratio, S.short);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    g.fillStyle = S.pad; g.fillRect(0, 0, W, H);
    if (!v || !v.videoWidth) return;
    if (S.mode === 'crop') drawFit(g, v, 0, 0, W, H, 'cover', S.fx, S.fy, S.zoom);
    else if (S.mode === 'stretch') g.drawImage(v, 0, 0, W, H);
    else {
      if (S.mode === 'blur') {
        // latar: versi kecil diperbesar + blur (cepat), digelapkan sedikit
        const k = 0.12;
        if (tmp.width !== Math.round(W * k)) { tmp.width = Math.round(W * k); tmp.height = Math.round(H * k); }
        tg.filter = `blur(${Math.max(1, S.blur * k * 0.6)}px) saturate(1.2)`;
        drawFit(tg, v, -4, -4, tmp.width + 8, tmp.height + 8, 'cover');
        tg.filter = 'none';
        g.drawImage(tmp, 0, 0, W, H);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, W, H);
      }
      drawFit(g, v, 0, 0, W, H, 'contain', 0.5, 0.5, S.zoom);
    }
  }
  const loop = () => {
    if (cur && !recording) {
      const v = cur.video;
      if (v.currentTime < cur.start - 0.05 || v.currentTime > cur.end) v.currentTime = cur.start;
      render(v);
      info.textContent = `${fmtTime(v.currentTime)} · ${c.width}×${c.height}`;
    }
    requestAnimationFrame(loop);
  };

  // seret di panggung (mode potong) → geser titik fokus
  let drag = null;
  c.addEventListener('pointerdown', (e) => { if (S.mode !== 'crop') return; drag = { p: canvasPoint(c, e), fx: S.fx, fy: S.fy }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => {
    if (!drag || !cur) return;
    const p = canvasPoint(c, e), v = cur.video;
    const k = Math.max(c.width / v.videoWidth, c.height / v.videoHeight) * S.zoom;
    const ex = v.videoWidth * k - c.width, ey = v.videoHeight * k - c.height;
    S.fx = ex > 1 ? clamp(drag.fx - (p.x - drag.p.x) / ex, 0, 1) : 0.5;
    S.fy = ey > 1 ? clamp(drag.fy - (p.y - drag.p.y) / ey, 0, 1) : 0.5;
    fxS.set(Math.round(S.fx * 100)); fyS.set(Math.round(S.fy * 100)); S.$save();
  });
  c.addEventListener('pointerup', () => { drag = null; });
  c.addEventListener('wheel', (e) => { e.preventDefault(); S.zoom = clamp(S.zoom * (e.deltaY < 0 ? 1.05 : 0.95), 1, 3); zoomS.set(S.zoom); S.$save(); }, { passive: false });

  async function addVideos(paths) {
    for (const p of paths) {
      if (queue.some((q) => q.path === p)) continue;
      try {
        const v = await io.video(p);
        v.video.muted = true; v.video.loop = false;
        queue.push({ path: p, name: v.name, video: v.video, start: 0, end: v.video.duration || 0 });
      } catch (e) { toast(`${p.split(/[\\/]/).pop()}: ${errText(e)}`, 'err'); }
    }
    if (!cur && queue.length) select(queue[0]);
    build();
  }
  function select(q) {
    if (cur && cur !== q) cur.video.pause();
    cur = q;
    ctx.stage.replaceChildren(c);
    q.video.currentTime = q.start;
    q.video.play().catch(() => {});
    build();
  }
  ctx.onDrop((sel) => addVideos(sel.videos));

  async function autoFocus(useAi) {
    if (!cur) return;
    const v = cur.video;
    v.pause();
    if (useAi) {
      const r = await ai('Ini satu frame dari video. Tentukan pusat subjek utama (orang/objek terpenting) sebagai koordinat relatif 0..1 dari kiri-atas. Format: {"x":0.5,"y":0.5,"subject":"deskripsi singkat"}', { json: true, image: dataUrlFor(v, 768) });
      const x = Number(r.x), y = Number(r.y);
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new Error('AI_BAD_JSON');
      setFocusPoint(x, y);
      toast(`Fokus AI: ${String(r.subject || 'subjek').slice(0, 80)}`, 'ok');
    } else {
      const pts = [];
      const dur = cur.end - cur.start;
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) { await seek(v, cur.start + dur * f); pts.push(saliencyCenter(v)); }
      setFocusPoint(pts.reduce((a, p) => a + p.x, 0) / pts.length, pts.reduce((a, p) => a + p.y, 0) / pts.length);
      toast('Titik fokus diatur dari isi video.', 'ok');
    }
    v.play().catch(() => {});
  }
  /** Ubah titik subjek (0..1 di video) → fx/fy agar subjek di tengah bingkai. */
  function setFocusPoint(x, y) {
    const v = cur.video;
    const [W, H] = sizeFor(S.ratio, S.short);
    const k = Math.max(W / v.videoWidth, H / v.videoHeight) * S.zoom;
    const dw = v.videoWidth * k, dh = v.videoHeight * k;
    const ex = dw - W, ey = dh - H;
    S.fx = ex > 1 ? clamp((x * dw - W / 2) / ex, 0, 1) : 0.5;
    S.fy = ey > 1 ? clamp((y * dh - H / 2) / ey, 0, 1) : 0.5;
    S.mode = 'crop'; S.$save(); build();
  }

  async function exportAll(only) {
    if (recording || !queue.length) return;
    recording = true;
    prog.classList.remove('hidden');
    const list = only ? [only] : queue.slice();
    let done = 0;
    const ag = ctx._ag || (ctx._ag = audioGraph());
    await ag.ac.resume();
    try {
      for (const q of list) {
        const v = q.video;
        v.pause(); v.loop = false; v.muted = !S.audio;
        await seek(v, q.start);
        const audio = [];
        if (S.audio) { ag.fromElement(v, false); audio.push(ag.track()); }
        const D = Math.max(0.2, q.end - q.start);
        render(v);
        const r = await record(c, {
          duration: D, fps: 30, format: S.format, audio,
          start: () => v.play(),
          draw: () => { render(v); return !v.ended && v.currentTime < q.end; },
          onProgress: (f) => prog.set((done + f) / list.length)
        });
        v.pause(); v.muted = true;
        done++;
        await io.save(`${q.name.replace(/\.[^.]+$/, '')} ${S.ratio.replace(':', 'x')}`, r.blob, r.format);
      }
      if (list.length > 1) toast(`${list.length} video selesai diubah ukurannya.`, 'ok');
    } catch (e) { toast(errText(e), 'err'); } finally {
      recording = false; prog.classList.add('hidden');
      if (cur) cur.video.play().catch(() => {});
    }
  }

  let fxS, fyS, zoomS;
  function build() {
    fxS = slider('Geser horizontal', { min: 0, max: 100, value: Math.round(S.fx * 100), fmt: (v) => v + '%' }, (v) => { S.fx = v / 100; S.$save(); });
    fyS = slider('Geser vertikal', { min: 0, max: 100, value: Math.round(S.fy * 100), fmt: (v) => v + '%' }, (v) => { S.fy = v / 100; S.$save(); });
    zoomS = slider('Zoom', { min: 1, max: 3, step: 0.01, value: S.zoom, fmt: (v) => v.toFixed(2) + '×' }, (v) => { S.zoom = v; S.$save(); });
    const trim = cur ? h('div.row',
      slider('Mulai', { min: 0, max: cur.video.duration, step: 0.1, value: cur.start, fmt: (v) => v.toFixed(1) + ' s' }, (v) => { cur.start = Math.min(v, cur.end - 0.2); cur.video.currentTime = cur.start; }),
      slider('Selesai', { min: 0, max: cur.video.duration, step: 0.1, value: cur.end, fmt: (v) => v.toFixed(1) + ' s' }, (v) => { cur.end = Math.max(v, cur.start + 0.2); })) : null;
    ctx.side.replaceChildren(
      section('Video', 'video',
        h('div.files', queue.map((q) => h('div.file' + (q === cur ? '.on' : ''), { onclick: () => select(q) }, ic('film'), h('span.ellipsis.small', { text: q.name, title: q.path }), h('span.faint.small', { text: (q.end - q.start).toFixed(1) + 's' }),
          button('', { icon: 'x', cls: 'sm subtle icon', title: 'Hapus dari daftar', onClick: (e) => { e.stopPropagation(); q.video.pause(); queue.splice(queue.indexOf(q), 1); if (cur === q) { cur = null; if (queue[0]) select(queue[0]); else showEmpty(); } build(); } })))),
        button(queue.length ? 'Tambah video…' : 'Pilih video…', { icon: 'folder-open', cls: 'sm' + (queue.length ? '' : ' primary'), onClick: async () => addVideos((await io.pick('video', true)).videos) })),
      section('Ukuran tujuan', 'ratio',
        chipField('Rasio', [['9:16', '9:16 Reels/TikTok'], ['16:9', '16:9 YouTube'], ['1:1', '1:1'], ['4:5', '4:5 Feed'], ['4:3', '4:3'], ['3:4', '3:4'], ['21:9', '21:9 Sinema']], S.ratio, (v) => { S.ratio = v; S.$save(); }),
        chipField('Resolusi', [[720, '720p'], [1080, '1080p'], [1440, '1440p']], S.short, (v) => { S.short = Number(v); S.$save(); })),
      section('Cara mengisi', 'scaling',
        chipField('Mode', [['crop', 'Potong pintar'], ['blur', 'Utuh + latar blur'], ['color', 'Utuh + warna'], ['stretch', 'Regang']], S.mode, (v) => { S.mode = v; S.$save(); build(); }),
        S.mode === 'crop' ? h('div', fxS, fyS) : null,
        S.mode === 'crop' ? h('div.row', button('Fokus otomatis', { icon: 'focus', cls: 'sm', disabled: !cur, onClick: () => autoFocus(false) }), button('Fokus AI', { icon: 'wand-sparkles', cls: 'sm ai', disabled: !cur, onClick: () => autoFocus(true) })) : null,
        S.mode === 'crop' ? h('div.faint.small', { text: 'Seret pratinjau untuk menggeser · roda mouse untuk zoom.' }) : null,
        S.mode === 'blur' ? slider('Kekuatan blur', { min: 10, max: 120, value: S.blur }, (v) => { S.blur = v; S.$save(); }) : null,
        S.mode === 'color' || S.mode === 'blur' ? color('Warna latar', S.pad, (v) => { S.pad = v; S.$save(); }) : null,
        zoomS),
      cur ? section('Potong durasi', 'scissors', trim) : null,
      section('Ekspor', 'download', videoFormatChips(S.format, (v) => { S.format = v; S.$save(); }), check('Sertakan audio', S.audio, (v) => { S.audio = v; S.$save(); }),
        h('div.faint.small', { text: 'Direkam waktu-nyata: lama ekspor ≈ durasi video. Jangan tutup jendela saat ekspor.' }))
    );
    exportBtn.disabled = !queue.length;
    exportOne.disabled = !cur;
    exportBtn.setText(queue.length > 1 ? `Ekspor ${queue.length} video` : 'Ekspor video');
  }
  function showEmpty() {
    ctx.stage.replaceChildren(emptyStage('scaling', 'Pilih video', 'Seret satu atau beberapa video (MP4/WebM/MOV) ke sini, atau gunakan tombol di kiri.',
      button('Pilih video…', { icon: 'folder-open', cls: 'primary', onClick: async () => addVideos((await io.pick('video', true)).videos) })));
  }
  const exportOne = button('Ekspor yang dipilih', { icon: 'download', cls: 'sm', onClick: () => exportAll(cur) });
  const exportBtn = button('Ekspor video', { icon: 'download', cls: 'primary', onClick: () => exportAll(null) });
  ctx.bar.append(info, h('div.grow', prog), exportOne, exportBtn);
  showEmpty();
  build();
  void stamp;
  requestAnimationFrame(loop);
}
