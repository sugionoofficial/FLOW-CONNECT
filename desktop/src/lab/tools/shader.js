// Efek Shader — filter WebGL yang bisa diatur & ditumpuk (maks. 4 lapis) untuk gambar dan video; AI menulis shader baru.
import {
  h, ic, button, section, slider, select, color, textField, progress, toast, errText, ai, io, record, audioGraph,
  videoFormatChips, preferredVideoFormat, persisted, sourcePicker, seek, toBlob, canvas, stamp, rgb, emptyStage
} from '../core.js';
import { VS, createGL, program, uni, drawQuad, texture, upload, target, freeTarget } from '../gl.js';

const PRELUDE = `#version 300 es
precision highp float;
uniform sampler2D u_tex; uniform vec2 u_res; uniform float u_time, u_amt, u_p1, u_p2, u_mix; uniform vec3 u_c1, u_c2;
in vec2 v_uv; out vec4 outColor;
vec4 tex(vec2 uv) { return texture(u_tex, clamp(uv, 0.0, 1.0)); }
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rand(i), rand(i + vec2(1, 0)), f.x), mix(rand(i + vec2(0, 1)), rand(i + vec2(1, 1)), f.x), f.y); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;
const MAIN = `
void main() { vec4 base = tex(v_uv); vec4 e = effect(v_uv); outColor = mix(base, e, clamp(u_mix, 0.0, 1.0)); }`;

/** [id, nama, label p1, label p2, kode effect()] — u_amt = kekuatan, u_p1/u_p2 = parameter 0..1. */
export const EFFECTS = [
  ['vhs', 'VHS', 'Garis', 'Gangguan', `vec4 effect(vec2 uv) {
  float t = u_time; float j = (noise(vec2(t * 8.0, uv.y * 40.0)) - 0.5) * 0.012 * u_amt;
  float band = step(0.985 - u_p2 * 0.05, fract(uv.y * 3.0 + t * 0.6)) * 0.03 * u_amt;
  vec2 q = uv + vec2(j + band, 0.0);
  vec3 c = vec3(tex(q + vec2(0.004 * u_amt, 0)).r, tex(q).g, tex(q - vec2(0.004 * u_amt, 0)).b);
  c = mix(c, vec3(luma(c)), 0.2 * u_amt);
  c *= 0.92 + 0.08 * sin(uv.y * u_res.y * (0.5 + u_p1) * 3.14159);
  c += (rand(uv * u_res + t) - 0.5) * 0.12 * u_amt;
  return vec4(c, 1.0); }`],
  ['crt', 'Monitor CRT', 'Lengkung', 'Mask', `vec4 effect(vec2 uv) {
  vec2 cc = uv - 0.5; float d = dot(cc, cc); vec2 q = 0.5 + cc * (1.0 + d * u_p1 * 0.6 * u_amt);
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec4(0, 0, 0, 1);
  vec3 c = tex(q).rgb;
  float scan = 0.75 + 0.25 * sin(q.y * u_res.y * 3.14159);
  float m = mod(floor(q.x * u_res.x), 3.0);
  vec3 mask = mix(vec3(1.0), vec3(m == 0.0 ? 1.2 : 0.8, m == 1.0 ? 1.2 : 0.8, m == 2.0 ? 1.2 : 0.8), u_p2);
  c *= mix(1.0, scan, u_amt) * mask; c *= 1.0 - d * 1.2 * u_amt;
  return vec4(c * 1.1, 1.0); }`],
  ['glitch', 'Glitch blok', 'Ukuran blok', 'Frekuensi', `vec4 effect(vec2 uv) {
  float t = floor(u_time * (4.0 + u_p2 * 20.0));
  vec2 blk = floor(uv * vec2(4.0, 10.0 + u_p1 * 40.0));
  float r = rand(blk + t); vec2 q = uv;
  if (r > 1.0 - 0.25 * u_amt) q.x += (rand(blk * 3.1 + t) - 0.5) * 0.25 * u_amt;
  float s = 0.01 * u_amt * step(0.5, rand(vec2(t)));
  vec3 c = vec3(tex(q + vec2(s, 0)).r, tex(q).g, tex(q - vec2(s, 0)).b);
  if (rand(blk + t * 1.7) > 1.0 - 0.06 * u_amt) c = 1.0 - c;
  return vec4(c, 1.0); }`],
  ['rgbsplit', 'RGB split', 'Sudut', 'Animasi', `vec4 effect(vec2 uv) {
  float a = u_p1 * 6.2832 + u_time * u_p2 * 2.0; vec2 o = vec2(cos(a), sin(a)) * 0.015 * u_amt;
  return vec4(tex(uv + o).r, tex(uv).g, tex(uv - o).b, 1.0); }`],
  ['film', 'Film grain', 'Hangat', 'Vignette', `vec4 effect(vec2 uv) {
  vec3 c = tex(uv).rgb; float g = rand(uv * u_res + fract(u_time * 24.0)) - 0.5;
  c += g * 0.18 * u_amt; c = mix(c, c * vec3(1.08, 1.0, 0.88), u_p1);
  float v = smoothstep(0.85, 0.2, length(uv - 0.5)); c *= mix(1.0, v, u_p2);
  return vec4(c, 1.0); }`],
  ['duotone', 'Duotone', 'Kontras', '—', `vec4 effect(vec2 uv) {
  float l = luma(tex(uv).rgb); l = clamp((l - 0.5) * (1.0 + u_p1 * 2.0) + 0.5, 0.0, 1.0);
  return vec4(mix(u_c1, u_c2, l), 1.0); }`],
  ['posterize', 'Posterize', 'Level', 'Saturasi', `vec4 effect(vec2 uv) {
  float n = 2.0 + floor(u_p1 * 10.0); vec3 c = floor(tex(uv).rgb * n + 0.5) / n;
  c = mix(vec3(luma(c)), c, 1.0 + u_p2); return vec4(c, 1.0); }`],
  ['pixelate', 'Pixelate', 'Ukuran piksel', '—', `vec4 effect(vec2 uv) {
  float s = 4.0 + u_p1 * 60.0; vec2 cell = s / u_res; return tex((floor(uv / cell) + 0.5) * cell); }`],
  ['halftone', 'Halftone', 'Ukuran titik', 'Warna', `vec4 effect(vec2 uv) {
  float s = 6.0 + u_p1 * 24.0; vec2 p = uv * u_res; mat2 r = mat2(0.707, -0.707, 0.707, 0.707);
  vec2 q = r * p; vec2 cell = (floor(q / s) + 0.5) * s; vec2 cuv = (transpose(r) * cell) / u_res;
  vec3 c = tex(cuv).rgb; float rad = (1.0 - luma(c)) * s * 0.7;
  float dot1 = 1.0 - smoothstep(rad - 1.0, rad + 1.0, length(q - cell));
  vec3 ink = mix(vec3(0.0), c, u_p2); return vec4(mix(vec3(1.0), ink, dot1), 1.0); }`],
  ['edge', 'Garis neon', 'Ketebalan', 'Latar asli', `vec4 effect(vec2 uv) {
  vec2 px = (1.0 + u_p1 * 2.0) / u_res;
  float tl = luma(tex(uv + px * vec2(-1, 1)).rgb), t = luma(tex(uv + px * vec2(0, 1)).rgb), tr = luma(tex(uv + px * vec2(1, 1)).rgb);
  float l = luma(tex(uv + px * vec2(-1, 0)).rgb), r = luma(tex(uv + px * vec2(1, 0)).rgb);
  float bl = luma(tex(uv + px * vec2(-1, -1)).rgb), b = luma(tex(uv + px * vec2(0, -1)).rgb), br = luma(tex(uv + px * vec2(1, -1)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br, gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float e = clamp(length(vec2(gx, gy)) * (1.0 + u_amt * 3.0), 0.0, 1.0);
  vec3 neon = mix(u_c1, u_c2, uv.x) * e * 1.6;
  return vec4(mix(neon, tex(uv).rgb * 0.6 + neon, u_p2), 1.0); }`],
  ['thermal', 'Termal', 'Geser warna', '—', `vec4 effect(vec2 uv) {
  float l = fract(luma(tex(uv).rgb) + u_p1 * 0.5);
  vec3 c = l < 0.25 ? mix(vec3(0, 0, 0.3), vec3(0.5, 0, 0.8), l * 4.0) : l < 0.5 ? mix(vec3(0.5, 0, 0.8), vec3(1, 0.1, 0.2), (l - 0.25) * 4.0) : l < 0.75 ? mix(vec3(1, 0.1, 0.2), vec3(1, 0.8, 0), (l - 0.5) * 4.0) : mix(vec3(1, 0.8, 0), vec3(1), (l - 0.75) * 4.0);
  return vec4(c, 1.0); }`],
  ['kaleido', 'Kaleidoskop', 'Sisi', 'Putar', `vec4 effect(vec2 uv) {
  vec2 p = uv - 0.5; p.x *= u_res.x / u_res.y; float n = 3.0 + floor(u_p1 * 9.0);
  float a = atan(p.y, p.x) + u_time * u_p2; float r = length(p); float s = 6.2832 / n;
  a = mod(a, s); a = abs(a - s * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r; q.x /= u_res.x / u_res.y; return tex(q * (1.0 + u_amt) + 0.5); }`],
  ['wave', 'Gelombang', 'Frekuensi', 'Kecepatan', `vec4 effect(vec2 uv) {
  float f = 4.0 + u_p1 * 30.0; vec2 q = uv + vec2(sin(uv.y * f + u_time * (1.0 + u_p2 * 6.0)), cos(uv.x * f + u_time * (1.0 + u_p2 * 6.0))) * 0.012 * u_amt;
  return tex(q); }`],
  ['ripple', 'Riak air', 'Gelombang', 'Kecepatan', `vec4 effect(vec2 uv) {
  vec2 p = uv - 0.5; p.x *= u_res.x / u_res.y; float d = length(p);
  float w = sin(d * (20.0 + u_p1 * 80.0) - u_time * (2.0 + u_p2 * 10.0)) * 0.01 * u_amt / (1.0 + d * 8.0);
  return tex(uv + normalize(p + 1e-5) * w); }`],
  ['bloom', 'Glow / bloom', 'Ambang', 'Lebar', `vec4 effect(vec2 uv) {
  vec3 c = tex(uv).rgb; vec3 acc = vec3(0.0); float rad = (2.0 + u_p2 * 10.0) / u_res.y;
  for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236; for (int k = 1; k <= 3; k++) {
    vec3 s = tex(uv + vec2(cos(a), sin(a)) * rad * float(k) * 2.0).rgb; acc += max(s - u_p1 * 0.8, 0.0); } }
  return vec4(c + acc / 36.0 * 3.0 * u_amt, 1.0); }`],
  ['sharpen', 'Tajamkan', 'Radius', '—', `vec4 effect(vec2 uv) {
  vec2 px = (1.0 + u_p1 * 2.0) / u_res; vec3 c = tex(uv).rgb;
  vec3 b = (tex(uv + vec2(px.x, 0)).rgb + tex(uv - vec2(px.x, 0)).rgb + tex(uv + vec2(0, px.y)).rgb + tex(uv - vec2(0, px.y)).rgb) * 0.25;
  return vec4(c + (c - b) * u_amt * 3.0, 1.0); }`],
  ['vignette', 'Vignette', 'Lebar', 'Kelembutan', `vec4 effect(vec2 uv) {
  vec2 p = uv - 0.5; p.x *= u_res.x / u_res.y; float v = smoothstep(0.2 + u_p1 * 0.6, 0.2 + u_p1 * 0.6 - 0.1 - u_p2 * 0.5, length(p));
  return vec4(tex(uv).rgb * mix(1.0, v, u_amt), 1.0); }`],
  ['tealorange', 'Teal & orange', 'Kontras', 'Saturasi', `vec4 effect(vec2 uv) {
  vec3 c = tex(uv).rgb; float l = luma(c);
  vec3 g = mix(vec3(0.0, 0.35, 0.45), vec3(1.0, 0.62, 0.32), smoothstep(0.1, 0.9, l));
  c = mix(c, g * (l * 1.6), 0.45 * u_amt); c = (c - 0.5) * (1.0 + u_p1 * 0.6) + 0.5; c = mix(vec3(luma(c)), c, 1.0 + u_p2 * 0.6);
  return vec4(c, 1.0); }`],
  ['sepia', 'Sepia vintage', 'Pudar', 'Goresan', `vec4 effect(vec2 uv) {
  vec3 c = tex(uv).rgb; float l = luma(c); vec3 s = vec3(l * 1.07, l * 0.74, l * 0.43) + 0.05;
  s = mix(s, vec3(0.9, 0.85, 0.75), u_p1 * 0.35);
  float line = step(0.998 - u_p2 * 0.004, rand(vec2(floor(uv.x * 400.0), floor(u_time * 12.0))));
  return vec4(mix(c, s, u_amt) - line * 0.3, 1.0); }`],
  ['invert', 'Negatif', '—', '—', `vec4 effect(vec2 uv) { vec3 c = tex(uv).rgb; return vec4(mix(c, 1.0 - c, u_amt), 1.0); }`],
  ['mirror', 'Cermin', 'Arah', '—', `vec4 effect(vec2 uv) {
  vec2 q = uv; if (u_p1 < 0.5) q.x = q.x > 0.5 ? 1.0 - q.x : q.x; else q.y = q.y > 0.5 ? 1.0 - q.y : q.y; return tex(q); }`],
  ['dither', 'Dither 1-bit', 'Skala', 'Ambang', `vec4 effect(vec2 uv) {
  float s = 1.0 + floor(u_p1 * 6.0); vec2 p = floor(uv * u_res / s);
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  float l = luma(tex((p + 0.5) * s / u_res).rgb) + (u_p2 - 0.5) * 0.5;
  return vec4(mix(u_c1, u_c2, step((m[i] + 0.5) / 16.0, l)), 1.0); }`],
  ['zoomblur', 'Zoom blur', 'Pusat X', 'Pusat Y', `vec4 effect(vec2 uv) {
  vec2 c = vec2(u_p1, u_p2); vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) { float k = 1.0 - float(i) / 24.0 * 0.15 * u_amt; acc += tex(c + (uv - c) * k).rgb; }
  return vec4(acc / 24.0, 1.0); }`],
  ['fisheye', 'Lensa ikan', 'Distorsi', '—', `vec4 effect(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0; float r = length(p); float k = 1.0 + u_amt * (0.3 + u_p1);
  vec2 q = p * pow(r, k - 1.0) / pow(1.0, k - 1.0); q = q * 0.5 + 0.5; return tex(q); }`]
];
const byId = Object.fromEntries(EFFECTS.map((e) => [e[0], e]));
const layerNew = (id) => ({ id, amt: 0.6, p1: 0.5, p2: 0.5, mix: 1, c1: '#1b1b4b', c2: '#ffcc66', code: '' });

/** Ambil kode GLSL effect() dari jawaban model. */
export function extractGLSL(text) {
  const s = String(text || '');
  const m = /```(?:glsl|c|cpp)?\s*([\s\S]*?)```/i.exec(s);
  const code = (m ? m[1] : s).trim();
  if (!/vec4\s+effect\s*\(\s*vec2\s+\w+\s*\)/.test(code)) throw new Error('AI_BAD_JSON');
  return code.replace(/#version[^\n]*\n/g, '').replace(/precision\s+\w+\s+float\s*;/g, '').replace(/uniform\s+[^;]+;/g, '');
}

export async function mount(ctx) {
  const S = persisted('shader', { layers: [layerNew('vhs')], sel: 0, format: preferredVideoFormat(), imgDur: 6 });
  if (!Array.isArray(S.layers) || !S.layers.length) S.layers = [layerNew('vhs')];
  S.layers = S.layers.filter((l) => l.id === 'custom' || byId[l.id]).slice(0, 4);
  if (!S.layers.length) S.layers = [layerNew('vhs')];
  S.sel = Math.min(S.sel | 0, S.layers.length - 1);
  let src = null, recording = false, t0 = performance.now(), playing = true;
  const c = h('canvas');
  const gl = createGL(c);
  const progs = new Map(); // kode → program
  const srcTex = texture(gl, null);
  let tgts = [];
  const errBox = h('div.note.warn.mono.hidden');

  function prog(code) {
    if (progs.has(code)) return progs.get(code);
    const p = program(gl, VS, PRELUDE + code + MAIN);
    progs.set(code, p);
    return p;
  }
  const codeOf = (L) => (L.id === 'custom' ? L.code : byId[L.id][4]);

  function demo() {
    const d = canvas(1280, 720), g = d.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1280, 720); gr.addColorStop(0, '#0f2027'); gr.addColorStop(0.5, '#2c5364'); gr.addColorStop(1, '#f7971e');
    g.fillStyle = gr; g.fillRect(0, 0, 1280, 720);
    for (let i = 0; i < 9; i++) { g.fillStyle = `hsl(${i * 40},80%,60%)`; g.beginPath(); g.arc(160 + i * 120, 360 + Math.sin(i) * 140, 60, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.font = '600 92px "Segoe UI", sans-serif'; g.textAlign = 'center'; g.fillText('FLOW CONNECT', 640, 200);
    return { type: 'image', el: d, w: 1280, h: 720, name: 'Contoh' };
  }
  function size() {
    const w = src.w || 1280, hh = src.h || 720, k = Math.min(1, 1920 / Math.max(w, hh));
    return [Math.round(w * k / 2) * 2, Math.round(hh * k / 2) * 2];
  }
  function render(time) {
    if (!src) return;
    const [W, H] = size();
    if (c.width !== W || c.height !== H || tgts.length !== 2 || tgts[0].w !== W || tgts[0].h !== H) {
      c.width = W; c.height = H;
      tgts.forEach((x) => freeTarget(gl, x)); tgts = [target(gl, W, H), target(gl, W, H)];
    }
    if (src.type === 'video' ? src.el.readyState >= 2 : !srcTex._up) { upload(gl, srcTex, src.el); srcTex._up = true; }
    let input = srcTex;
    const active = S.layers.filter((L) => L.id !== 'custom' || L.code);
    if (!active.length) active.push({ id: 'invert', amt: 0, p1: 0, p2: 0, mix: 0, c1: '#000000', c2: '#ffffff' });
    active.forEach((L, i) => {
      let p;
      try { p = prog(codeOf(L)); } catch (e) { errBox.textContent = (e.detail || errText(e)).slice(0, 600); errBox.classList.remove('hidden'); p = prog(byId.invert[4]); L = { ...L, mix: 0 }; }
      const last = i === active.length - 1;
      const out = last ? null : tgts[i % 2];
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
      gl.viewport(0, 0, W, H);
      gl.useProgram(p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform1i(uni(gl, p, 'u_tex'), 0);
      gl.uniform2f(uni(gl, p, 'u_res'), W, H);
      gl.uniform1f(uni(gl, p, 'u_time'), time);
      gl.uniform1f(uni(gl, p, 'u_amt'), L.amt); gl.uniform1f(uni(gl, p, 'u_p1'), L.p1); gl.uniform1f(uni(gl, p, 'u_p2'), L.p2); gl.uniform1f(uni(gl, p, 'u_mix'), L.mix);
      gl.uniform3fv(uni(gl, p, 'u_c1'), rgb(L.c1).map((v) => v / 255)); gl.uniform3fv(uni(gl, p, 'u_c2'), rgb(L.c2).map((v) => v / 255));
      drawQuad(gl);
      if (out) input = out.tex;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  const loop = () => {
    if (src && !recording && playing) render((performance.now() - t0) / 1000);
    requestAnimationFrame(loop);
  };

  async function setSource(s) {
    if (src && src.type === 'video') { src.el.pause(); }
    src = s; srcTex._up = false;
    if (s.type === 'video') { s.el.muted = true; s.el.loop = true; await seek(s.el, 0); s.el.play().catch(() => {}); }
    ctx.stage.replaceChildren(c);
    build();
  }
  const pick = sourcePicker('media', setSource);
  ctx.onDrop((sel) => pick.load(sel));

  async function aiShader() {
    const desc = textField('Efek seperti apa?', '', () => {}, { rows: 3, placeholder: 'mis. efek mimpi: warna pastel berpendar, sedikit bergelombang pelan, butiran halus' });
    const { dialog } = await import('../core.js');
    const ok = await dialog({ title: 'Buat efek dengan AI', body: h('div.chat', desc, h('div.faint.small', { text: 'AI menulis shader WebGL (GLSL). Hasilnya bisa diatur dengan slider Kekuatan, P1, P2, dan 2 warna.' })), buttons: [{ label: 'Buat efek', value: true, primary: true }, { label: 'Batal', value: false }] });
    if (!ok || !desc.el.value.trim()) return;
    const api = 'Tersedia: uniform sampler2D u_tex; vec2 u_res (piksel); float u_time (detik); float u_amt, u_p1, u_p2 (0..1 dari slider); vec3 u_c1, u_c2 (warna 0..1); fungsi vec4 tex(vec2 uv); float rand(vec2); float noise(vec2); float luma(vec3). Koordinat uv 0..1 (0,0 kiri-bawah).';
    let reply = await ai(`Tulis fungsi GLSL ES 3.00 (WebGL2) bernama \`vec4 effect(vec2 uv)\` untuk efek video: "${desc.el.value.trim()}". ${api}\nJANGAN tulis #version, precision, uniform, atau main(). Hanya fungsi effect (boleh fungsi pembantu di atasnya). Kembalikan dalam satu blok \`\`\`glsl.`);
    let code = extractGLSL(reply);
    try { prog(code); } catch (e) {
      reply = await ai(`Shader GLSL ES 3.00 ini gagal dikompilasi:\n\`\`\`glsl\n${code}\n\`\`\`\nGalat: ${String(e.detail || '').slice(0, 800)}\n${api}\nPerbaiki dan kembalikan HANYA fungsi effect dalam blok \`\`\`glsl.`);
      code = extractGLSL(reply);
      prog(code);
    }
    const L = { ...layerNew('custom'), code, name: desc.el.value.trim().slice(0, 40) };
    if (S.layers.length >= 4) S.layers[S.sel] = L; else { S.layers.push(L); S.sel = S.layers.length - 1; }
    errBox.classList.add('hidden');
    S.$save(); build();
    toast('Efek AI dibuat dan dipasang.', 'ok');
  }

  async function exportPng() { render((performance.now() - t0) / 1000); await io.save(`Efek shader ${stamp()}`, await toBlob(c, 'png'), 'png'); }
  async function exportVideo() {
    if (!src || recording) return;
    recording = true; prog2.classList.remove('hidden');
    try {
      const vid = src.type === 'video' ? src.el : null;
      const audio = [];
      if (vid) {
        vid.pause(); vid.loop = false; vid.muted = false; await seek(vid, 0);
        const ag = ctx._ag || (ctx._ag = audioGraph()); await ag.ac.resume(); ag.fromElement(vid, false); audio.push(ag.track());
      }
      const r = await record(c, {
        duration: vid ? vid.duration : S.imgDur, fps: 30, format: S.format, audio,
        start: async () => { if (vid) await vid.play(); },
        draw: (t) => { render(vid ? vid.currentTime : t); return !(vid && vid.ended); },
        onProgress: (f) => prog2.set(f)
      });
      if (vid) { vid.muted = true; vid.loop = true; vid.play().catch(() => {}); }
      await io.save(`Efek shader ${stamp()}`, r.blob, r.format);
    } catch (e) { toast(errText(e), 'err'); } finally { recording = false; prog2.classList.add('hidden'); }
  }

  function layerControls(L) {
    const up = () => S.$save();
    const e = L.id === 'custom' ? null : byId[L.id];
    const names = e ? [e[2], e[3]] : ['P1', 'P2'];
    return h('div.chat',
      select('Efek', [...EFFECTS.map((x) => [x[0], x[1]]), ['custom', 'Kustom / AI']], L.id, (v) => { Object.assign(L, layerNew(v), { code: v === 'custom' ? (L.code || byId.invert[4]) : '' }); up(); build(); }),
      slider('Kekuatan', { min: 0, max: 100, value: Math.round(L.amt * 100), fmt: (v) => v + '%' }, (v) => { L.amt = v / 100; up(); }),
      names[0] !== '—' ? slider(names[0], { min: 0, max: 100, value: Math.round(L.p1 * 100), fmt: (v) => v + '%' }, (v) => { L.p1 = v / 100; up(); }) : null,
      names[1] !== '—' ? slider(names[1], { min: 0, max: 100, value: Math.round(L.p2 * 100), fmt: (v) => v + '%' }, (v) => { L.p2 = v / 100; up(); }) : null,
      slider('Campur dengan asli', { min: 0, max: 100, value: Math.round(L.mix * 100), fmt: (v) => v + '%' }, (v) => { L.mix = v / 100; up(); }),
      ['duotone', 'edge', 'dither', 'custom'].includes(L.id) ? h('div.row', color('Warna 1', L.c1, (v) => { L.c1 = v; up(); }), color('Warna 2', L.c2, (v) => { L.c2 = v; up(); })) : null,
      L.id === 'custom' ? h('div.chat', textField('Kode GLSL — vec4 effect(vec2 uv)', L.code, (v) => { L.code = v; }, { rows: 9, max: 8000 }),
        button('Terapkan kode', { icon: 'code', cls: 'sm', onClick: () => { try { prog(L.code); errBox.classList.add('hidden'); up(); toast('Kode diterapkan.', 'ok'); } catch (err) { errBox.textContent = (err.detail || errText(err)).slice(0, 600); errBox.classList.remove('hidden'); } } })) : null
    );
  }
  const prog2 = progress(); prog2.classList.add('hidden');
  function build() {
    const L = S.layers[S.sel];
    ctx.side.replaceChildren(
      section('Sumber', 'image', pick, h('div.row', button('Pakai gambar contoh', { icon: 'sparkles', cls: 'sm subtle', onClick: () => setSource(demo()) }))),
      section('Tumpukan efek', 'layers',
        h('div.layers', S.layers.map((x, i) => h('div.layer' + (i === S.sel ? '.on' : ''), { onclick: () => { S.sel = i; S.$save(); build(); } }, ic(x.id === 'custom' ? 'code' : 'sparkles'), h('span.ellipsis.small', { text: `${i + 1}. ${x.id === 'custom' ? (x.name || 'Kustom') : byId[x.id][1]}` }),
          button('', { icon: 'trash-2', cls: 'sm subtle icon danger', title: 'Hapus efek', disabled: S.layers.length < 2, onClick: (ev) => { ev.stopPropagation(); S.layers.splice(i, 1); S.sel = Math.max(0, Math.min(S.sel, S.layers.length - 1)); S.$save(); build(); } })))),
        h('div.row', button('Tambah efek', { icon: 'plus', cls: 'sm', disabled: S.layers.length >= 4, onClick: () => { S.layers.push(layerNew('film')); S.sel = S.layers.length - 1; S.$save(); build(); } }), button('Buat efek (AI)', { icon: 'wand-sparkles', cls: 'sm ai', onClick: aiShader })),
        h('div.faint.small', { text: 'Efek diproses berurutan dari atas ke bawah (maks. 4).' })),
      L ? section(`Efek ${S.sel + 1}`, 'sliders-horizontal', layerControls(L), errBox) : null,
      section('Ekspor', 'download', videoFormatChips(S.format, (v) => { S.format = v; S.$save(); }),
        src && src.type === 'image' ? slider('Durasi video dari gambar', { min: 2, max: 30, value: S.imgDur, fmt: (v) => v + ' dtk' }, (v) => { S.imgDur = v; S.$save(); }) : null,
        h('div.faint.small', { text: 'Video: diproses waktu-nyata, audio asli ikut. Gambar: PNG, atau video agar efek bergerak terekam.' }))
    );
    vidBtn.disabled = pngBtn.disabled = !src;
  }
  const pngBtn = button('Simpan PNG', { icon: 'image-down', cls: 'sm', onClick: exportPng });
  const vidBtn = button('Ekspor video', { icon: 'download', cls: 'primary', onClick: exportVideo });
  const pauseBtn = button('Jeda', { icon: 'pause', cls: 'sm', onClick: () => { playing = !playing; pauseBtn.setText(playing ? 'Jeda' : 'Putar'); if (src && src.type === 'video') { if (playing) src.el.play().catch(() => {}); else src.el.pause(); } } });
  ctx.bar.append(pauseBtn, h('div.grow', prog2), pngBtn, vidBtn);
  ctx.stage.replaceChildren(emptyStage('sparkles', 'Pilih gambar atau video', 'Seret berkas ke sini, atau coba dulu dengan gambar contoh.', button('Pakai gambar contoh', { icon: 'sparkles', cls: 'primary', onClick: () => setSource(demo()) })));
  build();
  requestAnimationFrame(loop);
}
