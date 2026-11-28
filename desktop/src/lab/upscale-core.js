// Inti upscale gambar (offline, tanpa dependensi): denoise + unsharp mask + kontras.
// Beroperasi langsung pada data piksel RGBA (ImageData.data) sehingga bisa diuji di Node.
// Alur alat: canvas menggambar ulang dengan skala 2x/3x/4x (smoothing tinggi),
// lalu denoise → unsharp mask → kontras lembut, hasilnya disimpan sebagai PNG/JPG/WebP.

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Box blur terpisah (horizontal lalu vertikal) dengan jendela geser — O(w*h) per radius. */
export function boxBlur(data, w, h, radius) {
  const r = Math.max(1, Math.min(8, Math.round(radius) || 1));
  const tmp = new Float32Array(w * h * 4);
  const out = new Float32Array(w * h * 4);
  // horizontal
  for (let y = 0; y < h; y++) {
    let sr = 0, sg = 0, sb = 0, sa = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) {
      const i = (row + Math.min(w - 1, Math.max(0, x))) * 4;
      sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; sa += data[i + 3];
    }
    for (let x = 0; x < w; x++) {
      const o = (row + x) * 4;
      const n = 2 * r + 1;
      tmp[o] = sr / n; tmp[o + 1] = sg / n; tmp[o + 2] = sb / n; tmp[o + 3] = sa / n;
      const xa = Math.min(w - 1, Math.max(0, x - r)), xb = Math.min(w - 1, Math.max(0, x + r + 1));
      const ia = (row + xa) * 4, ib = (row + xb) * 4;
      sr += data[ib] - data[ia]; sg += data[ib + 1] - data[ia + 1]; sb += data[ib + 2] - data[ia + 2]; sa += data[ib + 3] - data[ia + 3];
    }
  }
  // vertikal
  for (let x = 0; x < w; x++) {
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let y = -r; y <= r; y++) {
      const i = (Math.min(h - 1, Math.max(0, y)) * w + x) * 4;
      sr += tmp[i]; sg += tmp[i + 1]; sb += tmp[i + 2]; sa += tmp[i + 3];
    }
    for (let y = 0; y < h; y++) {
      const o = (y * w + x) * 4;
      const n = 2 * r + 1;
      out[o] = sr / n; out[o + 1] = sg / n; out[o + 2] = sb / n; out[o + 3] = sa / n;
      const ya = Math.min(h - 1, Math.max(0, y - r)), yb = Math.min(h - 1, Math.max(0, y + r + 1));
      const ia = (ya * w + x) * 4, ib = (yb * w + x) * 4;
      sr += tmp[ib] - tmp[ia]; sg += tmp[ib + 1] - tmp[ia + 1]; sb += tmp[ib + 2] - tmp[ia + 2]; sa += tmp[ib + 3] - tmp[ia + 3];
    }
  }
  return out;
}

/** Denoise: campur piksel dengan versi blur-nya (strength 0..1). */
export function denoise(data, w, h, strength) {
  const s = Math.min(1, Math.max(0, Number(strength) || 0));
  if (s <= 0) return;
  const blur = boxBlur(data, w, h, 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] + (blur[i] - data[i]) * s);
    data[i + 1] = clamp255(data[i + 1] + (blur[i + 1] - data[i + 1]) * s);
    data[i + 2] = clamp255(data[i + 2] + (blur[i + 2] - data[i + 2]) * s);
  }
}

/** Unsharp mask: pertajam tepi (amount 0..2, radius 1..4). */
export function unsharpMask(data, w, h, amount, radius) {
  const a = Math.min(2, Math.max(0, Number(amount) || 0));
  if (a <= 0) return;
  const blur = boxBlur(data, w, h, radius || 2);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] + (data[i] - blur[i]) * a);
    data[i + 1] = clamp255(data[i + 1] + (data[i + 1] - blur[i + 1]) * a);
    data[i + 2] = clamp255(data[i + 2] + (data[i + 2] - blur[i + 2]) * a);
  }
}

/** Kontras & saturasi lembut (contrast 0..1 → faktor 1..1.5, saturasi serupa). */
export function enhance(data, contrast = 0.12, saturation = 0.1) {
  const cf = 1 + Math.min(0.5, Math.max(0, Number(contrast) || 0));
  const sf = 1 + Math.min(0.5, Math.max(0, Number(saturation) || 0));
  for (let i = 0; i < data.length; i += 4) {
    let r = (data[i] - 128) * cf + 128;
    let g = (data[i + 1] - 128) * cf + 128;
    let b = (data[i + 2] - 128) * cf + 128;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    r = lum + (r - lum) * sf; g = lum + (g - lum) * sf; b = lum + (b - lum) * sf;
    data[i] = clamp255(r); data[i + 1] = clamp255(g); data[i + 2] = clamp255(b);
  }
}

/** Ukuran hasil upscale dengan batas keamanan (maks 8192px per sisi, 48 MP). */
export function upscaleSize(w, h, scale) {
  const s = Math.min(4, Math.max(1, Number(scale) || 2));
  let W = Math.round(w * s), H = Math.round(h * s);
  const maxSide = 8192, maxPx = 48_000_000;
  const k = Math.min(1, maxSide / Math.max(W, H), Math.sqrt(maxPx / (W * H)));
  W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
  return { w: W, h: H, scale: k < 1 ? s * k : s };
}
