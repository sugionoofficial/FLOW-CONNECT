// Scout360 — penjelajah panorama 360° (equirectangular) di WebGL: tampilan kamera, little planet, terowongan, datar;
// rekam jalur kamera (keyframe) → video tur; ambil still dari sudut mana pun → Studio; AI membuat daftar shot
// pengintaian lokasi (→ Bulk) atau prompt panorama baru (→ Studio).
import {
  h, button, section, slider, chipField, check, textField, toast, ai, io, persisted, call, canvas, toBlob, record,
  videoFormatChips, preferredVideoFormat, sizeFor, dataUrlFor, canvasPoint, clamp, ease, stamp, progress, fmtTime
} from '../core.js';
import { VS, createGL, program, uni, drawQuad, texture, upload } from '../gl.js';

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_pano;
uniform vec2 u_res;
uniform float u_yaw, u_pitch, u_fov, u_mode;
const float PI = 3.14159265359;
vec3 rotX(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(d.x, c * d.y - s * d.z, s * d.y + c * d.z); }
vec3 rotY(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z); }
vec4 pano(vec3 d) {
  float lon = atan(d.x, -d.z), lat = asin(clamp(d.y, -1.0, 1.0));
  return texture(u_pano, vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 + lat / PI));
}
void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  float asp = u_res.x / u_res.y;
  if (u_mode < 0.5) {            // kamera (rectilinear)
    float t = tan(u_fov * 0.5);
    vec3 d = normalize(vec3(p.x * t * asp, p.y * t, -1.0));
    o = pano(rotY(rotX(d, u_pitch), -u_yaw));
  } else if (u_mode < 2.5) {     // little planet (1) / terowongan (2): proyeksi stereografis
    vec2 q = vec2(p.x * asp, p.y) * (u_fov / 1.6);
    float r = length(q), c = 2.0 * atan(r), az = atan(q.y, q.x) + u_yaw;
    vec3 d = vec3(sin(c) * cos(az), -cos(c), sin(c) * sin(az));
    if (u_mode > 1.5) d.y = -d.y;
    o = pano(rotX(d, u_pitch * 0.5));
  } else {                       // datar (equirectangular, geser yaw)
    float lon = (v_uv.x - 0.5) * 2.0 * PI + u_yaw;
    float lat = (v_uv.y - 0.5) * PI;
    o = pano(vec3(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat)));
  }
}`;
const MODES = [['cam', 'Kamera', 0], ['planet', 'Little planet', 1], ['tunnel', 'Terowongan', 2], ['flat', 'Datar 360', 3]];
const DEG = Math.PI / 180;

/** Panorama contoh prosedural (langit, matahari, gunung, laut, tanah berpetak). */
export function demoPanorama(W = 2048) {
  const H = W / 2, c = canvas(W, H), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H / 2); sky.addColorStop(0, '#0b1d3a'); sky.addColorStop(0.6, '#3a6ea5'); sky.addColorStop(1, '#f6bd60');
  g.fillStyle = sky; g.fillRect(0, 0, W, H / 2);
  g.fillStyle = '#ffe8a3'; g.beginPath(); g.arc(W * 0.3, H * 0.42, H * 0.05, 0, 7); g.fill();
  const rnd = (i) => { const x = Math.sin(i * 127.1) * 43758.5; return x - Math.floor(x); };
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = ['#46536b', '#2f3b52', '#1e2838'][layer];
    g.beginPath(); g.moveTo(0, H / 2);
    for (let x = 0; x <= W; x += 16) { const k = x / W * Math.PI * 2; g.lineTo(x, H / 2 - (H * (0.05 + layer * 0.02)) * (1 + Math.sin(k * (3 + layer) + layer) * 0.6 + Math.sin(k * 11 + layer * 3) * 0.2) * (0.6 + rnd(layer) * 0.4)); }
    g.lineTo(W, H / 2); g.closePath(); g.fill();
  }
  const ground = g.createLinearGradient(0, H / 2, 0, H); ground.addColorStop(0, '#2d6a4f'); ground.addColorStop(1, '#1b4332');
  g.fillStyle = ground; g.fillRect(0, H / 2, W, H / 2);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
  for (let i = 1; i < 10; i++) { const y = H / 2 + (H / 2) * Math.pow(i / 10, 1.6); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let i = 0; i < 24; i++) { const x = i / 24 * W; g.beginPath(); g.moveTo(x, H / 2); g.lineTo(x, H); g.stroke(); }
  g.fillStyle = '#e63946'; g.fillRect(W * 0.72, H * 0.43, W * 0.02, H * 0.07);
  g.fillStyle = '#fff'; g.font = `600 ${H * 0.03}px sans-serif`; g.textAlign = 'center';
  [['U', 0.5], ['T', 0.75], ['S', 0], ['B', 0.25]].forEach(([t, x]) => { g.fillText(t, x * W + (x === 0 ? H * 0.02 : 0), H * 0.56); });
  return c;
}
/** Pastikan rasio 2:1 (gambar lebar biasa → isi kutub dengan tepi yang diregangkan & diburamkan). */
export function toEquirect(src) {
  const W = Math.min(4096, Math.max(1024, src.width)), H = W / 2;
  const r = src.width / src.height;
  if (Math.abs(r - 2) < 0.04) return src;
  const c = canvas(W, H), g = c.getContext('2d');
  const hs = W / r;
  if (hs >= H) { const sh = src.width / 2; g.drawImage(src, 0, (src.height - sh) / 2, src.width, sh, 0, 0, W, H); return c; }
  const y = (H - hs) / 2;
  g.filter = 'blur(24px)';
  g.drawImage(src, 0, 0, src.width, 2, 0, -20, W, y + 44);
  g.drawImage(src, 0, src.height - 2, src.width, 2, 0, y + hs - 24, W, H - y - hs + 44);
  g.filter = 'none';
  g.drawImage(src, 0, y, W, hs);
  return c;
}
const lerpAngle = (a, b, t) => { const d = ((b - a + 540) % 360) - 180; return a + d * t; };

export async function mount(ctx) {
  const S = persisted('scout', { mode: 'cam', yaw: 0, pitch: 0, fov: 75, ratio: '16:9', short: 1080, format: preferredVideoFormat(), tour: 12, auto: false, keys: [], desc: '', shotList: null });
  const c = h('canvas.grab');
  const gl = createGL(c);
  const prog = program(gl, VS, FS);
  const tex = texture(gl, null, { repeat: true, mipmap: true });
  let pano = null, panoName = 'Panorama', panoPath = null;
  const stills = [];
  const info = h('span.faint.small.mono');
  const prog2 = progress(); prog2.classList.add('hidden');
  let recording = false, preview = null;

  function setPano(src, name, path) {
    pano = toEquirect(src); panoName = name; panoPath = path;
    upload(gl, tex, pano);
    panoVer++;
    build();
  }
  function size() { const [W, H] = sizeFor(S.ratio, S.short); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } }
  function render(cam = S) {
    size();
    gl.viewport(0, 0, c.width, c.height);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uni(gl, prog, 'u_pano'), 0);
    gl.uniform2f(uni(gl, prog, 'u_res'), c.width, c.height);
    gl.uniform1f(uni(gl, prog, 'u_yaw'), cam.yaw * DEG);
    gl.uniform1f(uni(gl, prog, 'u_pitch'), cam.pitch * DEG);
    gl.uniform1f(uni(gl, prog, 'u_fov'), cam.fov * DEG);
    gl.uniform1f(uni(gl, prog, 'u_mode'), (MODES.find((m) => m[0] === (cam.mode || S.mode)) || MODES[0])[2]);
    drawQuad(gl);
  }
  /** Kamera pada waktu t dari keyframe (atau putar otomatis). */
  function camAt(t, D) {
    const K = S.keys;
    if (K.length < 2) return { yaw: S.yaw + 360 * t / D, pitch: S.pitch, fov: S.fov, mode: S.mode };
    const seg = (K.length - 1) * clamp(t / D, 0, 1), i = Math.min(K.length - 2, Math.floor(seg)), f = ease.inOut(seg - i);
    const a = K[i], b = K[i + 1];
    return { yaw: lerpAngle(a.yaw, b.yaw, f), pitch: a.pitch + (b.pitch - a.pitch) * f, fov: a.fov + (b.fov - a.fov) * f, mode: f < 0.5 ? a.mode : b.mode };
  }
  let last = performance.now(), lastKey = '', panoVer = 0;
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!recording) {
      if (preview) { const t = (now - preview.t0) / 1000; render(camAt(t, S.tour)); info.textContent = `Pratinjau tur ${fmtTime(t)} / ${fmtTime(S.tour)}`; if (t > S.tour) { preview = null; lastKey = ''; } }
      else {
        if (S.auto && !drag) S.yaw = (S.yaw + dt * 6) % 360;
        // gambar ulang hanya bila kamera/ukuran/panorama berubah (hemat GPU)
        const key = [S.yaw, S.pitch, S.fov, S.mode, S.ratio, S.short, panoVer].join();
        if (key !== lastKey) { lastKey = key; render(); }
        info.textContent = `yaw ${Math.round(((S.yaw % 360) + 360) % 360)}° · pitch ${Math.round(S.pitch)}° · fov ${Math.round(S.fov)}°`; }
    }
    requestAnimationFrame(loop);
  };
  // seret untuk melihat sekeliling, roda untuk zoom
  let drag = null;
  c.addEventListener('pointerdown', (e) => { drag = { p: canvasPoint(c, e), yaw: S.yaw, pitch: S.pitch }; c.setPointerCapture(e.pointerId); preview = null; });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = canvasPoint(c, e), k = S.mode === 'flat' ? 360 / c.width : S.fov / c.height;
    S.yaw = drag.yaw - (p.x - drag.p.x) * k;
    if (S.mode !== 'flat') S.pitch = clamp(drag.pitch + (p.y - drag.p.y) * k, -89, 89);
  });
  c.addEventListener('pointerup', () => { drag = null; S.$save(); });
  c.addEventListener('wheel', (e) => { e.preventDefault(); S.fov = clamp(S.fov * (e.deltaY > 0 ? 1.08 : 1 / 1.08), 20, S.mode === 'cam' ? 120 : 200); fovS.set(Math.round(S.fov)); S.$save(); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowLeft') S.yaw -= step; else if (e.key === 'ArrowRight') S.yaw += step;
    else if (e.key === 'ArrowUp') S.pitch = clamp(S.pitch + step, -89, 89); else if (e.key === 'ArrowDown') S.pitch = clamp(S.pitch - step, -89, 89);
    else if (e.key.toLowerCase() === 'k') addKey(); else return;
    e.preventDefault(); S.$save();
  });

  const snap = () => { render(); const o = canvas(c.width, c.height); o.getContext('2d').drawImage(c, 0, 0); return o; };
  function addKey() { S.keys.push({ yaw: Math.round(S.yaw * 10) / 10, pitch: Math.round(S.pitch * 10) / 10, fov: Math.round(S.fov), mode: S.mode }); S.keys = S.keys.slice(-24); S.$save(); build(); toast(`Keyframe ${S.keys.length} direkam.`, 'ok'); }
  function addStill() { stills.push({ canvas: snap(), cam: { yaw: S.yaw, pitch: S.pitch, fov: S.fov, mode: S.mode } }); build(); toast(`Still ${stills.length} diambil.`, 'ok'); }
  async function exportVideo() {
    if (recording) return;
    preview = null; recording = true; prog2.classList.remove('hidden');
    try {
      const r = await record(c, { duration: S.tour, fps: 30, format: S.format, draw: (t) => render(camAt(t, S.tour)), onProgress: (f) => prog2.set(f) });
      await io.save(`Tur 360 ${panoName.replace(/\.[^.]+$/, '')} ${stamp()}`, r.blob, r.format);
    } finally { recording = false; lastKey = ''; prog2.classList.add('hidden'); }
  }
  async function stillsTo(where) {
    const files = [];
    for (const [i, s] of stills.entries()) files.push(await io.saveQuiet(`${panoName.replace(/\.[^.]+$/, '')} still ${i + 1}`, await toBlob(s.canvas, 'png'), 'png'));
    if (where === 'studio') { await call('lab:toStudio', { images: files.slice(0, 10), prompt: '', kind: 'image' }); toast(`${Math.min(10, files.length)} still dipasang sebagai referensi di Studio.`, 'ok'); }
    else toast(`${files.length} still tersimpan (Unduhan → Alat).`, 'ok', { label: 'Tampilkan', run: () => call('lab:show', files[0]) });
  }
  async function aiShots() {
    if (!pano) { toast('Buka panorama dulu (atau pakai contoh).', 'err'); return; }
    const r = await ai(`Kamu location scout & sinematografer. Ini panorama 360° (equirectangular; tengah gambar = yaw 0°, kanan = yaw positif, 360° melingkar). ${S.desc ? 'Catatan pengguna: ' + S.desc + '. ' : ''}Identifikasi lokasi & suasana, lalu rancang 4-6 shot video menarik di lokasi ini. Untuk tiap shot beri sudut kamera (yaw -180..180, pitch -60..60, fov 30..100) dan prompt video BAHASA INGGRIS untuk Veo/Omni.
