'use strict';
// Studio → Alat (lokal, gratis, offline): baca/simpan berkas untuk alat gambar & video, serta ganti nama massal.
// Pengolahan piksel (potong, grid, konversi, hapus latar, frame video) dikerjakan tampilan dengan <canvas>;
// proses utama hanya membaca berkas yang dipilih pengguna dan menyimpan hasil ke folder unduhan → "Alat".
const fs = require('fs');
const path = require('path');

const VIDEO_EXT = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4' };
const OUT_EXT = { png: '.png', jpg: '.jpg', webp: '.webp' };
const MAX_VIDEO_READ = 600 * 1024 * 1024;
const MAX_IMAGE_READ = 40 * 1024 * 1024;
const MAX_SAVE = 80 * 1024 * 1024;

function checkVideo(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !VIDEO_EXT[path.extname(p).toLowerCase()]) return false;
  try { const st = fs.statSync(p); return st.isFile() && st.size <= MAX_VIDEO_READ; } catch { return false; }
}

/** Tanda tangan berkas sesuai format keluaran (hasil canvas). */
function magicOk(buf, fmt) {
  if (fmt === 'png') return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (fmt === 'jpg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (fmt === 'webp') return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

const cleanBase = (s, n = 80) => String(s ?? '').replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n).trim();

/** Nama berkas unik di folder (nama.ext, nama (2).ext, …). */
function uniquePath(dir, base, ext, taken = new Set()) {
  for (let i = 1; i < 10000; i++) {
    const p = path.join(dir, (i === 1 ? base : `${base} (${i})`) + ext);
    if (!taken.has(p.toLowerCase()) && !fs.existsSync(p)) return p;
  }
  throw new Error('NAME_CONFLICT');
}

/**
 * Simpan hasil alat ke <folder unduhan>/Alat.
 * @param {string} dir  folder tujuan
 * @param {{name:string, data:Uint8Array, format:'png'|'jpg'|'webp'}} o
 */
function saveOutput(dir, o) {
  const fmt = o && OUT_EXT[o.format] ? o.format : null;
  if (!fmt || !o.data || typeof o.data.length !== 'number') throw new Error('INVALID_OUTPUT');
  const buf = Buffer.from(o.data);
  if (!buf.length || buf.length > MAX_SAVE || !magicOk(buf, fmt)) throw new Error('INVALID_OUTPUT');
  fs.mkdirSync(dir, { recursive: true });
  const file = uniquePath(dir, cleanBase(o.name) || 'hasil', OUT_EXT[fmt]);
  fs.writeFileSync(file, buf);
  return file;
}

// ---------- Ganti nama massal (berkas di daftar Unduhan) ----------
const pad = (n, w) => String(n).padStart(w, '0');
const KIND_WORD = (name) => (/\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/i.test(name) ? 'audio' : /\.(mp4|webm|mov|m4v)$/i.test(name) ? 'video' : 'gambar');
const KIND_CAT = { gambar: 'image', video: 'video', audio: 'audio' };

/**
 * Rencana ganti nama. Token pola: {nama} {n} {tanggal} {jam} {akun} {jenis}.
 * @param {object[]} downloads  store.data.downloads
 * @param {{pattern?:string, cat?:string, start?:number}} o
 * @param {(id:string)=>string} accountLabel
 */
function renamePlan(downloads, o = {}, accountLabel = () => '') {
  const pattern = String(o.pattern || '{nama}').slice(0, 120);
  if (!/\{(nama|n)\}/.test(pattern)) throw new Error('RENAME_NEEDS_TOKEN');
  const cat = ['image', 'video', 'audio'].includes(o.cat) ? o.cat : 'all';
  const start = Math.max(0, Math.min(99999, Math.floor(Number(o.start)) || 1));
  const list = (Array.isArray(downloads) ? downloads : [])
    .filter((d) => d && typeof d.path === 'string' && (cat === 'all' || KIND_CAT[KIND_WORD(d.name || d.path)] === cat))
    .filter((d) => { try { return fs.statSync(d.path).isFile(); } catch { return false; } })
    .sort((a, b) => (a.at || 0) - (b.at || 0));
  const w = Math.max(2, String(start + list.length - 1).length);
  const taken = new Set();
  return list.slice(0, 500).map((d, i) => {
    const ext = path.extname(d.path);
    const t = new Date(d.at || Date.now());
    const base = cleanBase(pattern
      .replace(/\{nama\}/g, cleanBase(path.basename(d.path, ext), 60))
      .replace(/\{n\}/g, pad(start + i, w))
      .replace(/\{tanggal\}/g, `${t.getFullYear()}-${pad(t.getMonth() + 1, 2)}-${pad(t.getDate(), 2)}`)
      .replace(/\{jam\}/g, `${pad(t.getHours(), 2)}.${pad(t.getMinutes(), 2)}`)
      .replace(/\{akun\}/g, cleanBase(accountLabel(d.accountId), 30) || 'akun')
      .replace(/\{jenis\}/g, KIND_WORD(d.name || d.path)), 120) || 'berkas';
    const dir = path.dirname(d.path);
    let to = path.join(dir, base + ext);
    if (to.toLowerCase() !== d.path.toLowerCase() && (taken.has(to.toLowerCase()) || fs.existsSync(to))) to = uniquePath(dir, base, ext, taken);
    taken.add(to.toLowerCase());
    return { from: d.path, to, name: path.basename(to) };
  });
}

/** Jalankan rencana; memperbarui path di daftar unduhan. */
function applyRename(downloads, plan) {
  let renamed = 0, skipped = 0;
  for (const p of plan) {
    if (p.from === p.to) { skipped++; continue; }
    try {
      if (p.from.toLowerCase() !== p.to.toLowerCase() && fs.existsSync(p.to)) { skipped++; continue; }
      fs.renameSync(p.from, p.to);
      for (const d of downloads) if (d.path === p.from) { d.path = p.to; d.name = p.name; }
      renamed++;
    } catch { skipped++; }
  }
  return { renamed, skipped };
}

module.exports = { VIDEO_EXT, checkVideo, saveOutput, renamePlan, applyRename, magicOk, MAX_IMAGE_READ };
