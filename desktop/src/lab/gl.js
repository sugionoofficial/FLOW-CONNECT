// WebGL2 bersama: program, tekstur dari gambar/video/canvas, rantai efek (ping-pong FBO), warp perspektif (homografi).

export const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export function createGL(c, opts = {}) {
  const gl = c.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, ...opts });
  if (!gl) throw new Error('WEBGL_UNSUPPORTED');
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl._quad = buf;
  return gl;
}

/** Kompilasi program; galat → Error dengan log (baris shader) di .detail */
export function program(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s) || 'compile error';
      gl.deleteShader(s);
      const e = new Error('SHADER_ERROR'); e.detail = log; throw e;
    }
    return s;
  };
  const p = gl.createProgram();
  const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f);
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const e = new Error('SHADER_ERROR'); e.detail = gl.getProgramInfoLog(p); throw e; }
  p._u = {};
  return p;
}
export function uni(gl, p, name) { if (!(name in p._u)) p._u[name] = gl.getUniformLocation(p, name); return p._u[name]; }

export function drawQuad(gl) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl._quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export function texture(gl, src, { repeat = false, mipmap = false } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  t._mip = mipmap;
  if (src) upload(gl, t, src);
  return t;
}
export function upload(gl, t, src) {
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (t._mip) gl.generateMipmap(gl.TEXTURE_2D);
}

export function target(gl, w, hh) {
  const tex = texture(gl, null);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, hh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h: hh };
}
export function freeTarget(gl, t) { if (!t) return; gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }

// ---------- homografi (4 titik → 4 titik) ----------
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    const p = A[i][i] || 1e-12;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / p;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / (A[i][i] || 1e-12); }
  return x;
}
/** Matriks 3×3 (baris) yang memetakan src[i] → dst[i]. */
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const hh = solve(A, b);
  return [hh[0], hh[1], hh[2], hh[3], hh[4], hh[5], hh[6], hh[7], 1];
}
export function applyH(H, x, y) { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; }

const WARP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex; uniform mat3 u_h; uniform vec2 u_out;
in vec2 v_uv; out vec4 o;
void main() {
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y) * u_out;   // piksel tujuan (y ke bawah)
  vec3 q = u_h * vec3(p, 1.0);
  vec2 uv = q.xy / q.z;                          // 0..1 di sumber (y ke bawah)
  if (q.z <= 0.0 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { o = vec4(0.0); return; }
  o = texture(u_tex, vec2(uv.x, 1.0 - uv.y));
}`;
let warpCtx = null;
/**
 * Lukis sumber ke segi empat bebas (perspektif) — hasil canvas WebGL ukuran outW×outH (transparan di luar).
 * quad: [[x,y] kiri-atas, kanan-atas, kanan-bawah, kiri-bawah] dalam piksel tujuan.
 */
export function warpQuad(src, quad, outW, outH) {
  if (!warpCtx) {
    const c = document.createElement('canvas');
    const gl = createGL(c, { premultipliedAlpha: true });
    warpCtx = { c, gl, p: program(gl, VS, WARP_FS), t: texture(gl, null, { mipmap: true }) };
  }
  const { c, gl, p, t } = warpCtx;
  c.width = Math.max(1, Math.round(outW)); c.height = Math.max(1, Math.round(outH));
  gl.viewport(0, 0, c.width, c.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  upload(gl, t, src);
  // tujuan → sumber (uv 0..1): invers homografi sumber→tujuan
  const H = homography(quad, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  gl.useProgram(p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.uniform1i(uni(gl, p, 'u_tex'), 0);
  // mat3 GLSL kolom-mayor → transpos
  gl.uniformMatrix3fv(uni(gl, p, 'u_h'), false, [H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]]);
  gl.uniform2f(uni(gl, p, 'u_out'), c.width, c.height);
  drawQuad(gl);
  return c;
}

/** Proyeksi titik 3D sederhana untuk kemiringan (rotasi X/Y) bidang w×h di pusat (cx, cy). */
export function tiltQuad(cx, cy, w, hh, rx, ry, rz = 0, persp = 1600) {
  const pts = [[-w / 2, -hh / 2], [w / 2, -hh / 2], [w / 2, hh / 2], [-w / 2, hh / 2]];
  const [sx, cxr] = [Math.sin(rx), Math.cos(rx)], [sy, cyr] = [Math.sin(ry), Math.cos(ry)], [sz, czr] = [Math.sin(rz), Math.cos(rz)];
  return pts.map(([x0, y0]) => {
    let x = x0 * czr - y0 * sz, y = x0 * sz + y0 * czr, z = 0;
    // rotasi X
    let y1 = y * cxr - z * sx, z1 = y * sx + z * cxr; y = y1; z = z1;
    // rotasi Y
    const x1 = x * cyr + z * sy; z1 = -x * sy + z * cyr; x = x1; z = z1;
    const k = persp / (persp + z);
    return [cx + x * k, cy + y * k];
  });
}
