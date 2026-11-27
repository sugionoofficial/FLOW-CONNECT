// Studio → Alat lokal: pengolahan gambar & video dengan <canvas> (gratis, offline, di PC ini).
// Sumber dimuat sebagai Blob (bytes dari proses utama) → canvas tidak "tercemar" dan bisa diekspor.

export const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
export const RATIO_LIST = ['16:9', '9:16', '1:1', '4:3', '3:4'];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export async function loadBitmap(blob) {
  try { return await createImageBitmap(blob); } catch { throw new Error('IMAGE_DECODE_FAILED'); }
}

/** Canvas → Blob (png/jpg/webp). JPG diberi latar putih agar area transparan tidak jadi hitam. */
export function toBlob(c, format = 'png', quality = 0.9) {
  let src = c;
  if (format === 'jpg') {
    src = canvas(c.width, c.height);
    const g = src.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(c, 0, 0);
  }
  return new Promise((resolve, reject) => src.toBlob((b) => (b ? resolve(b) : reject(new Error('ENCODE_FAILED'))), MIME[format] || 'image/png', quality));
}

/** Potong ke rasio (anchor: 'center' | 'start' | 'end' sepanjang sisi yang dipotong). */
export function cropRatio(bmp, ratio, anchor = 'center') {
  const [rw, rh] = String(ratio).split(':').map(Number);
  const W = bmp.width, H = bmp.height;
  let w = W, h = Math.round(W * rh / rw);
  if (h > H) { h = H; w = Math.round(H * rw / rh); }
  const k = anchor === 'start' ? 0 : anchor === 'end' ? 1 : 0.5;
  const x = Math.round((W - w) * k), y = Math.round((H - h) * k);
  const c = canvas(w, h);
  c.getContext('2d').drawImage(bmp, x, y, w, h, 0, 0, w, h);
  return c;
}

/** Pecah grid n×m → daftar canvas (baris demi baris). */
export function gridSplit(bmp, cols, rows = cols) {
  const out = [];
  const cw = bmp.width / cols, ch = bmp.height / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.round(col * cw), y = Math.round(r * ch);
      const w = Math.round((col + 1) * cw) - x, h = Math.round((r + 1) * ch) - y;
      const c = canvas(w, h);
      c.getContext('2d').drawImage(bmp, x, y, w, h, 0, 0, w, h);
      out.push(c);
    }
  }
  return out;
}

/** Perkecil (bila perlu) agar sisi terpanjang ≤ max px; 0 = ukuran asli. */
export function resizeMax(bmp, max = 0) {
  const k = max > 0 ? Math.min(1, max / Math.max(bmp.width, bmp.height)) : 1;
  const c = canvas(bmp.width * k, bmp.height * k);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** Warna latar perkiraan: rata-rata piksel di 4 sudut. */
function cornerColor(d, W, H) {
  let r = 0, g = 0, b = 0, n = 0;
  const s = Math.max(2, Math.round(Math.min(W, H) * 0.02));
  for (const [x0, y0] of [[0, 0], [W - s, 0], [0, H - s], [W - s, H - s]]) {
    for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) {
      const i = (y * W + x) * 4;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}

/**
 * Hapus latar polos → transparan.
 * @param {ImageBitmap} bmp
 * @param {{mode?:'auto'|'white'|'green', tolerance?:number, edgeOnly?:boolean}} o
 *   tolerance 1–100; edgeOnly = hanya area latar yang tersambung ke tepi gambar (bagian putih di dalam objek aman)
 */
export function removeBackground(bmp, { mode = 'auto', tolerance = 30, edgeOnly = true } = {}) {
  const W = bmp.width, H = bmp.height;
  const c = canvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const key = mode === 'white' ? [255, 255, 255] : mode === 'green' ? [0, 177, 64] : cornerColor(d, W, H);
  const tol = Math.max(1, Math.min(100, tolerance)) * 4.42; // jarak RGB maks ≈ 442
  const hard = tol * 0.55;
  const N = W * H;
  const dist = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    let dd = Math.hypot(d[i] - key[0], d[i + 1] - key[1], d[i + 2] - key[2]);
    // hijau: piksel yang jelas lebih hijau dari merah & biru juga dianggap latar
    if (mode === 'green') { const ex = d[i + 1] - Math.max(d[i], d[i + 2]); if (ex > 40) dd = Math.min(dd, Math.max(0, 120 - ex)); }
    dist[p] = dd;
  }
  const bg = new Uint8Array(N);
  if (edgeOnly) {
    const stack = [];
    const push = (p) => { if (!bg[p] && dist[p] < tol) { bg[p] = 1; stack.push(p); } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop();
      const x = p % W;
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (p >= W) push(p - W);
      if (p < N - W) push(p + W);
    }
  } else for (let p = 0; p < N; p++) bg[p] = dist[p] < tol ? 1 : 0;
  for (let p = 0; p < N; p++) {
    if (!bg[p]) continue;
    const i = p * 4;
    const a = dist[p] <= hard ? 0 : Math.round(255 * (dist[p] - hard) / (tol - hard));
    d[i + 3] = Math.min(d[i + 3], a);
    if (mode === 'green' && a > 0) d[i + 1] = Math.min(d[i + 1], Math.max(d[i], d[i + 2])); // kurangi pantulan hijau di tepi
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Muat video (URL blob) → elemen video siap dibaca. */
export function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    const t = setTimeout(() => reject(new Error('VIDEO_DECODE_FAILED')), 30000);
    v.addEventListener('loadeddata', () => { clearTimeout(t); resolve(v); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(t); reject(new Error('VIDEO_DECODE_FAILED')); }, { once: true });
    v.src = url;
  });
}

/** Ambil frame pada detik t (dibatasi ke durasi video). */
export async function videoFrame(v, t) {
  const dur = Number.isFinite(v.duration) ? v.duration : 0;
  const at = Math.max(0, Math.min(Number(t) || 0, Math.max(0, dur - 0.04)));
  if (Math.abs(v.currentTime - at) > 0.001 || v.readyState < 2) {
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('VIDEO_SEEK_FAILED')), 15000);
      v.addEventListener('seeked', () => { clearTimeout(to); resolve(); }, { once: true });
      v.currentTime = at;
    });
  }
  const c = canvas(v.videoWidth, v.videoHeight);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return { canvas: c, at };
}
