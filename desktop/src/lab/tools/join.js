// Gabung Video — sambungkan beberapa klip menjadi satu video: urutkan, potong per klip,
// samakan resolusi, fade antar klip, sertakan audio. Direkam waktu-nyata via canvas
// (seperti Ubah Ukuran Video), offline di PC ini.
import {
  h, ic, button, section, slider, chipField, check, progress, toast, errText, io, record, audioGraph,
  videoFormatChips, preferredVideoFormat, persisted, drawFit, clamp, fmtTime, canvas, emptyStage, stamp
} from '../core.js';

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export async function mount(ctx) {
  const S = persisted('join', { res: 'first', fit: 'contain', audio: true, fade: true, format: preferredVideoFormat(), pad: '#000000' });
  const queue = []; // {path, name, video, start, end}
  let cur = null, recording = false;
  let previewT = 0, lastTs = 0, previewClip = -1;
  const c = h('canvas.grab');
  const g = c.getContext('2d');
  const info = h('span.faint.small.mono', { text: '' });
  const prog = progress(); prog.classList.add('hidden');

  const totalDur = () => queue.reduce((a, q) => a + Math.max(0, q.end - q.start), 0);
  function targetSize() {
    const first = queue[0];
    if (!first) return [1280, 720];
    const vw = first.video.videoWidth || 1280, vh = first.video.videoHeight || 720;
    if (S.res === 'first') return [even(vw), even(vh)];
    const k = Number(S.res) / Math.min(vw, vh);
    return [even(vw * k), even(vh * k)];
  }
  function render(v, local = 0, dur = 0) {
    const [W, H] = targetSize();
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    g.fillStyle = S.pad; g.fillRect(0, 0, W, H);
    if (!v || !v.videoWidth) return;
    if (S.fit === 'cover') drawFit(g, v, 0, 0, W, H, 'cover');
    else drawFit(g, v, 0, 0, W, H, 'contain');
    if (S.fade && dur > 0.8) {
      const f = 0.4, a = Math.min(1, Math.min(local, dur - local) / f);
      if (a < 1) { g.fillStyle = `rgba(0,0,0,${(1 - a).toFixed(3)})`; g.fillRect(0, 0, W, H); }
    }
  }
  /** Klip & waktu lokal untuk waktu global t. */
  function locate(t) {
    let acc = 0;
    for (let i = 0; i < queue.length; i++) {
      const d = Math.max(0, queue[i].end - queue[i].start);
      if (t < acc + d || i === queue.length - 1) return { i, local: Math.max(0, t - acc), dur: d };
      acc += d;
    }
    return { i: 0, local: 0, dur: 0 };
  }

  const loop = (ts) => {
    if (!recording && queue.length) {
      if (lastTs) previewT += (ts - lastTs) / 1000;
      lastTs = ts;
      const total = totalDur();
      if (previewT >= total) previewT = 0;
      const { i, local, dur } = locate(previewT);
      const q = queue[i];
      if (i !== previewClip) {
        if (previewClip >= 0 && queue[previewClip]) queue[previewClip].video.pause();
        previewClip = i;
        q.video.pause(); q.video.muted = true;
        q.video.currentTime = q.start + local;
        q.video.play().catch(() => {});
      } else if (Math.abs(q.video.currentTime - (q.start + local)) > 0.2) {
        q.video.currentTime = q.start + local;
      }
      render(q.video, local, dur);
      info.textContent = `Klip ${i + 1}/${queue.length} · ${fmtTime(previewT)} / ${fmtTime(total)} · ${c.width}×${c.height}`;
    }
    requestAnimationFrame(loop);
  };

  async function addVideos(paths) {
    for (const p of paths) {
      if (queue.some((q) => q.path === p)) continue;
      try {
        const v = await io.video(p);
        v.video.muted = true; v.video.loop = false;
        queue.push({ path: p, name: v.name, video: v.video, start: 0, end: v.video.duration || 0 });
      } catch (e) { toast(`${p.split(/[\\/]/).pop()}: ${errText(e)}`, 'err'); }
    }
    if (!cur && queue.length) cur = queue[0];
    build();
  }
  function move(q, d) {
    const i = queue.indexOf(q), j = i + d;
    if (j < 0 || j >= queue.length) return;
    queue.splice(i, 1); queue.splice(j, 0, q);
    build();
  }
  function remove(q) {
    q.video.pause();
    queue.splice(queue.indexOf(q), 1);
    if (cur === q) cur = queue[0] || null;
    previewClip = -1;
    build();
  }

  async function exportAll() {
    if (recording || !queue.length) return;
    recording = true;
    prog.classList.remove('hidden');
    queue.forEach((q) => { q.video.pause(); q.video.muted = !S.audio; });
    const total = totalDur();
    const ag = ctx._ag || (ctx._ag = audioGraph());
    await ag.ac.resume();
    let curIdx = -1;
    const audio = S.audio ? [ag.track()] : [];
    try {
      const r = await record(c, {
        duration: total, fps: 30, format: S.format, audio,
        draw: (t) => {
          const { i, local, dur } = locate(t);
          const q = queue[i];
          if (i !== curIdx) {
            if (curIdx >= 0 && queue[curIdx]) queue[curIdx].video.pause();
            curIdx = i;
            q.video.pause();
            if (S.audio) ag.fromElement(q.video, false);
            q.video.currentTime = q.start + local;
            q.video.play().catch(() => {});
          } else if (Math.abs(q.video.currentTime - (q.start + local)) > 0.15) {
            q.video.currentTime = q.start + local;
          }
          render(q.video, local, dur);
          return t < total;
        },
        onProgress: (f) => prog.set(f)
      });
      await io.save(`gabungan ${stamp()}`, r.blob, r.format);
      toast(`Video gabungan selesai (${queue.length} klip, ${fmtTime(total)}).`, 'ok');
    } catch (e) { toast(errText(e), 'err'); } finally {
      recording = false; prog.classList.add('hidden');
      queue.forEach((q) => q.video.pause());
      previewClip = -1; previewT = 0;
    }
  }

  function build() {
    const trim = cur ? h('div.row',
      slider('Mulai', { min: 0, max: cur.video.duration, step: 0.1, value: cur.start, fmt: (v) => v.toFixed(1) + ' s' }, (v) => { cur.start = Math.min(v, cur.end - 0.2); }),
      slider('Selesai', { min: 0, max: cur.video.duration, step: 0.1, value: cur.end, fmt: (v) => v.toFixed(1) + ' s' }, (v) => { cur.end = Math.max(v, cur.start + 0.2); })) : null;
    ctx.side.replaceChildren(
      section('Klip', 'film',
        h('div.files', queue.map((q, i) => h('div.file' + (q === cur ? '.on' : ''), { onclick: () => { cur = q; build(); } }, ic('film'), h('span.ellipsis.small', { text: `${i + 1}. ${q.name}`, title: q.path }), h('span.faint.small', { text: (q.end - q.start).toFixed(1) + 's' }),
          button('', { icon: 'arrow-up', cls: 'sm subtle icon', title: 'Naikkan', onClick: (e) => { e.stopPropagation(); move(q, -1); } }),
          button('', { icon: 'arrow-down', cls: 'sm subtle icon', title: 'Turunkan', onClick: (e) => { e.stopPropagation(); move(q, 1); } }),
          button('', { icon: 'x', cls: 'sm subtle icon', title: 'Hapus dari daftar', onClick: (e) => { e.stopPropagation(); remove(q); } })))),
        button(queue.length ? 'Tambah video…' : 'Pilih video…', { icon: 'folder-open', cls: 'sm' + (queue.length ? '' : ' primary'), onClick: async () => addVideos((await io.pick('video', true)).videos) }),
        queue.length ? h('div.faint.small', { text: `Total ${queue.length} klip · ${fmtTime(totalDur())} · klik klip untuk memotongnya.` }) : null),
      cur ? section('Potong klip terpilih', 'scissors', trim) : null,
      section('Hasil gabungan', 'clapperboard',
        chipField('Resolusi', [['first', 'Ikuti klip pertama'], [720, '720p'], [1080, '1080p']], S.res, (v) => { S.res = v; S.$save(); }),
        chipField('Cara mengisi', [['contain', 'Utuh + latar'], ['cover', 'Potong penuh']], S.fit, (v) => { S.fit = v; S.$save(); }),
        check('Fade hitam antar klip', S.fade, (v) => { S.fade = v; S.$save(); }),
        check('Sertakan audio', S.audio, (v) => { S.audio = v; S.$save(); }),
        videoFormatChips(S.format, (v) => { S.format = v; S.$save(); }),
        h('div.faint.small', { text: 'Direkam waktu-nyata: lama ekspor ≈ durasi gabungan. Jangan tutup jendela saat ekspor.' }))
    );
    exportBtn.disabled = !queue.length;
    exportBtn.setText(queue.length > 1 ? `Gabung ${queue.length} klip` : 'Ekspor video');
  }
  function showEmpty() {
    ctx.stage.replaceChildren(emptyStage('clapperboard', 'Pilih video untuk digabung', 'Seret beberapa video (MP4/WebM/MOV) ke sini, atau gunakan tombol di kiri. Urutan bisa diubah, tiap klip bisa dipotong.',
      button('Pilih video…', { icon: 'folder-open', cls: 'primary', onClick: async () => addVideos((await io.pick('video', true)).videos) })));
  }
  const exportBtn = button('Gabung video', { icon: 'download', cls: 'primary', onClick: exportAll });
  ctx.bar.append(info, h('div.grow', prog), exportBtn);
  ctx.onDrop((s) => addVideos(s.videos));
  showEmpty();
  build();
  requestAnimationFrame(loop);
}
