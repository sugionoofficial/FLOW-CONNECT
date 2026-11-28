'use strict';
// Alat Kreatif baru: Cek Metadata (inti port BLEA-AI), Upscale (inti piksel), dan simpan GIF/MOV.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const tools = require('../src/main/tools');

async function esmLab(name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-lab-'));
  fs.copyFileSync(path.join(__dirname, '..', 'src', 'lab', name + '.js'), path.join(tmp, name + '.mjs'));
  return import(pathToFileURL(path.join(tmp, name + '.mjs')).href);
}

// CRC32 untuk membangun PNG sintetis
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function synthPng() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const text = Buffer.from('Software\0ComfyUI workflow', 'latin1');
  const idat = Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('tEXt', text), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}
function synthJpeg() {
  const com = Buffer.from('Made with Google AI', 'latin1');
  const comLen = Buffer.alloc(2); comLen.writeUInt16BE(com.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xfe]), comLen, com, Buffer.from([0xff, 0xd9])]);
}

test('metadata: pindai PNG ber-tEXt ComfyUI lalu hapus lossless', async () => {
  const { scanMediaMetadata, stripMediaMetadata, detectMediaFormat, formatBytesCompact } = await esmLab('metadata-core');
  const png = synthPng();
  assert.strictEqual(detectMediaFormat(png).format, 'png');
  const scan = await scanMediaMetadata(png, { fileName: 'a.png', mimeType: 'image/png' });
  assert.ok(scan.supported && scan.totalEntries >= 1, 'entri tEXt ditemukan');
  assert.ok(scan.aiDetected, 'ComfyUI terdeteksi sebagai penanda AI');
  assert.ok(scan.detectedTools.includes('ComfyUI'), scan.detectedTools.join(','));
  const clean = await stripMediaMetadata(png, { fileName: 'a.png', mimeType: 'image/png' });
  assert.ok(clean.removedCount >= 1, 'entri dihapus');
  assert.strictEqual(clean.after.totalEntries, 0, 'hasil bersih dari metadata');
  assert.strictEqual(clean.after.aiDetected, false);
  assert.ok(clean.cleanedBytes[0] === 0x89 && clean.cleanedBytes[1] === 0x50, 'tanda PNG utuh');
  assert.ok(clean.cleanedSize < clean.originalSize, 'berkas mengecil');
  assert.strictEqual(formatBytesCompact(500), '500 B');
  assert.strictEqual(formatBytesCompact(2048), '2.0 KB');
});

test('metadata: JPEG ber-COM Google AI dibersihkan', async () => {
  const { scanMediaMetadata, stripMediaMetadata } = await esmLab('metadata-core');
  const jpg = synthJpeg();
  const scan = await scanMediaMetadata(jpg, { fileName: 'a.jpg', mimeType: 'image/jpeg' });
  assert.ok(scan.aiDetected, 'Google AI terdeteksi');
  assert.ok(scan.detectedTools.some((t) => t.includes('Google')), scan.detectedTools.join(','));
  const clean = await stripMediaMetadata(jpg, { fileName: 'a.jpg', mimeType: 'image/jpeg' });
  assert.strictEqual(clean.after.totalEntries, 0);
  assert.strictEqual(clean.after.aiDetected, false);
  assert.ok(clean.cleanedBytes[0] === 0xff && clean.cleanedBytes[1] === 0xd8, 'SOI utuh');
  assert.ok(clean.cleanedBytes[clean.cleanedBytes.length - 2] === 0xff, 'EOI utuh');
});

test('metadata: format tak dikenal ditolak dengan ramah', async () => {
  const { scanMediaMetadata } = await esmLab('metadata-core');
  const scan = await scanMediaMetadata(new Uint8Array([1, 2, 3, 4]), { fileName: 'a.bin' });
  assert.strictEqual(scan.supported, false);
  assert.ok(scan.error);
});

test('upscale: denoise meredam noise, unsharp mempertajam tepi', async () => {
  const { boxBlur, denoise, unsharpMask, enhance, upscaleSize } = await esmLab('upscale-core');
  // gambar konstan → blur tidak mengubah
  const flat = new Uint8ClampedArray(4 * 4 * 4).fill(128);
  const b = boxBlur(flat, 4, 4, 2);
  assert.ok(Math.abs(b[0] - 128) < 1e-6, 'blur gambar konstan');
  // noise acak → denoise menurunkan varians
  let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const noisy = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < noisy.length; i += 4) { const v = 100 + (rnd() - 0.5) * 80; noisy[i] = noisy[i + 1] = noisy[i + 2] = v; noisy[i + 3] = 255; }
  const varOf = (d) => { let m = 0; for (let i = 0; i < d.length; i += 4) m += d[i]; m /= d.length / 4; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] - m) ** 2; return s / (d.length / 4); };
  const before = varOf(noisy);
  denoise(noisy, 64, 64, 1);
  assert.ok(varOf(noisy) < before * 0.5, 'varians turun setelah denoise');
  // tepi langkah hitam→putih → unsharp memperlebar rentang nilai di tepi
  const step = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const i = (y * 16 + x) * 4; const v = x < 8 ? 40 : 216; step[i] = step[i + 1] = step[i + 2] = v; step[i + 3] = 255; }
  const edge = (d) => { const row = 8 * 16; return Math.abs(d[(row + 8) * 4] - d[(row + 7) * 4]); };
  const e0 = edge(step);
  unsharpMask(step, 16, 16, 1, 2);
  assert.ok(edge(step) > e0, 'kontras tepi naik setelah unsharp');
  enhance(step, 0.2, 0.2);
  assert.ok(step.every((v) => v >= 0 && v <= 255), 'nilai tetap dalam rentang');
  assert.deepStrictEqual(upscaleSize(100, 50, 4), { w: 400, h: 200, scale: 4 });
  const big = upscaleSize(4000, 3000, 4);
  assert.ok(big.w <= 8192 && big.h <= 8192 && big.w * big.h <= 48_000_000 + 4, `batas aman: ${big.w}x${big.h}`);
});

test('alat: simpan GIF & MOV hasil bersih metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-meta-'));
  const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.from([1, 0, 1, 0, 0, 0, 0, 0x3b])]);
  assert.ok(tools.saveOutput(dir, { name: 'animasi', data: new Uint8Array(gif), format: 'gif' }).endsWith('.gif'));
  const mov = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypqt  ', 'ascii'), Buffer.from([0, 0, 0, 0])]);
  assert.ok(tools.saveOutput(dir, { name: 'klip', data: new Uint8Array(mov), format: 'mov' }).endsWith('.mov'));
  assert.throws(() => tools.saveOutput(dir, { name: 'x', data: new Uint8Array(gif), format: 'mov' }), /INVALID_OUTPUT/, 'magic salah');
  assert.throws(() => tools.saveOutput(dir, { name: 'x', data: new Uint8Array(mov), format: 'gif' }), /INVALID_OUTPUT/, 'magic salah');
});