Format: {"location":"(Indonesia)","mood":"(Indonesia)","shots":[{"name":"(Indonesia)","camera":"gerak kamera (Indonesia)","yaw":0,"pitch":0,"fov":70,"prompt":"..."}]}`, { json: true, image: dataUrlFor(pano, 1280, 0.85) });
    const shots = (Array.isArray(r.shots) ? r.shots : []).slice(0, 8).map((s, i, a) => ({
      name: String(s.name || `Shot ${i + 1}`).slice(0, 60), camera: String(s.camera || '').slice(0, 120), prompt: String(s.prompt || '').slice(0, 1500),
      yaw: Number.isFinite(Number(s.yaw)) ? clamp(Number(s.yaw), -180, 180) : -180 + 360 * i / a.length, pitch: Number.isFinite(Number(s.pitch)) ? clamp(Number(s.pitch), -60, 60) : 0, fov: Number.isFinite(Number(s.fov)) ? clamp(Number(s.fov), 30, 100) : 70
    })).filter((s) => s.prompt);
    if (!shots.length) throw new Error('AI_BAD_JSON');
    S.shotList = { location: String(r.location || '').slice(0, 80), mood: String(r.mood || '').slice(0, 80), shots }; S.$save(); build();
    toast(`${shots.length} shot untuk ${S.shotList.location || 'lokasi ini'}.`, 'ok');
  }
  async function aiPanoPrompt() {
    if (!S.desc.trim()) { toast('Tulis deskripsi lokasi dulu.', 'err'); return; }
    const r = await ai(`Tulis prompt BAHASA INGGRIS untuk generator gambar agar menghasilkan panorama 360° equirectangular yang mulus (rasio 2:1, tepi kiri-kanan menyambung, horizon lurus di tengah, tanpa distorsi aneh di kutub, tanpa teks) dari deskripsi: "${S.desc}".\nFormat: {"prompt":"..."}`, { json: true });
    if (!r.prompt) throw new Error('AI_BAD_JSON');
    await call('lab:toStudio', { prompt: String(r.prompt).slice(0, 4000), images: [], kind: 'image' });
    toast('Prompt panorama dipasang di Studio. Hasilnya bisa dibuka lagi di sini.', 'ok');
  }
  const goShot = (s) => { S.yaw = s.yaw; S.pitch = s.pitch; S.fov = s.fov; S.mode = 'cam'; S.$save(); build(); };

  let fovS;
  function build() {
    fovS = slider('Bidang pandang', { min: 20, max: S.mode === 'cam' ? 120 : 200, value: Math.round(S.fov), fmt: (v) => v + '°' }, (v) => { S.fov = v; S.$save(); });
    const sl = S.shotList;
    ctx.side.replaceChildren(
      section('Panorama', 'globe',
        h('div.row', button(pano && panoPath ? 'Ganti panorama…' : 'Buka panorama…', { icon: 'folder-open', cls: 'sm primary', onClick: async () => { const p = (await io.pick('image')).images[0]; if (!p) return; const im = await io.image(p); setPano(im.bmp, im.name, p); } }),
          button('Contoh', { icon: 'mountain', cls: 'sm subtle', onClick: () => setPano(demoPanorama(), 'Contoh', null) })),
        h('div.faint.small', { text: pano ? `${panoName} · ${pano.width}×${pano.height}` : 'Gambar 360° (2:1). Foto lebar biasa juga bisa — kutubnya diisi otomatis.' })),
      section('Tampilan', 'eye',
        chipField('Proyeksi', MODES.map(([v, l]) => [v, l]), S.mode, (v) => { S.mode = v; if (v !== 'cam' && S.fov < 60) S.fov = 100; if (v === 'cam' && S.fov > 120) S.fov = 75; S.$save(); build(); }),
        fovS,
        slider('Kemiringan', { min: -89, max: 89, value: Math.round(S.pitch), fmt: (v) => v + '°' }, (v) => { S.pitch = v; S.$save(); }),
        check('Putar otomatis', S.auto, (v) => { S.auto = v; S.$save(); }),
        h('div.row', button('Ambil still', { icon: 'camera', cls: 'sm', onClick: addStill }), button('PNG tampilan ini', { icon: 'image-down', cls: 'sm', onClick: async () => io.save(`${panoName.replace(/\.[^.]+$/, '')} ${Math.round(S.yaw)}°`, await toBlob(snap(), 'png'), 'png') }))),
      stills.length ? section(`Still (${stills.length})`, 'images',
        h('div.files', stills.map((s, i) => { const t = canvas(160, 90); t.getContext('2d').drawImage(s.canvas, 0, 0, 160, 90); return h('div.file', t, h('span.ellipsis.small', { text: `yaw ${Math.round(s.cam.yaw)}° · fov ${Math.round(s.cam.fov)}°` }), button('', { icon: 'x', cls: 'sm subtle icon', title: 'Hapus', onClick: () => { stills.splice(i, 1); build(); } })); })),
        h('div.row', button('Simpan semua', { icon: 'download', cls: 'sm', onClick: () => stillsTo('save') }), button('Ke Studio', { icon: 'send', cls: 'sm primary', onClick: () => stillsTo('studio') }))) : null,
      section('Tur kamera', 'route',
        h('div.row', button('Rekam keyframe (K)', { icon: 'plus', cls: 'sm', onClick: addKey }), S.keys.length ? button('Hapus', { icon: 'trash-2', cls: 'sm subtle', onClick: () => { S.keys = []; S.$save(); build(); } }) : null),
        h('div.faint.small', { text: S.keys.length >= 2 ? `${S.keys.length} keyframe — kamera bergerak halus antar titik.` : 'Kurang dari 2 keyframe → tur berputar 360° penuh dari sudut sekarang.' }),
        S.keys.length ? h('div.files', S.keys.map((k, i) => h('div.file', h('span.kbd', { text: String(i + 1) }), h('span.small.ellipsis', { text: `${MODES.find((m) => m[0] === k.mode)[1]} · yaw ${k.yaw}° · pitch ${k.pitch}° · fov ${k.fov}°` }),
          button('', { icon: 'eye', cls: 'sm subtle icon', title: 'Lihat', onClick: () => { Object.assign(S, { yaw: k.yaw, pitch: k.pitch, fov: k.fov, mode: k.mode }); S.$save(); build(); } }),
          button('', { icon: 'x', cls: 'sm subtle icon', title: 'Hapus', onClick: () => { S.keys.splice(i, 1); S.$save(); build(); } })))) : null,
        slider('Durasi', { min: 4, max: 60, value: S.tour, fmt: (v) => v + ' dtk' }, (v) => { S.tour = v; S.$save(); }),
        chipField('Rasio', [['16:9', '16:9'], ['9:16', '9:16'], ['1:1', '1:1'], ['21:9', '21:9']], S.ratio, (v) => { S.ratio = v; S.$save(); }),
        chipField('Resolusi', [[720, '720p'], [1080, '1080p']], S.short, (v) => { S.short = Number(v); S.$save(); }),
        videoFormatChips(S.format, (v) => { S.format = v; S.$save(); }),
        button('Pratinjau tur', { icon: 'play', cls: 'sm', onClick: () => { preview = { t0: performance.now() }; } })),
      section('AI pengintai lokasi', 'wand-sparkles',
        textField('Catatan / deskripsi lokasi', S.desc, (v) => { S.desc = v; S.$save(); }, { rows: 2, max: 600, placeholder: 'mis. pantai berbatu saat senja, untuk iklan parfum' }),
        button('Rancang shot dari panorama (AI)', { icon: 'clapperboard', cls: 'ai block', onClick: aiShots }),
        button('Prompt panorama baru → Studio', { icon: 'globe', cls: 'sm block', onClick: aiPanoPrompt }),
        sl ? h('div.chat', h('b', { text: `${sl.location}${sl.mood ? ' · ' + sl.mood : ''}` }),
          ...sl.shots.map((s, i) => h('div.file', h('span.kbd', { text: String(i + 1) }), h('span.small.ellipsis', { text: `${s.name} — ${s.camera}`, title: s.prompt }),
            button('', { icon: 'eye', cls: 'sm subtle icon', title: 'Arahkan kamera', onClick: () => goShot(s) }))),
          h('div.row', button('Jadikan keyframe', { icon: 'route', cls: 'sm', onClick: () => { S.keys = sl.shots.map((s) => ({ yaw: s.yaw, pitch: s.pitch, fov: s.fov, mode: 'cam' })); S.$save(); build(); } }),
            button('Prompt → Bulk', { icon: 'layers', cls: 'sm primary', onClick: async () => { await call('lab:toBulk', { prompts: sl.shots.map((s) => s.prompt), kind: 'video' }); toast(`${sl.shots.length} prompt video dikirim ke Bulk.`, 'ok'); } }))) : null)
    );
  }
  ctx.onDrop(async (s) => { if (s.images[0]) { const im = await io.image(s.images[0]); setPano(im.bmp, im.name, s.images[0]); } });
  ctx.stage.append(c);
  ctx.bar.append(info, h('span.faint.small', { text: 'Seret = lihat sekeliling · roda = zoom · ←↑→↓ · K = keyframe' }), h('div.grow', prog2), button('Ekspor video tur', { icon: 'download', cls: 'primary', onClick: exportVideo }));
  setPano(demoPanorama(), 'Contoh', null);
  requestAnimationFrame(loop);
}
