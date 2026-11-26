'use strict';
// Membaca balasan `batchexecute` Google Flow (flow.google.com) yang DIAMATI dari lalu lintas tab Flow sendiri.
// Tidak ada permintaan yang dibuat/diulang dari sini — hanya membaca jawaban yang memang diterima halaman.
//
// RPC yang relevan (diukur oleh proyek komunitas gflow-cli pada flow.google.com, 2026):
//   maseQ   unggah media (gambar referensi) → balasan memuat media id baru
//   ogiZ0b  kirim generate GAMBAR — sinkron: balasan datang setelah render & memuat URL hasil, atau penolakan
//   YhhmEf / eb1hJf / MZZa6b / nprQif  kirim generate VIDEO → record [workflow, project, media, _, _, DETAILS]
//   jwpduf  polling status video tiap 5 dtk (DETAILS[8] = [status, [kode, teks]?]) · status 6/2 = berjalan, 3 = selesai
//   Zzl0ze  daftar isi project · as29s  ambil media
// Penolakan: HTTP 200 dengan payload null & slot 5 = [kode gRPC, null, [[ErrorInfo, [ALASAN]]]].

const UPLOAD_RPC = 'maseQ';
const IMAGE_SUBMIT_RPC = 'ogiZ0b';
const VIDEO_SUBMIT_RPCS = ['YhhmEf', 'eb1hJf', 'MZZa6b', 'nprQif'];
const SUBMIT_RPCS = [IMAGE_SUBMIT_RPC, ...VIDEO_SUBMIT_RPCS];
const STATUS_RPCS = ['jwpduf', 'as29s', 'Zzl0ze'];
const STATUS_RUNNING = 2, STATUS_DONE = 3, STATUS_SUBMITTED = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Alasan penolakan → kode galat aplikasi
const REASONS = {
  PUBLIC_ERROR_UNUSUAL_ACTIVITY: 'FLOW_UNUSUAL_ACTIVITY',
  PUBLIC_ERROR_UNSAFE_GENERATION: 'FLOW_CONTENT_POLICY',
  PUBLIC_ERROR_UNSAFE_CONTENT: 'FLOW_CONTENT_POLICY',
  PUBLIC_ERROR_UNSAFE_FACE: 'FLOW_CONTENT_POLICY',
  PUBLIC_ERROR_UNSAFE_IDENTITY: 'FLOW_CONTENT_POLICY'
};

/** rpcids dari URL batchexecute (`?rpcids=a,b`). */
function rpcidsOf(url) {
  try {
    const u = new URL(url);
    if (!/\/batchexecute$/.test(u.pathname)) return [];
    return (u.searchParams.get('rpcids') || '').split(',').filter(Boolean);
  } catch { return []; }
}

/** Semua baris ["wrb.fr", rpcid, payloadJson, …] dalam badan balasan, tanpa didekode. */
function wrbRows(text) {
  if (!text) return [];
  let body = String(text).trimStart();
  if (body.startsWith(")]}'")) body = body.slice(4);
  const rows = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('[')) continue;
    let v;
    try { v = JSON.parse(line); } catch { continue; }
    if (!Array.isArray(v)) continue;
    for (const it of v) if (Array.isArray(it) && it.length >= 3 && it[0] === 'wrb.fr' && typeof it[1] === 'string') rows.push(it);
  }
  return rows;
}

/** [[rpcid, payload]] yang berhasil (payload terdekode). */
function frames(text) {
  const out = [];
  for (const r of wrbRows(text)) {
    if (r[2] == null) continue;
    let p = r[2];
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { /* biarkan string */ } }
    out.push([r[1], p]);
  }
  return out;
}

function strings(n, out = []) {
  if (typeof n === 'string') out.push(n);
  else if (Array.isArray(n)) for (const c of n) strings(c, out);
  return out;
}

