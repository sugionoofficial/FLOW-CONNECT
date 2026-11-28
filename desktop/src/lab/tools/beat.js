// Ribbit — klip (gambar/video) berganti mengikuti ketukan musik: otomatis tiap N ketukan, atau dimainkan live (tombol 1–9 / Spasi).
import {
  h, ic, button, section, slider, chipField, check, progress, toast, errText, io, record, videoFormatChips,
  preferredVideoFormat, persisted, sizeFor, drawFit, clamp, fmtTime, stamp, emptyStage, textField
} from '../core.js';
import { analyze, manualGrid, peaks, mono } from '../beat.js';

const FX = [['zoom', 'Zoom hentak'], ['flash', 'Kilat'], ['shake', 'Guncang'], ['rgb', 'RGB split'], ['bw', 'Hitam-putih sekilas']];
const hash = (n) => { const x = Math.sin(n * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };

/** Urutan klip per segmen (urut / acak tanpa pengulangan berturut-turut). */
export function clipOrder(n, segments, mode, seed = 1) {
  const out = [];
  for (let s = 0; s < segments; s++) {
    if (mode !== 'random' || n < 2) { out.push(s % Math.max(1, n)); continue; }
    let k = Math.floor(hash(s * 7.3 + seed) * n);
    if (k === out[s - 1]) k = (k + 1) % n;
    out.push(k);
  }
  return out;
}

export async function mount(ctx) {
  const S = persisted('beat', { every: 2, fx: ['zoom', 'flash'], fxAmt: 60, order: 'seq', kenburns: true, vstart: 'start', ratio: '9:16', short: 1080, format: preferredVideoFormat(), mode: 'auto', quantize: true, rangeStart: 0, rangeLen: 30, seed: 1 });
  const ac = new AudioContext();
  let music = null; // {buffer, name, samples, an, beats, bpm, offset, peaks}
  const clips = []; // {type, el, name}
  let src = null, playing = false, playStart = 0, recording = false;
  let live = { clip: 0, pending: null, events: [] };
  const c = h('canvas');
  const g = c.getContext('2d');
  const wave = h('canvas.waves');
  const wg = wave.getContext('2d');
  const prog = progress(); prog.classList.add('hidden');
  const info = h('span.faint.small.mono', { text: '' });

  const beats = () => (music ? music.beats : []);
  const lastBeatIdx = (t) => { const b = beats(); let lo = 0, hi = b.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
  let order = [];
  const rebuildOrder = () => { order = clipOrder(clips.length, Math.ceil(beats().length / Math.max(1, S.every)) + 2, S.order, S.seed); };
  let curSeg = -1, segStart = 0;

  function frame(t, absT) {
    const [W, H] = sizeFor(S.ratio, S.short);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (!clips.length) return;
    const bi = lastBeatIdx(absT);
    let ci;
    if (S.mode === 'live') {
      if (live.pending != null && (!S.quantize || (bi >= 0 && bi !== live.pendBeat))) { live.clip = live.pending; live.pending = null; live.events.push([t, live.clip]); }
      ci = live.clip % clips.length;
      if (ci !== curSeg) { curSeg = ci; segStart = t; startClip(clips[ci]); }
    } else {
      const seg = Math.max(0, Math.floor(Math.max(0, bi) / Math.max(1, S.every)));
      if (seg !== curSeg) { curSeg = seg; segStart = t; startClip(clips[order[seg] ?? 0]); }
      ci = order[seg] ?? 0;
    }
    const clip = clips[ci];
    const since = bi >= 0 ? absT - beats()[bi] : 9;
    const pulse = Math.exp(-since * 9) * S.fxAmt / 100;
    const fx = new Set(S.fx);
    g.save();
    let sc = 1, ox = 0, oy = 0;
    if (clip.type === 'image' && S.kenburns) { const p = clamp((t - segStart) / 4, 0, 1); sc *= 1.04 + 0.1 * p; ox += (hash(curSeg) - 0.5) * W * 0.06 * p; oy += (hash(curSeg + 3) - 0.5) * H * 0.06 * p; }
    if (fx.has('zoom')) sc *= 1 + 0.12 * pulse;
    if (fx.has('shake')) { ox += (hash(absT * 60) - 0.5) * W * 0.05 * pulse; oy += (hash(absT * 60 + 9) - 0.5) * H * 0.05 * pulse; }
    g.translate(W / 2 + ox, H / 2 + oy); g.scale(sc, sc); g.translate(-W / 2, -H / 2);
    if (fx.has('bw') && pulse > 0.3) g.filter = 'grayscale(1) contrast(1.3)';
    drawFit(g, clip.el, 0, 0, W, H, 'cover');
    if (fx.has('rgb') && pulse > 0.05) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * pulse;
      g.filter = 'sepia(1) saturate(6) hue-rotate(-50deg)'; drawFit(g, clip.el, -W * 0.012 * pulse, 0, W, H, 'cover');
      g.filter = 'sepia(1) saturate(6) hue-rotate(150deg)'; drawFit(g, clip.el, W * 0.012 * pulse, 0, W, H, 'cover');
    }
    g.restore();
    if (fx.has('flash') && pulse > 0.01) { g.fillStyle = `rgba(255,255,255,${0.55 * pulse})`; g.fillRect(0, 0, W, H); }
  }
  function startClip(cl) {
    clips.forEach((x) => { if (x.type === 'video' && x !== cl) x.el.pause(); });
    if (cl && cl.type === 'video') {
      const v = cl.el;
      const d = v.duration || 1;
      v.currentTime = S.vstart === 'random' ? hash(curSeg * 3.1 + S.seed) * Math.max(0, d - 2) : 0;
      v.play().catch(() => {});
    }
  }
  function drawWave(tAbs) {
    const W = wave.width = wave.clientWidth * devicePixelRatio || 600, H = wave.height = 90 * devicePixelRatio;
    wg.clearRect(0, 0, W, H);
    if (!music) return;
    const P = music.peaks, D = music.buffer.duration;
    wg.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-3') || '#888';
    for (let i = 0; i < P.length; i++) { const x = i / P.length * W, hh = P[i] * H * 0.9; wg.fillRect(x, (H - hh) / 2, Math.max(1, W / P.length), hh); }
    wg.fillStyle = 'rgba(0,103,192,0.10)'; wg.fillRect(S.rangeStart / D * W, 0, Math.min(S.rangeLen, D - S.rangeStart) / D * W, H);
    wg.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent') || '#0067c0'; wg.lineWidth = 1;
    music.beats.forEach((b, i) => { const x = b / D * W; wg.globalAlpha = i % S.every === 0 ? 0.9 : 0.3; wg.beginPath(); wg.moveTo(x, 0); wg.lineTo(x, H * (i % S.every === 0 ? 1 : 0.3)); wg.stroke(); });
    wg.globalAlpha = 1;
    if (tAbs != null) { wg.fillStyle = '#e11d48'; wg.fillRect(tAbs / D * W - 1, 0, 2, H); }
  }
  let lastKey = '';
  const loop = () => {
    if (!recording) {
      const t = playing ? ac.currentTime - playStart : 0;
      const abs = S.rangeStart + t;
      if (playing && (t > Math.min(S.rangeLen, music.buffer.duration - S.rangeStart))) stop();
      // saat diam: gambar ulang hanya bila pengaturan berubah (hemat CPU)
      const key = playing ? abs : [S.rangeStart, S.rangeLen, S.every, S.ratio, S.short, S.fx.join(), S.fxAmt, S.kenburns, S.order, S.seed, clips.length, music ? music.beats.length + ':' + music.beats[0] : '-', wave.clientWidth].join();
      if (key !== lastKey) {
        lastKey = key;
        if (clips.length) { if (!playing) curSeg = -1; frame(t, abs); }
        if (music) drawWave(playing ? abs : S.rangeStart);
      }
      info.textContent = music ? `${fmtTime(playing ? t : 0)} · ${music.bpm.toFixed(1)} BPM` : '';
    }
    requestAnimationFrame(loop);
  };
  function play() {
    if (!music || !clips.length) { toast('Pilih musik dan klip dulu.', 'err'); return; }
    stop();
    ac.resume();
    src = ac.createBufferSource(); src.buffer = music.buffer; src.connect(ac.destination);
    playStart = ac.currentTime + 0.05; src.start(playStart, S.rangeStart);
    curSeg = -1; live.events = []; rebuildOrder(); playing = true; playBtn.setText('Berhenti');
  }
  function stop() { if (src) { try { src.stop(); } catch { /* sudah */ } src.disconnect(); src = null; } playing = false; playBtn.setText('Putar'); clips.forEach((x) => x.type === 'video' && x.el.pause()); }

  async function loadMusic(s) {
    const samples = mono(s.el);
    const an = analyze(samples, s.el.sampleRate);
    music = { buffer: s.el, name: s.name, samples, an, bpm: an.bpm, offset: an.offset, beats: an.beats, peaks: peaks(samples, 1200) };
    S.rangeStart = clamp(S.rangeStart, 0, Math.max(0, s.el.duration - 1)); S.rangeLen = clamp(S.rangeLen, 1, s.el.duration);
    waveBar.classList.remove('hidden');
    rebuildOrder(); build();
    toast(`Tempo terdeteksi ${an.bpm.toFixed(1)} BPM · ${an.beats.length} ketukan.`, 'ok');
  }
  async function addClips(sel) {
    for (const p of [...sel.images, ...sel.videos]) {
      try {
        if (sel.videos.includes(p)) { const v = await io.video(p); v.video.muted = true; v.video.loop = true; clips.push({ type: 'video', el: v.video, name: v.name }); }
        else { const im = await io.image(p); clips.push({ type: 'image', el: im.bmp, name: im.name }); }
      } catch (e) { toast(errText(e), 'err'); }
    }
    if (clips.length) ctx.stage.replaceChildren(c);
    rebuildOrder(); build();
  }
  const musicPick = sourcePickerAudio();
  function sourcePickerAudio() {
    return button('Pilih musik…', { icon: 'music', cls: 'sm primary', onClick: async () => { const sel = await io.pick('audio'); const p = sel.audios[0]; if (!p) return; const a = await io.audio(p, ac); await loadMusic({ el: a.buffer, name: a.name }); } });
  }
  ctx.onDrop(async (sel) => {
    if (sel.audios[0]) { const a = await io.audio(sel.audios[0], ac); await loadMusic({ el: a.buffer, name: a.name }); }
    if (sel.images.length || sel.videos.length) await addClips(sel);
  });

  // live: 1–9 = klip, Spasi = berikutnya
  window.addEventListener('keydown', (e) => {
    if (S.mode !== 'live' || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    const n = Number(e.key);
    let next = null;
    if (n >= 1 && n <= 9 && n <= clips.length) next = n - 1;
    else if (e.code === 'Space') { next = (live.clip + 1) % Math.max(1, clips.length); e.preventDefault(); }
    if (next == null) return;
    const t = playing ? ac.currentTime - playStart : 0;
    live.pending = next; live.pendBeat = lastBeatIdx(S.rangeStart + t);
  });
  // ketuk tempo
  let taps = [];
  const tap = () => {
    const now = performance.now() / 1000;
    taps = taps.filter((x) => now - x < 3).concat(now);
    if (taps.length >= 4 && music) {
      const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setBpm(60 / iv);
    }
  };
  function setBpm(bpm, offset = music.offset) {
    music.bpm = clamp(bpm, 40, 240); music.offset = offset;
    music.beats = manualGrid(music.bpm, music.offset, music.buffer.duration);
    rebuildOrder(); build();
  }

  async function exportVideo() {
    if (!music || !clips.length || recording) { if (!recording) toast('Pilih musik dan klip dulu.', 'err'); return; }
    stop();
    recording = true; prog.classList.remove('hidden');
    try {
      await ac.resume();
      const dest = ac.createMediaStreamDestination();
      const D = Math.min(S.rangeLen, music.buffer.duration - S.rangeStart);
      let bsrc = null, t0 = 0;
      curSeg = -1; rebuildOrder();
      const r = await record(c, {
        duration: D, fps: 30, format: S.format, audio: [dest.stream.getAudioTracks()[0]],
        start: () => { bsrc = ac.createBufferSource(); bsrc.buffer = music.buffer; bsrc.connect(dest); bsrc.connect(ac.destination); t0 = ac.currentTime; bsrc.start(t0, S.rangeStart); },
        draw: (t) => { const tt = bsrc ? ac.currentTime - t0 : t; frame(tt, S.rangeStart + tt); },
        onProgress: (f) => prog.set(f)
      });
      try { bsrc.stop(); } catch { /* sudah */ }
      clips.forEach((x) => x.type === 'video' && x.el.pause());
      await io.save(`Ribbit ${music.name.replace(/\.[^.]+$/, '')} ${stamp()}`, r.blob, r.format);
    } catch (e) { toast(errText(e), 'err'); } finally { recording = false; prog.classList.add('hidden'); }
  }

  function build() {
    const up = () => { S.$save(); rebuildOrder(); };
    const D = music ? music.buffer.duration : 60;
    ctx.side.replaceChildren(
      section('Musik', 'music',
        h('div.row', musicPick, h('span.faint.small.ellipsis.grow', { text: music ? music.name : 'MP3 / WAV / M4A / OGG' })),
        music ? h('div.chat',
          h('div.row', textField('BPM', music.bpm.toFixed(1), (v) => { if (v >= 40 && v <= 240) setBpmQuiet(v); }, { type: 'number', step: 0.1, min: 40, maxNum: 240 }),
            button('½×', { cls: 'sm', title: 'Setengah tempo', onClick: () => setBpm(music.bpm / 2) }), button('2×', { cls: 'sm', title: 'Dua kali tempo', onClick: () => setBpm(music.bpm * 2) }),
            button('Ketuk', { icon: 'drum', cls: 'sm', title: 'Ketuk 4× mengikuti musik untuk mengatur tempo', onClick: tap })),
          slider('Geser ketukan', { min: -250, max: 250, value: 0, fmt: (v) => v + ' ms' }, (v) => { music.beats = manualGrid(music.bpm, music.offset + v / 1000, music.buffer.duration); rebuildOrder(); }),
          h('div.row', slider('Mulai lagu', { min: 0, max: Math.floor(D), value: S.rangeStart, fmt: (v) => fmtTime(v) }, (v) => { S.rangeStart = v; S.$save(); }), slider('Panjang video', { min: 3, max: Math.max(3, Math.floor(D)), value: Math.min(S.rangeLen, Math.floor(D)), fmt: (v) => v + ' dtk' }, (v) => { S.rangeLen = v; S.$save(); })),
          button('Deteksi ulang', { icon: 'refresh-cw', cls: 'sm subtle', onClick: () => { const an = music.an; setBpm(an.bpm, an.offset); } })) : null),
      section('Klip', 'film',
        clips.length ? h('div.files', clips.map((cl, i) => h('div.file', h('span.kbd', { text: String(i + 1) }), ic(cl.type === 'video' ? 'video' : 'image'), h('span.ellipsis.small', { text: cl.name }),
          button('', { icon: 'x', cls: 'sm subtle icon', title: 'Hapus', onClick: () => { if (cl.type === 'video') cl.el.pause(); clips.splice(i, 1); rebuildOrder(); build(); } })))) : null,
        button(clips.length ? 'Tambah klip…' : 'Pilih gambar / video…', { icon: 'folder-open', cls: 'sm' + (clips.length ? '' : ' primary'), onClick: async () => addClips(await io.pick('media', true)) })),
      section('Gaya potong', 'scissors',
        chipField('Mode', [['auto', 'Otomatis'], ['live', 'Live (keyboard)']], S.mode, (v) => { S.mode = v; S.$save(); build(); }),
        S.mode === 'auto' ? chipField('Ganti klip tiap', [[1, '1 ketukan'], [2, '2'], [4, '4 (1 bar)'], [8, '8']], S.every, (v) => { S.every = Number(v); up(); }) : h('div.note', { html: 'Tekan <span class="kbd">1</span>–<span class="kbd">9</span> untuk memilih klip, <span class="kbd">Spasi</span> untuk klip berikutnya — saat Putar maupun saat Ekspor (pertunjukan live terekam).' }),
        S.mode === 'live' ? check('Kunci ke ketukan berikutnya', S.quantize, (v) => { S.quantize = v; S.$save(); }) : null,
        S.mode === 'auto' ? h('div.row', chipField('Urutan', [['seq', 'Berurutan'], ['random', 'Acak']], S.order, (v) => { S.order = v; up(); }), S.order === 'random' ? button('', { icon: 'shuffle', cls: 'sm icon', title: 'Acak ulang', onClick: () => { S.seed++; up(); } }) : null) : null,
        h('div.field', h('span', 'Efek di ketukan'), h('div.chips', FX.map(([v, l]) => h('button.chip' + (S.fx.includes(v) ? '.on' : ''), { type: 'button', onclick: () => { S.fx = S.fx.includes(v) ? S.fx.filter((x) => x !== v) : [...S.fx, v]; S.$save(); build(); } }, l)))),
        slider('Kekuatan efek', { min: 0, max: 100, value: S.fxAmt, fmt: (v) => v + '%' }, (v) => { S.fxAmt = v; S.$save(); }),
        check('Gerak Ken Burns (gambar)', S.kenburns, (v) => { S.kenburns = v; S.$save(); }),
        chipField('Klip video mulai dari', [['start', 'Awal'], ['random', 'Titik acak']], S.vstart, (v) => { S.vstart = v; S.$save(); })),
      section('Ekspor', 'download',
        chipField('Rasio', [['9:16', '9:16'], ['16:9', '16:9'], ['1:1', '1:1'], ['4:5', '4:5']], S.ratio, (v) => { S.ratio = v; S.$save(); }),
        chipField('Resolusi', [[720, '720p'], [1080, '1080p']], S.short, (v) => { S.short = Number(v); S.$save(); }),
        videoFormatChips(S.format, (v) => { S.format = v; S.$save(); }))
    );
  }
  function setBpmQuiet(v) { music.bpm = v; music.beats = manualGrid(v, music.offset, music.buffer.duration); rebuildOrder(); }

  const playBtn = button('Putar', { icon: 'play', cls: 'sm', onClick: () => (playing ? stop() : play()) });
  const waveBar = h('div.stagebar.hidden', wave);
  ctx.main.insertBefore(waveBar, ctx.bar);
  ctx.bar.append(playBtn, info, h('div.grow', prog), button('Ekspor video', { icon: 'download', cls: 'primary', onClick: exportVideo }));
  ctx.stage.replaceChildren(emptyStage('audio-waveform', 'Musik + klip = video berirama', 'Pilih musik (ketukan dideteksi otomatis, offline) lalu beberapa gambar/video. Seret berkas ke sini juga bisa.'));
  build();
  requestAnimationFrame(loop);
}
