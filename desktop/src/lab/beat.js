// Deteksi ketukan offline (tanpa jaringan): spectral flux → tempo (autokorelasi + preferensi ~120 BPM) → fase ketukan.
// Murni perhitungan angka (tanpa DOM) — bisa diuji di Node.

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Sampel mono → selubung onset (spectral flux, dinormalisasi). */
export function onsetEnvelope(samples, sr) {
  // turunkan ke ~11 kHz agar cepat
  const step = Math.max(1, Math.floor(sr / 11025));
  const n = Math.floor(samples.length / step);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < step; k++) s += samples[i * step + k]; x[i] = s / step; }
  const rate0 = sr / step, win = 1024, hop = 256;
  const frames = Math.max(0, Math.floor((n - win) / hop));
  const env = new Float32Array(frames);
  const re = new Float32Array(win), im = new Float32Array(win), prev = new Float32Array(win / 2);
  const hann = new Float32Array(win).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (win - 1)));
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    for (let i = 0; i < win; i++) { re[i] = x[o + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    for (let b = 1; b < win / 2; b++) {
      const m = Math.log1p(100 * Math.hypot(re[b], im[b]));
      const d = m - prev[b];
      if (d > 0) flux += d * (b < 40 ? 1.5 : 1); // bas (kick) sedikit diutamakan
      prev[b] = m;
    }
    env[f] = flux;
  }
  // kurangi rata-rata lokal, potong negatif, normalisasi
  const out = new Float32Array(frames);
  const W = 8;
  let max = 1e-9;
  for (let f = 0; f < frames; f++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, f - W); k <= Math.min(frames - 1, f + W); k++) { s += env[k]; c++; }
    out[f] = Math.max(0, env[f] - s / c);
    if (out[f] > max) max = out[f];
  }
  for (let f = 0; f < frames; f++) out[f] /= max;
  // onset terlihat saat masuk jendela analisis → geser waktu frame (dikalibrasi dengan ketukan sintetis)
  return { env: out, rate: rate0 / hop, delay: win * 0.75 / rate0 };
}

/** Perkiraan tempo (BPM) dari selubung onset. */
export function estimateTempo(env, rate, lo = 60, hi = 190) {
  const minLag = Math.floor(rate * 60 / hi), maxLag = Math.ceil(rate * 60 / lo);
  const ac = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
    ac[lag] = s / (env.length - lag || 1);
  }
  let best = minLag, bestV = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 * rate / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    // ketukan kelipatan (2× lag) ikut menguatkan
    const v = (ac[lag] + 0.5 * (ac[Math.min(maxLag + 1, lag * 2)] || 0)) * prior;
    if (v > bestV) { bestV = v; best = lag; }
  }
  // interpolasi parabola untuk lag pecahan
  const a = ac[best - 1] || 0, b = ac[best], c = ac[best + 1] || 0;
  const den = a - 2 * b + c;
  const lag = best + (den ? 0.5 * (a - c) / den : 0);
  return 60 * rate / lag;
}

/** Fase terbaik untuk tempo tertentu → daftar waktu ketukan (detik) + kekuatannya. */
export function beatGrid(env, rate, bpm, duration) {
  const period = rate * 60 / bpm;
  const at = (pos) => { const i = Math.floor(pos), f = pos - i; return (env[i] || 0) * (1 - f) + (env[i + 1] || 0) * f; };
  let bestOff = 0, bestS = -1;
  const steps = Math.max(8, Math.round(period * 2));
  for (let s = 0; s < steps; s++) {
    const off = s * period / steps;
    let sum = 0;
    for (let p = off; p < env.length; p += period) sum += Math.max(at(p - 1), at(p), at(p + 1));
    if (sum > bestS) { bestS = sum; bestOff = off; }
  }
  const beats = [], strength = [];
  for (let p = bestOff; p / rate < duration; p += period) { beats.push(p / rate); strength.push(at(p)); }
  return { beats, strength, offset: bestOff / rate };
}

/** Analisis lengkap dari sampel mono. */
export function analyze(samples, sr) {
  const { env, rate, delay } = onsetEnvelope(samples, sr);
  const duration = samples.length / sr;
  if (env.length < 16) return { bpm: 120, beats: [], strength: [], offset: 0, env, rate, duration, delay };
  const bpm = estimateTempo(env, rate);
  const g = beatGrid(env, rate, bpm, duration);
  const p = 60 / bpm;
  const offset = (g.offset + delay) % p;
  return { bpm, beats: manualGrid(bpm, offset, duration), strength: g.strength, offset, env, rate, duration, delay };
}

/** Grid ketukan dari BPM & titik awal manual. */
export function manualGrid(bpm, offset, duration) {
  const beats = [];
  const p = 60 / bpm;
  for (let t = ((offset % p) + p) % p; t < duration; t += p) beats.push(t);
  return beats;
}

/** Puncak bentuk gelombang untuk tampilan (n kolom). */
export function peaks(samples, n) {
  const out = new Float32Array(n);
  const per = Math.max(1, Math.floor(samples.length / n));
  for (let i = 0; i < n; i++) { let m = 0; for (let k = i * per; k < Math.min(samples.length, (i + 1) * per); k += 4) { const v = Math.abs(samples[k]); if (v > m) m = v; } out[i] = m; }
  return out;
}

/** Sampel mono dari AudioBuffer. */
export function mono(buf) {
  const n = buf.length, out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}