/** Amplop galat: {rpcid, code, reasons[]} untuk setiap RPC yang gagal. */
function rpcErrors(text) {
  const out = [];
  for (const r of wrbRows(text)) {
    if (r[2] != null || r.length <= 5 || !Array.isArray(r[5]) || !r[5].length) continue;
    const st = r[5];
    out.push({ rpcid: r[1], code: Number.isInteger(st[0]) ? st[0] : null, reasons: strings(st[2]).filter((s) => !s.startsWith('type.googleapis.com/')) });
  }
  return out;
}

/** Penolakan yang dinyatakan balasan untuk salah satu `rpcids` → {code, reason, text, suspect} | null. */
function refusal(text, rpcids) {
  for (const e of rpcErrors(text)) {
    if (rpcids && !rpcids.includes(e.rpcid)) continue;
    const reason = e.reasons.find((r) => REASONS[r]) || e.reasons[0] || null;
    if (!reason && e.code == null) continue;
    return {
      code: REASONS[reason] || 'FLOW_REFUSED',
      reason, grpc: e.code,
      suspect: reason === 'PUBLIC_ERROR_UNUSUAL_ACTIVITY',
      text: reason ? reason.replace(/^PUBLIC_ERROR_/, '').replace(/_/g, ' ').toLowerCase() : 'gRPC ' + e.code
    };
  }
  return null;
}

function walk(n, fn) {
  if (!Array.isArray(n)) return;
  fn(n);
  for (const c of n) walk(c, fn);
}
const at = (n, ...p) => { let c = n; for (const i of p) { if (!Array.isArray(c) || i >= c.length) return undefined; c = c[i]; } return c; };
const isRecord = (n) => n.length >= 6 && Array.isArray(n[5]) && [0, 1, 2].every((i) => typeof n[i] === 'string' && UUID.test(n[i]));

/** Record generate video: [{workflowId, projectId, mediaId, status, done, running, failed, errorCode, errorText}] */
function generationRecords(payload) {
  const out = [];
  walk(payload, (n) => {
    if (!isRecord(n)) return;
    const cell = at(n, 5, 8);
    const status = Array.isArray(cell) && Number.isInteger(cell[0]) ? cell[0] : null;
    const pair = Array.isArray(cell) ? cell[1] : null;
    const errorCode = Array.isArray(pair) && Number.isInteger(pair[0]) ? pair[0] : null;
    const errorText = Array.isArray(pair) && typeof pair[1] === 'string' ? pair[1] : null;
    const done = status === STATUS_DONE, running = status === STATUS_RUNNING || status === STATUS_SUBMITTED;
    out.push({ workflowId: n[0], projectId: n[1], mediaId: n[2], status, done, running, failed: status !== null && !done && !running, errorCode, errorText });
  });
  return out;
}

/** Gambar hasil ogiZ0b: [{mediaId, workflowId, url}] — tuple media dikenali dari bentuknya, bukan posisi. */
function imageRecords(payload) {
  const out = [];
  walk(payload, (n) => {
    if (n.length < 7 || typeof n[0] !== 'string' || !UUID.test(n[0]) || typeof n[2] !== 'string' || !UUID.test(n[2])) return;
    const det = at(n, 6, 0);
    const url = Array.isArray(det) ? det.find((x) => typeof x === 'string' && /^https:\/\//.test(x)) : null;
    if (url) out.push({ mediaId: n[0], workflowId: n[2], url });
  });
  return out;
}

/** Media id dari balasan unggah maseQ: UUID pertama yang bukan id project. */
function uploadedMediaId(text, projectId) {
  for (const [rid, p] of frames(text)) {
    if (rid !== UPLOAD_RPC) continue;
    for (const s of strings(p)) {
      const m = s.match(UUID_ANY);
      if (!m) continue;
      for (const id of m) if (!projectId || id.toLowerCase() !== String(projectId).toLowerCase()) return id;
    }
  }
  return null;
}

module.exports = {
  UPLOAD_RPC, IMAGE_SUBMIT_RPC, VIDEO_SUBMIT_RPCS, SUBMIT_RPCS, STATUS_RPCS,
  rpcidsOf, wrbRows, frames, rpcErrors, refusal, generationRecords, imageRecords, uploadedMediaId
};
