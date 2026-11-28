// Tampilan FLOW CONNECT Desktop — JavaScript biasa, tanpa framework, tanpa akses Node (lihat preload).
import { icon } from './icons.js';
import { FLOW_TOOLS, LOCAL_TOOLS, BUILTIN_SKILLS, SKILL_ICONS, parseFields, compose, missingFields, aiMode } from './skills.js';
import { RATIO_LIST, loadBitmap, toBlob, cropRatio, gridSplit, resizeMax, removeBackground, loadVideo, videoFrame } from './imagetools.js';

const fc = window.fc;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Tag "@" gambar referensi — algoritme SAMA dengan src/main/refs.js (yang ditampilkan = yang dipakai)
function baseTag(file) {
  const name = String(file).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  let t = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 20).replace(/-+$/, '');
  if (!t) t = 'gambar';
  if (/^[0-9]/.test(t)) t = 'img' + t;
  return t;
}
function refTags(paths) {
  const seen = new Map();
  return paths.map((p) => { const b = baseTag(p); const n = (seen.get(b) || 0) + 1; seen.set(b, n); return n === 1 ? b : b + n; });
}

async function call(channel, ...args) {
  const r = await fc.call(channel, ...args);
  if (!r || !r.ok) {
    const e = new Error((r && r.error) || 'ERROR');
    if (r && r.detail) e.detail = r.detail;
    throw e;
  }
  return r.data;
}

const ERR = {
  BROWSER_NOT_FOUND: 'Google Chrome / Microsoft Edge tidak ditemukan. Instal Chrome, atau pilih file browser di Pengaturan.',
  PROFILE_IN_USE: 'Jendela browser akun ini masih terbuka tanpa kendali aplikasi (misalnya setelah "Masuk ke Google"). Tutup semua jendela browser akun ini, lalu klik Hubungkan lagi.',
  NOT_CONNECTED: 'Akun belum terhubung. Klik Hubungkan.',
  BROWSER_CLOSED: 'Browser akun ini sudah ditutup. Klik Hubungkan untuk membukanya lagi.',
  NOT_SIGNED_IN: 'Akun ini belum masuk ke Google Flow. Klik "Masuk ke Google".',
  PROMPT_BOX_NOT_FOUND: 'Kolom prompt tidak ditemukan. Buka sebuah project di Google Flow.',
  GENERATE_DISABLED: 'Tombol Generate di Google Flow belum aktif (prompt kosong, sedang memproses, atau kuota habis).',
  GENERATE_TIMEOUT: 'Hasil belum muncul dalam batas waktu. Periksa tab Google Flow.',
  INVALID_PROJECT_ID: 'Buka sebuah project di Google Flow terlebih dahulu.',
  AUTO_MODE_DISABLED: 'Mode Otomatis belum diaktifkan.',
  INVALID_IMAGE: 'File gambar tidak valid (PNG/JPG/WEBP/GIF/HEIC, maks. 30 MB).',
  INVALID_FILES: 'Pilih 1–10 gambar.',
  INVALID_PROMPT: 'Prompt kosong atau terlalu panjang.',
  NOTHING_TO_SEND: 'Tambahkan gambar atau tulis prompt terlebih dahulu.',
  MEDIA_NOT_READY: 'Media belum selesai diproses.',
  CDP_TIMEOUT: 'Google Flow tidak merespons. Coba lagi.',
  CDP_CONNECT_FAILED: 'Tidak bisa terhubung ke tab Google Flow.',
  CDP_CLOSED: 'Tab Google Flow tertutup. Klik Hubungkan.',
  RPC_ERROR: 'Google Flow menolak permintaan. Muat ulang tab Flow lalu coba lagi.',
  NO_PAYLOAD: 'Google Flow tidak mengirim data. Muat ulang tab Flow lalu coba lagi.',
  UNKNOWN_ACCOUNT: 'Akun tidak ditemukan.',
  QUEUE_FULL: 'Antrean penuh (maks. 500 tugas).',
  STOPPED: 'Dihentikan.',
  INVALID_URL: 'Alamat tidak diizinkan.',
  LICENSE_REQUIRED: 'Aktifkan lisensi terlebih dahulu.',
  INVALID_KEY: 'Kunci lisensi tidak dikenal. Periksa lagi, atau buat kunci baru di situs FLOW CONNECT.',
  REVOKED: 'Kunci lisensi ini sudah dicabut di situs FLOW CONNECT.',
  EXPIRED: 'Masa berlaku lisensi sudah habis.',
  DEVICE_LIMIT: 'Kunci ini sudah dipakai di jumlah PC maksimum. Lepaskan PC lama di situs (Lisensi → Perangkat), lalu coba lagi.',
  INVALID_DEVICE: 'ID perangkat tidak valid.',
  NETWORK: 'Tidak bisa terhubung ke server lisensi. Periksa koneksi internet.',
  OFFLINE_TOO_LONG: 'Lisensi perlu diverifikasi online (sudah lebih dari 7 hari offline). Sambungkan ke internet.',
  NOT_VERIFIED: 'Lisensi perlu diverifikasi ulang. Sambungkan ke internet.',
  NO_UPDATE: 'Tidak ada pembaruan.',
  NOT_READY: 'Pembaruan belum selesai diunduh.',
  UPDATE_UNSUPPORTED: 'Pembaruan otomatis hanya tersedia di versi installer Windows.',
  FORBIDDEN: 'Tidak diizinkan.',
  BROWSER_LAUNCH_FAILED: 'Browser tidak bisa dijalankan. Periksa pilihan browser di Pengaturan.',
  LOGIN_TIMEOUT: 'Kartu login ditutup karena terlalu lama. Coba lagi.',
  LOGIN_IN_PROGRESS: 'Kartu login untuk akun ini sudah terbuka.',
  QUEUE_RUNNING: 'Hentikan antrean otomatis terlebih dahulu.',
  NEW_PROJECT_NOT_FOUND: 'Tombol "New project" di Google Flow tidak ditemukan. Klik "Lihat Flow" lalu buat project secara manual.',
  GENERATE_NOT_STARTED: 'Flow tidak memulai pembuatan setelah Generate ditekan. Periksa kuota/kredit, lalu coba lagi.',
  FLOW_ERROR: 'Google Flow menolak permintaan ini.',
  UPLOAD_BUTTON_NOT_FOUND: 'Tombol unggah gambar di Google Flow tidak ditemukan. Buka sebuah project di Flow lalu coba lagi.',
  UPLOAD_TERMS: 'Google Flow meminta persetujuan sekali saat pertama kali mengunggah gambar. Klik "Lihat Flow", setujui dialognya, lalu coba lagi.',
  UPLOAD_NOT_SENT: 'Gambar tidak terunggah ke Google Flow (dialog unggah tidak merespons).',
  UPLOAD_TIMEOUT: 'Unggahan gambar ke Google Flow tidak selesai dalam 90 detik. Periksa koneksi lalu coba lagi.',
  UPLOAD_FAILED: 'Google Flow gagal menyimpan gambar referensi.',
  UPLOAD_REJECTED: 'Google Flow menolak gambar referensi (terlalu kecil, format tidak didukung, atau melanggar kebijakan).',
  REFERENCE_NOT_ATTACHED: 'Gambar referensi sudah diunggah tetapi tidak bisa ditandai dengan @ di prompt Flow. Generate dibatalkan agar tidak menghasilkan gambar kosong.',
  REFERENCE_LOST: 'Penanda @ di prompt Flow hilang saat menyusun prompt. Coba lagi.',
  FRAMES_REQUIRED: 'Mode Frame wajib 2 foto: frame awal dan frame akhir.',
  FRAME_SLOT_NOT_FOUND: 'Slot frame awal/akhir tidak ditemukan di Google Flow.',
  FRAME_NOT_ATTACHED: 'Gambar tidak bisa dipasang sebagai frame di Google Flow.',
  GENERATE_FAILED: 'Google Flow gagal membuat hasil.',
  FLOW_UNUSUAL_ACTIVITY: 'Google Flow mendeteksi "aktivitas tidak biasa" dan menolak permintaan. Tunggu beberapa menit, perpanjang jeda antrean, lalu coba lagi.',
  FLOW_CONTENT_POLICY: 'Ditolak filter keamanan Google Flow (prompt atau gambar dianggap melanggar kebijakan). Ubah prompt / gambar lalu coba lagi.',
  FLOW_REFUSED: 'Google Flow menolak permintaan ini.',
  INSUFFICIENT_CREDITS: 'Kredit Google Flow tidak cukup untuk setelan ini. Kurangi jumlah / pilih model lebih murah, atau isi ulang kredit.',
  NO_RESULTS: 'Flow tidak mengembalikan hasil.',
  BULK_RUNNING: 'Bulk Generate sedang berjalan. Tunggu selesai atau hentikan dulu.',
  NO_ACCOUNTS: 'Pilih minimal satu akun Google untuk Bulk Generate.',
  UNKNOWN_COST: 'Biaya kredit model ini belum diketahui — isi "Kredit per video" secara manual.',
  NOT_ENOUGH_CREDITS: 'Kredit akun yang dipilih tidak cukup untuk 1 video pun dengan setelan ini.',
  DOWNLOAD_FAILED: 'Hasil dari alat gagal disimpan.',
  TOOL_LOAD_FAILED: 'Alat Google Flow gagal dimuat.',
  CREDITS_NOT_FOUND: 'Saldo kredit tidak terbaca dari Google Flow. Isi jumlah kredit secara manual, atau buka Flow akun ini lalu coba lagi.',
  NO_CREDITS_LEFT: 'Terlewat — kredit semua akun sudah habis.',
  NO_ACCOUNTS_LEFT: 'Terlewat — tidak ada akun yang masih bisa dipakai.',
  NO_BATCH: 'Belum ada batch Bulk.',
  DAILY_LIMIT: 'Batas chat Asisten Prompt hari ini untuk lisensi Anda sudah tercapai. Coba lagi besok.',
  NO_API_KEY: 'Asisten Prompt belum siap: admin belum memasang kunci API layanan AI.',
  NO_MODEL: 'Belum ada model chat yang diaktifkan admin.',
  PROVIDER_ERROR: 'Layanan AI sedang bermasalah. Coba lagi sebentar lagi.',
  UNSUPPORTED_PROVIDER: 'Model chat yang dipilih admin belum didukung.',
  EMPTY_MESSAGE: 'Tulis pesan terlebih dahulu.',
  INVALID_FILE: 'Berkas tidak bisa dibuka. Pilih ulang berkasnya.',
  UNSUPPORTED_FORMAT: 'Format HEIC belum didukung alat lokal. Ubah ke JPG/PNG terlebih dahulu.',
  FILE_TOO_LARGE: 'Berkas terlalu besar.',
  IMAGE_DECODE_FAILED: 'Gambar tidak bisa dibaca.',
  VIDEO_DECODE_FAILED: 'Video tidak bisa diputar di aplikasi (coba MP4/WebM).',
  VIDEO_SEEK_FAILED: 'Tidak bisa melompat ke detik itu di video.',
  ENCODE_FAILED: 'Gagal menyimpan hasil gambar.',
  INVALID_OUTPUT: 'Hasil alat tidak valid.',
  NAME_CONFLICT: 'Nama berkas bentrok.',
  RENAME_NEEDS_TOKEN: 'Pola nama wajib memuat {nama} atau {n} agar setiap berkas punya nama berbeda.',
  INVALID_SKILL: 'Skill tidak valid: nama dan templat wajib diisi.',
  INVALID_SKILL_FILE: 'Berkas skill tidak valid (harus .json hasil ekspor FLOW CONNECT).',
  TOO_MANY_SKILLS: 'Skill saya sudah penuh (maks. 200).',
  NO_SKILLS: 'Belum ada skill untuk diekspor.'
};
const DETAIL = new Set(['FRAMES_REQUIRED', 'FLOW_ERROR', 'GENERATE_FAILED', 'FLOW_REFUSED', 'UPLOAD_FAILED', 'UPLOAD_REJECTED', 'REFERENCE_NOT_ATTACHED', 'FRAME_NOT_ATTACHED', 'GENERATE_TIMEOUT', 'GENERATE_NOT_STARTED', 'INSUFFICIENT_CREDITS', 'FLOW_CONTENT_POLICY', 'CREDITS_NOT_FOUND']);
const msg = (e) => {
  const k = (e && e.message) || String(e);
  if (ERR[k] && DETAIL.has(k) && e.detail) return `${ERR[k]} (${e.detail})`;
  if (ERR[k]) return ERR[k];
  if (/^HTTP_\d+$/.test(k)) return `Google Flow membalas error ${k.slice(5)}.`;
  return k;
};

// ---------- State ----------
const S = {
  page: 'home',
  studioTab: 'buat', // Studio → Buat · Alat · Skill
  tool: { open: null, src: null, files: [], opts: {}, results: [], urls: [], busy: false, plan: null },
  sk: { group: 'all', q: '', sel: 'b-product', values: {}, edited: null, images: [], over: {}, busy: '', result: null, admin: null, adminError: null, mine: null, model: '' },
  info: null,
  settings: null,
  statuses: {},
  queue: { running: false, activity: '', jobs: [] },
  bulk: { st: { running: false, activity: '', batch: null }, form: null, plan: null, view: '', showAll: false },
  studio: { images: [], previews: {}, prompt: '', busy: '', waitResults: true, log: [], sel: null },
  flowOptions: {},
  login: null,     // { id, state, error } kartu login yang sedang berjalan
  gallery: { key: '', items: [], loading: false, error: null, thumbs: {}, selected: new Set(), busy: new Set() },
  galleryCat: 'all', // Semua · Gambar · Video · Audio
  dlCat: 'all',
  chat: { messages: [], input: '', busy: false, error: null, model: '', mode: '', catalog: null, catalogError: null, scroll: false },
  dlThumbs: {}, // path file unduhan → undefined (belum) · false (memuat) · null (tidak ada) · {url} · {missing}
  busy: new Set(),
  activity: '',
  license: null,
  update: null,
  updateHidden: null,
  gateKey: ''
};
const licensed = () => !!S.license && (S.license.state === 'valid' || S.license.state === 'offline');
const acc = () => (S.settings ? S.settings.accounts.find((a) => a.id === S.settings.activeAccountId) : null);
const accById = (id) => S.settings.accounts.find((a) => a.id === id);
const st = (id) => S.statuses[id] || { connected: false };
const isAuto = () => S.settings && S.settings.mode === 'auto' && !!S.settings.autoAck;
const fmtTime = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (t) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// pengelompokan per tanggal (zona waktu PC)
const dayKey = (t) => { if (!t) return 'none'; const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const longDate = (t) => new Date(t).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function dayLabel(t) {
  if (!t) return { label: 'Tanpa tanggal', sub: '' };
  const now = new Date();
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const k = dayKey(t);
  if (k === dayKey(now.getTime())) return { label: 'Hari ini', sub: longDate(t) };
  if (k === dayKey(y.getTime())) return { label: 'Kemarin', sub: longDate(t) };
  return { label: longDate(t), sub: '' };
}
/** [{key, label, sub, items}] terbaru di atas; yang tanpa tanggal paling bawah. */
function byDay(list, at) {
  const groups = [], idx = {};
  [...list].sort((a, b) => (at(b) || 0) - (at(a) || 0)).forEach((x) => {
    const k = dayKey(at(x));
    if (!(k in idx)) { idx[k] = groups.length; groups.push({ key: k, ...dayLabel(at(x)), items: [] }); }
    groups[idx[k]].items.push(x);
  });
  return groups;
}
const galleryVisible = () => S.gallery.items.filter((i) => S.galleryCat === 'all' || itemCat(i) === S.galleryCat);
const dayHead = (g, unit, extra = '') => `<div class="day-head"><h3>${esc(g.label)}</h3><span class="muted small">${g.sub ? esc(g.sub) + ' · ' : ''}${g.items.length} ${unit}</span><span class="grow"></span>${extra}</div>`;
const VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;
const AUDIO_FILE = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/i;
// kategori hasil: gambar · video · audio (audio disiapkan untuk provider audio yang ditambahkan admin)
const CATS = [['all', 'Semua', 'layout-grid'], ['image', 'Gambar', 'image'], ['video', 'Video', 'video'], ['audio', 'Audio', 'audio-lines']];
const CAT_WORD = { all: 'hasil', image: 'gambar', video: 'video', audio: 'audio' };
const itemCat = (it) => (it.isAudio ? 'audio' : it.isVideo ? 'video' : 'image');
const fileCat = (name) => (AUDIO_FILE.test(name) ? 'audio' : VIDEO_FILE.test(name) ? 'video' : 'image');
function catTabs(act, cur, list, catOf) {
  const n = { all: list.length, image: 0, video: 0, audio: 0 };
  list.forEach((x) => { n[catOf(x)]++; });
  return `<div class="cat-tabs" role="tablist" aria-label="Kategori">${CATS.map(([id, label, ic]) =>
    `<button class="cat-tab ${cur === id ? 'on' : ''}" role="tab" aria-selected="${cur === id}" data-act="${act}" data-cat="${id}">${icon(ic)}<span>${label}</span><span class="count">${n[id]}</span></button>`).join('')}</div>`;
}
const catEmpty = (cat, where) => cat === 'audio'
  ? `<div class="card empty">${icon('audio-lines', 'xl')}<div>Belum ada audio${where}.</div><div class="muted small">Google Flow hanya membuat gambar &amp; video. Hasil audio akan muncul di sini setelah provider audio diaktifkan.</div></div>`
  : `<div class="card empty">${icon(cat === 'video' ? 'video' : cat === 'image' ? 'image' : 'images', 'xl')}<div>Belum ada ${CAT_WORD[cat]}${where}.</div></div>`;
const fileUrl = (p) => {
  const u = String(p).replace(/\\/g, '/').split('/').map((x, i) => (i === 0 && /^[A-Za-z]:$/.test(x) ? x : encodeURIComponent(x))).join('/');
  return u.startsWith('/') ? 'file://' + u : 'file:///' + u;
};
const normText = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------- Katalog setelan Google Flow (nama sesuai label di Flow) ----------
const MODELS = {
  video: [['Omni 1.2 Flash', 'Terbaru · 10 dtk'], ['Omni 1.1 Flash', '10 dtk · dihentikan 5 Des'], ['Veo 3.1 - Lite', 'Paling hemat · 8 dtk'], ['Veo 3.1 - Fast', '8 dtk · dihentikan 5 Des'], ['Veo 3.1 - Quality', 'Kualitas tertinggi · 8 dtk · dihentikan 5 Des']],
  image: [['Nano Banana 2.1', 'Bawaan · tanpa batas (0 kredit)'], ['Nano Banana Pro', 'Detail tinggi'], ['Nano Banana 2 Lite', 'Ringan · cepat']]
};
const DEFAULT_MODEL = { video: 'Omni 1.2 Flash', image: 'Nano Banana 2.1' };
const KIND_RE = { video: /veo|omni/i, image: /nano|banana/i };
// durasi mengikuti model: semua Omni 10 detik, semua Veo 8 detik
const durationFor = (kind, model) => (kind !== 'video' ? 0 : /omni/i.test(model) ? 10 : /veo/i.test(model) ? 8 : 0);
const SUBS = [['frames', 'Frame', 'film', 'Frame ke Video', 'Wajib foto awal & foto akhir'], ['ingredients', 'Bahan', 'layers', 'Bahan ke Video', 'Karakter, objek, gaya']];
const isFrames = (o) => o.kind === 'video' && o.sub === 'frames';
const RATIOS = { video: ['16:9', '9:16'], image: ['16:9', '9:16', '1:1', '4:3', '3:4'] };
const opts = () => S.settings.studio;
function modelList(kind) {
  const a = acc();
  const fo = a && S.flowOptions[a.id];
  const list = MODELS[kind].map(([v, d]) => ({ v, d }));
  if (fo && fo.models) {
    for (const m of fo.models) {
      if (!KIND_RE[kind].test(m)) continue;
      if (!list.some((x) => normText(x.v) === normText(m))) list.push({ v: m, d: 'Dibaca dari Flow' });
    }
  }
  const cur = opts().model;
  if (cur && !list.some((x) => x.v === cur) && KIND_RE[kind].test(cur)) list.push({ v: cur, d: '' });
  return list;
}

// ---------- Komponen kecil ----------
const btn = (act, label, { ic, cls = '', title, data = '', disabled } = {}) =>
  `<button class="btn ${cls}" data-act="${act}" ${data} ${title ? `title="${esc(title)}" aria-label="${esc(title)}"` : ''} ${disabled ? 'disabled' : ''}>${ic ? icon(ic, S.busy.has(act + data) || ic === 'loader-circle' ? 'spin' : '') : ''}${label ? `<span>${label}</span>` : ''}</button>`;
const infobar = (kind, ic, title, text, actions = '') =>
  `<div class="infobar ${kind}">${icon(ic, 'lg')}<div class="text">${title ? `<b>${title}</b>` : ''}${text}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;

function statusInfo(id) {
  const s = st(id);
  if (!s.connected) return { dot: '', badge: '<span class="badge">Tidak terhubung</span>', text: 'Tidak terhubung' };
  if (s.error && !s.signedIn) return { dot: 'warn', badge: '<span class="badge warn">Terhubung · Flow belum siap</span>', text: 'Terhubung · Flow belum siap' };
  if (!s.signedIn) return { dot: 'warn', badge: '<span class="badge warn">Terhubung · Belum masuk</span>', text: 'Terhubung · Belum masuk Google' };
  return { dot: 'ok', badge: '<span class="badge ok">Terhubung</span>', text: 'Terhubung' };
}

function accountPicker() {
  const a = S.settings.accounts;
  if (!a.length) return '';
  return `<div class="account-pick">${icon('users', 'faint')}<select class="input" data-change="pickAccount" aria-label="Akun Google">${a
    .map((x) => `<option value="${x.id}" ${x.id === S.settings.activeAccountId ? 'selected' : ''}>${esc(x.label)}${x.email ? ' — ' + esc(x.email) : ''}</option>`)
    .join('')}</select></div>`;
}

// Peringatan umum bila akun aktif belum siap; null bila siap
function readiness(needProject) {
  const a = acc();
  if (!S.settings.accounts.length) return infobar('', 'info', 'Belum ada akun.', 'Tambahkan akun Google untuk mulai.', btn('addAccount', 'Tambah akun', { ic: 'plus', cls: 'primary' }));
  if (!a) return infobar('', 'info', '', 'Pilih akun di atas.');
  const s = st(a.id);
  if (!s.connected) return infobar('warning', 'plug', 'Akun belum terhubung.', a.signedInAt ? ' Google Flow dibuka di latar belakang — browser tidak tampil.' : ' Masuk lewat kartu login Google dulu (sekali saja).', (a.signedInAt ? '' : btn('login', 'Masuk ke Google', { ic: 'log-in', cls: 'primary', data: `data-id="${a.id}"` })) + btn('connect', 'Hubungkan', { ic: 'plug', cls: a.signedInAt ? 'primary' : '', data: `data-id="${a.id}"` }));
  if (!s.signedIn) return infobar('warning', 'log-in', 'Belum masuk ke Google Flow.', ' Klik "Masuk ke Google": kartu login kecil terbuka, setelah itu semuanya otomatis.', btn('login', 'Masuk ke Google', { ic: 'log-in', cls: 'primary', data: `data-id="${a.id}"` }));
  if (needProject && !s.projectId) return infobar('', 'info', 'Belum ada project terbuka.', ' Buat project baru — aplikasi menekan "New project" di Flow untuk Anda.', btn('newProject', 'Project baru', { ic: 'folder-plus', cls: 'primary', data: `data-id="${a.id}"` }));
  return null;
}

// ---------- Halaman ----------
const NAV = [
  ['home', 'Beranda', 'house'],
  ['accounts', 'Akun Google', 'users'],
  ['studio', 'Studio', 'wand-sparkles'],
  ['assistant', 'Asisten Prompt', 'message-square-text'],
  ['gallery', 'Galeri', 'images'],
  ['auto', 'Otomatis', 'bot'],
  ['downloads', 'Unduhan', 'download']
];

// ---------- Asisten Prompt ----------
const CHAT_KEY = 'fc.chat.v1';
const chatModels = () => (S.chat.catalog || []).filter((m) => m.category === 'chat');
const chatMode = () => S.chat.mode || (S.settings && S.settings.studio && S.settings.studio.kind === 'image' ? 'image' : 'video');
function chatSave() {
  try { localStorage.setItem(CHAT_KEY, JSON.stringify({ messages: S.chat.messages.slice(-40), model: S.chat.model, mode: S.chat.mode })); } catch { /* penyimpanan penuh */ }
}
function chatRestore() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAT_KEY) || 'null');
    if (d && Array.isArray(d.messages)) {
      S.chat.messages = d.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
      S.chat.model = typeof d.model === 'string' ? d.model : '';
      S.chat.mode = d.mode === 'image' || d.mode === 'video' ? d.mode : '';
    }
  } catch { /* abaikan */ }
}
/** Blok ```prompt …``` (atau blok kode tanpa bahasa) dalam jawaban asisten. */
function chatBlocks(text) {
  const parts = [];
  const re = /```([a-z]*)[ \t]*\n?([\s\S]*?)```/gi;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    const lang = m[1].toLowerCase();
    parts.push({ t: lang === '' || lang === 'prompt' || lang === 'text' ? 'prompt' : 'code', v: m[2].trim() });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
}
const chatPrompts = (text) => chatBlocks(String(text || '')).filter((p) => p.t === 'prompt' && p.v).map((p) => p.v);
// teks biasa: aman (esc) + **tebal** + `kode`
const chatInline = (t) => esc(t.replace(/^\n+|\n+$/g, '')).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
function chatBody(text, mi, nextIndex) {
  let bi = 0;
  return chatBlocks(String(text || '')).map((p) => {
    if (p.t === 'text') return p.v.trim() ? `<div class="txt">${chatInline(p.v)}</div>` : '';
    if (p.t === 'code') return `<pre class="code">${esc(p.v)}</pre>`;
    if (!p.v) return '';
    nextIndex();
    const d = `data-m="${mi}" data-b="${bi++}"`;
    return `<div class="pblock"><div class="pblock-h">${icon('wand-sparkles')}<b>Prompt</b><span class="grow"></span>${btn('chatCopy', 'Salin', { ic: 'copy', cls: 'sm subtle', data: d })}${btn('chatUse', 'Pakai di Studio', { ic: 'arrow-right', cls: 'sm primary', data: d })}</div><pre>${esc(p.v)}</pre></div>`;
  }).join('');
}
async function chatCatalog(force) {
  S.chat.catalogLoading = true;
  try {
    S.chat.catalog = await call('assistant:catalog', !!force);
    S.chat.catalogError = null;
    if (force) toast(`Daftar model dimuat ulang · ${chatModels().length} model`, 'ok');
  } catch (e) {
    S.chat.catalogError = e.message;
  }
  S.chat.catalogLoading = false;
  if (S.page === 'assistant') render();
}
async function chatSend(text) {
  const c = S.chat;
  if (c.busy) return;
  const t = String(text ?? c.input).trim();
  if (t) { c.messages.push({ role: 'user', content: t.slice(0, 4000) }); c.input = ''; }
  if (!c.messages.length || c.messages[c.messages.length - 1].role !== 'user') return;
  const models = chatModels();
  const model = (models.find((m) => m.id === c.model) || models.find((m) => m.is_default) || models[0] || {}).id;
  c.busy = true; c.error = null; c.scroll = true;
  chatSave();
  render();
  try {
    const r = await call('assistant:chat', { messages: c.messages, model, mode: chatMode() });
    c.messages.push({ role: 'assistant', content: r.reply });
  } catch (e) {
    c.error = e.message === 'NETWORK' ? 'Tidak bisa terhubung ke server FLOW CONNECT. Periksa koneksi internet.' : msg(e);
  } finally {
    c.busy = false; c.scroll = true;
    chatSave();
    if (S.page === 'assistant') { render(); const i = $('#chat-input'); if (i) i.focus(); }
  }
}
function chatPromptAt(el) {
  const m = S.chat.messages[Number(el.dataset.m)];
  return m ? chatPrompts(m.content)[Number(el.dataset.b)] || '' : '';
}

// ---------- Studio → Buat · Alat · Skill ----------
function studioHead() {
  const a = acc();
  const s = a ? st(a.id) : {};
  const busy = S.studio.busy;
  return `
      <div class="page-head"><h1>Studio</h1><div class="tools">${accountPicker()}
        ${a && s.signedIn ? `<span class="pill" title="${esc(s.projectTitle || '')}">${icon('clapperboard')}<span class="ellipsis">${s.projectId ? esc(s.projectTitle || 'Project') : 'Belum ada project'}</span></span>${btn('newProject', 'Project baru', { ic: S.busy.has('newProject' + `data-id="${a.id}"`) ? 'loader-circle' : 'folder-plus', data: `data-id="${a.id}"`, disabled: !!busy })}` : ''}
        ${a && s.connected ? btn('showFlow', '', { ic: 'app-window', cls: 'icon', title: 'Lihat jendela Google Flow', data: `data-id="${a.id}"` }) : ''}
      </div></div>
      ${runtimePill()}
      ${studioTabs()}`;
}
const STUDIO_TABS = [['buat', 'Buat', 'wand-sparkles'], ['alat', 'Alat', 'sliders-horizontal'], ['skill', 'Skill', 'sparkles'], ['bulk', 'Bulk', 'layers']];
function studioTabs() {
  return `<div class="subtabs" role="tablist" aria-label="Bagian Studio">${STUDIO_TABS.map(([id, label, ic], i) =>
    `<button class="subtab ${S.studioTab === id ? 'on' : ''}" role="tab" aria-selected="${S.studioTab === id}" data-act="studioTab" data-tab="${id}" title="${label} (Alt+${i + 1})">${icon(ic)}<span>${label}</span></button>`).join('')}</div>`;
}
const baseName = (p) => String(p || '').split(/[\\/]/).pop();
const stem = (p) => baseName(p).replace(/\.[^.]+$/, '');

// ----- Bulk Generate (Studio → Bulk) + timer runtime -----
const BULK_MAX = 300;
const BULK_FORM = { prompts: '', count: '', accounts: {}, cost: '', parallel: false, newProject: true, minDelay: '', maxDelay: '', images: [], refMode: 'shared' };
const BULK_REF_MAX = { shared: 10, each: 300 };
const BULK_THUMBS = 48; // thumbnail yang ditampilkan (sisanya diringkas)
const BULK_DELAY = { image: [8, 20], video: [15, 40] };
function bulkForm() {
  if (!S.bulk.form) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('fc.bulk') || '{}') || {}; } catch { /* rusak → bawaan */ }
    S.bulk.form = { ...BULK_FORM, ...saved, accounts: { ...(saved.accounts || {}) } };
    const f = S.bulk.form;
    f.refMode = f.refMode === 'each' ? 'each' : 'shared';
    f.images = Array.isArray(f.images) ? f.images.filter((x) => typeof x === 'string').slice(0, BULK_REF_MAX.each) : [];
    // gambar tersimpan dari sesi sebelumnya → daftarkan ulang (file yang hilang/dipindah dibuang)
    if (f.images.length) {
      const saved0 = f.images;
      call('files:register', saved0, BULK_REF_MAX.each).then((ok) => {
        const okSet = new Set(ok);
        f.images = saved0.filter((x) => okSet.has(x));
        bulkSave(); bulkPreviews(); bulkPlanSoon();
        if (S.page === 'studio' && S.studioTab === 'bulk') render();
      }).catch(() => { f.images = []; });
    }
  }
  return S.bulk.form;
}
const bulkRefMax = () => BULK_REF_MAX[bulkForm().refMode] || 10;
/** Tambah gambar referensi Bulk (mode "sama untuk semua": tanpa duplikat; "satu per prompt": boleh berulang). */
async function bulkAddImages(paths) {
  const f = bulkForm();
  const max = isFrames(opts()) && f.refMode === 'shared' ? 2 : bulkRefMax();
  const list = await call('files:register', paths, BULK_REF_MAX.each);
  if (paths.length && !list.length) { toast(ERR.INVALID_IMAGE, 'err'); return; }
  let cut = 0;
  for (const p of list) {
    if (f.refMode === 'shared' && f.images.includes(p)) continue;
    if (f.images.length >= max) { cut++; continue; }
    f.images.push(p);
  }
  if (cut) toast(max === 2 ? 'Mode Frame (sama untuk semua) hanya memakai 2 foto: awal & akhir.' : `Maksimal ${max} gambar — ${cut} gambar tidak ditambahkan.`, 'err');
  bulkSave(); render(); bulkPlanSoon();
  await bulkPreviews();
}
async function bulkPreviews() {
  const want = bulkForm().images.slice(0, BULK_THUMBS).filter((p) => S.studio.previews[p] === undefined);
  if (!want.length) return;
  for (const p of want) S.studio.previews[p] = (await call('files:preview', p).catch(() => null)) || null;
  if (S.page === 'studio' && S.studioTab === 'bulk' && $('#bulk-drop')) render();
}
/** Petunjuk / galat di bawah judul gambar referensi Bulk (diperbarui juga setelah rencana dihitung ulang). */
function bulkRefHint(o = opts()) {
  const f = bulkForm();
  const each = f.refMode === 'each';
  const frames = isFrames(o);
  const max = each ? BULK_REF_MAX.each : frames ? 2 : BULK_REF_MAX.shared;
  const p = S.bulk.plan;
  const bad = p && p.refError ? msg({ message: p.refError.code, detail: p.refError.detail }) : '';
  const over = f.images.length > max ? `${f.images.length} gambar — mode ini hanya memakai ${max} pertama.` : '';
  const hint = each
    ? frames ? 'Berpasangan: foto 1 + 2 = video 1, foto 3 + 4 = video 2, … (awal & akhir)' : 'Gambar 1 → prompt 1, gambar 2 → prompt 2, … · berulang bila jumlahnya beda'
    : frames ? 'Foto awal & akhir yang sama untuk semua video' : 'Dipakai di semua tugas · klik @tag untuk menyisipkannya ke prompt';
  return { text: bad || over || hint, warn: !!(bad || over) };
}
function bulkRefsHtml(o) {
  const f = bulkForm();
  const each = f.refMode === 'each';
  const frames = isFrames(o);
  const imgs = f.images;
  const max = each ? BULK_REF_MAX.each : frames ? 2 : BULK_REF_MAX.shared;
  const tags = refTags(imgs);
  const h = bulkRefHint(o);
  const label = (i) => each
    ? (frames ? `${Math.floor(i / 2) + 1} ${i % 2 ? 'akhir' : 'awal'}` : `#${i + 1}`)
    : frames ? (i === 0 ? 'Awal' : i === 1 ? 'Akhir' : 'Tidak dipakai') : null;
  const thumb = (x, i) => `<div class="thumb ${i >= max ? 'extra' : ''}" title="${esc(x)}">${S.studio.previews[x] ? `<img src="${S.studio.previews[x]}" alt="">` : icon('file-image', 'lg')}${label(i) !== null
    ? `<span class="tag">${esc(label(i))}</span>`
    : `<button class="reftag" data-act="bulkInsertTag" data-tag="${esc(tags[i])}" title="Sisipkan @${esc(tags[i])} ke prompt">@${esc(tags[i])}</button>`}${btn('bulkRemoveImage', '', { ic: 'x', cls: 'x sm', title: 'Hapus', data: `data-i="${i}"` })}</div>`;
  const more = imgs.length > BULK_THUMBS ? `<div class="thumb more"><b>+${imgs.length - BULK_THUMBS}</b><span class="small">lainnya</span></div>` : '';
  const canAdd = imgs.length < max;
  return `<div class="refs bulk-refs">
    <div class="refs-head"><b>Gambar referensi</b>
      <div class="seg mini" role="tablist" aria-label="Cara memakai gambar referensi">
        <button class="seg-btn ${!each ? 'on' : ''}" data-act="bulkRefMode" data-v="shared" role="tab" aria-selected="${!each}" title="Gambar yang sama untuk semua tugas (maks. ${BULK_REF_MAX.shared})">${icon('copy')}<span>Sama untuk semua</span></button>
        <button class="seg-btn ${each ? 'on' : ''}" data-act="bulkRefMode" data-v="each" role="tab" aria-selected="${each}" title="Satu gambar per prompt (maks. ${BULK_REF_MAX.each})">${icon('list-ordered')}<span>Satu per prompt</span></button>
      </div>
      <span class="right faint small" id="bulk-ref-count">${imgs.length}/${max}</span></div>
    <div class="faint small ${h.warn ? 'warn-text' : ''}" id="bulk-ref-hint">${esc(h.text)}</div>
    <div class="ref-row" id="bulk-drop">
      ${imgs.slice(0, BULK_THUMBS).map(thumb).join('')}${more}
      ${canAdd ? `<button class="thumb add" data-act="bulkPickImages" title="Tambah gambar (atau seret ke sini)">${icon('image-plus', 'lg')}<span class="small">${frames && !each ? (imgs.length ? 'Frame akhir' : 'Frame awal') : 'Tambah'}</span></button>` : ''}
    </div>
    <div class="hrow">${S.studio.images.length ? btn('bulkFromStudio', `Pakai ${S.studio.images.length} gambar dari Buat`, { ic: 'import', cls: 'sm subtle' }) : ''}${imgs.length ? btn('bulkClearImages', 'Hapus semua', { ic: 'trash-2', cls: 'sm subtle' }) : ''}${each ? `<span class="faint small">Urutan mengikuti urutan pilih/seret · nama file dipakai untuk nama hasil.</span>` : ''}</div>
  </div>`;
}
let bulkSaveT = null;
function bulkSave() {
  clearTimeout(bulkSaveT);
  bulkSaveT = setTimeout(() => { try { localStorage.setItem('fc.bulk', JSON.stringify(S.bulk.form)); } catch { /* penuh */ } }, 300);
}
/** mm:ss atau j:mm:ss */
function fmtDur(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  const p = (v) => String(v).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}
/** durasi panjang yang mudah dibaca: "1 j 05 m", "12 m 30 d" */
function fmtDurLong(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h} j ${String(m).padStart(2, '0')} m` : m ? `${m} m ${String(x).padStart(2, '0')} d` : `${x} d`;
}
// elemen [data-since] diperbarui 4×/detik tanpa render ulang halaman (hanya bila teksnya berubah)
const runtimeEl = (since, until, cls = '') => `<span class="runtime ${cls}" data-since="${since}" ${until ? `data-until="${until}"` : ''}>${fmtDur((until || Date.now()) - since)}</span>`;
function tickRuntime() {
  const now = Date.now();
  for (const el of document.querySelectorAll('[data-since]')) {
    if (el.dataset.until) continue;
    const t = fmtDur(now - Number(el.dataset.since));
    if (el.textContent !== t) el.textContent = t;
  }
}
function runtimePill() {
  const b = S.bulk.st.batch;
  const bits = [];
  if (S.studio.busy && S.studio.busyAt) bits.push(`<span class="pill runtime-pill" title="Waktu sejak Generate ditekan">${icon('timer')}<span>${S.studio.busy === 'send' ? 'Mengirim' : 'Generate'}</span>${runtimeEl(S.studio.busyAt)}</span>`);
  if (b && S.bulk.st.running) {
    const fin = b.jobs.filter((j) => j.status !== 'pending' && j.status !== 'running').length;
    bits.push(`<button class="pill runtime-pill on" data-act="studioTab" data-tab="bulk" title="Bulk Generate berjalan — klik untuk melihat">${icon('loader-circle', 'spin')}<span>Bulk ${fin}/${b.jobs.length}</span>${runtimeEl(b.startedAt)}</button>`);
  }
  return bits.length ? `<div class="runtime-row">${bits.join('')}</div>` : '';
}

const bulkAccOn = (a) => { const x = bulkForm().accounts[a.id]; return x && typeof x.on === 'boolean' ? x.on : !!(a.signedInAt || st(a.id).signedIn || (a.credits && a.credits.at)); };
function bulkCredits(a) {
  const x = bulkForm().accounts[a.id];
  if (x && x.credits !== '' && x.credits !== undefined && x.credits !== null && Number.isFinite(Number(x.credits))) return Math.max(0, Math.round(Number(x.credits)));
  return a.credits && Number.isFinite(a.credits.value) ? a.credits.value : null;
}
const sameDay = (t) => new Date(t).toDateString() === new Date().toDateString();
function bulkInput() {
  const f = bulkForm();
  const accounts = S.settings.accounts.filter(bulkAccOn).map((a) => ({ id: a.id, credits: bulkCredits(a) }));
  return {
    prompts: f.prompts.split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, BULK_MAX), count: Number(f.count) || 0, accounts,
    cost: Number(f.cost) || null, parallel: !!f.parallel, newProject: f.newProject !== false,
    minDelay: Number(f.minDelay) || undefined, maxDelay: Number(f.maxDelay) || undefined,
    images: f.images, refMode: f.refMode, tags: f.refMode === 'each' ? null : refTags(f.images), options: opts()
  };
}
let bulkPlanT = null, bulkPlanSeq = 0;
function bulkPlanSoon() {
  clearTimeout(bulkPlanT);
  bulkPlanT = setTimeout(async () => {
    const seq = ++bulkPlanSeq;
    try {
      const p = await call('bulk:plan', bulkInput());
      if (seq !== bulkPlanSeq) return;
      S.bulk.plan = p;
    } catch (e) { S.bulk.plan = { error: msg(e) }; }
    const box = $('#bulk-plan');
    if (box) { box.innerHTML = bulkPlanHtml(); const b = $('#bulk-start'); if (b) b.outerHTML = bulkStartBtn(); }
    const hint = $('#bulk-ref-hint');
    if (hint) { const h = bulkRefHint(); hint.textContent = h.text; hint.classList.toggle('warn-text', h.warn); }
  }, 150);
}
function bulkEstimate(p) {
  const video = p.kind === 'video';
  const gen = video ? 100 : 40; // perkiraan detik per Generate
  const f = bulkForm();
  const [d0, d1] = BULK_DELAY[p.kind];
  const delay = ((Number(f.minDelay) || d0) + (Number(f.maxDelay) || Math.max(d1, Number(f.minDelay) || 0))) / 2;
  const n = Math.max(1, p.accounts.filter((a) => a.planned > 0).length);
  const perAcc = Math.ceil(p.jobs / n);
  const sec = f.parallel ? perAcc * (gen + delay) : Math.max(p.jobs * gen, perAcc * (gen + delay));
  return sec * 1000;
}
const WARN_TEXT = {
  NO_ACCOUNTS: 'Pilih minimal satu akun.',
  UNKNOWN_COST: 'Biaya kredit model ini belum diketahui — isi "Kredit per video".',
  UNKNOWN_CREDITS: 'Ada akun yang kreditnya belum diketahui (dihitung 0). Klik "Baca kredit" atau isi manual.',
  MAX_BULK: `Dibatasi maks. ${BULK_MAX} hasil per batch.`,
  NOT_ENOUGH_CREDITS: 'Kredit tidak cukup untuk jumlah yang diminta — jumlah video disesuaikan dengan kredit.'
};
function bulkPlanHtml() {
  const p = S.bulk.plan;
  if (!p) return `<div class="muted small">${icon('loader-circle', 'spin')} Menghitung rencana…</div>`;
  if (p.error) return infobar('error', 'circle-x', '', esc(p.error));
  const video = p.kind === 'video';
  const accs = S.settings.accounts;
  const name = (id) => esc((accs.find((a) => a.id === id) || {}).label || 'akun');
  const used = p.accounts.filter((a) => a.planned > 0);
  const caps = [...new Set(used.map((a) => a.planned))];
  let head;
  if (!p.target) head = `<b>0 ${video ? 'video' : 'gambar'}</b>`;
  else if (video) head = caps.length === 1 && used.length > 1 ? `<b>${used.length} akun × ${caps[0]} = ${p.target} video</b>` : `<b>${p.target} video</b>`;
  else head = `<b>${p.target} gambar</b> · ${p.jobs}× Generate${p.perJob > 1 ? ` (${p.perJob} per Generate)` : ''}`;
  const sub = video
    ? `${p.cost ? `${p.cost} kredit/video · total ${p.credits} kredit` : ''}${p.capacity > p.target ? ` · kredit cukup untuk ${p.capacity} video` : ''}`
    : `0 kredit (Nano Banana) · dibagi ke ${used.length || 0} akun`;
  const rows = p.accounts.map((a) => `<span class="plan-acc ${a.planned ? '' : 'off'}" title="${video ? `${a.credits === null ? '?' : a.credits} kredit ÷ ${p.cost || '?'} = ${a.capacity} video` : ''}">${name(a.id)} <b>${a.planned}</b>${video ? `<span class="faint">/${a.capacity}</span>` : ''}</span>`).join('');
  const refErr = p.refError ? `<div class="small err-text">${icon('circle-x')} ${esc(msg({ message: p.refError.code, detail: p.refError.detail }))}</div>` : '';
  const each = p.refMode === 'each' && p.groups ? `<div class="faint small">${icon('list-ordered')} ${p.groups} ${p.kind === 'video' && bulkForm().refMode === 'each' && isFrames(opts()) ? 'pasang foto' : 'gambar'} × ${bulkInput().prompts.length || 1} prompt → ${p.units} variasi, dipakai bergiliran</div>` : '';
  const warns = refErr + each + p.warnings.filter((w) => WARN_TEXT[w]).map((w) => `<div class="small warn-text">${icon('triangle-alert')} ${WARN_TEXT[w]}</div>`).join('');
  return `<div class="plan-head">${icon(video ? 'clapperboard' : 'images')}<span>${head}</span></div>
    <div class="muted small">${sub}${p.jobs ? ` · perkiraan ±${fmtDurLong(bulkEstimate(p))}` : ''}</div>
    ${p.accounts.length ? `<div class="plan-accs">${rows}</div>` : ''}${warns}`;
}
function bulkStartBtn() {
  const p = S.bulk.plan;
  const o = opts();
  const refBad = p && p.refError ? msg({ message: p.refError.code, detail: p.refError.detail }) : '';
  const n = p && !p.error ? p.target : 0;
  return btn('bulkStart', n ? `Mulai Bulk · ${n} ${o.kind === 'video' ? 'video' : 'gambar'}` : 'Mulai Bulk', { ic: S.busy.has('bulkStart') ? 'loader-circle' : 'play', cls: 'cta', data: 'id="bulk-start"', disabled: !n || !!refBad || S.bulk.st.running || !isAuto(), title: refBad });
}

function bulkPage() {
  const B = S.bulk;
  const b = B.st.batch;
  const view = B.st.running ? 'run' : B.view || (b ? 'run' : 'form');
  const gate = isAuto() ? '' : infobar('warning', 'bot', 'Bulk Generate butuh Mode Otomatis.', ' Aplikasi akan menekan Generate di Google Flow untuk Anda, satu per satu dengan jeda acak.', btn('enableAuto', 'Aktifkan…', { ic: 'zap', cls: 'sm primary' }));
  return gate + (view === 'run' && b ? bulkRunView(b) : bulkFormView());
}

function bulkFormView() {
  const f = bulkForm();
  const o = opts();
  const video = o.kind === 'video';
  const accs = S.settings.accounts;
  const lines = f.prompts.split(/\r?\n/).filter((x) => x.trim()).length;
  const chip = (k, v, label, ic) => `<button class="chip ${String(o[k]) === String(v) ? 'on' : ''}" data-act="studioOpt" data-k="${k}" data-v="${v}">${ic ? icon(ic) : ''}<span>${label}</span></button>`;
  const dur = durationFor(o.kind, o.model);
  const [d0, d1] = BULK_DELAY[o.kind];
  const accRow = (a) => {
    const s = st(a.id);
    const on = bulkAccOn(a);
    const x = f.accounts[a.id] || {};
    const read = a.credits && a.credits.at ? a.credits : null;
    const stale = read && !sameDay(read.at);
    const k = 'bulkReadCredits' + `data-id="${a.id}"`;
    return `<div class="bulk-acc ${on ? 'on' : ''}">
      <label class="check"><input type="checkbox" data-change="bulkAcc" data-id="${a.id}" ${on ? 'checked' : ''}><span class="dot ${statusInfo(a.id).dot}"></span><span class="ellipsis"><b>${esc(a.label)}</b>${a.email ? `<span class="faint small"> · ${esc(a.email)}</span>` : ''}</span></label>
      ${video ? `<div class="bulk-cred">
        <input class="input num" type="number" min="0" max="1000000" placeholder="${read ? read.value : '?'}" value="${esc(x.credits ?? '')}" data-input="bulkCredit" data-id="${a.id}" aria-label="Kredit ${esc(a.label)}" title="Kosongkan untuk memakai saldo yang terbaca dari Flow">
        <span class="faint small">kredit</span>
        ${btn('bulkReadCredits', '', { ic: S.busy.has(k) ? 'loader-circle' : 'refresh-cw', cls: 'subtle icon sm', title: 'Baca saldo kredit dari Google Flow', data: `data-id="${a.id}"`, disabled: S.busy.has(k) || S.bulk.st.running })}
        <span class="faint small cred-at ${stale ? 'warn-text' : ''}">${read ? `${stale ? 'kemarin/lebih lama' : 'dibaca ' + fmtTime(read.at)}` : s.signedIn || a.signedInAt ? 'belum dibaca' : 'klik ⟳ untuk membaca'}</span>
      </div>` : `<span class="faint small">${s.signedIn ? 'Siap' : a.signedInAt ? 'Disambungkan otomatis' : 'Belum masuk Google'}</span>`}
    </div>`;
  };
  const last = S.bulk.st.batch;
  return `
    <div class="bulk">
      <div class="card bulk-form">
        <div class="card-head">${icon('layers')}<h3>Bulk Generate</h3><span class="muted small grow">Maks. ${BULK_MAX} hasil per batch · ${video ? 'jumlah video mengikuti kredit Flow semua akun' : 'gambar Nano Banana 0 kredit'}</span>${last ? btn('bulkView', 'Batch terakhir', { ic: 'list-video', cls: 'sm subtle', data: 'data-v="run"' }) : ''}</div>
        <div class="seg" role="tablist" aria-label="Jenis hasil">
          <button class="seg-btn ${video ? 'on' : ''}" data-act="studioOpt" data-k="kind" data-v="video" role="tab" aria-selected="${video}">${icon('clapperboard')}<span>Video</span></button>
          <button class="seg-btn ${!video ? 'on' : ''}" data-act="studioOpt" data-k="kind" data-v="image" role="tab" aria-selected="${!video}">${icon('image')}<span>Gambar</span></button>
        </div>
        <div class="opts">
          <div class="opt wide"><span class="opt-l">${icon('cpu')} Model</span><select class="input" data-change="studioModel" aria-label="Model">${modelList(o.kind).map((m) => `<option value="${esc(m.v)}" ${o.model === m.v ? 'selected' : ''}>${esc(m.v)}${m.d ? ' — ' + esc(m.d) : ''}</option>`).join('')}</select></div>
          ${video ? `<div class="opt"><span class="opt-l">${icon('film')} Mode</span><div class="chips">${SUBS.map(([v, l, ic]) => chip('sub', v, l, ic)).join('')}</div></div>` : ''}
          <div class="opt"><span class="opt-l">${icon('ratio')} Rasio</span><div class="chips">${RATIOS[o.kind].map((r) => chip('ratio', r, r)).join('')}</div></div>
          ${video ? `<div class="opt"><span class="opt-l">${icon('timer')} Durasi</span><div class="chips"><span class="chip on">${dur ? dur + ' dtk' : 'Bawaan Flow'}</span><span class="faint small">720p</span></div></div>`
            : `<div class="opt"><span class="opt-l">${icon('hash')} Per Generate</span><div class="chips">${[1, 2, 3, 4].map((n) => chip('count', n, 'x' + n)).join('')}</div></div>`}
          ${video ? `<div class="opt"><span class="opt-l" title="Kredit per video">${icon('gem')} Biaya</span><div class="hrow"><input class="input num" type="number" min="1" max="10000" placeholder="${S.bulk.plan && S.bulk.plan.cost ? S.bulk.plan.cost : '?'}" value="${esc(f.cost)}" data-input="bulkCost" aria-label="Kredit per video"><span class="faint small">kredit/video · kosong = harga Flow 720p</span></div></div>` : ''}
        </div>
        ${bulkRefsHtml(o)}
        <label class="field"><span class="hrow">Prompt <span class="faint small">satu per baris · maks. ${BULK_MAX} · dipakai bergiliran</span><span class="right faint small" id="bulk-lines">${lines} prompt</span></span>
          <textarea id="bulk-prompts" class="input prompt" rows="7" placeholder="${video ? 'Kamera drone di atas sawah terasering saat matahari terbit…\nTimelapse kota Jakarta malam hari, lampu kendaraan…' : 'Foto produk kopi susu gula aren di meja kayu…\nIlustrasi maskot kucing oranye, gaya 3D lucu…'}" data-input="bulkPrompts">${esc(f.prompts)}</textarea></label>
        <div class="hrow">${btn('bulkImport', 'Impor .txt', { ic: 'upload', cls: 'sm subtle' })}<input type="file" id="bulk-file" accept=".txt,.csv,text/plain" hidden data-change="bulkFile">
          <label class="field inline grow-0"><span>Jumlah ${video ? 'video' : 'gambar'}</span><input id="bulk-count" class="input num" type="number" min="1" max="${BULK_MAX}" placeholder="${video ? 'maks. kredit' : 'otomatis'}" value="${esc(f.count)}" data-input="bulkCount"></label>
          <span class="faint small">${video ? 'Kosong = sebanyak kredit semua akun.' : `Kosong = 1 Generate per prompt. Maks. ${BULK_MAX}.`}</span></div>
      </div>
      <div class="bulk-side">
        <div class="card">
          <div class="card-head">${icon('users')}<h3>Akun Google</h3><span class="muted small grow">${video ? 'Kredit dipakai bergiliran' : 'Tugas dibagi rata'}</span>${video && accs.length ? btn('bulkReadAll', 'Baca semua kredit', { ic: S.busy.has('bulkReadAll') ? 'loader-circle' : 'gem', cls: 'sm', disabled: S.busy.has('bulkReadAll') }) : ''}</div>
          ${accs.length ? `<div class="bulk-accs">${accs.map(accRow).join('')}</div>` : `<div class="muted small">Belum ada akun. ${btn('go', 'Tambah akun', { cls: 'sm', data: 'data-page="accounts"' })}</div>`}
          ${video ? '<p class="faint small">Paket gratis Google Flow: 50 kredit/hari/akun. Saldo dibaca dari menu akun Flow (hanya membaca, tidak menekan tombol lain).</p>' : ''}
        </div>
        <div class="card bulk-plan-card">
          <div class="card-head">${icon('chart-pie')}<h3>Rencana</h3></div>
          <div id="bulk-plan">${bulkPlanHtml()}</div>
          <details class="bulk-adv"><summary class="small">Opsi lanjutan</summary>
            <label class="check small"><input type="checkbox" data-change="bulkParallel" ${f.parallel ? 'checked' : ''}> Jalankan semua akun bersamaan (lebih cepat, lebih berat untuk PC)</label>
            <label class="check small"><input type="checkbox" data-change="bulkNewProject" ${f.newProject !== false ? 'checked' : ''}> Project Flow baru untuk batch ini (dan tiap 100 tugas)</label>
            <div class="hrow"><label class="field inline"><span>Jeda min.</span><input class="input num" type="number" min="3" max="600" placeholder="${d0}" value="${esc(f.minDelay)}" data-input="bulkMinDelay"></label>
              <label class="field inline"><span>maks.</span><input class="input num" type="number" min="3" max="1200" placeholder="${d1}" value="${esc(f.maxDelay)}" data-input="bulkMaxDelay"></label><span class="faint small">detik per akun · dilipatgandakan otomatis bila Flow menolak</span></div>
          </details>
          <div class="actionbar cta-bar">${bulkStartBtn()}</div>
          <p class="faint small">${icon('triangle-alert')} Google dapat membatasi akun yang terdeteksi otomatis. Bila Flow mendeteksi "aktivitas tidak biasa", akun itu diistirahatkan dan tugasnya dipindah ke akun lain.</p>
        </div>
      </div>
    </div>`;
}

const JOB_BADGE = { pending: '<span class="badge">Menunggu</span>', running: '<span class="badge accent">Berjalan</span>', done: '<span class="badge ok">Selesai</span>', failed: '<span class="badge err">Gagal</span>', stopped: '<span class="badge warn">Dihentikan</span>', skipped: '<span class="badge warn">Terlewat</span>' };
const ACC_BADGE = { ready: '<span class="badge">Siap</span>', running: '<span class="badge accent">Membuat</span>', waiting: '<span class="badge">Jeda</span>', done: '<span class="badge ok">Selesai</span>', exhausted: '<span class="badge warn">Kredit habis</span>', paused: '<span class="badge warn">Diistirahatkan</span>', error: '<span class="badge err">Dilewati</span>' };
function bulkRunView(b) {
  const B = S.bulk;
  const running = B.st.running;
  const video = b.kind === 'video';
  const count = (st0) => b.jobs.filter((j) => j.status === st0).length;
  const done = count('done'), failed = count('failed'), skipped = count('skipped'), stopped = count('stopped'), pending = count('pending') + count('running');
  const fin = b.jobs.length - pending;
  const items = b.jobs.filter((j) => j.status === 'done').reduce((s, j) => s + (j.results.length || j.count), 0);
  const elapsed = (b.finishedAt || Date.now()) - b.startedAt;
  const eta = running && fin && pending ? (elapsed / fin) * pending : 0;
  const avg = done ? b.jobs.filter((j) => j.status === 'done' && j.finishedAt && j.startedAt).reduce((s, j) => s + (j.finishedAt - j.startedAt), 0) / done : 0;
  const status = running ? `<span class="badge accent">${icon('loader-circle', 'spin')} Berjalan</span>` : b.stopped ? '<span class="badge warn">Dihentikan</span>' : '<span class="badge ok">Selesai</span>';
  const pct = b.jobs.length ? Math.round((fin / b.jobs.length) * 100) : 0;
  const accName = (id) => esc((b.accounts.find((a) => a.id === id) || {}).label || '—');
  const list = B.showAll ? b.jobs : b.jobs.slice(0, 60);
  const resumable = !running && (failed + skipped + stopped) > 0;
  const firstFile = b.jobs.find((j) => j.results.length && /[\\/]/.test(j.results[0]));
  return `
    <div class="card bulk-run">
      <div class="bulk-run-head">
        <div class="bulk-title">${icon('layers', 'lg')}<div><h3>Bulk ${video ? 'video' : 'gambar'} ${status}</h3>
          <div class="muted small">${esc(b.model)}${b.duration ? ` · ${b.duration} dtk` : ''} · ${esc(b.options.ratio)}${video ? ` · ${b.cost} kredit/video` : b.perJob > 1 ? ` · ${b.perJob} per Generate` : ''} · ${b.accounts.length} akun · ${b.parallel ? 'bersamaan' : 'bergiliran'} · mulai ${fmtTime(b.startedAt)}</div></div></div>
        <div class="bulk-clock" title="${running ? 'Waktu berjalan sejak Bulk dimulai' : 'Total durasi batch'}">${icon('timer')}<div><div class="faint small">${running ? 'Runtime' : 'Total durasi'}</div>${runtimeEl(b.startedAt, running ? null : b.finishedAt, 'big')}</div></div>
      </div>
      <div class="progress bulk-progress"><i data-w="${pct}"></i></div>
      <div class="bulk-stats">
        <div><b>${items}</b><span class="faint small">/${b.target} ${video ? 'video' : 'gambar'}</span></div>
        <div><b>${fin}</b><span class="faint small">/${b.jobs.length} tugas</span></div>
        ${failed ? `<div><b class="err-text">${failed}</b><span class="faint small"> gagal</span></div>` : ''}
        ${skipped ? `<div><b class="warn-text">${skipped}</b><span class="faint small"> terlewat</span></div>` : ''}
        ${avg ? `<div><b>${fmtDur(avg)}</b><span class="faint small"> rata-rata/tugas</span></div>` : ''}
        ${eta ? `<div><b>±${fmtDurLong(eta)}</b><span class="faint small"> lagi</span></div>` : ''}
        ${video ? `<div><b>${b.accounts.reduce((s, a) => s + (a.used || 0), 0)}</b><span class="faint small"> kredit terpakai</span></div>` : ''}
      </div>
      ${running || B.st.activity ? `<div class="activity">${running ? icon('loader-circle', 'spin') : icon('info')}<span id="bulk-act">${esc(B.st.activity)}</span></div>` : ''}
      <div class="actionbar">
        ${running ? btn('bulkStop', 'Hentikan', { ic: 'square' }) : ''}
        ${resumable ? btn('bulkResume', `Lanjutkan sisa (${failed + skipped + stopped})`, { ic: 'rotate-ccw', cls: 'primary', disabled: !isAuto() }) : ''}
        ${!running ? btn('bulkView', 'Batch baru', { ic: 'plus', cls: resumable ? '' : 'primary', data: 'data-v="form"' }) : ''}
        ${firstFile ? btn('showFile', 'Buka folder hasil', { ic: 'folder-open', cls: 'subtle', data: `data-path="${esc(firstFile.results[0])}"` }) : ''}
        ${!running ? btn('bulkClear', 'Hapus riwayat batch', { ic: 'trash-2', cls: 'subtle' }) : ''}
      </div>
    </div>
    <table class="table bulk-accs-t"><thead><tr><th>Akun</th><th>Status</th><th>Selesai</th>${video ? '<th>Kredit</th>' : ''}<th>Catatan</th></tr></thead><tbody>
      ${b.accounts.map((a) => `<tr><td class="ellipsis"><b>${esc(a.label)}</b></td><td>${ACC_BADGE[a.status] || esc(a.status)}</td>
        <td>${a.done}${a.planned ? `<span class="faint">/${a.planned}</span>` : ''}${a.failed ? ` <span class="err-text small">· ${a.failed} gagal</span>` : ''}</td>
        ${video ? `<td>${a.credits === null ? '—' : a.credits}<span class="faint small">${a.startCredits !== null && a.startCredits !== undefined ? ` dari ${a.startCredits}` : ''}</span></td>` : ''}
        <td class="small muted">${a.note ? esc(ERR[a.note] || a.note) : ''}</td></tr>`).join('')}
    </tbody></table>
    <table class="table bulk-jobs"><thead><tr><th class="num">#</th><th>Prompt</th><th>Akun</th><th>Status</th><th>Durasi</th><th>Hasil</th></tr></thead><tbody>
      ${list.map((j) => `<tr>
        <td class="num">${j.n}</td>
        <td class="prompt"><div class="ellipsis" title="${esc(b.prompts[j.p])}">${esc(b.prompts[j.p] || '(tanpa prompt)')}</div>${j.error && j.status !== 'pending' ? `<div class="small err-text">${esc(msg({ message: j.error, detail: j.detail }))}</div>` : ''}</td>
        <td class="ellipsis">${j.accountId ? accName(j.accountId) : '—'}</td>
        <td>${JOB_BADGE[j.status] || esc(j.status)}</td>
        <td class="small">${j.status === 'running' && j.startedAt ? runtimeEl(j.startedAt) : j.finishedAt && j.startedAt ? fmtDur(j.finishedAt - j.startedAt) : '—'}</td>
        <td>${j.status === 'done' ? (j.results.length && /[\\/]/.test(j.results[0]) ? btn('openFile', `${j.results.length} file`, { ic: 'folder-open', cls: 'sm subtle', data: `data-path="${esc(j.results[0])}"` }) : `${j.results.length || j.count} hasil`) : '—'}</td>
      </tr>`).join('')}
    </tbody></table>
    ${b.jobs.length > 60 ? `<div class="actionbar center">${btn('bulkShowAll', B.showAll ? 'Tampilkan 60 pertama' : `Tampilkan semua ${b.jobs.length} tugas`, { cls: 'sm subtle' })}</div>` : ''}`;
}

// ----- Alat -----
function alatPage() {
  const a = acc();
  const s = a ? st(a.id) : {};
  const T = S.tool;
  const flowReady = a && s.connected && s.signedIn;
  return `
    <div class="sec-head"><h2>${icon('layers')} Alat otomatis</h2><span class="badge accent">Mode Otomatis</span><span class="muted small grow">Banyak hasil sekaligus, lintas akun Google.</span></div>
    <div class="tool-grid"><button class="tool-card bulk-card" data-act="studioTab" data-tab="bulk">
      <span class="tool-ic">${icon('layers', 'lg')}</span><span class="tool-t"><b>Bulk Generate</b><span class="muted small">Sampai ${BULK_MAX} gambar per batch. Video mengikuti kredit Flow tiap akun — dipakai bergiliran dari semua akun (mis. 5 akun × 3 = 15 video Omni 1.1 Flash).</span></span>
      ${S.bulk.st.running ? `<span class="badge accent">${icon('loader-circle', 'spin')} Berjalan</span>` : icon('chevron-right', 'faint')}</button></div>
    <div class="sec-head"><h2>${icon('zap')} Alat lokal</h2><span class="badge ok">Gratis · offline</span><span class="muted small grow">Diproses di PC ini — hasil disimpan ke folder Unduhan → Alat.</span></div>
    <div class="tool-grid">${LOCAL_TOOLS.map((t) => `<button class="tool-card ${T.open === t.id ? 'on' : ''}" data-act="toolOpen" data-id="${t.id}" aria-pressed="${T.open === t.id}">
      <span class="tool-ic">${icon(t.icon, 'lg')}</span><span class="tool-t"><b>${t.name}</b><span class="muted small">${t.desc}</span></span></button>`).join('')}</div>
    ${T.open ? toolPanel() : ''}
    <div class="sec-head"><h2>${icon('app-window')} Alat Google Flow</h2><span class="muted small grow">Dibuka di jendela aplikasi memakai akun aktif — browser Google Flow tetap tersembunyi. Hasil ekspor tersimpan di Unduhan → Alat.</span></div>
    ${flowReady ? '' : readiness(false) || ''}
    <div class="tool-grid">${FLOW_TOOLS.map((t) => `<div class="tool-card flow">
      <span class="tool-ic">${icon(t.icon, 'lg')}</span>
      <span class="tool-t"><b>${esc(t.name)}</b><span class="muted small">${esc(t.desc)}</span><span class="faint small">oleh ${esc(t.author)}</span></span>
      ${btn('flowTool', 'Buka', { ic: S.busy.has('flowTool' + `data-id="${t.id}"`) ? 'loader-circle' : 'app-window', cls: 'sm', data: `data-id="${t.id}"`, disabled: !a, title: `Buka ${t.name} di jendela aplikasi` })}
    </div>`).join('')}</div>`;
}

const TOOL_KIND = { frame: 'video', convert: 'images', rename: null };
function toolPanel() {
  const T = S.tool;
  const t = LOCAL_TOOLS.find((x) => x.id === T.open);
  const o = T.opts;
  const kind = TOOL_KIND[t.id] === undefined ? 'image' : TOOL_KIND[t.id];
  const chip = (k, v, label) => `<button class="chip ${String(o[k]) === String(v) ? 'on' : ''}" data-act="toolOpt" data-k="${k}" data-v="${v}">${label}</button>`;
  const src = T.src;
  const srcBox = kind === null ? '' : kind === 'images'
    ? `<div class="tool-src" id="tool-drop">${T.files.length
      ? `<div class="tool-files">${T.files.map((f, i) => `<div class="tf">${icon('file-image')}<span class="ellipsis">${esc(f.name)}</span>${btn('toolFileRemove', '', { ic: 'x', cls: 'subtle icon sm', title: 'Hapus', data: `data-i="${i}"` })}</div>`).join('')}</div>`
      : `<div class="tool-empty">${icon('images', 'xl')}<div class="muted small">Pilih atau seret gambar ke sini (bisa banyak sekaligus).</div></div>`}
      <div class="hrow">${btn('toolPick', T.files.length ? 'Tambah gambar…' : 'Pilih gambar…', { ic: 'folder-open', cls: T.files.length ? 'sm' : 'sm primary' })}${T.files.length ? btn('toolClear', 'Kosongkan', { cls: 'sm subtle' }) : ''}</div></div>`
    : `<div class="tool-src" id="tool-drop">${src
      ? (src.kind === 'video'
        ? `<video id="tool-video" class="tool-media" src="${esc(src.url)}" controls muted playsinline preload="auto"></video>`
        : `<img class="tool-media ${t.id === 'bg' ? 'checker' : ''}" src="${esc(src.url)}" alt="">`)
      : `<div class="tool-empty">${icon(kind === 'video' ? 'video' : 'image', 'xl')}<div class="muted small">Pilih atau seret ${kind === 'video' ? 'video (MP4/WebM/MOV)' : 'gambar'} ke sini.</div></div>`}
      <div class="hrow">${btn('toolPick', src ? 'Ganti…' : (kind === 'video' ? 'Pilih video…' : 'Pilih gambar…'), { ic: 'folder-open', cls: src ? 'sm' : 'sm primary' })}${src ? `<span class="faint small ellipsis">${esc(src.name)}${src.w ? ` · ${src.w}×${src.h}` : ''}${src.dur ? ` · ${src.dur.toFixed(1)} dtk` : ''}</span>` : ''}</div></div>`;
  let opts = '', run = '';
  if (t.id === 'frame') {
    opts = `<div class="opt"><span class="opt-l">${icon('timer')} Ambil frame</span><div class="chips">${chip('at', 'start', 'Awal')}${chip('at', 'end', 'Akhir')}${chip('at', 'now', 'Posisi pemutar')}${chip('at', 'sec', 'Detik ke-')}</div></div>
      ${o.at === 'sec' ? `<label class="field inline"><span>Detik</span><input id="tool-sec" class="input num" type="number" min="0" step="0.1" value="${esc(o.sec)}" data-input="toolSec"></label>` : ''}
      <p class="faint small">Tip: frame <b>akhir</b> video sebelumnya → <b>frame awal</b> video berikutnya agar adegan menyambung.</p>`;
    run = 'Ambil frame';
  } else if (t.id === 'crop') {
    opts = `<div class="opt"><span class="opt-l">${icon('ratio')} Rasio</span><div class="chips">${RATIO_LIST.map((r) => chip('ratio', r, r)).join('')}</div></div>
      <div class="opt"><span class="opt-l">${icon('crop')} Posisi potong</span><div class="chips">${chip('anchor', 'start', 'Atas / kiri')}${chip('anchor', 'center', 'Tengah')}${chip('anchor', 'end', 'Bawah / kanan')}</div></div>`;
    run = 'Potong';
  } else if (t.id === 'grid') {
    opts = `<div class="opt"><span class="opt-l">${icon('grid-2x2')} Grid</span><div class="chips">${chip('grid', '2', '2 × 2')}${chip('grid', '3', '3 × 3')}${chip('grid', '2x1', '2 kolom')}${chip('grid', '1x2', '2 baris')}</div></div>`;
    run = 'Pecah grid';
  } else if (t.id === 'convert') {
    opts = `<div class="opt"><span class="opt-l">${icon('file-output')} Format</span><div class="chips">${chip('format', 'png', 'PNG')}${chip('format', 'jpg', 'JPG')}${chip('format', 'webp', 'WebP')}</div></div>
      ${o.format !== 'png' ? `<label class="field inline"><span>Kualitas <b id="tool-q">${o.quality}</b>%</span><input class="range" type="range" min="40" max="100" step="1" value="${o.quality}" data-input="toolQuality" aria-label="Kualitas"></label>` : ''}
      <div class="opt"><span class="opt-l">${icon('maximize-2')} Ukuran maks.</span><div class="chips">${chip('max', '0', 'Asli')}${chip('max', '2048', '2048 px')}${chip('max', '1080', '1080 px')}${chip('max', '720', '720 px')}</div></div>`;
    run = T.files.length > 1 ? `Konversi ${T.files.length} gambar` : 'Konversi';
  } else if (t.id === 'bg') {
    opts = `<div class="opt"><span class="opt-l">${icon('pipette')} Warna latar</span><div class="chips">${chip('mode', 'auto', 'Otomatis')}${chip('mode', 'white', 'Putih')}${chip('mode', 'green', 'Hijau (green screen)')}</div></div>
      <label class="field inline"><span>Toleransi <b id="tool-tol">${o.tol}</b></span><input class="range" type="range" min="5" max="80" step="1" value="${o.tol}" data-input="toolTol" aria-label="Toleransi"></label>
      <label class="check small"><input type="checkbox" data-change="toolEdge" ${o.edgeOnly ? 'checked' : ''}> Hanya latar yang tersambung ke tepi (bagian putih di dalam objek aman)</label>
      <p class="faint small">Cocok untuk latar polos. Untuk latar rumit gunakan alat Google Flow / Editor Gambar.</p>`;
    run = 'Hapus latar';
  } else if (t.id === 'rename') {
    const n = (S.settings.downloads || []).length;
    opts = `<label class="field"><span>Pola nama</span><input id="tool-pattern" class="input" maxlength="120" value="${esc(o.pattern)}" data-input="toolPattern" placeholder="{tanggal} {nama}"></label>
      <div class="faint small">Token: <code>{nama}</code> nama lama · <code>{n}</code> nomor urut · <code>{tanggal}</code> · <code>{jam}</code> · <code>{akun}</code> · <code>{jenis}</code></div>
      <div class="opt-row">
        <label class="field inline"><span>Jenis</span><select class="input" data-change="toolRenameCat">${[['all', 'Semua'], ['image', 'Gambar'], ['video', 'Video'], ['audio', 'Audio']].map(([v, l]) => `<option value="${v}" ${o.cat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field inline"><span>Mulai dari</span><input id="tool-start" class="input num" type="number" min="0" max="99999" value="${esc(o.start)}" data-input="toolStart"></label>
      </div>
      ${T.plan ? `<div class="rename-plan"><div class="faint small">${T.plan.filter((p) => p.from !== p.to).length} dari ${T.plan.length} berkas akan berganti nama${T.plan.length > 60 ? ' (60 pertama ditampilkan)' : ''}</div>
        <ul>${T.plan.slice(0, 60).map((p) => `<li class="${p.from === p.to ? 'same' : ''}"><span class="ellipsis">${esc(baseName(p.from))}</span>${icon('arrow-right')}<b class="ellipsis">${esc(p.name)}</b></li>`).join('')}</ul></div>` : ''}`;
    return `<div class="card tool-panel" id="tool-panel">
      <div class="card-head">${icon(t.icon)}<h3>${t.name}</h3><span class="muted small grow">${n} berkas di daftar Unduhan</span>${btn('toolClose', '', { ic: 'x', cls: 'subtle icon sm', title: 'Tutup' })}</div>
      <div class="tool-opts">${opts}</div>
      <div class="actionbar">${btn('toolRenamePlan', 'Pratinjau', { ic: S.busy.has('toolRenamePlan') ? 'loader-circle' : 'eye', disabled: !n })}${btn('toolRename', T.plan ? `Ganti nama ${T.plan.filter((p) => p.from !== p.to).length} berkas` : 'Ganti nama', { ic: S.busy.has('toolRename') ? 'loader-circle' : 'text-cursor-input', cls: 'primary', disabled: !T.plan || !T.plan.some((p) => p.from !== p.to) })}</div>
    </div>`;
  }
  const canRun = kind === 'images' ? T.files.length > 0 : !!src;
  return `<div class="card tool-panel" id="tool-panel">
    <div class="card-head">${icon(t.icon)}<h3>${t.name}</h3><span class="muted small grow">${t.desc}</span>${btn('toolClose', '', { ic: 'x', cls: 'subtle icon sm', title: 'Tutup' })}</div>
    <div class="tool-body">
      ${srcBox}
      <div class="tool-opts">${opts}
        <div class="actionbar">${btn('toolRun', T.busy ? 'Memproses…' : run, { ic: T.busy ? 'loader-circle' : 'sparkles', cls: 'primary', disabled: !canRun || T.busy })}${T.results.length ? btn('openToolsFolder', 'Buka folder Alat', { ic: 'folder-open', cls: 'subtle' }) : ''}</div>
      </div>
    </div>
    ${T.results.length ? `<div class="tool-results">${T.results.map((r, i) => `<div class="tres">
      <div class="tres-img ${r.alpha ? 'checker' : ''}"><img src="${esc(r.url)}" alt=""></div>
      <div class="tres-t"><span class="small ellipsis" title="${esc(r.path)}">${esc(baseName(r.path))}</span><span class="faint small">${r.w}×${r.h}</span></div>
      <div class="tres-a">
        ${t.id === 'frame' ? btn('toolUse', 'Frame awal', { cls: 'sm', data: `data-i="${i}" data-slot="0"`, title: 'Jadikan foto awal mode Frame di Studio' }) + btn('toolUse', 'Frame akhir', { cls: 'sm', data: `data-i="${i}" data-slot="1"`, title: 'Jadikan foto akhir mode Frame di Studio' }) : ''}
        ${btn('toolUse', t.id === 'frame' ? 'Bahan' : 'Pakai di Studio', { ic: 'wand-sparkles', cls: 'sm subtle', data: `data-i="${i}"`, title: 'Tambahkan sebagai gambar referensi di Studio' })}
        ${btn('showFile', '', { ic: 'folder-open', cls: 'sm subtle icon', title: 'Tampilkan di folder', data: `data-path="${esc(r.path)}"` })}
      </div></div>`).join('')}</div>` : ''}
  </div>`;
}

// ----- Skill -----
const SK_GROUPS = [['all', 'Semua'], ['image', 'Gambar'], ['video', 'Video'], ['ai', 'AI'], ['mine', 'Skill saya'], ['admin', 'Dari admin']];
const SK_SRC = { builtin: '', mine: 'Skill saya', admin: 'Dari admin' };
function allSkills() {
  return [
    ...BUILTIN_SKILLS.map((x) => ({ ...x, source: 'builtin' })),
    ...(S.sk.admin || []).map((x) => ({ ...x, source: 'admin', desc: x.description })),
    ...(S.sk.mine || []).map((x) => ({ ...x, source: 'mine', desc: x.description }))
  ];
}
function skVisible() {
  const k = S.sk;
  const q = k.q.trim().toLowerCase();
  return allSkills().filter((x) => (k.group === 'all' || (k.group === 'mine' || k.group === 'admin' ? x.source === k.group : x.category === k.group))
    && (!q || (x.name + ' ' + (x.desc || '')).toLowerCase().includes(q)));
}
function curSkill() {
  const all = allSkills();
  return all.find((x) => x.id === S.sk.sel) || skVisible()[0] || all[0];
}
const skValues = (sk) => S.sk.values[sk.id] || (S.sk.values[sk.id] = {});
const skPrompt = (sk) => (S.sk.edited != null ? S.sk.edited : compose(sk.template, skValues(sk), refTags(S.sk.images)));
/** Setelan Flow hasil skill = setelan Studio sekarang + setelan skill + pilihan di panel skill. */
function skillOpts(sk) {
  const base = opts();
  const s = sk.settings || {};
  const over = S.sk.over;
  const kind = sk.category === 'ai' ? aiMode(sk, skValues(sk)) : s.kind || base.kind;
  const models = { ...DEFAULT_MODEL, ...(base.models || {}) };
  let model = over.model || (s.model && KIND_RE[kind].test(s.model) ? s.model : models[kind]);
  if (!model || !KIND_RE[kind].test(model)) model = DEFAULT_MODEL[kind];
  models[kind] = model;
  let ratio = over.ratio || s.ratio || base.ratio;
  if (!RATIOS[kind].includes(ratio)) ratio = '16:9';
  const count = over.count || s.count || base.count;
  const sub = kind === 'video' ? (s.sub === 'frames' ? 'frames' : sk.category === 'ai' ? base.sub : 'ingredients') : base.sub;
  return { ...base, kind, sub, model, models, ratio, count, duration: durationFor(kind, model), apply: true };
}
function skillCheck(sk) {
  const miss = missingFields(sk.template, skValues(sk));
  if (miss.length && S.sk.edited == null) throw new Error('Isi dulu: ' + miss.join(', ') + '.');
  const r = sk.refs || { min: 0, max: 0 };
  if (S.sk.images.length < r.min) throw new Error(r.min === 2 && r.max === 2 ? ERR.FRAMES_REQUIRED : `Skill ini butuh ${r.min} foto referensi.`);
}

function skillPage() {
  const k = S.sk;
  const list = skVisible();
  const sk = curSkill();
  const counts = { all: 0, image: 0, video: 0, ai: 0, mine: 0, admin: 0 };
  for (const x of allSkills()) { counts.all++; counts[x.category]++; if (x.source !== 'builtin') counts[x.source]++; }
  return `
    <div class="skills">
      <div class="card sk-list">
        <div class="sk-search">${icon('search', 'faint')}<input id="sk-q" class="input" placeholder="Cari skill…" value="${esc(k.q)}" data-input="skQuery" aria-label="Cari skill"></div>
        <div class="chips sk-groups">${SK_GROUPS.map(([id, label]) => `<button class="chip ${k.group === id ? 'on' : ''}" data-act="skGroup" data-g="${id}">${label}<span class="count">${counts[id]}</span></button>`).join('')}</div>
        <div class="sk-items" role="listbox" aria-label="Daftar skill">
          ${list.length ? list.map((x) => `<button class="sk-item ${sk && sk.id === x.id ? 'on' : ''}" role="option" aria-selected="${!!sk && sk.id === x.id}" data-act="skSel" data-id="${esc(x.id)}">
            <span class="sk-ic ${x.category}">${icon(x.icon || 'sparkles')}</span><span class="sk-t"><b class="ellipsis">${esc(x.name)}</b><span class="faint small ellipsis">${esc(x.desc || '')}</span></span>${x.source !== 'builtin' ? `<span class="badge ${x.source === 'admin' ? 'accent' : ''}">${x.source === 'admin' ? 'Admin' : 'Saya'}</span>` : ''}</button>`).join('')
            : `<div class="muted small sk-none">${k.group === 'mine' ? 'Belum ada skill buatan Anda. Simpan prompt Studio sebagai skill, atau impor berkas .json.' : k.group === 'admin' ? (k.adminError ? 'Skill dari admin tidak bisa dimuat (offline?).' : 'Admin belum menambahkan skill.') : 'Tidak ada skill yang cocok.'}</div>`}
        </div>
        <div class="sk-foot">${btn('skNew', 'Skill baru', { ic: 'plus', cls: 'sm' })}${btn('skImport', 'Impor', { ic: 'upload', cls: 'sm subtle' })}${btn('skExport', 'Ekspor', { ic: 'download', cls: 'sm subtle', disabled: !(k.mine || []).length, title: 'Ekspor semua Skill saya (.json)' })}${btn('skReload', '', { ic: S.busy.has('skReload') ? 'loader-circle' : 'refresh-cw', cls: 'sm subtle icon', title: 'Muat ulang skill dari admin' })}</div>
      </div>
      ${sk ? skillPanel(sk) : '<div class="card empty">Pilih skill.</div>'}
    </div>`;
}

function skillPanel(sk) {
  const k = S.sk;
  const vals = skValues(sk);
  const fields = parseFields(sk.template);
  const ai = sk.category === 'ai';
  const eff = skillOpts(sk);
  const r = sk.refs || { min: 0, max: 0 };
  const frames = !ai && eff.kind === 'video' && eff.sub === 'frames';
  const tags = refTags(k.images);
  const prompt = ai ? '' : skPrompt(sk);
  const busy = k.busy;
  const field = (f, i) => {
    const id = `skf-${i}`;
    const v = vals[f.label] ?? '';
    if (f.options) return `<label class="field"><span>${esc(f.label)}</span><select id="${id}" class="input" data-change="skField" data-k="${esc(f.label)}">${f.options.map((o) => `<option value="${esc(o.label)}" ${(v || f.options[0].label) === o.label ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
    return `<label class="field ${f.long ? 'wide' : ''}"><span>${esc(f.label)}</span>${f.long
      ? `<textarea id="${id}" class="input" rows="${/cerita|prompt|brief/i.test(f.label) ? 4 : 2}" maxlength="3000" data-input="skField" data-k="${esc(f.label)}">${esc(v)}</textarea>`
      : `<input id="${id}" class="input" maxlength="300" value="${esc(v)}" data-input="skField" data-k="${esc(f.label)}">`}</label>`;
  };
  const chip = (key, v, label) => `<button class="chip ${String(eff[key]) === String(v) ? 'on' : ''}" data-act="skOpt" data-k="${key}" data-v="${v}">${label}</button>`;
  const models = MODELS[eff.kind].map(([v]) => v);
  if (!models.includes(eff.model)) models.push(eff.model);
  const chatList = chatModels();
  const refsBox = r.max > 0 ? `<div class="refs sk-refs">
      <div class="refs-head"><b>${frames ? 'Frame awal &amp; akhir' : 'Foto referensi'}</b><span class="faint small">${frames ? 'Wajib 2 foto: ke-1 awal, ke-2 akhir.' : r.min ? `Wajib ${r.min} foto.` : 'Opsional.'}${!frames && k.images.length ? ' Dirujuk di prompt sebagai @tag.' : ''}</span><span class="right faint small">${k.images.length}/${r.max}</span></div>
      <div class="ref-row" id="sk-drop">
        ${k.images.map((p, i) => `<div class="thumb" title="${esc(p)}">${S.studio.previews[p] ? `<img src="${S.studio.previews[p]}" alt="">` : icon('file-image', 'lg')}<span class="tag">${frames ? (i === 0 ? 'Awal' : 'Akhir') : '@' + esc(tags[i])}</span>${btn('skImgRemove', '', { ic: 'x', cls: 'x sm', title: 'Hapus', data: `data-i="${i}"` })}</div>`).join('')}
        ${k.images.length < r.max ? `<button class="thumb add" data-act="skPick" title="Pilih foto (atau seret ke sini)">${icon('image-plus', 'lg')}<span class="small">${frames ? (k.images.length ? 'Frame akhir' : 'Frame awal') : 'Tambah'}</span></button>` : ''}
      </div></div>` : '';
  const head = `<div class="sk-head"><span class="sk-ic big ${sk.category}">${icon(sk.icon || 'sparkles', 'lg')}</span><div class="grow"><h3>${esc(sk.name)}</h3><div class="muted small">${esc(sk.desc || '')}</div></div>
    <div class="hrow">${SK_SRC[sk.source] ? `<span class="badge ${sk.source === 'admin' ? 'accent' : ''}">${SK_SRC[sk.source]}</span>` : ''}
      ${sk.source === 'mine' ? btn('skEdit', '', { ic: 'pencil', cls: 'subtle icon sm', title: 'Ubah skill' }) + btn('skExportOne', '', { ic: 'file-json', cls: 'subtle icon sm', title: 'Ekspor skill ini (.json)' }) + btn('skDelete', '', { ic: 'trash-2', cls: 'subtle icon sm danger', title: 'Hapus skill' })
        : !ai ? btn('skCopy', '', { ic: 'copy', cls: 'subtle icon sm', title: 'Salin ke Skill saya (lalu ubah sesuka hati)' }) : ''}</div></div>`;

  if (ai) {
    const res = k.result && k.result.id === sk.id ? k.result : null;
    return `<div class="card sk-panel">${head}
      <div class="sk-form">${fields.map(field).join('')}</div>
      ${refsBox}
      ${sk.ai === 'reverse' ? `<label class="field inline"><span>Model AI</span><select class="input" data-change="skModel">${chatList.length ? chatList.map((m) => `<option value="${esc(m.id)}" ${(k.model || S.chat.model) === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('') : '<option value="">Memuat…</option>'}</select></label><p class="faint small">Butuh model chat yang bisa membaca gambar (mis. model vision di OpenRouter). Bila gagal, pilih model lain atau minta admin menambahkannya.</p>` : ''}
      <div class="actionbar">${btn('skRun', busy === 'run' ? 'Memproses…' : sk.ai === 'director' ? 'Buka di Asisten Prompt' : 'Jalankan', { ic: busy === 'run' ? 'loader-circle' : sk.ai === 'director' ? 'message-square-text' : 'sparkles', cls: 'primary', disabled: !!busy })}
        <span class="faint small grow">Memakai model chat dari admin (kuota Asisten Prompt).</span></div>
      ${res ? skResult(sk, res) : ''}
    </div>`;
  }
  const res = sk.ai === 'scenes' && k.result && k.result.id === sk.id ? k.result : null;
  return `<div class="card sk-panel">${head}
    <div class="sk-form">${fields.map(field).join('')}</div>
    ${refsBox}
    <div class="opts sk-opts">
      <div class="opt"><span class="opt-l">${icon(eff.kind === 'video' ? 'clapperboard' : 'image')} Jenis</span><span class="chip on">${eff.kind === 'video' ? `Video · ${frames ? 'Frame' : 'Bahan'}` : 'Gambar'}</span></div>
      <div class="opt wide"><span class="opt-l">${icon('cpu')} Model</span><select class="input" data-change="skModelFlow" aria-label="Model">${models.map((m) => `<option value="${esc(m)}" ${eff.model === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>
      <div class="opt"><span class="opt-l">${icon('ratio')} Rasio</span><div class="chips">${RATIOS[eff.kind].map((x) => chip('ratio', x, x)).join('')}</div></div>
      <div class="opt"><span class="opt-l">${icon('hash')} Jumlah</span><div class="chips">${[1, 2, 3, 4].map((n) => chip('count', n, 'x' + n)).join('')}</div></div>
    </div>
    ${sk.ai === 'scenes' ? `
      <div class="actionbar">${btn('skRun', busy === 'run' ? 'AI menyusun adegan…' : 'Pecah jadi adegan', { ic: busy === 'run' ? 'loader-circle' : 'list-video', cls: 'primary', disabled: !!busy })}<span class="faint small grow">Setiap adegan menjadi 1 tugas di antrean Otomatis (setelan di atas).</span></div>
      ${res ? skResult(sk, res) : ''}`
    : `<div class="sk-prompt">
      <div class="sk-prompt-head"><b>Prompt</b><span class="faint small grow">${k.edited != null ? 'Diubah manual' : 'Tersusun otomatis dari isian'}</span>${k.edited != null ? btn('skReset', 'Kembalikan', { ic: 'rotate-ccw', cls: 'sm subtle' }) : ''}${btn('skRefine', busy === 'refine' ? 'Menyempurnakan…' : 'Sempurnakan dengan Asisten Prompt', { ic: busy === 'refine' ? 'loader-circle' : 'sparkles', cls: 'sm', disabled: !!busy || !prompt.trim() })}</div>
      <textarea id="sk-prompt" class="input prompt" rows="5" maxlength="8000" data-input="skPrompt">${esc(prompt)}</textarea>
    </div>
    <div class="actionbar cta-bar">
      ${btn('skGenerate', isAuto() ? 'Generate sekarang' : 'Kirim ke Flow sekarang', { ic: 'sparkles', cls: 'cta', disabled: !!busy || !!S.studio.busy || !acc() })}
      ${btn('skToStudio', 'Kirim ke Studio', { ic: 'wand-sparkles', disabled: !!busy })}
      ${btn('skQueue', 'Tambah ke antrean', { ic: 'list-plus', disabled: !!busy || !S.settings.accounts.length, title: 'Tambah ke antrean Mode Otomatis' })}
    </div>`}
  </div>`;
}

function skResult(sk, res) {
  const scenes = sk.ai === 'scenes';
  return `<div class="sk-result">
    <div class="sk-prompt-head"><b>${scenes ? `${res.prompts.length} adegan` : 'Hasil'}</b><span class="faint small grow">${res.model ? esc(res.model) : ''}</span>
      ${scenes && res.prompts.length ? btn('skResQueue', `Tambah ${res.prompts.length} adegan ke antrean`, { ic: 'list-plus', cls: 'sm primary' }) : ''}</div>
    ${res.prompts.length ? res.prompts.map((p, i) => `<div class="sk-res-item"><div class="sk-res-n">${scenes ? 'Adegan ' + (i + 1) : 'Prompt' + (res.prompts.length > 1 ? ' ' + (i + 1) : '')}</div><div class="sk-res-text">${esc(p)}</div>
      <div class="hrow">${btn('skResUse', 'Pakai di Studio', { ic: 'wand-sparkles', cls: 'sm', data: `data-i="${i}"` })}${btn('skResQueue', 'Antrean', { ic: 'list-plus', cls: 'sm subtle', data: `data-i="${i}"` })}${btn('skResCopy', '', { ic: 'copy', cls: 'sm subtle icon', title: 'Salin', data: `data-i="${i}"` })}</div></div>`).join('')
    : `<div class="sk-res-text">${esc(res.reply)}</div>`}
  </div>`;
}

const PAGES = {
  home() {
    const a = acc();
    const nb = !S.info.browsers.length && S.settings.browser.prefer !== 'custom';
    const s = a ? st(a.id) : {};
    const si = a ? statusInfo(a.id) : null;
    const hidden = S.settings.browserWindow === 'hidden';
    return `
      <section class="hero">
        <div class="hero-text">
          <div class="eyebrow">${icon('sparkles')} FLOW CONNECT Desktop</div>
          <h1>Berkarya dengan Google Flow, tanpa membuka browser.</h1>
          <p>Masuk sekali lewat kartu login Google. Setelah itu aplikasi membuka Flow di latar belakang, membuat project, memilih model, dan menekan Generate untuk Anda.</p>
          <div class="hero-actions">
            ${!S.settings.accounts.length ? btn('addAccount', 'Tambah akun Google', { ic: 'plus', cls: 'primary lg' })
              : a && !s.signedIn ? btn('login', 'Masuk ke Google', { ic: 'log-in', cls: 'primary lg', data: `data-id="${a.id}"` })
              : btn('go', 'Buka Studio', { ic: 'wand-sparkles', cls: 'primary lg', data: 'data-page="studio"' })}
            ${btn('help', 'Cara kerja', { ic: 'circle-help', cls: 'ghost lg' })}
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"><div class="orb o1"></div><div class="orb o2"></div><div class="glass-card">${icon('clapperboard', 'xl')}<div><b>Omni 1.2 Flash</b><span>16:9 · x2 · 10 dtk</span></div></div><div class="glass-card two">${icon('image', 'xl')}<div><b>Nano Banana 2.1</b><span>Gambar · 1:1</span></div></div></div>
      </section>
      ${nb ? infobar('error', 'circle-x', 'Browser tidak ditemukan.', ' Instal Google Chrome atau Microsoft Edge, lalu buka ulang aplikasi.', btn('external', 'Unduh Chrome', { ic: 'external-link', data: 'data-url="https://www.google.com/chrome"' })) : ''}
      <div class="grid c3">
        <div class="card stat">
          <div class="label">${icon('users')} Akun aktif</div>
          <div class="value ellipsis">${a ? esc(a.label) : '—'}</div>
          <div class="muted small ellipsis">${a ? esc(a.email || 'Email terdeteksi setelah masuk') : 'Belum ada akun'}</div>
          <div class="actions">${a ? `${si.badge}` : ''}</div>
          <div class="actions">${a ? (s.connected ? btn('go', 'Studio', { ic: 'wand-sparkles', cls: 'sm', data: 'data-page="studio"' }) : btn('connect', 'Hubungkan', { ic: 'plug', cls: 'sm primary', data: `data-id="${a.id}"` })) : btn('addAccount', 'Tambah akun', { ic: 'plus', cls: 'sm primary' })}</div>
        </div>
        <div class="card stat">
          <div class="label">${icon(hidden ? 'eye-off' : 'app-window')} Browser</div>
          <div class="value">${{ hidden: 'Tersembunyi', minimized: 'Diperkecil', normal: 'Terlihat' }[S.settings.browserWindow]}</div>
          <div class="muted small">${hidden ? (isAuto() ? 'Headless (eksperimental) — otomatis pindah ke jendela diperkecil bila ditolak Flow.' : 'Mode Aman: jendela Flow muncul saat Anda perlu menekan Generate.') : 'Ubah di Pengaturan → Browser.'}</div>
          <div class="actions">${btn('go', 'Ubah', { cls: 'sm', data: 'data-page="settings"' })}</div>
        </div>
        <div class="card stat">
          <div class="label">${icon(isAuto() ? 'bot' : 'shield-check')} Mode kerja</div>
          <div class="value">${isAuto() ? 'Otomatis' : 'Aman'}</div>
          <div class="muted small">${isAuto() ? 'Aplikasi menekan Generate, menunggu, lalu mengunduh hasil.' : 'Anda sendiri yang menekan Generate di Flow.'}</div>
          <div class="actions">${btn('go', 'Ubah', { cls: 'sm', data: 'data-page="settings"' })}${btn('openDownloads', `${S.settings.downloads.length} unduhan`, { ic: 'folder-open', cls: 'sm subtle' })}</div>
        </div>
      </div>
      <h2>Cara kerja</h2>
      <div class="card">
        <ol class="steps">
          <li><div><b>Tambah akun &amp; masuk ke Google</b><div class="muted small">Kartu login kecil berisi halaman login Google asli terbuka. Aplikasi tidak menyentuh halaman itu — kata sandi hanya Anda yang mengetik.</div></div></li>
          <li><div><b>Otomatis masuk ke Flow &amp; buat project</b><div class="muted small">Kartu tertutup sendiri, Flow dibuka di latar belakang (tanpa jendela), lalu tombol "New project" ditekan untuk Anda.</div></div></li>
          <li><div><b>Pilih mode, model &amp; rasio di Studio</b><div class="muted small">Video (Frame / Bahan) atau Gambar, Omni / Veo 3.1 / Nano Banana, 16:9 / 9:16, x1–x4 — diterapkan ke setelan Flow sebelum Generate.</div></div></li>
          <li><div><b>Generate &amp; lihat hasilnya di sini</b><div class="muted small">Pratinjau besar, galeri project, dan unduh otomatis ke PC.</div></div></li>
        </ol>
      </div>`;
  },

  accounts() {
    const list = S.settings.accounts;
    return `
      <div class="page-head"><h1>Akun Google</h1><div class="tools">${btn('addAccount', 'Tambah akun', { ic: 'plus', cls: 'primary' })}</div></div>
      <p class="subtitle">Satu akun = satu profil browser terpisah di PC ini. Login cukup sekali lewat kartu login Google.</p>
      ${list.length ? '' : `<div class="card empty">${icon('users', 'xl')}<div>Belum ada akun.</div><div class="actionbar center">${btn('addAccount', 'Tambah akun', { ic: 'plus', cls: 'primary' })}</div></div>`}
      <div class="rows">
        ${list.map((a) => {
          const s = st(a.id);
          const si = statusInfo(a.id);
          const d = `data-id="${a.id}"`;
          return `<div class="row acc-row">
            <div class="avatar">${esc((a.label || '?').trim().charAt(0).toUpperCase())}</div>
            <div class="text">
              <div class="title">${esc(a.label)} ${a.id === S.settings.activeAccountId ? '<span class="badge accent">Aktif</span>' : ''} ${a.headlessFailedAt ? '<span class="badge warn" title="Flow menolak mode tersembunyi untuk akun ini">Jendela diperkecil</span>' : ''}</div>
              <div class="desc">${esc(a.email || 'Email terdeteksi setelah masuk')}${s.projectTitle ? ' · Project: ' + esc(s.projectTitle) : ''}</div>
            </div>
            <div class="ctrl">
              ${si.badge}
              ${a.id !== S.settings.activeAccountId ? btn('setActive', '', { ic: 'check', cls: 'subtle icon', title: 'Jadikan akun aktif', data: d }) : ''}
              ${btn('login', s.signedIn ? 'Masuk ulang' : 'Masuk ke Google', { ic: 'log-in', cls: s.signedIn ? '' : 'primary', data: d })}
              ${s.connected
                ? btn('showFlow', '', { ic: 'app-window', cls: 'icon', title: 'Lihat jendela Google Flow', data: d }) + btn('disconnect', 'Putuskan', { ic: 'unplug', data: d })
                : btn('connect', 'Hubungkan', { ic: 'plug', cls: a.signedInAt ? 'primary' : '', data: d })}
              ${btn('renameAccount', '', { ic: 'pencil', cls: 'subtle icon', title: 'Ganti nama', data: d })}
              ${btn('removeAccount', '', { ic: 'trash-2', cls: 'subtle icon danger', title: 'Hapus akun', data: d })}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${list.length ? `<h2>Tentang login</h2>${infobar('', 'shield-check', '', '"Masuk ke Google" membuka <b>kartu login</b> — jendela kecil berisi halaman login Google asli di Chrome/Edge Anda. Aplikasi <b>tidak</b> mengetik, mengklik, atau membaca isi halaman itu; aplikasi hanya menunggu Google mengalihkan ke Flow, lalu menutup kartu dan melanjutkan di latar belakang. Kata sandi &amp; cookie hanya tersimpan di profil browser di PC ini.', btn('loginWindowHelp', 'Login di browser biasa', { cls: 'sm subtle' }))}` : ''}`;
  },

  studio() {
    if (S.studioTab === 'alat') return studioHead() + alatPage();
    if (S.studioTab === 'skill') return studioHead() + skillPage();
    if (S.studioTab === 'bulk') return studioHead() + bulkPage();
    const a = acc();
    const s = a ? st(a.id) : {};
    const warn = readiness(false);
    const ready = !warn;
    const o = opts();
    const imgs = S.studio.images;
    const busy = S.studio.busy;
    const video = o.kind === 'video';
    const chip = (k, v, label, ic, title) => `<button class="chip ${String(o[k]) === String(v) ? 'on' : ''}" data-act="studioOpt" data-k="${k}" data-v="${v}" ${title ? `title="${esc(title)}"` : ''}>${ic ? icon(ic) : ''}<span>${label}</span></button>`;
    const frames = isFrames(o);
    const refLabel = !video ? 'Gambar referensi' : frames ? 'Frame awal &amp; akhir <span class="badge warn">Wajib</span>' : 'Bahan (karakter, objek, gaya)';
    const tags = refTags(imgs);
    const refHint = !video ? (imgs.length ? 'Ketik @ di prompt untuk menunjuk gambar.' : 'Opsional — untuk edit / gaya.') : frames ? (imgs.length > 2 ? 'Mode Frame hanya memakai 2 foto — hapus foto lainnya.' : 'Foto ke-1 = frame awal, ke-2 = frame akhir.') : imgs.length ? 'Ketik @ di prompt untuk menunjuk bahan.' : 'Maks. 3 bahan agar konsisten antar adegan.';
    const framesOk = !frames || imgs.length === 2;
    const endFirst = frames && imgs.length === 1 && S.studio.endFirst === imgs[0]; // foto akhir dipasang lebih dulu (dari Alat)
    const dur = durationFor(o.kind, o.model);
    const models = modelList(o.kind);
    const g = S.gallery;
    const items = g.key ? g.items : [];
    const cur = items.find((x) => x.mediaId === S.studio.sel) || items[0];
    const local = cur && S.settings.downloads.find((d) => d.mediaId === cur.mediaId);
    const stage = busy
      ? `<div class="stage-busy"><div class="pulse">${icon('sparkles', 'xl')}</div><div class="stage-title">${busy === 'send' ? 'Mengirim ke Google Flow…' : 'Google Flow sedang membuat…'}</div>${S.studio.busyAt ? `<div class="stage-clock">${icon('timer')}${runtimeEl(S.studio.busyAt, null, 'big')}</div>` : ''}<div class="muted small" id="act-text">${esc(S.activity)}</div><div class="progress indet"><i></i></div></div>`
      : cur
        ? (cur.isVideo && local && /\.(mp4|webm)$/i.test(local.path)
          ? `<video class="stage-media" src="${esc(fileUrl(local.path))}" controls loop muted autoplay playsinline></video>`
          : thumbSrc(cur, local) ? `<img class="stage-media" src="${esc(thumbSrc(cur, local))}" alt="">`
            : `<div class="stage-empty">${icon(cur.isVideo ? 'video' : 'file-image', 'xl')}<div class="muted">${!cur.done ? 'Masih diproses Flow…' : g.thumbs[cur.mediaId] === null ? 'Pratinjau tidak tersedia.' : 'Memuat pratinjau…'}</div>${cur.done && g.thumbs[cur.mediaId] === null ? btn('thumbRetry', 'Coba lagi', { ic: 'refresh-cw', cls: 'sm subtle', data: `data-id="${cur.mediaId}"` }) : ''}</div>`)
        : `<div class="stage-empty">${icon('square-play', 'xl')}<div class="stage-title">Hasil generate tampil di sini</div><div class="muted small">Tulis prompt, pilih model, lalu tekan ${isAuto() ? 'Generate' : 'Kirim ke Flow'}.</div></div>`;
    return `
      ${studioHead()}
      ${warn || ''}
      <div class="studio">
        <div class="card composer">
          <div class="seg" role="tablist" aria-label="Jenis hasil">
            <button class="seg-btn ${video ? 'on' : ''}" data-act="studioOpt" data-k="kind" data-v="video" role="tab" aria-selected="${video}">${icon('clapperboard')}<span>Video</span></button>
            <button class="seg-btn ${!video ? 'on' : ''}" data-act="studioOpt" data-k="kind" data-v="image" role="tab" aria-selected="${!video}">${icon('image')}<span>Gambar</span></button>
          </div>
          ${video ? `<div class="chips modes">${SUBS.map(([v, l, ic, t, d]) => chip('sub', v, l, ic, `${t} — ${d}`)).join('')}</div>` : ''}
          <div class="prompt-wrap">
            <textarea id="prompt" class="input prompt" rows="6" maxlength="8000" placeholder="${video ? 'Kamera drone perlahan maju di atas sawah terasering Bali saat matahari terbit, kabut tipis, sinematik…' : 'Foto produk kopi susu gula aren di meja kayu, cahaya pagi, gaya editorial…'}" data-input="prompt">${esc(S.studio.prompt)}</textarea>
            <div class="mention-pop" id="mention-pop" role="listbox" hidden></div>
            <div class="prompt-foot"><span class="faint small" id="count">${S.studio.prompt.length}/8000</span>${btn('skSaveStudio', 'Simpan sebagai skill', { ic: 'bookmark-plus', cls: 'subtle sm', title: 'Simpan prompt & setelan ini ke Studio → Skill → Skill saya' })}<span class="faint small">${imgs.length ? '@ = tandai gambar · ' : ''}Ctrl+Enter</span></div>
          </div>
          <div class="refs">
            <div class="refs-head"><b>${refLabel}</b><span class="faint small ${frames && !framesOk ? 'warn-text' : ''}">${refHint}</span><span class="right faint small">${imgs.length}/${frames ? 2 : 10}</span>${frames && imgs.length >= 2 ? btn('swapFrames', '', { ic: 'arrow-right-left', cls: 'subtle icon sm', title: 'Tukar frame awal ↔ akhir' }) : ''}</div>
            <div class="ref-row" id="drop">
              ${imgs.map((p, i) => `<div class="thumb ${frames && i > 1 ? 'extra' : ''}" title="${esc(p)}">${S.studio.previews[p] ? `<img src="${S.studio.previews[p]}" alt="">` : icon('file-image', 'lg')}${frames ? `<span class="tag">${endFirst || i === 1 ? 'Akhir' : i === 0 ? 'Awal' : 'Tidak dipakai'}</span>` : `<button class="reftag" data-act="insertTag" data-tag="${esc(tags[i])}" title="Sisipkan @${esc(tags[i])} ke prompt">@${esc(tags[i])}</button>`}${btn('removeImage', '', { ic: 'x', cls: 'x sm', title: 'Hapus', data: `data-i="${i}"` })}</div>`).join('')}
              ${frames
                ? [0, 1].filter((i) => i >= imgs.length).map((i) => (endFirst ? 'awal' : i ? 'akhir' : 'awal')).map((w) => `<button class="thumb add slot" data-act="pickImages" title="Pilih foto ${w}">${icon('image-plus', 'lg')}<span class="small">Frame ${w}</span></button>`).join('')
                : `<button class="thumb add" data-act="pickImages" title="Tambah gambar (atau seret ke sini)">${icon('image-plus', 'lg')}<span class="small">Tambah</span></button>`}
            </div>
          </div>
          <div class="opts ${o.apply ? '' : 'off'}">
            <div class="opt wide"><span class="opt-l">${icon('cpu')} Model</span>
              <select class="input" data-change="studioModel" ${o.apply ? '' : 'disabled'} aria-label="Model">
                ${models.map((m) => `<option value="${esc(m.v)}" ${o.model === m.v ? 'selected' : ''}>${esc(m.v)}${m.d ? ' — ' + esc(m.d) : ''}</option>`).join('')}
              </select>
              ${a && s.connected ? btn('studioScan', '', { ic: S.busy.has('studioScan') ? 'loader-circle' : 'scan-search', cls: 'subtle icon', title: 'Baca daftar model dari Google Flow', disabled: !!busy }) : ''}
            </div>
            <div class="opt"><span class="opt-l">${icon('ratio')} Rasio</span><div class="chips">${RATIOS[o.kind].map((r) => chip('ratio', r, r)).join('')}</div></div>
            <div class="opt"><span class="opt-l">${icon('hash')} Jumlah</span><div class="chips">${[1, 2, 3, 4].map((n) => chip('count', n, 'x' + n)).join('')}</div></div>
            ${video ? `<div class="opt"><span class="opt-l">${icon('timer')} Durasi</span><div class="chips dur-row">${dur ? `<span class="chip on" id="dur-chip" title="Durasi tetap untuk ${esc(o.model)}">${dur} dtk</span>` : '<span class="chip on">Bawaan Flow</span>'}<span class="faint small">${/omni/i.test(o.model) ? 'Omni selalu 10 detik' : /veo/i.test(o.model) ? 'Veo selalu 8 detik' : ''}</span></div></div>` : ''}
          </div>
          <label class="switch apply"><input type="checkbox" data-change="studioApply" ${o.apply ? 'checked' : ''}><span class="small">Terapkan setelan ini ke Google Flow sebelum ${isAuto() ? 'Generate' : 'mengirim'}</span></label>
          <div class="actionbar cta-bar">
            ${isAuto()
              ? btn('sendGenerate', busy === 'generate' ? 'Membuat…' : 'Generate', { ic: busy === 'generate' ? 'loader-circle' : 'sparkles', cls: 'cta', disabled: !ready || !!busy || !framesOk, title: framesOk ? '' : ERR.FRAMES_REQUIRED }) +
                btn('queueAdd', 'Antrean', { ic: 'list-plus', disabled: !a || !!busy, title: 'Tambah ke antrean otomatis' }) +
                `<label class="check small"><input type="checkbox" data-change="waitResults" ${S.studio.waitResults ? 'checked' : ''}> Tunggu hasil${S.settings.auto.autoDownload ? ' &amp; unduh' : ''}</label>`
              : btn('send', busy === 'send' ? 'Mengirim…' : 'Kirim ke Flow', { ic: busy === 'send' ? 'loader-circle' : 'send', cls: 'cta', disabled: !ready || !!busy || !framesOk, title: framesOk ? '' : ERR.FRAMES_REQUIRED }) +
                `<span class="muted small grow">Mode Aman: jendela Flow muncul agar Anda menekan Generate. <a data-act="go" data-page="settings">Mode Otomatis</a> menjalankan semuanya tersembunyi.</span>`}
          </div>
        </div>
        <div class="card preview">
          <div class="card-head">${icon('square-play')}<h3>Pratinjau</h3>${cur && !busy ? `<span class="faint small ellipsis">${esc(cur.title || '')}</span>` : ''}
            <span class="right hrow">${cur && !busy ? btn('galleryDownload', '', { ic: g.busy.has(cur.mediaId) ? 'loader-circle' : 'download', cls: 'subtle icon sm', title: 'Unduh', data: `data-id="${cur.mediaId}"`, disabled: !cur.done }) : ''}${local ? btn('showFile', '', { ic: 'folder-open', cls: 'subtle icon sm', title: 'Tampilkan di folder', data: `data-path="${esc(local.path)}"` }) : ''}</span></div>
          <div class="stage r-${o.ratio.replace(':', '-')}">${stage}</div>
          ${items.length ? `<div class="strip">${items.slice(0, 14).map((it) => `<button class="strip-item ${cur && cur.mediaId === it.mediaId ? 'on' : ''}" data-act="studioSel" data-id="${it.mediaId}" title="${esc(it.title || '')}">${thumbSrc(it) ? `<img src="${esc(thumbSrc(it))}" alt="">` : icon(it.isVideo ? 'video' : 'file-image')}${it.isVideo ? `<span class="vtag">${icon('play')}</span>` : ''}</button>`).join('')}</div>` : `<div class="muted small strip-empty">${s.projectId ? 'Belum ada hasil di project ini.' : 'Hasil project akan muncul di sini.'}</div>`}
        </div>
      </div>
      <details class="card logcard" ${S.studio.log.length ? 'open' : ''}><summary><b>Aktivitas</b><span class="faint small">${S.studio.log.length ? S.studio.log.length + ' catatan' : 'Belum ada aktivitas'}</span></summary>
        ${S.studio.log.length ? `<ul class="log">${S.studio.log.map((l) => `<li><time>${fmtTime(l.t)}</time><span class="${l.k}">${icon(l.k === 'ok' ? 'circle-check' : l.k === 'err' ? 'circle-x' : 'info')}</span><span>${esc(l.text)}</span></li>`).join('')}</ul>` : ''}
      </details>`;
  },

  assistant() {
    const c = S.chat;
    const models = chatModels();
    const multiProv = new Set(models.map((m) => m.provider)).size > 1;
    const cur = models.find((m) => m.id === c.model) || models.find((m) => m.is_default) || models[0];
    const mode = chatMode();
    const starters = mode === 'image'
      ? ['Buatkan prompt foto produk kopi susu gula aren untuk iklan Instagram', 'Prompt potret wanita berkebaya di sawah saat golden hour, gaya editorial', 'Ubah ide ini jadi prompt gambar yang detail: kota Jakarta tahun 2080']
      : ['Buatkan prompt video drone sawah terasering Bali saat matahari terbit', 'Prompt video iklan 8 detik untuk sepatu lari, gerakan kamera dinamis', 'Pecah cerita ini jadi 3 adegan video: kucing oranye mencari ikan di pasar'];
    let pi = 0;
    return `
      <div class="page-head"><h1>Asisten Prompt</h1><div class="tools">
        ${models.length > 1 ? `<select class="input chat-model" data-change="chatModel" aria-label="Model AI">${models.map((m) => `<option value="${esc(m.id)}" ${cur && cur.id === m.id ? 'selected' : ''}>${esc(m.label)}${multiProv ? ` · ${esc(m.provider_name || m.provider)}` : ''}</option>`).join('')}</select>` : ''}
        ${btn('chatCatalog', '', { ic: 'refresh-cw', cls: 'icon', title: 'Muat ulang daftar model', disabled: c.catalogLoading })}
        ${btn('chatNew', 'Percakapan baru', { ic: 'eraser', disabled: c.busy || !c.messages.length })}
      </div></div>
      <p class="subtitle">Ngobrol dengan AI untuk menyusun prompt Google Flow. Prompt yang sudah jadi bisa langsung dipakai di Studio.</p>
      ${c.catalogError ? infobar('warning', 'cloud-off', 'Daftar model tidak bisa dimuat.', ' ' + esc(msg({ message: c.catalogError })), btn('chatCatalog', 'Coba lagi', { ic: 'refresh-cw', cls: 'sm' })) : ''}
      ${c.catalog && !models.length ? infobar('warning', 'triangle-alert', 'Asisten belum tersedia.', ' Admin belum mengaktifkan model chat.', btn('chatCatalog', 'Muat ulang', { ic: 'refresh-cw', cls: 'sm' })) : ''}
      ${cur && cur.ready === false ? infobar('warning', 'triangle-alert', 'Asisten belum siap.', ' Admin belum memasang kunci API untuk ' + esc(cur.provider_name || cur.provider) + '.') : ''}
      <div class="card chat">
        <div class="chat-top">
          <div class="seg chat-mode" role="tablist" aria-label="Jenis prompt">
            <button class="seg-btn ${mode === 'video' ? 'on' : ''}" data-act="chatMode" data-v="video" role="tab" aria-selected="${mode === 'video'}">${icon('clapperboard')}<span>Video</span></button>
            <button class="seg-btn ${mode === 'image' ? 'on' : ''}" data-act="chatMode" data-v="image" role="tab" aria-selected="${mode === 'image'}">${icon('image')}<span>Gambar</span></button>
          </div>
          <span class="faint small grow">${cur ? `Model: ${esc(cur.label)}` : ''}</span>
        </div>
        <div class="chat-list" id="chat-list">
          ${c.messages.length ? c.messages.map((m, mi) => m.role === 'user'
            ? `<div class="msg me"><div class="bubble">${esc(m.content)}</div></div>`
            : `<div class="msg ai"><span class="ai-av">${icon('sparkles')}</span><div class="bubble">${chatBody(m.content, mi, () => pi++)}</div></div>`).join('')
            : `<div class="chat-empty">${icon('message-square-text', 'xl')}<div class="stage-title">Mau bikin ${mode === 'image' ? 'gambar' : 'video'} apa hari ini?</div><div class="muted small">Ceritakan idenya dengan bahasa sehari-hari — asisten akan menyusun prompt yang detail.</div>
              <div class="starters">${starters.map((t) => `<button class="chip" data-act="chatStarter" data-text="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`}
          ${c.busy ? `<div class="msg ai"><span class="ai-av">${icon('sparkles')}</span><div class="bubble typing"><i></i><i></i><i></i></div></div>` : ''}
          ${c.error ? `<div class="chat-err">${infobar('error', 'circle-x', '', esc(c.error), btn('chatRetry', 'Kirim ulang', { ic: 'rotate-ccw', cls: 'sm' }))}</div>` : ''}
        </div>
        <div class="chat-compose">
          <textarea id="chat-input" class="input" rows="2" maxlength="4000" placeholder="Tulis ide atau pertanyaan… (Enter kirim · Shift+Enter baris baru)" data-input="chatInput" ${c.busy ? 'disabled' : ''}>${esc(c.input)}</textarea>
          ${btn('chatSend', '', { ic: c.busy ? 'loader-circle' : 'send', cls: 'primary icon chat-send', title: 'Kirim', disabled: c.busy || !models.length })}
        </div>
      </div>`;
  },

  gallery() {
    const a = acc();
    const s = a ? st(a.id) : {};
    const warn = readiness(true);
    const g = S.gallery;
    const n = g.selected.size;
    const cat = S.galleryCat;
    const vis = galleryVisible();
    const selectable = vis.filter((i) => i.done);
    const allSel = selectable.length && selectable.every((i) => g.selected.has(i.mediaId));
    return `
      <div class="page-head"><h1>Galeri</h1><div class="tools">${accountPicker()}
        ${btn('galleryRefresh', 'Muat ulang', { ic: 'refresh-cw', disabled: !!warn || g.loading })}
        ${selectable.length ? btn('gallerySelectAll', allSel ? 'Batal pilih' : 'Pilih semua', { ic: 'check' }) : ''}
        ${btn('galleryDownloadSel', n ? `Unduh (${n})` : 'Unduh', { ic: 'download', cls: 'primary', disabled: !n })}
      </div></div>
      ${warn || `<p class="subtitle">Project: <b>${esc(s.projectTitle || s.projectId)}</b> · ${g.items.length} hasil</p>`}
      ${!warn ? catTabs('galleryCat', cat, g.items, itemCat) : ''}
      ${g.error ? infobar('error', 'circle-x', 'Gagal memuat galeri.', ' ' + esc(msg({ message: g.error })), btn('galleryRefresh', 'Coba lagi', { ic: 'rotate-ccw' })) : ''}
      ${g.loading && !g.items.length ? '<div class="activity"><div class="progress indet grow"><i></i></div></div>' : ''}
      ${!warn && !g.loading && !vis.length && !g.error ? catEmpty(cat, ' di project ini') : ''}
      ${!warn ? byDay(vis, (i) => i.createdAt).map((grp) => {
        const sel = grp.items.filter((i) => i.done);
        const all = sel.length && sel.every((i) => g.selected.has(i.mediaId));
        return `<section class="day">${dayHead(grp, CAT_WORD[cat], sel.length ? btn('gallerySelectDay', all ? 'Batal pilih' : 'Pilih', { ic: 'check', cls: 'sm subtle', data: `data-day="${grp.key}"` }) : '')}
        <div class="gallery">${grp.items.map((it) => `
        <div class="tile ${g.selected.has(it.mediaId) ? 'sel' : ''}">
          <div class="media">
            ${icon(it.isAudio ? 'audio-lines' : it.isVideo ? 'video' : 'file-image', 'xl')}${thumbSrc(it) ? `<img class="pic" src="${esc(thumbSrc(it))}" alt="" loading="lazy">` : ''}
            <input type="checkbox" data-change="gallerySel" data-id="${it.mediaId}" ${g.selected.has(it.mediaId) ? 'checked' : ''} aria-label="Pilih">
            ${it.isVideo ? '<span class="badge">Video</span>' : it.isAudio ? '<span class="badge">Audio</span>' : ''}${!it.done ? '<span class="badge">Memproses…</span>' : ''}
          </div>
          <div class="meta"><div class="grow"><div class="t" title="${esc(it.title)}">${esc(it.title || (it.isAudio ? 'Audio' : it.isVideo ? 'Video' : 'Gambar'))}</div><div class="d">${it.createdAt ? fmtTime(it.createdAt) : ''}${S.settings.downloads.some((d) => d.mediaId === it.mediaId) ? ' · Sudah diunduh' : ''}</div></div>
            ${btn('galleryDownload', '', { ic: g.busy.has(it.mediaId) ? 'loader-circle' : 'download', cls: 'subtle sm icon' + (g.busy.has(it.mediaId) ? ' busy' : ''), title: 'Unduh', data: `data-id="${it.mediaId}"`, disabled: !it.done || g.busy.has(it.mediaId) })}
          </div>
        </div>`).join('')}</div></section>`;
      }).join('') : ''}`;
  },

  auto() {
    if (!isAuto()) {
      return `
        <div class="page-head"><h1>Otomatis</h1></div>
        <div class="card narrow">
          <div class="card-head">${icon('bot', 'lg')}<h3>Mode Otomatis belum aktif</h3></div>
          <p class="muted">Di Mode Otomatis, aplikasi bisa menekan tombol <b>Generate</b> di Google Flow untuk Anda, menunggu hasilnya, lalu mengunduhnya. Anda juga bisa membuat <b>antrean</b> banyak prompt yang dijalankan satu per satu dengan jeda acak.</p>
          ${infobar('warning', 'triangle-alert', 'Risiko akun.', ' Google dapat mendeteksi pemakaian otomatis dan membatasi atau memblokir akun. Gunakan secukupnya, sebaiknya dengan akun cadangan.')}
          <div class="actionbar">${btn('enableAuto', 'Aktifkan Mode Otomatis…', { ic: 'zap', cls: 'primary' })}</div>
        </div>`;
    }
    const q = S.queue;
    const total = q.jobs.length;
    const done = q.jobs.filter((j) => j.status === 'done').length;
    const pending = q.jobs.filter((j) => j.status === 'pending').length;
    const cfg = S.settings.auto;
    const label = { pending: '<span class="badge">Menunggu</span>', running: '<span class="badge accent">Berjalan</span>', done: '<span class="badge ok">Selesai</span>', failed: '<span class="badge err">Gagal</span>', stopped: '<span class="badge warn">Dihentikan</span>' };
    return `
      <div class="page-head"><h1>Otomatis</h1><div class="tools">
        ${btn('queueAdd', 'Tambah tugas', { ic: 'list-plus' })}
        ${q.running ? btn('queueStop', 'Hentikan', { ic: 'square' }) : btn('queueStart', 'Mulai', { ic: 'play', cls: 'primary', disabled: !pending })}
        ${btn('queueClear', 'Hapus yang selesai', { ic: 'trash-2', cls: 'subtle', disabled: q.running || total === pending })}
      </div></div>
      ${infobar('warning', 'triangle-alert', 'Mode Otomatis aktif.', ' Gunakan secukupnya — akun Google bisa dibatasi bila terdeteksi otomatis.', btn('disableAuto', 'Matikan', { cls: 'sm' }))}
      <div class="muted small">Jeda acak ${cfg.minDelay}–${cfg.maxDelay} detik · Maks. ${cfg.maxPerRun} tugas per sesi · Batas tunggu ${cfg.timeoutMin} menit · Unduh otomatis: ${cfg.autoDownload ? 'Ya' : 'Tidak'} · <a data-act="go" data-page="settings">Ubah</a></div>
      ${q.running || q.activity ? `<div class="activity">${q.running ? icon('loader-circle', 'spin') : icon('info')}<span id="q-act">${esc(q.activity)}</span><span id="q-next" class="faint"></span></div>` : ''}
      ${total ? `<div class="progress q-progress"><i id="q-bar"></i></div>` : ''}
      ${total ? `<table class="table"><thead><tr><th class="num">#</th><th>Prompt</th><th>Gambar</th><th>Akun</th><th>Status</th><th>Hasil</th><th class="act"></th></tr></thead><tbody>
        ${q.jobs.map((j, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td class="prompt"><div class="ellipsis" title="${esc(j.prompt)}">${esc(j.prompt)}</div>${j.error ? `<div class="small err-text">${esc(msg({ message: j.error, detail: j.detail }))}</div>` : ''}</td>
          <td>${j.images.length || '—'}</td>
          <td class="ellipsis">${esc((accById(j.accountId) || {}).label || '—')}</td>
          <td>${label[j.status] || j.status}</td>
          <td>${j.status === 'done' ? (j.results.length && /[\\/]/.test(j.results[0]) ? btn('openFile', `${j.results.length} file`, { ic: 'folder-open', cls: 'sm subtle', data: `data-path="${esc(j.results[0])}"` }) : `${j.results.length} hasil`) : '—'}</td>
          <td class="act">${j.status === 'failed' || j.status === 'stopped' ? btn('queueRetry', '', { ic: 'rotate-ccw', cls: 'sm subtle icon', title: 'Ulangi', data: `data-id="${j.id}"` }) : ''}${j.status !== 'running' ? btn('queueRemove', '', { ic: 'x', cls: 'sm subtle icon', title: 'Hapus', data: `data-id="${j.id}"` }) : ''}</td>
        </tr>`).join('')}
      </tbody></table><div class="muted small mt8">${done}/${total} selesai · ${pending} menunggu</div>`
        : `<div class="card empty">${icon('list-plus', 'xl')}<div>Antrean kosong.</div><div class="muted small">Tambahkan beberapa prompt (satu per baris), lalu klik Mulai.</div><div class="actionbar center">${btn('queueAdd', 'Tambah tugas', { ic: 'list-plus', cls: 'primary' })}</div></div>`}`;
  },

  downloads() {
    const all = S.settings.downloads;
    const cat = S.dlCat;
    const d = all.filter((x) => cat === 'all' || fileCat(x.name) === cat);
    const tile = (x) => {
      const kind = fileCat(x.name);
      const isV = kind === 'video';
      const isA = kind === 'audio';
      const th = S.dlThumbs[x.path];
      const src = th && th.url ? th.url : (th === null && kind === 'image' ? fileUrl(x.path) : '');
      return `<div class="tile dl-tile${th && th.missing ? ' missing' : ''}">
        <button class="media" data-act="openFile" data-path="${esc(x.path)}" title="Buka ${esc(x.name)}">
          ${icon(isA ? 'audio-lines' : isV ? 'video' : 'file-image', 'xl')}${src ? `<img class="pic" src="${esc(src)}" alt="" loading="lazy">` : ''}
          ${isV ? `<span class="badge">${icon('play')}Video</span>` : isA ? `<span class="badge">${icon('music')}Audio</span>` : ''}${th && th.missing ? '<span class="badge warn">File tidak ditemukan</span>' : ''}
        </button>
        <div class="meta"><div class="grow"><div class="t" title="${esc(x.path)}">${esc(x.name)}</div><div class="d">${fmtTime(x.at)} · ${esc((accById(x.accountId) || {}).label || '—')}</div></div>
          ${btn('showFile', '', { ic: 'folder-open', cls: 'sm subtle icon', title: 'Tampilkan di folder', data: `data-path="${esc(x.path)}"` })}${btn('forgetFile', '', { ic: 'x', cls: 'sm subtle icon', title: 'Hapus dari daftar', data: `data-path="${esc(x.path)}"` })}
        </div>
      </div>`;
    };
    return `
      <div class="page-head"><h1>Unduhan</h1><div class="tools">${btn('openDownloads', 'Buka folder unduhan', { ic: 'folder-open' })}</div></div>
      <p class="subtitle"><span class="mono">${esc(S.settings.downloadDir)}</span>${all.length ? ` · ${all.length} file` : ''}</p>
      ${all.length ? catTabs('dlCat', cat, all, (x) => fileCat(x.name)) : ''}
      ${d.length ? byDay(d, (x) => x.at).map((grp) => `<section class="day">${dayHead(grp, 'file')}<div class="gallery">${grp.items.map(tile).join('')}</div></section>`).join('')
        : all.length ? catEmpty(cat, ' di unduhan') : `<div class="card empty">${icon('download', 'xl')}<div>Belum ada unduhan.</div><div class="muted small">Unduh hasil dari Galeri, atau aktifkan unduh otomatis di Mode Otomatis.</div></div>`}`;
  },

  settings() {
    const s = S.settings;
    const b = S.info.browsers;
    const auto = isAuto();
    const cur = s.browser.prefer === 'custom' ? s.browser.customPath : ((s.browser.prefer === 'auto' ? b[0] : b.find((x) => x.id === s.browser.prefer)) || {}).path;
    const num = (k, label, desc, unit) => `<div class="row sub ${auto ? '' : 'disabled'}"><div class="text"><div class="title">${label}</div><div class="desc">${desc}</div></div><div class="ctrl"><input class="input" type="number" data-change="autoNum" data-k="${k}" value="${s.auto[k]}" ${auto ? '' : 'disabled'}><span class="muted small">${unit}</span></div></div>`;
    const tog = (k, label, desc) => `<div class="row sub ${auto ? '' : 'disabled'}"><div class="text"><div class="title">${label}</div><div class="desc">${desc}</div></div><div class="ctrl"><label class="switch"><span class="small muted">${s.auto[k] ? 'Aktif' : 'Nonaktif'}</span><input type="checkbox" data-change="autoBool" data-k="${k}" ${s.auto[k] ? 'checked' : ''} ${auto ? '' : 'disabled'}></label></div></div>`;
    return `
      <div class="page-head"><h1>Pengaturan</h1></div>
      <h2>Tampilan</h2>
      <div class="rows">
        <div class="row">${icon('monitor', 'lg')}<div class="text"><div class="title">Tema</div><div class="desc">Ikuti tema Windows, atau pilih terang / gelap</div></div>
          <div class="ctrl"><select class="input" data-change="theme">${[['system', 'Ikuti sistem'], ['light', 'Terang'], ['dark', 'Gelap']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      </div>
      <h2>Browser</h2>
      <div class="rows">
        <div class="row">${icon('app-window', 'lg')}<div class="text"><div class="title">Browser yang dipakai</div><div class="desc mono ellipsis" title="${esc(cur || '')}">${esc(cur || 'Tidak ditemukan')}</div></div>
          <div class="ctrl"><select class="input" data-change="browser">
            <option value="auto" ${s.browser.prefer === 'auto' ? 'selected' : ''}>Otomatis${b[0] ? ' (' + esc(b[0].name) + ')' : ''}</option>
            ${b.map((x) => `<option value="${x.id}" ${s.browser.prefer === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
            <option value="custom" ${s.browser.prefer === 'custom' ? 'selected' : ''}>Pilih file…</option>
          </select></div></div>
        <div class="row">${icon('eye-off', 'lg')}<div class="text"><div class="title">Tampilan browser Google Flow</div><div class="desc">${{
          hidden: 'Tersembunyi total (headless, eksperimental) saat Mode Otomatis. Bila Flow menolak, aplikasi otomatis beralih ke jendela diperkecil untuk akun itu. Di Mode Aman jendela diperkecil dipakai agar Anda bisa menekan Generate.',
          minimized: 'Jendela browser di luar layar & diperkecil. Paling kompatibel — muncul hanya saat Anda klik "Lihat Flow".',
          normal: 'Jendela browser terlihat biasa. Berguna untuk memantau apa yang dilakukan aplikasi.'
        }[s.browserWindow]}</div></div>
          <div class="ctrl"><select class="input" data-change="browserWindow">${[['hidden', 'Tersembunyi (headless) — eksperimental'], ['minimized', 'Diperkecil (di luar layar)'], ['normal', 'Terlihat']].map(([v, l]) => `<option value="${v}" ${s.browserWindow === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        ${s.accounts.filter((a) => a.headlessFailedAt).map((a) => `<div class="row sub">${icon('triangle-alert', 'warn-ic')}<div class="text"><div class="title">${esc(a.label)}: memakai jendela diperkecil</div><div class="desc">Flow menolak mode tersembunyi pada ${fmtDate(a.headlessFailedAt)}${a.headlessReason ? ' — ' + esc(a.headlessReason) : ''}.</div></div><div class="ctrl">${btn('resetHeadless', 'Coba tersembunyi lagi', { cls: 'sm', data: `data-id="${a.id}"` })}</div></div>`).join('')}
        <div class="row">${icon('folder-plus', 'lg')}<div class="text"><div class="title">Buat project baru otomatis</div><div class="desc">Setelah masuk / terhubung, aplikasi menekan "New project" di Flow bila belum ada project terbuka.</div></div>
          <div class="ctrl"><label class="switch"><span class="small muted">${s.autoProject ? 'Aktif' : 'Nonaktif'}</span><input type="checkbox" data-change="autoProject" ${s.autoProject ? 'checked' : ''}></label></div></div>
      </div>
      <h2>Unduhan</h2>
      <div class="rows">
        <div class="row">${icon('folder-open', 'lg')}<div class="text"><div class="title">Lokasi unduhan</div><div class="desc mono ellipsis" title="${esc(s.downloadDir)}">${esc(s.downloadDir)}</div></div>
          <div class="ctrl">${btn('pickFolder', 'Ubah…')}${btn('openDownloads', '', { ic: 'external-link', cls: 'subtle icon', title: 'Buka folder' })}</div></div>
      </div>
      <h2>Mode kerja</h2>
      <div class="choice">
        <label class="${auto ? '' : 'on'}"><input type="radio" name="mode" value="safe" data-change="mode" ${auto ? '' : 'checked'}><div><b>Mode Aman</b><div class="muted small">Aplikasi memasukkan gambar &amp; prompt ke Flow. Anda sendiri yang menekan Generate. Disarankan.</div></div></label>
        <label class="${auto ? 'on' : ''}"><input type="radio" name="mode" value="auto" data-change="mode" ${auto ? 'checked' : ''}><div><b>Mode Otomatis</b> <span class="badge warn">Risiko</span><div class="muted small">Aplikasi menekan Generate, menunggu, lalu mengunduh. Mendukung antrean banyak prompt.</div></div></label>
      </div>
      <h2>Mode Otomatis</h2>
      <div class="rows">
        ${num('minDelay', 'Jeda minimum antar tugas', 'Jeda acak antar tugas mengurangi pola "robot" (min. 20 detik)', 'detik')}
        ${num('maxDelay', 'Jeda maksimum antar tugas', 'Batas atas jeda acak', 'detik')}
        ${num('maxPerRun', 'Maksimum tugas per sesi', 'Antrean berhenti setelah jumlah ini (maks. 50)', 'tugas')}
        ${num('timeoutMin', 'Batas waktu menunggu hasil', 'Video bisa butuh beberapa menit', 'menit')}
        ${tog('autoDownload', 'Unduh hasil otomatis', 'Simpan hasil ke folder unduhan, dikelompokkan per akun')}
        ${tog('stopOnError', 'Berhenti bila ada tugas gagal', 'Mencegah percobaan berulang saat ada masalah (mis. kuota habis)')}
      </div>
      <h2>Lisensi</h2>
      <div class="rows">${licenseRow()}</div>
      <h2>Pembaruan</h2>
      <div class="rows">${updateRow()}</div>
      <h2>Tentang</h2>
      <div class="rows">
        <div class="row">${icon('info', 'lg')}<div class="text"><div class="title">FLOW CONNECT Desktop ${esc(S.info.version)}</div><div class="desc">Tidak berafiliasi dengan Google. Google Flow adalah layanan Google Labs.</div></div>
          <div class="ctrl">${btn('external', 'Situs', { ic: 'external-link', cls: 'subtle', data: `data-url="${S.info.webUrl}"` })}${btn('external', 'GitHub', { ic: 'external-link', cls: 'subtle', data: 'data-url="https://github.com/sugionoofficial/FLOW-CONNECT"' })}</div></div>
      </div>`;
  }
};

// ---------- Lisensi & pembaruan ----------
const LICENSE_URL = () => S.info.webUrl + '/app/lisensi';

function gatePage() {
  const l = S.license || {};
  const err = l.state === 'invalid' ? (ERR[l.error] || l.error) : null;
  return `
    <div id="gate" class="gate">
      <div class="gate-card card">
        <div class="gate-brand"><img src="icon.png" alt="" width="40" height="40" /><div><h1>Aktivasi FLOW CONNECT</h1><div class="muted">Masukkan kunci lisensi dari situs FLOW CONNECT.</div></div></div>
        ${err ? infobar('error', 'circle-x', '', esc(err)) : ''}
        <label class="field"><span>Kunci lisensi</span>
          <input id="license-key" class="input mono" data-input="gateKey" value="${esc(S.gateKey)}" placeholder="FC-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" spellcheck="false" autocomplete="off" maxlength="40" />
        </label>
        <div class="gate-actions">
          ${btn('licenseActivate', 'Aktifkan', { ic: S.busy.has('licenseActivate') ? 'loader-circle' : 'key-round', cls: 'primary', disabled: S.busy.has('licenseActivate') })}
          ${btn('external', 'Buat kunci di situs', { ic: 'external-link', cls: 'subtle', data: `data-url="${esc(LICENSE_URL())}"` })}
        </div>
        <ol class="steps small">
          <li><div>Buka <b>${esc(S.info.webUrl.replace('https://', ''))}/app/lisensi</b> dan masuk dengan akun FLOW CONNECT Anda.</div></li>
          <li><div>Klik <b>Buat kunci lisensi</b>, lalu salin kuncinya.</div></li>
          <li><div>Tempel di sini dan klik <b>Aktifkan</b>. Satu kunci bisa dipakai di beberapa PC sesuai batasnya.</div></li>
        </ol>
        <div class="faint small mono">ID perangkat: ${esc((l.deviceId || '').slice(0, 8))} · v${esc(S.info.version)}</div>
      </div>
    </div>`;
}

function licenseRow() {
  const l = S.license || {};
  const i = l.info || {};
  const offline = l.state === 'offline';
  const desc = [i.email ? esc(i.email) : '', i.max_devices ? `${i.devices || 1}/${i.max_devices} PC` : '',
    i.expires_at ? 'berlaku s.d. ' + fmtDate(Date.parse(i.expires_at)) : 'tanpa batas waktu',
    l.checkedAt ? 'diverifikasi ' + fmtDate(l.checkedAt) : ''].filter(Boolean).join(' · ');
  return `<div class="row">${icon(offline ? 'cloud-off' : 'badge-check', 'lg')}<div class="text"><div class="title">${esc(i.label || 'Lisensi')} <span class="mono faint">${esc(l.hint || '')}</span> ${offline ? '<span class="badge warn">Offline</span>' : '<span class="badge ok">Aktif</span>'}</div><div class="desc">${desc}${offline && l.graceUntil ? ` · bisa offline s.d. ${fmtDate(l.graceUntil)}` : ''}</div></div>
    <div class="ctrl">${btn('licenseVerify', 'Periksa', { ic: 'refresh-cw', cls: 'subtle' })}${btn('external', 'Kelola', { ic: 'external-link', cls: 'subtle', data: `data-url="${esc(LICENSE_URL())}"` })}${btn('licenseLogout', 'Keluar', { ic: 'log-out' })}</div></div>`;
}

function updateText(u) {
  if (!u) return '';
  return {
    unsupported: 'Pembaruan otomatis aktif di versi installer Windows.',
    idle: 'Aplikasi memeriksa pembaruan secara otomatis.',
    checking: 'Memeriksa pembaruan…',
    none: `Anda memakai versi terbaru${u.checkedAt ? ' (diperiksa ' + fmtTime(u.checkedAt) + ')' : ''}.`,
    available: `Versi ${esc(u.version)} tersedia.`,
    downloading: `Mengunduh versi ${esc(u.version)}… ${u.percent}%`,
    ready: `Versi ${esc(u.version)} siap dipasang.`,
    error: 'Gagal memeriksa pembaruan: ' + esc(u.error || '')
  }[u.state] || '';
}

function updateRow() {
  const u = S.update || {};
  const action = u.state === 'available' ? btn('updateDownload', u.portable ? 'Unduh versi baru' : 'Update sekarang', { ic: 'circle-arrow-down', cls: 'primary' })
    : u.state === 'ready' ? btn('updateInstall', 'Mulai ulang & perbarui', { ic: 'rotate-ccw', cls: 'primary' })
    : btn('updateCheck', 'Periksa pembaruan', { ic: u.state === 'checking' ? 'loader-circle' : 'refresh-cw', disabled: u.state === 'checking' || u.state === 'downloading' || u.state === 'unsupported' });
  return `<div class="row">${icon('circle-arrow-down', 'lg')}<div class="text"><div class="title">Versi ${esc(S.info.version)}${u.portable ? ' (portable)' : ''}</div><div class="desc">${updateText(u)}</div>${u.state === 'downloading' ? `<progress class="progress" max="100" value="${u.percent}"></progress>` : ''}</div><div class="ctrl">${action}</div></div>`;
}

function updateBanner() {
  const u = S.update;
  if (!u || !['available', 'downloading', 'ready'].includes(u.state)) return '';
  if (u.state === 'available' && S.updateHidden === u.version) return '';
  if (u.state === 'available') {
    return infobar('success update-bar', 'circle-arrow-down', `Pembaruan versi ${esc(u.version)} tersedia.`,
      u.portable ? ' Anda memakai versi portable: unduh file baru lalu ganti file lama.' : ' Diunduh di latar belakang lalu dipasang otomatis — tidak perlu instal ulang.',
      btn('updateDownload', u.portable ? 'Unduh' : 'Update sekarang', { ic: 'circle-arrow-down', cls: 'primary' }) + btn('updateHide', 'Nanti', { cls: 'subtle' }));
  }
  if (u.state === 'downloading') {
    return infobar('update-bar', 'loader-circle', `Mengunduh pembaruan ${esc(u.version)}… ${u.percent}%`, `<progress class="progress" max="100" value="${u.percent}"></progress>`);
  }
  return infobar('success update-bar', 'circle-check', `Pembaruan ${esc(u.version)} siap.`, ' Aplikasi akan ditutup sebentar, diperbarui, lalu dibuka kembali. Pengaturan & akun tetap tersimpan.',
    btn('updateInstall', 'Mulai ulang & perbarui', { ic: 'rotate-ccw', cls: 'primary' }));
}

// ---------- Render ----------
function renderNav() {
  const item = ([id, label, ic]) => `<button class="nav-item ${S.page === id ? 'active' : ''}" data-act="go" data-page="${id}">${icon(ic, 'lg')}<span>${label}</span>${id === 'auto' && S.queue.running ? '<span class="badge accent">Berjalan</span>' : ''}</button>`;
  $('#nav-items').innerHTML = NAV.map(item).join('');
  const upd = S.update && ['available', 'ready'].includes(S.update.state);
  $('#nav-bottom').innerHTML = item(['settings', 'Pengaturan', 'settings']).replace('</span></button>', `</span>${upd ? `<span class="badge ok" title="Pembaruan ${esc(S.update.version)} tersedia">Update</span>` : ''}</button>`);
  const a = acc();
  const si = a ? statusInfo(a.id) : null;
  $('#nav-account').innerHTML = a
    ? `<button class="nav-acc" data-act="go" data-page="accounts" title="Akun Google"><span class="avatar sm">${esc((a.label || '?').trim().charAt(0).toUpperCase())}<i class="dot ${si.dot}"></i></span><span class="nav-acc-t"><b class="ellipsis">${esc(a.label)}</b><span class="ellipsis">${esc(st(a.id).account || a.email || si.text)}</span></span></button>`
    : `<button class="nav-acc" data-act="addAccount"><span class="avatar sm">${icon('plus')}</span><span class="nav-acc-t"><b>Tambah akun</b><span>Masuk ke Google</span></span></button>`;
}

function renderStatus() {
  const a = acc();
  let left = `<span class="dot"></span><span>Belum ada akun</span>`;
  if (a) {
    const s = st(a.id);
    const si = statusInfo(a.id);
    left = `<span class="dot ${si.dot}"></span><span>${esc(a.label)}${s.account ? ' · ' + esc(s.account) : ''}</span><span class="sep"></span><span>${si.text}</span>${s.projectId ? `<span class="sep"></span><span class="ellipsis">Project: ${esc(s.projectTitle || s.projectId)}</span>` : ''}`;
  }
  const act = S.queue.running ? S.queue.activity : S.activity;
  const bw = { hidden: 'Browser tersembunyi', minimized: 'Browser diperkecil', normal: 'Browser terlihat' }[S.settings.browserWindow];
  $('#statusbar').innerHTML = `${left}<span class="grow ellipsis faint">${esc(act || '')}</span><span>${bw}</span><span class="sep"></span><span>${isAuto() ? 'Mode Otomatis' : 'Mode Aman'}</span><span class="sep"></span><span>v${esc(S.info.version)}</span>`;
  const tb = $('#tb-status');
  if (tb) tb.innerHTML = a ? `<span class="dot ${statusInfo(a.id).dot}"></span>${esc(a.label)}` : '';
}

function render() {
  if (!S.info) return;
  const gated = !licensed();
  document.body.classList.toggle('gated', gated);
  if (gated) {
    const ae = document.activeElement;
    const keepFocus = ae && ae.id === 'license-key' ? { s: ae.selectionStart, e: ae.selectionEnd } : null;
    $('#nav-items').innerHTML = '';
    $('#nav-bottom').innerHTML = '';
    $('#nav-account').innerHTML = '';
    $('#tb-status').innerHTML = '';
    $('#statusbar').innerHTML = `<span>FLOW CONNECT Desktop</span><span class="grow"></span><span>v${esc(S.info.version)}</span>`;
    $('#page').innerHTML = updateBanner() + gatePage();
    const inp = $('#license-key');
    if (inp && (keepFocus || !ae || ae === document.body || ae === $('#page'))) { inp.focus(); if (keepFocus) inp.setSelectionRange(keepFocus.s, keepFocus.e); }
    return;
  }
  // pertahankan fokus & posisi kursor saat render ulang
  const ae = document.activeElement;
  const keep = ae && ae.id && $('#page').contains(ae) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  const scroll = $('#page').scrollTop;
  const tv = $('#tool-video');
  const tvTime = tv ? tv.currentTime : 0;
  renderNav();
  renderStatus();
  $('#page').innerHTML = updateBanner() + PAGES[S.page]();
  $('#page').scrollTop = scroll;
  const tv2 = $('#tool-video');
  if (tv2 && tvTime) tv2.addEventListener('loadedmetadata', () => { tv2.currentTime = tvTime; }, { once: true });
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { /* bukan input teks */ } }
  }
  afterRender();
}

function afterRender() {
  for (const el of document.querySelectorAll('[data-w]')) el.style.width = Math.max(0, Math.min(100, Number(el.dataset.w) || 0)) + '%';
  const bar = $('#q-bar');
  if (bar) {
    const t = S.queue.jobs.length;
    const d = S.queue.jobs.filter((j) => j.status !== 'pending' && j.status !== 'running').length;
    bar.style.width = (t ? (d / t) * 100 : 0) + '%';
  }
  if (S.page === 'assistant' && S.chat.scroll) { const l = $('#chat-list'); if (l) l.scrollTop = l.scrollHeight; S.chat.scroll = false; }
  if (S.page === 'gallery' || S.page === 'studio') loadThumbs();
  if (['downloads', 'gallery', 'studio'].includes(S.page)) loadDlThumbs();
}

function go(page) {
  if (!PAGES[page]) return;
  S.page = page;
  $('#page').scrollTop = 0;
  render();
  $('#page').focus();
  if (page === 'gallery' || page === 'studio') galleryAutoLoad();
  if (page === 'studio' && S.studioTab === 'skill') { skillsLoad(false); if (!S.chat.catalog) chatCatalog(false).then(() => render()); }
  if (page === 'assistant') {
    S.chat.scroll = true;
    if (S.chat.catalog && !S.chat.catalogError) render();
    chatCatalog(false); // selalu cek model terbaru dari admin (cache 1 menit di proses utama)
    const i = $('#chat-input'); if (i) i.focus();
  }
}

// ---------- Toast & dialog ----------
function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'ok' ? 'circle-check' : kind === 'err' ? 'circle-x' : 'info', 'lg')}<div class="text">${esc(text)}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 4000);
}

/** Dialog modal bergaya ContentDialog. Mengembalikan nilai tombol atau null bila dibatalkan. */
function dialog({ title, body, buttons, onOpen, validate }) {
  const d = $('#dialog');
  d.innerHTML = `<form method="dialog"><div class="body"><h3>${title}</h3>${body}</div><div class="foot">${buttons
    .map((b) => `<button class="btn ${b.primary ? 'primary' : ''}" value="${b.value}" ${b.primary ? 'data-primary' : ''}>${b.label}</button>`)
    .join('')}</div></form>`;
  return new Promise((resolve) => {
    const form = d.querySelector('form');
    form.addEventListener('submit', (e) => {
      const v = e.submitter ? e.submitter.value : (d.querySelector('[data-primary]') || {}).value;
      if (v && v !== 'cancel' && validate && !validate(d)) { e.preventDefault(); return; }
      e.preventDefault();
      d.close(v || 'cancel');
    });
    d.addEventListener('close', () => {
      const v = d.returnValue;
      resolve(v && v !== 'cancel' ? { value: v, el: d } : null);
    }, { once: true });
    d.returnValue = '';
    d.showModal();
    if (onOpen) onOpen(d);
    const f = d.querySelector('input:not([type=checkbox]), textarea');
    if (f) f.focus();
  });
}

// ---------- Aksi ----------
async function busy(key, fn) {
  if (S.busy.has(key)) return;
  S.busy.add(key);
  render();
  try { return await fn(); } catch (e) { toast(msg(e), 'err'); } finally { S.busy.delete(key); render(); }
}
function log(text, k = 'info') {
  S.studio.log.unshift({ t: Date.now(), text, k });
  S.studio.log = S.studio.log.slice(0, 50);
}

async function addImages(paths) {
  const list = await call('files:register', paths);
  if (paths.length && !list.length) { toast(ERR.INVALID_IMAGE, 'err'); return; }
  const max = isFrames(opts()) ? 2 : 10;
  for (const p of list) {
    if (S.studio.images.length >= max) { toast(max === 2 ? 'Mode Frame hanya memakai 2 foto: frame awal & frame akhir.' : 'Maksimal 10 gambar.', 'err'); break; }
    if (S.studio.images.includes(p)) continue;
    if (S.studio.endFirst && S.studio.images.length === 1 && S.studio.images[0] === S.studio.endFirst) { S.studio.images.unshift(p); S.studio.endFirst = null; }
    else S.studio.images.push(p);
  }
  render();
  for (const p of list) {
    if (S.studio.previews[p] === undefined) {
      S.studio.previews[p] = (await call('files:preview', p).catch(() => null)) || null;
    }
  }
  render();
}

function mentionNote(m) {
  return m && m.missing && m.missing.length ? ` Tidak ditemukan di Flow: ${m.missing.map((x) => '@' + x).join(', ')} (ditulis sebagai teks).` : '';
}
function settingsNote(r) {
  if (!r) return '';
  const names = { kind: 'jenis', sub: 'mode', model: 'model', ratio: 'rasio', count: 'jumlah', duration: 'durasi' };
  const ok = Object.keys(r.applied || {}).length;
  return (ok ? ` Setelan diterapkan (${ok}).` : '') + (r.missing && r.missing.length ? ` Tidak ditemukan di Flow: ${r.missing.map((k) => names[k] || k).join(', ')}.` : '');
}
function studioSummary() {
  const o = opts();
  if (!o.apply) return 'setelan Flow apa adanya';
  const sub = o.kind === 'video' ? (SUBS.find((x) => x[0] === o.sub) || [])[3] : 'Gambar';
  const d = durationFor(o.kind, o.model);
  return [sub, o.model, o.ratio, 'x' + o.count, d ? d + ' dtk' : ''].filter(Boolean).join(' · ');
}
function setStudio(patch) {
  const prev = opts();
  const o = { ...prev, ...patch, models: { ...DEFAULT_MODEL, ...(prev.models || {}) } };
  if (patch.kind && patch.kind !== prev.kind) {
    // model terakhir per jenis diingat (Video ↔ Gambar)
    o.model = o.models[o.kind] || DEFAULT_MODEL[o.kind];
    if (!RATIOS[o.kind].includes(o.ratio)) o.ratio = '16:9';
  }
  if (!o.model || !KIND_RE[o.kind].test(o.model)) o.model = DEFAULT_MODEL[o.kind];
  o.models[o.kind] = o.model;
  o.duration = durationFor(o.kind, o.model);
  S.settings.studio = o;
  render();
  call('settings:set', { studio: o }).catch((e) => toast(msg(e), 'err'));
  if (S.studioTab === 'bulk') bulkPlanSoon();
}

// Kartu login Google: aplikasi menunggu login selesai, lalu menyambung tersembunyi & membuat project baru
const LOGIN_STEPS = [
  ['card', 'Kartu login Google terbuka', 'Masuk ke akun Google Anda di jendela kecil itu. Aplikasi tidak menyentuh halaman login.'],
  ['connecting', 'Membuka Google Flow di latar belakang', 'Kartu ditutup otomatis; Flow berjalan tanpa jendela.'],
  ['project', 'Membuat project baru', 'Tombol "New project" ditekan untuk Anda.'],
  ['done', 'Siap di Studio', '']
];
function loginSheetHtml() {
  const l = S.login || {};
  const idx = Math.max(0, LOGIN_STEPS.findIndex((x) => x[0] === l.state));
  return `<form method="dialog"><div class="body login-sheet">
    <div class="ls-head"><div class="ls-logo">${icon('log-in', 'lg')}</div><div><h3>Masuk ke Google</h3><div class="muted small">${esc((accById(l.id) || {}).label || '')}</div></div></div>
    <ol class="ls-steps">${LOGIN_STEPS.map(([, t, d], i) => `<li class="${i < idx || l.state === 'done' ? 'done' : i === idx ? 'now' : ''}"><span class="ls-dot">${i < idx || l.state === 'done' ? icon('check') : i === idx ? icon('loader-circle', 'spin') : i + 1}</span><div><b>${t}</b>${d ? `<div class="muted small">${d}</div>` : ''}</div></li>`).join('')}</ol>
    <p class="small faint">Kartu tidak muncul? Periksa taskbar, atau gunakan <a data-ls="window">login di browser biasa</a>.</p>
  </div><div class="foot"><button class="btn" value="cancel" data-ls="cancel">${l.state === 'card' ? 'Batal' : 'Tutup'}</button></div></form>`;
}
function renderLoginSheet() {
  const d = $('#dialog');
  if (!S.login || !d.open || !d.classList.contains('ls')) return;
  d.innerHTML = loginSheetHtml();
}
async function loginFlow(id) {
  if (S.login) return;
  S.login = { id, state: 'card' };
  const d = $('#dialog');
  d.classList.add('ls');
  d.innerHTML = loginSheetHtml();
  const onClick = (e) => {
    const b = e.target.closest('[data-ls]');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.ls === 'window') { call('accounts:loginCancel', id); d.close(); ACTIONS.loginWindowHelp(); }
    else { if (S.login && S.login.state === 'card') call('accounts:loginCancel', id); d.close(); }
  };
  d.addEventListener('click', onClick);
  d.addEventListener('close', () => { d.removeEventListener('click', onClick); d.classList.remove('ls'); }, { once: true });
  d.showModal();
  try {
    const r = await call('accounts:login', id);
    S.statuses[id] = r.status;
    if (r.ok) {
      S.login.state = 'done';
      renderLoginSheet();
      toast(r.status.projectId ? 'Masuk berhasil — project baru siap di Studio.' : 'Masuk berhasil.', 'ok');
      await new Promise((res) => setTimeout(res, 900));
      if (d.open) d.close();
      go('studio');
    } else if (S.login.state === 'not-signed-in') {
      if (d.open) d.close();
      toast('Login belum selesai. Coba lagi dan masuk sampai Google Flow terbuka.', 'err');
    } else if (d.open) d.close();
  } catch (e) {
    if (d.open) d.close();
    toast(msg(e), 'err');
  } finally { S.login = null; render(); }
}

const ACTIONS = {
  go: (el) => go(el.dataset.page),
  external: (el) => call('shell:external', el.dataset.url).catch((e) => toast(msg(e), 'err')),
  openDownloads: () => call('files:openDownloads'),
  openFile: (el) => call('files:open', el.dataset.path).catch((e) => toast(msg(e), 'err')),
  showFile: (el) => call('files:show', el.dataset.path).catch((e) => toast(msg(e), 'err')),
  forgetFile: async (el) => { S.settings = await call('files:forget', el.dataset.path); render(); },

  async addAccount() {
    const r = await dialog({
      title: 'Tambah akun Google',
      body: `<p>Beri nama agar mudah dikenali, mis. "Kerja" atau "Pribadi". Email terdeteksi otomatis setelah Anda masuk.</p>
        <label class="field"><span>Nama akun</span><input class="input" name="label" maxlength="40" placeholder="Akun ${S.settings.accounts.length + 1}"></label>`,
      buttons: [{ label: 'Tambah', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }]
    });
    if (!r) return;
    S.settings = await call('accounts:add', r.el.querySelector('[name=label]').value);
    const a = S.settings.accounts[S.settings.accounts.length - 1];
    if (S.page !== 'accounts') go('accounts'); else render();
    const next = await dialog({
      title: 'Masuk ke Google sekarang?',
      body: `<p>Kartu login Google kecil akan terbuka. Masuk ke akun Anda di sana — setelah itu aplikasi otomatis membuka Google Flow di latar belakang dan membuat project baru untuk "${esc(a.label)}".</p>`,
      buttons: [{ label: 'Masuk ke Google', value: 'ok', primary: true }, { label: 'Nanti', value: 'cancel' }]
    });
    if (next) ACTIONS.login({ dataset: { id: a.id } });
  },
  async renameAccount(el) {
    const a = accById(el.dataset.id);
    const r = await dialog({
      title: 'Ganti nama akun',
      body: `<label class="field"><span>Nama akun</span><input class="input" name="label" maxlength="40" value="${esc(a.label)}"></label>`,
      buttons: [{ label: 'Simpan', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }]
    });
    if (!r) return;
    S.settings = await call('accounts:rename', a.id, r.el.querySelector('[name=label]').value);
    render();
  },
  async removeAccount(el) {
    const a = accById(el.dataset.id);
    const r = await dialog({
      title: `Hapus akun "${esc(a.label)}"?`,
      body: `<p>Akun dihapus dari aplikasi dan jendela browsernya ditutup. Tugas antrean milik akun ini ikut dihapus.</p>
        <label class="check"><input type="checkbox" name="wipe" checked> Hapus juga data login (profil browser) di PC ini</label>`,
      buttons: [{ label: 'Hapus', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }]
    });
    if (!r) return;
    await busy('removeAccount' + a.id, async () => {
      S.settings = await call('accounts:remove', a.id, r.el.querySelector('[name=wipe]').checked);
      toast('Akun dihapus.', 'ok');
    });
  },
  async setActive(el) { S.settings = await call('settings:set', { activeAccountId: el.dataset.id }); render(); },
  login: (el) => loginFlow(el.dataset.id),
  loginWindowHelp: async () => {
    const a = acc();
    if (!a) return;
    const r = await dialog({
      title: 'Login di browser biasa',
      body: '<p>Cadangan bila kartu login bermasalah: jendela Chrome/Edge biasa dibuka di halaman login Google. Setelah berhasil masuk, <b>tutup jendela itu</b>, lalu klik <b>Hubungkan</b>.</p>',
      buttons: [{ label: 'Buka browser', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }]
    });
    if (r) await call('accounts:loginWindow', a.id);
  },
  connect: (el) => busy('connect' + `data-id="${el.dataset.id}"`, async () => {
    S.activity = 'Membuka Google Flow di latar belakang…';
    const s = await call('accounts:connect', el.dataset.id);
    S.statuses[el.dataset.id] = s;
    S.activity = '';
    if (s.signedIn) toast(s.projectId ? 'Terhubung — project siap di Studio.' : 'Terhubung ke Google Flow.', 'ok');
    else toast('Terhubung, tetapi belum masuk ke Google. Klik "Masuk ke Google".', 'info');
  }),
  newProject: (el) => busy('newProject' + `data-id="${el.dataset.id}"`, async () => {
    const s = await call('flow:newProject', el.dataset.id);
    S.statuses[el.dataset.id] = s;
    S.gallery.key = '';
    S.studio.sel = null;
    log(`Project baru dibuat${s.projectTitle ? ': ' + s.projectTitle : ''}.`, 'ok');
    toast('Project baru siap.', 'ok');
    galleryAutoLoad();
  }),
  resetHeadless: async (el) => { S.settings = await call('accounts:resetHeadless', el.dataset.id); toast('Mode tersembunyi dicoba lagi saat akun dihubungkan berikutnya.', 'ok'); render(); },
  help: () => helpDialog(),
  disconnect: async (el) => {
    const r = await dialog({
      title: 'Putuskan akun?',
      body: '<p>Aplikasi berhenti mengendalikan browser akun ini.</p><label class="check"><input type="checkbox" name="close" checked> Tutup juga jendela browser-nya</label>',
      buttons: [{ label: 'Putuskan', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }]
    });
    if (!r) return;
    await busy('disconnect' + `data-id="${el.dataset.id}"`, async () => {
      S.statuses[el.dataset.id] = await call('accounts:disconnect', el.dataset.id, r.el.querySelector('[name=close]').checked);
    });
  },
  showFlow: (el) => busy('showFlow' + `data-id="${el.dataset.id}"`, () => call('flow:show', el.dataset.id)),

  // Studio: setelan Flow
  studioOpt: (el) => setStudio({ [el.dataset.k]: /^(count|duration)$/.test(el.dataset.k) ? Number(el.dataset.v) : el.dataset.v }),
  studioSel: (el) => { S.studio.sel = el.dataset.id; render(); },
  studioScan: () => busy('studioScan', async () => {
    const a = acc();
    const r = await call('flow:scan', a.id);
    S.flowOptions[a.id] = r;
    toast(r.models.length ? `${r.models.length} model terbaca dari Google Flow.` : 'Daftar model tidak terbaca — pilihan bawaan tetap bisa dipakai.', r.models.length ? 'ok' : 'info');
  }),

  // Studio
  pickImages: async () => { const list = await call('files:pickImages'); if (list.length) addImages(list); },
  removeImage: (el) => { S.studio.images.splice(Number(el.dataset.i), 1); if (!S.studio.images.includes(S.studio.endFirst)) S.studio.endFirst = null; render(); },
  insertTag: (el) => insertMention(el.dataset.tag, false),
  clearImages: () => { S.studio.images = []; render(); },
  async send() {
    const a = acc();
    if (!a || S.studio.busy) return;
    if (isFrames(opts()) && S.studio.images.length !== 2) { toast(ERR.FRAMES_REQUIRED, 'err'); return; }
    S.studio.busy = 'send'; S.studio.busyAt = Date.now();
    S.activity = 'Mengirim ke Google Flow…';
    render();
    try {
      const r = await call('flow:send', a.id, { prompt: S.studio.prompt, images: S.studio.images, tags: refTags(S.studio.images), options: opts() });
      const parts = [];
      if (r.refs && r.refs.length) parts.push(`${r.refs.length} gambar diunggah (${r.refs.map((x) => '@' + x.tag).join(', ')})`);
      if (S.studio.prompt.trim()) parts.push('prompt');
      log(`Terkirim ke Flow: ${parts.join(' + ')}.${settingsNote(r.settings)}${mentionNote(r.mentions)}`, 'ok');
      await call('flow:afterSend', a.id, true);
      toast('Terkirim. Tekan Generate di jendela Google Flow.', 'ok');
    } catch (e) { log(msg(e), 'err'); toast(msg(e), 'err'); }
    S.studio.busy = ''; S.studio.busyAt = 0;
    S.activity = '';
    render();
  },
  async sendGenerate() {
    const a = acc();
    if (!a || S.studio.busy || !isAuto()) return;
    if (!S.studio.prompt.trim() && !S.studio.images.length) { toast(ERR.NOTHING_TO_SEND, 'err'); return; }
    if (isFrames(opts()) && S.studio.images.length !== 2) { toast(ERR.FRAMES_REQUIRED, 'err'); return; }
    S.studio.busy = 'generate';
    S.studio.busyAt = Date.now();
    S.activity = 'Menyiapkan Google Flow…';
    render();
    try {
      const r = await call('flow:run', a.id, { prompt: S.studio.prompt, images: S.studio.images, tags: refTags(S.studio.images), options: opts(), waitResults: S.studio.waitResults });
      if (r.refs && r.refs.length) log(`${r.refs.length} gambar referensi terunggah di Flow & ditandai: ${r.refs.map((x) => '@' + x.tag).join(', ')}.`, 'ok');
      log(`Generate ditekan${r.click && r.click.label ? ' ("' + r.click.label + '")' : ''}.${settingsNote(r.settings)}${mentionNote(r.mentions)}${r.fellBack ? ' Mode tersembunyi ditolak — beralih ke jendela diperkecil.' : ''}`, 'ok');
      if (r.items) {
        const took = fmtDur(Date.now() - S.studio.busyAt);
        log(`${r.items.length} hasil siap dalam ${took}${r.files.length ? `, ${r.files.length} file diunduh` : ''}.`, 'ok');
        toast(`${r.items.length} hasil siap dalam ${took}${r.files.length ? ' & sudah diunduh' : ''}.`, 'ok');
        S.studio.sel = r.items[0] ? r.items[0].mediaId : null;
        galleryMerge(r.items); // langsung tampil, tanpa menunggu daftar Flow
      } else { toast('Generate ditekan. Hasil muncul di pratinjau saat selesai.', 'ok'); galleryFollow(); }
    } catch (e) { log(`${msg(e)} (setelah ${fmtDur(Date.now() - S.studio.busyAt)})`, 'err'); toast(msg(e), 'err'); }
    S.studio.busy = '';
    S.studio.busyAt = 0;
    S.activity = '';
    render();
    if (galleryKey()) galleryLoad(false); // muat ulang daftar (tanpa mengosongkan hasil yang sudah tampil)
  },

  // Galeri
  galleryRefresh: () => { S.gallery.thumbs = Object.fromEntries(Object.entries(S.gallery.thumbs).filter(([, v]) => v)); return galleryLoad(true); },
  thumbRetry: (el) => { delete S.gallery.thumbs[el.dataset.id]; render(); },
  chatSend: () => chatSend(),
  chatRetry: () => chatSend(''),
  chatStarter: (el) => chatSend(el.dataset.text),
  chatNew: () => { S.chat.messages = []; S.chat.error = null; chatSave(); render(); const i = $('#chat-input'); if (i) i.focus(); },
  chatMode: (el) => { S.chat.mode = el.dataset.v; chatSave(); render(); },
  chatCatalog: () => chatCatalog(true),
  chatCopy: async (el) => {
    const t = chatPromptAt(el);
    if (!t) return;
    await navigator.clipboard.writeText(t);
    toast('Prompt disalin.', 'ok');
  },
  chatUse: (el) => {
    const t = chatPromptAt(el);
    if (!t) return;
    S.studio.prompt = t.slice(0, 8000);
    const kind = chatMode();
    if (S.settings && S.settings.studio && S.settings.studio.kind !== kind) setStudio({ kind });
    S.studioTab = 'buat';
    go('studio');
    toast('Prompt dipindahkan ke Studio. Periksa lalu tekan ' + (isAuto() ? 'Generate.' : 'Kirim ke Flow.'), 'ok');
  },
  galleryCat: (el) => { S.galleryCat = el.dataset.cat; render(); },
  dlCat: (el) => { S.dlCat = el.dataset.cat; render(); },
  gallerySelectDay: (el) => {
    const g = S.gallery;
    const day = galleryVisible().filter((i) => i.done && dayKey(i.createdAt) === el.dataset.day);
    if (day.every((i) => g.selected.has(i.mediaId))) day.forEach((i) => g.selected.delete(i.mediaId));
    else day.forEach((i) => g.selected.add(i.mediaId));
    render();
  },
  gallerySelectAll: () => {
    const g = S.gallery;
    const vis = galleryVisible().filter((i) => i.done);
    if (vis.length && vis.every((i) => g.selected.has(i.mediaId))) vis.forEach((i) => g.selected.delete(i.mediaId));
    else vis.forEach((i) => g.selected.add(i.mediaId));
    render();
  },
  galleryDownload: (el) => downloadItems([el.dataset.id]),
  galleryDownloadSel: () => downloadItems([...S.gallery.selected]),

  // Otomatis
  enableAuto: () => enableAuto(),
  bulkView: (el) => { S.bulk.view = el.dataset.v; render(); if (el.dataset.v === 'form') bulkPlanSoon(); },
  bulkShowAll: () => { S.bulk.showAll = !S.bulk.showAll; render(); },
  bulkImport: () => { const f = $('#bulk-file'); if (f) f.click(); },
  bulkReadCredits: (el) => bulkRead(el.dataset.id),
  bulkPickImages: async () => { const list = await call('files:pickImages', bulkRefMax()); if (list.length) await bulkAddImages(list); },
  bulkRemoveImage: (el) => { bulkForm().images.splice(Number(el.dataset.i), 1); bulkSave(); render(); bulkPreviews(); bulkPlanSoon(); },
  bulkClearImages: () => { bulkForm().images = []; bulkSave(); render(); bulkPlanSoon(); },
  bulkFromStudio: () => bulkAddImages([...S.studio.images]),
  bulkRefMode: (el) => {
    const f = bulkForm();
    f.refMode = el.dataset.v === 'each' ? 'each' : 'shared';
    if (f.refMode === 'shared') f.images = [...new Set(f.images)];
    bulkSave(); S.bulk.plan = null; render(); bulkPlanSoon();
  },
  bulkInsertTag: (el) => {
    const ta = $('#bulk-prompts');
    if (!ta) return;
    const at = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, at), ins = (before && !/\s$/.test(before) ? ' ' : '') + '@' + el.dataset.tag + ' ';
    ta.value = before + ins + ta.value.slice(ta.selectionEnd ?? at);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = at + ins.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  },
  bulkReadAll: () => busy('bulkReadAll', async () => {
    const list = S.settings.accounts.filter(bulkAccOn);
    if (!list.length) throw new Error('NO_ACCOUNTS');
    let ok = 0;
    for (const a of list) { if (await bulkRead(a.id, true)) ok++; }
    toast(`Kredit terbaca: ${ok}/${list.length} akun.`, ok === list.length ? 'ok' : 'info');
  }),
  bulkStart: async () => {
    if (S.busy.has('bulkStart')) return;
    if (!isAuto()) { const ok = await enableAuto(); if (!ok) return; }
    const input = bulkInput();
    const p = await call('bulk:plan', input);
    const video = p.kind === 'video';
    const names = p.accounts.filter((a) => a.planned).map((a) => `${esc((accById(a.id) || {}).label || 'akun')}: ${a.planned}`).join(' · ');
    const r = await dialog({
      title: `Mulai Bulk ${p.target} ${video ? 'video' : 'gambar'}?`,
      body: `<p>${p.jobs}× Generate di Google Flow${video ? ` · ${p.credits} kredit (${p.cost}/video)` : ''} · perkiraan ±${fmtDurLong(bulkEstimate(p))}.</p><p class="muted small">${names}</p><p class="muted small">Model ${esc(opts().model)} · ${esc(opts().ratio)}${input.images.length ? ` · ${input.images.length} gambar referensi (${input.refMode === 'each' ? 'satu per prompt' : 'sama untuk semua'})` : ''}. Jendela Flow tetap tersembunyi; Anda bisa menghentikan kapan saja.</p>`,
      buttons: [{ label: 'Batal', value: 'cancel' }, { label: 'Mulai', value: 'go', primary: true }]
    });
    if (!r) return;
    S.busy.add('bulkStart');
    try {
      S.bulk.st = await call('bulk:start', input);
      S.bulk.view = 'run'; S.bulk.showAll = false;
      toast('Bulk Generate dimulai.', 'ok');
    } finally { S.busy.delete('bulkStart'); render(); }
  },
  bulkStop: async () => { S.bulk.st = await call('bulk:stop'); render(); },
  bulkResume: async () => {
    const b = S.bulk.st.batch;
    const accounts = b ? b.accounts.map((a) => { const x = accById(a.id); const c = x ? bulkCredits(x) : null; return { id: a.id, credits: c }; }) : [];
    S.bulk.st = await call('bulk:resume', { accounts });
    render();
  },
  bulkClear: async () => {
    const r = await dialog({ title: 'Hapus riwayat batch?', body: '<p class="muted">File hasil yang sudah diunduh tidak dihapus.</p>', buttons: [{ label: 'Batal', value: 'cancel' }, { label: 'Hapus', value: 'ok', primary: true }] });
    if (!r) return;
    S.bulk.st = await call('bulk:clear');
    S.bulk.view = 'form';
    render();
    bulkPlanSoon();
  },
  disableAuto: async () => { S.settings = await call('auto:ack', false); toast('Mode Aman aktif.', 'ok'); render(); },
  async queueAdd() {
    if (!S.settings.accounts.length) { toast(ERR.UNKNOWN_ACCOUNT, 'err'); return; }
    if (!isAuto()) { const ok = await enableAuto(); if (!ok) return; }
    let images = [...S.studio.images];
    const r = await dialog({
      title: 'Tambah tugas ke antrean',
      body: `<p>Tulis <b>satu prompt per baris</b> — setiap baris menjadi satu tugas. Gambar referensi (opsional) dan setelan Studio saat ini (<b>${esc(studioSummary())}</b>) dipakai untuk semua tugas ini.</p>
        <label class="field"><span>Akun</span><select class="input" name="acc">${S.settings.accounts.map((x) => `<option value="${x.id}" ${x.id === S.settings.activeAccountId ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
        <label class="field"><span>Prompt</span><textarea class="input" name="prompts" rows="7" placeholder="Kucing astronot di bulan, gaya film 70-an&#10;Pasar terapung saat fajar, sinematik">${esc(S.studio.prompt)}</textarea></label>
        <div class="field"><span>Gambar referensi</span><div class="hrow"><button type="button" class="btn sm" id="dlg-pick">${icon('folder-open')}<span>Pilih gambar…</span></button><span class="muted small" id="dlg-imgs">${images.length ? images.length + ' gambar' : 'Tidak ada'}</span></div></div>`,
      buttons: [{ label: 'Tambahkan', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }],
      onOpen: (d) => {
        d.querySelector('#dlg-pick').addEventListener('click', async () => {
          const list = await call('files:pickImages');
          if (list.length) { images = list; d.querySelector('#dlg-imgs').textContent = list.length + ' gambar'; }
        });
      },
      validate: (d) => !!d.querySelector('[name=prompts]').value.trim()
    });
    if (!r) return;
    const prompts = r.el.querySelector('[name=prompts]').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    try {
      S.queue = await call('queue:add', { prompts, images, tags: refTags(images), accountId: r.el.querySelector('[name=acc]').value, options: opts() });
      toast(`${prompts.length} tugas ditambahkan.`, 'ok');
      if (S.page !== 'auto') go('auto'); else render();
    } catch (e) { toast(msg(e), 'err'); }
  },
  queueStart: async () => { try { S.queue = await call('queue:start'); render(); } catch (e) { toast(msg(e), 'err'); } },
  queueStop: async () => { S.queue = await call('queue:stop'); render(); },
  queueClear: async () => { S.queue = await call('queue:clear'); render(); },
  queueRemove: async (el) => { S.queue = await call('queue:remove', el.dataset.id); render(); },
  queueRetry: async (el) => { S.queue = await call('queue:retry', el.dataset.id); render(); },

  // Lisensi
  licenseActivate: () => busy('licenseActivate', async () => {
    const key = (S.gateKey || '').trim();
    if (!key) { toast('Tempel kunci lisensi terlebih dahulu.', 'err'); return; }
    S.license = await call('license:activate', key);
    S.gateKey = '';
    S.settings = (await call('app:info')).settings;
    toast(`Lisensi aktif${S.license.info && S.license.info.email ? ' — ' + S.license.info.email : ''}. Selamat bekerja!`, 'ok');
    go('home');
  }),
  licenseVerify: () => busy('licenseVerify', async () => {
    S.license = await call('license:verify');
    if (S.license.state === 'valid') toast('Lisensi valid.', 'ok');
    else if (S.license.state === 'offline') toast(ERR.NETWORK, 'err');
    render();
  }),
  licenseLogout: async () => {
    const r = await dialog({
      title: 'Keluar dari lisensi?',
      body: '<p>Aplikasi akan terkunci sampai kunci lisensi dimasukkan lagi. Slot PC ini dilepas sehingga kunci bisa dipakai di PC lain. Akun Google &amp; pengaturan tetap tersimpan.</p>',
      buttons: [{ label: 'Keluar', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }]
    });
    if (!r) return;
    S.license = await call('license:deactivate');
    render();
  },

  // Pembaruan
  updateCheck: async () => {
    S.updateChecking = true;
    try { S.update = await call('update:check'); } finally { S.updateChecking = false; }
    if (S.update.state === 'none') toast('Anda sudah memakai versi terbaru.', 'ok');
    render();
  },
  updateDownload: async () => {
    S.update = await call('update:download');
    if (S.update.portable) toast('Halaman unduhan dibuka di browser. Ganti file portable lama dengan yang baru.', 'info');
    render();
  },
  updateHide: () => { S.updateHidden = S.update && S.update.version; render(); },
  updateInstall: async () => { await call('update:install'); },

  // Pengaturan
  pickFolder: async () => { S.settings = await call('files:pickFolder'); render(); }
};

async function enableAuto() {
  const r = await dialog({
    title: 'Aktifkan Mode Otomatis?',
    body: `<p>Di Mode Otomatis aplikasi akan menekan tombol <b>Generate</b> di Google Flow atas nama Anda.</p>
      <ul>
        <li>Google dapat mendeteksi pemakaian otomatis dan <b>membatasi atau memblokir akun</b> Anda.</li>
        <li>Kuota/kredit Google Flow Anda tetap terpakai untuk setiap generate.</li>
        <li>Gunakan secukupnya, sebaiknya dengan akun cadangan. Jangan jalankan antrean besar terus-menerus.</li>
        <li>Anda bertanggung jawab mematuhi ketentuan layanan Google.</li>
      </ul>
      <label class="check"><input type="checkbox" name="agree"> Saya memahami risikonya</label>`,
    buttons: [{ label: 'Aktifkan', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }],
    onOpen: (d) => {
      const cb = d.querySelector('[name=agree]');
      const ok = d.querySelector('[data-primary]');
      ok.disabled = true;
      cb.addEventListener('change', () => { ok.disabled = !cb.checked; });
    },
    validate: (d) => d.querySelector('[name=agree]').checked
  });
  if (!r) { render(); return false; }
  S.settings = await call('auto:ack', true);
  toast('Mode Otomatis aktif.', 'ok');
  render();
  return true;
}

// ---------- Galeri: muat & thumbnail ----------
function galleryKey() {
  const a = acc();
  const s = a ? st(a.id) : {};
  return a && s.connected && s.signedIn && s.projectId ? `${a.id}:${s.projectId}` : '';
}
// hasil dari balasan generate → masukkan ke galeri sekarang juga (daftar Flow menyusul)
function galleryMerge(items) {
  const g = S.gallery;
  const k = galleryKey();
  if (!k || !Array.isArray(items) || !items.length) return;
  if (k !== g.key) { g.items = []; g.selected.clear(); g.thumbs = {}; g.key = k; }
  const have = new Set(g.items.map((i) => i.mediaId));
  g.items = [...items.filter((i) => i && i.mediaId && !have.has(i.mediaId)), ...g.items];
}
// generate dikirim tanpa menunggu hasil → muat ulang galeri beberapa kali sampai hasil muncul
let followTimers = [];
function galleryFollow() {
  followTimers.forEach(clearTimeout);
  followTimers = [20, 45, 90, 150, 240, 360].map((sec) => setTimeout(() => { if (galleryKey()) galleryLoad(false); }, sec * 1000));
}
let refreshSoonTimer = null;
function galleryRefreshSoon() {
  clearTimeout(refreshSoonTimer);
  refreshSoonTimer = setTimeout(() => { if (galleryKey() && (S.page === 'gallery' || S.page === 'studio')) galleryLoad(false); }, 1500);
}
function galleryAutoLoad() {
  const k = galleryKey();
  if (k && k !== S.gallery.key) galleryLoad(false);
}
async function galleryLoad(force) {
  const k = galleryKey();
  const g = S.gallery;
  if (!k) return;
  if (g.loading) { g.again = true; return; } // sedang memuat → ulangi setelah selesai (hasil terbaru)
  if (k !== g.key) { g.items = []; g.selected.clear(); g.thumbs = {}; }
  g.key = k;
  g.loading = true;
  g.error = null;
  render();
  try {
    const [id, pid] = k.split(':');
    g.items = await call('flow:listMedia', id, pid);
    const ids = new Set(g.items.map((i) => i.mediaId));
    g.selected.forEach((x) => { if (!ids.has(x)) g.selected.delete(x); });
    if (force) toast(`${g.items.length} hasil dimuat.`, 'ok');
  } catch (e) { g.error = e.message; }
  g.loading = false;
  render();
  if (g.again) { g.again = false; galleryLoad(false); }
}
// sumber gambar pratinjau: thumbnail dari Flow, atau file hasil yang sudah diunduh
function thumbSrc(it, local) {
  const t = S.gallery.thumbs[it.mediaId];
  if (t) return t;
  const l = local || S.settings.downloads.find((d) => d.mediaId === it.mediaId);
  if (!l) return '';
  const dt = S.dlThumbs[l.path];
  if (dt && dt.url) return dt.url;
  return /\.(png|jpe?g|webp|gif)$/i.test(l.path) && !(dt && dt.missing) ? fileUrl(l.path) : '';
}
// thumbnail file unduhan (dibuat aplikasi, kecil) — halaman Unduhan, dan cadangan galeri bila Flow tidak memberi gambar
let dlThumbRunning = 0;
function loadDlThumbs() {
  let paths = [];
  if (S.page === 'downloads') paths = S.settings.downloads.map((d) => d.path);
  else if (S.page === 'gallery' || S.page === 'studio') {
    const g = S.gallery;
    paths = g.items.filter((i) => g.thumbs[i.mediaId] === null || (i.isVideo && !g.thumbs[i.mediaId]))
      .map((i) => (S.settings.downloads.find((d) => d.mediaId === i.mediaId) || {}).path).filter(Boolean);
  }
  const todo = paths.filter((p) => S.dlThumbs[p] === undefined);
  while (dlThumbRunning < 3 && todo.length) {
    const p = todo.shift();
    S.dlThumbs[p] = false;
    dlThumbRunning++;
    call('files:thumb', p)
      .then((r) => { S.dlThumbs[p] = r || null; })
      .catch(() => { S.dlThumbs[p] = null; })
      .finally(() => { dlThumbRunning--; if (['downloads', 'gallery', 'studio'].includes(S.page)) render(); });
  }
}
let thumbRunning = 0;
function loadThumbs() {
  const g = S.gallery;
  const a = acc();
  if (!a) return;
  // undefined = belum dicoba · false = sedang dimuat · null = gagal · string = data URL
  const todo = g.items.slice(0, S.page === 'studio' ? 14 : g.items.length).filter((i) => i.done && g.thumbs[i.mediaId] === undefined);
  while (thumbRunning < 3 && todo.length) {
    const it = todo.shift();
    g.thumbs[it.mediaId] = false;
    thumbRunning++;
    call('flow:thumb', a.id, it)
      .then((url) => { g.thumbs[it.mediaId] = url || null; })
      .catch(() => { g.thumbs[it.mediaId] = null; })
      .finally(() => { thumbRunning--; if (S.page === 'gallery' || S.page === 'studio') render(); });
  }
}
async function downloadItems(ids) {
  const a = acc();
  const g = S.gallery;
  let ok = 0, last = null;
  for (const id of ids) {
    const it = g.items.find((x) => x.mediaId === id);
    if (!it || g.busy.has(id)) continue;
    g.busy.add(id);
    render();
    try { last = await call('flow:download', a.id, it); ok++; } catch (e) { toast(msg(e), 'err'); }
    g.busy.delete(id);
    g.selected.delete(id);
    render();
  }
  if (ok) toast(`${ok} file diunduh ke folder FLOW CONNECT.`, 'ok');
  return last;
}

// ---------- Studio → Alat & Skill: aksi ----------
const TOOL_DEFAULTS = { at: 'end', sec: 0, ratio: '16:9', anchor: 'center', grid: '2', format: 'webp', quality: 85, max: '0', mode: 'auto', tol: 30, edgeOnly: true, pattern: '{tanggal} {nama}', cat: 'all', start: 1 };
function toolReset(keepOpen) {
  const T = S.tool;
  for (const u of T.urls) URL.revokeObjectURL(u);
  S.tool = { open: keepOpen ? T.open : null, src: null, files: [], opts: { ...TOOL_DEFAULTS, ...T.opts }, results: [], urls: [], busy: false, plan: null };
}
async function toolLoad(path) {
  const r = await call('tools:read', path);
  const blob = new Blob([r.data], { type: r.mime });
  const url = URL.createObjectURL(blob);
  S.tool.urls.push(url);
  const src = { path, name: r.name || baseName(path), blob, url, kind: /^video\//.test(r.mime) ? 'video' : 'image' };
  if (src.kind === 'image') {
    const bmp = await loadBitmap(blob);
    src.w = bmp.width; src.h = bmp.height;
    bmp.close();
  }
  return src;
}
async function toolAddPaths(paths) {
  const T = S.tool;
  const kind = TOOL_KIND[T.open] === undefined ? 'image' : TOOL_KIND[T.open];
  if (!kind || !paths.length) return;
  T.busy = true; render();
  try {
    if (kind === 'images') {
      for (const p of paths) if (!T.files.some((f) => f.path === p)) T.files.push({ path: p, name: baseName(p) });
      T.files = T.files.slice(0, 50);
    } else {
      const src = await toolLoad(paths[0]);
      if (src.kind !== (kind === 'video' ? 'video' : 'image')) throw new Error(kind === 'video' ? 'Pilih berkas video.' : 'Pilih berkas gambar.');
      if (src.kind === 'video') {
        const v = await loadVideo(src.url);
        src.dur = Number.isFinite(v.duration) ? v.duration : 0;
        v.removeAttribute('src'); v.load();
      }
      S.tool.src = src;
      T.results = T.results.slice(0, 24);
    }
  } finally { T.busy = false; render(); }
}
async function toolSave(c, name, format = 'png', quality = 0.92, extra = {}) {
  const blob = await toBlob(c, format, quality);
  const data = new Uint8Array(await blob.arrayBuffer());
  const path = await call('tools:save', { name, data, format });
  const url = URL.createObjectURL(blob);
  S.tool.urls.push(url);
  S.tool.results.unshift({ path, url, w: c.width, h: c.height, ...extra });
  return path;
}
async function toolRun() {
  const T = S.tool, o = T.opts;
  if (T.busy) return;
  T.busy = true; render();
  let n = 0;
  try {
    if (T.open === 'frame') {
      const v = await loadVideo(T.src.url);
      const live = $('#tool-video');
      const t = o.at === 'start' ? 0 : o.at === 'end' ? v.duration : o.at === 'now' ? (live ? live.currentTime : 0) : Number(o.sec) || 0;
      const { canvas, at } = await videoFrame(v, t);
      v.removeAttribute('src'); v.load();
      await toolSave(canvas, `${stem(T.src.name)} - frame ${o.at === 'start' ? 'awal' : o.at === 'end' ? 'akhir' : at.toFixed(1) + ' dtk'}`, 'png');
      n = 1;
    } else if (T.open === 'convert') {
      for (const f of T.files) {
        const src = await toolLoad(f.path);
        const bmp = await loadBitmap(src.blob);
        const c = resizeMax(bmp, Number(o.max) || 0);
        bmp.close();
        await toolSave(c, stem(f.name), o.format, o.quality / 100);
        n++;
        S.activity = `Konversi ${n}/${T.files.length}…`; renderStatus();
      }
      S.activity = '';
    } else {
      const bmp = await loadBitmap(T.src.blob);
      const name = stem(T.src.name);
      const fmt = /\.jpe?g$/i.test(T.src.name) ? 'jpg' : 'png';
      if (T.open === 'crop') {
        await toolSave(cropRatio(bmp, o.ratio, o.anchor), `${name} - ${o.ratio.replace(':', 'x')}`, fmt);
        n = 1;
      } else if (T.open === 'grid') {
        const [cols, rows] = o.grid === '2x1' ? [2, 1] : o.grid === '1x2' ? [1, 2] : [Number(o.grid), Number(o.grid)];
        const parts = gridSplit(bmp, cols, rows);
        for (let i = parts.length - 1; i >= 0; i--) await toolSave(parts[i], `${name} - bagian ${i + 1}`, fmt);
        n = parts.length;
      } else if (T.open === 'bg') {
        await toolSave(removeBackground(bmp, { mode: o.mode, tolerance: o.tol, edgeOnly: o.edgeOnly }), `${name} - tanpa latar`, 'png', 1, { alpha: true });
        n = 1;
      }
      bmp.close();
    }
    toast(`${n} berkas disimpan di folder Unduhan → Alat.`, 'ok');
  } catch (e) { toast(msg(e), 'err'); }
  T.busy = false;
  render();
}
/** Pasang hasil alat di Studio: slot 0/1 = foto awal/akhir mode Frame; tanpa slot = gambar referensi. */
async function placeInStudio(path, slot) {
  if (slot == null) {
    if (isFrames(opts()) && S.studio.images.length >= 2) setStudio({ sub: 'ingredients' });
    await addImages([path]);
  } else {
    await call('files:register', [path]);
    if (!isFrames(opts())) setStudio(opts().kind === 'video' ? { sub: 'frames' } : { kind: 'video', sub: 'frames' });
    const imgs = S.studio.images.slice(0, 2);
    if (slot === 0) { imgs[0] = path; S.studio.endFirst = null; }
    else if (imgs.length) imgs[1] = path;
    else { imgs[0] = path; S.studio.endFirst = path; } // foto akhir dulu → foto berikutnya jadi frame awal
    S.studio.images = imgs.filter(Boolean);
    if (S.studio.previews[path] === undefined) S.studio.previews[path] = (await call('files:preview', path).catch(() => null)) || null;
  }
  S.studioTab = 'buat';
  go('studio');
  toast(slot === 0 ? 'Dipasang sebagai frame awal.' : slot === 1 ? (S.studio.endFirst ? 'Dipasang sebagai frame akhir — tambahkan foto awal.' : 'Dipasang sebagai frame akhir.') : 'Ditambahkan ke Studio.', 'ok');
}

async function skillsLoad(force) {
  const k = S.sk;
  try { k.mine = await call('skills:mine'); } catch { k.mine = k.mine || []; }
  try { k.admin = await call('skills:catalog', !!force); k.adminError = null; } catch (e) { k.adminError = e.message; k.admin = k.admin || []; }
  if (S.page === 'studio' && S.studioTab === 'skill') render();
}
function skSelect(id) {
  const k = S.sk;
  if (k.sel === id) return;
  k.sel = id; k.edited = null; k.over = {}; k.result = null;
  const sk = allSkills().find((x) => x.id === id);
  const max = sk && sk.refs ? sk.refs.max : 0;
  k.images = k.images.slice(0, max);
}
async function skAddImages(paths) {
  const sk = curSkill();
  const max = sk && sk.refs ? sk.refs.max : 0;
  if (!max) return;
  const list = await call('files:register', paths);
  if (paths.length && !list.length) { toast(ERR.INVALID_IMAGE, 'err'); return; }
  for (const p of list) if (S.sk.images.length < max && !S.sk.images.includes(p)) S.sk.images.push(p);
  S.sk.edited = null;
  render();
  for (const p of list) if (S.studio.previews[p] === undefined) S.studio.previews[p] = (await call('files:preview', p).catch(() => null)) || null;
  render();
}
/** Terapkan skill ke Studio (prompt, foto, setelan). */
function skApply(sk, prompt) {
  const eff = skillOpts(sk);
  S.studio.prompt = String(prompt || '').slice(0, 8000);
  if (sk.category !== 'ai') { S.studio.images = [...S.sk.images]; S.studio.endFirst = null; }
  S.settings.studio = eff;
  call('settings:set', { studio: eff }).catch((e) => toast(msg(e), 'err'));
  S.studioTab = 'buat';
}
function skMessage(sk) { return compose(sk.template, skValues(sk), refTags(S.sk.images)); }
async function skChat(text, mode, extra = {}) {
  const models = chatModels();
  const model = extra.model || (models.find((m) => m.id === S.chat.model) || models.find((m) => m.is_default) || models[0] || {}).id;
  const r = await call('assistant:chat', { messages: [{ role: 'user', content: text.slice(0, 6000) }], mode, model, imagePath: extra.imagePath });
  return { ...r, prompts: r.prompts && r.prompts.length ? r.prompts : chatPrompts(r.reply || '') };
}
async function skQueueAdd(prompts, eff, images) {
  if (!S.settings.accounts.length) throw new Error('UNKNOWN_ACCOUNT');
  if (!isAuto()) { const ok = await enableAuto(); if (!ok) return false; }
  S.queue = await call('queue:add', { prompts, images, tags: refTags(images), accountId: S.settings.activeAccountId, options: eff });
  toast(`${prompts.length} tugas ditambahkan ke antrean Otomatis.`, 'ok');
  render();
  return true;
}

/** Dialog buat / ubah "Skill saya". */
async function skillEditor(init = {}) {
  const s0 = init.settings || {};
  const kind0 = s0.kind || init.category || opts().kind;
  const refs0 = init.refs || { min: 0, max: 0 };
  const refKey = refs0.min === 2 ? 'two' : refs0.min === 1 && refs0.max === 1 ? 'one' : refs0.min >= 1 ? 'many' : refs0.max > 0 ? 'opt' : 'none';
  const allModels = [...MODELS.video.map(([v]) => ['video', v]), ...MODELS.image.map(([v]) => ['image', v])];
  const r = await dialog({
    title: init.id ? 'Ubah skill' : 'Skill baru',
    body: `<div class="sk-editor">
      <label class="field"><span>Nama</span><input class="input" name="name" maxlength="60" value="${esc(init.name || '')}" placeholder="mis. Foto produk kopi"></label>
      <label class="field"><span>Deskripsi (opsional)</span><input class="input" name="description" maxlength="200" value="${esc(init.description || init.desc || '')}"></label>
      <div class="grid2">
        <label class="field"><span>Jenis</span><select class="input" name="kind"><option value="video" ${kind0 === 'video' ? 'selected' : ''}>Video</option><option value="image" ${kind0 === 'image' ? 'selected' : ''}>Gambar</option></select></label>
        <label class="field"><span>Mode video</span><select class="input" name="sub"><option value="ingredients" ${s0.sub !== 'frames' ? 'selected' : ''}>Bahan</option><option value="frames" ${s0.sub === 'frames' ? 'selected' : ''}>Frame (2 foto)</option></select></label>
        <label class="field"><span>Model</span><select class="input" name="model"><option value="">Ikuti Studio</option>${allModels.map(([k, v]) => `<option value="${esc(v)}" data-kind="${k}" ${s0.model === v ? 'selected' : ''}>${esc(v)} (${k === 'video' ? 'video' : 'gambar'})</option>`).join('')}</select></label>
        <label class="field"><span>Rasio</span><select class="input" name="ratio"><option value="">Ikuti Studio</option>${RATIOS.image.map((x) => `<option ${s0.ratio === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Jumlah</span><select class="input" name="count"><option value="">Ikuti Studio</option>${[1, 2, 3, 4].map((n) => `<option value="${n}" ${Number(s0.count) === n ? 'selected' : ''}>x${n}</option>`).join('')}</select></label>
        <label class="field"><span>Foto referensi</span><select class="input" name="refs">${[['none', 'Tidak perlu'], ['opt', 'Opsional (maks. 3)'], ['one', 'Wajib 1 foto'], ['many', 'Wajib 1–3 foto'], ['two', 'Wajib 2 foto']].map(([v, l]) => `<option value="${v}" ${refKey === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Ikon</span><select class="input" name="icon">${SKILL_ICONS.map((x) => `<option ${init.icon === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Templat prompt</span><textarea class="input mono" name="template" rows="7" maxlength="4000" placeholder="Foto produk {Produk} di atas {Latar:meja kayu|marmer putih}, cahaya pagi[, {Detail}]">${esc(init.template || '')}</textarea></label>
      <div class="faint small sk-help"><b>Isian:</b> <code>{Nama}</code> kotak teks · <code>{Gaya:Kartun|Anime}</code> pilihan · <code>{Gaya:Kartun=cartoon style|…}</code> label=teks prompt · <code>{@1}</code> tag foto ke-1 · <code>[ … ]</code> bagian opsional (dibuang bila isiannya kosong).</div>
    </div>`,
    buttons: [{ label: 'Simpan', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }],
    validate: (d) => !!d.querySelector('[name=name]').value.trim() && !!d.querySelector('[name=template]').value.trim()
  });
  if (!r) return null;
  const q = (n) => r.el.querySelector(`[name=${n}]`).value;
  const kind = q('kind');
  const model = q('model');
  const settings = { kind };
  if (kind === 'video') settings.sub = q('sub');
  if (model && KIND_RE[kind].test(model)) settings.model = model;
  if (q('ratio')) settings.ratio = q('ratio');
  if (q('count')) settings.count = Number(q('count'));
  const refs = { none: { min: 0, max: 0 }, opt: { min: 0, max: 3 }, one: { min: 1, max: 1 }, many: { min: 1, max: 3 }, two: { min: 2, max: 2 } }[q('refs')];
  const skill = { id: init.id && /^my-/.test(init.id) ? init.id : undefined, name: q('name'), description: q('description'), category: kind, icon: q('icon'), template: q('template'), settings, refs };
  const list = await call('skills:save', skill);
  S.sk.mine = list;
  const saved = skill.id ? list.find((x) => x.id === skill.id) : list[0];
  if (saved) { S.sk.group = S.sk.group === 'all' || S.sk.group === 'mine' ? S.sk.group : 'mine'; skSelect(saved.id); }
  toast('Skill disimpan di Skill saya.', 'ok');
  render();
  return saved;
}

Object.assign(ACTIONS, {
  studioTab: (el) => studioTab(el.dataset.tab),
  swapFrames: () => { const i = S.studio.images; if (i.length >= 2) { [i[0], i[1]] = [i[1], i[0]]; render(); } },

  // Alat
  toolOpen: (el) => {
    if (S.tool.open === el.dataset.id) { toolReset(false); render(); return; }
    toolReset(false);
    S.tool.open = el.dataset.id;
    render();
    const p = $('#tool-panel'); if (p) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },
  toolClose: () => { toolReset(false); render(); },
  toolOpt: (el) => { const k = el.dataset.k; S.tool.opts[k] = typeof TOOL_DEFAULTS[k] === 'number' ? Number(el.dataset.v) : el.dataset.v; S.tool.plan = null; render(); },
  toolPick: async () => {
    const kind = TOOL_KIND[S.tool.open] === undefined ? 'image' : TOOL_KIND[S.tool.open];
    const list = await call('tools:pick', kind);
    if (list.length) await toolAddPaths(list);
  },
  toolClear: () => { S.tool.files = []; render(); },
  toolFileRemove: (el) => { S.tool.files.splice(Number(el.dataset.i), 1); render(); },
  toolRun: () => toolRun(),
  toolUse: (el) => { const r = S.tool.results[Number(el.dataset.i)]; if (r) return placeInStudio(r.path, el.dataset.slot == null ? null : Number(el.dataset.slot)); },
  openToolsFolder: () => { const r = S.tool.results[0]; if (r) return call('files:show', r.path); },
  toolRenamePlan: () => busy('toolRenamePlan', async () => {
    const o = S.tool.opts;
    S.tool.plan = await call('tools:renamePlan', { pattern: o.pattern, cat: o.cat, start: o.start });
    if (!S.tool.plan.length) toast('Tidak ada berkas yang cocok di daftar Unduhan.', 'info');
  }),
  toolRename: async () => {
    const T = S.tool, o = T.opts;
    const n = (T.plan || []).filter((p) => p.from !== p.to).length;
    if (!n) return;
    const ok = await dialog({ title: `Ganti nama ${n} berkas?`, body: '<p>Berkas di folder Unduhan akan diganti namanya. Daftar Unduhan di aplikasi ikut diperbarui.</p>', buttons: [{ label: 'Ganti nama', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }] });
    if (!ok) return;
    await busy('toolRename', async () => {
      const r = await call('tools:rename', { pattern: o.pattern, cat: o.cat, start: o.start });
      T.plan = null;
      toast(`${r.renamed} berkas diganti namanya${r.skipped ? `, ${r.skipped} dilewati` : ''}.`, r.renamed ? 'ok' : 'info');
    });
  },
  flowTool: (el) => {
    const a = acc();
    const t = FLOW_TOOLS.find((x) => x.id === el.dataset.id);
    if (!a || !t) { toast(ERR.UNKNOWN_ACCOUNT, 'err'); return; }
    return busy('flowTool' + `data-id="${t.id}"`, async () => {
      const r = await call('flow:openTool', a.id, t.url, { name: t.name });
      if (!r || !r.reused) toast(`${t.name} dibuka di jendela aplikasi (${a.label}).`, 'ok');
    });
  },

  // Skill
  skGroup: (el) => { S.sk.group = el.dataset.g; const v = skVisible(); if (v.length && !v.some((x) => x.id === S.sk.sel)) skSelect(v[0].id); render(); },
  skSel: (el) => { skSelect(el.dataset.id); render(); },
  skOpt: (el) => { S.sk.over[el.dataset.k] = el.dataset.k === 'count' ? Number(el.dataset.v) : el.dataset.v; render(); },
  skPick: async () => { const list = await call('files:pickImages'); if (list.length) await skAddImages(list); },
  skImgRemove: (el) => { S.sk.images.splice(Number(el.dataset.i), 1); S.sk.edited = null; render(); },
  skReset: () => { S.sk.edited = null; render(); },
  skReload: () => busy('skReload', async () => { await skillsLoad(true); toast(`Skill dimuat ulang · ${(S.sk.admin || []).length} dari admin.`, 'ok'); }),
  skToStudio: () => {
    const sk = curSkill();
    skillCheck(sk);
    skApply(sk, skPrompt(sk));
    go('studio');
    toast('Skill dipasang di Studio. Periksa lalu tekan ' + (isAuto() ? 'Generate.' : 'Kirim ke Flow.'), 'ok');
  },
  skGenerate: async () => {
    const sk = curSkill();
    skillCheck(sk);
    skApply(sk, skPrompt(sk));
    go('studio');
    await (isAuto() ? ACTIONS.sendGenerate : ACTIONS.send)();
  },
  skQueue: async () => {
    const sk = curSkill();
    skillCheck(sk);
    const p = skPrompt(sk).trim();
    if (!p) throw new Error('INVALID_PROMPT');
    await skQueueAdd([p], skillOpts(sk), [...S.sk.images]);
  },
  skRefine: async () => {
    const sk = curSkill();
    const p = skPrompt(sk).trim();
    if (!p || S.sk.busy) return;
    S.sk.busy = 'refine'; render();
    try {
      const kind = skillOpts(sk).kind;
      const r = await skChat(`Sempurnakan prompt Google Flow (${kind === 'image' ? 'gambar' : 'video'}) berikut agar lebih detail, jelas, dan sinematik. Pertahankan maksudnya, gaya, dan SEMUA tag @ apa adanya. Balas hanya dengan satu blok \`\`\`prompt\`\`\`.\n\n${p}`, kind);
      S.sk.edited = (r.prompts && r.prompts[0]) || r.reply;
      toast('Prompt disempurnakan oleh Asisten Prompt.', 'ok');
    } catch (e) { toast(msg(e), 'err'); }
    S.sk.busy = ''; render();
  },
  skRun: async () => {
    const sk = curSkill();
    if (S.sk.busy) return;
    skillCheck(sk);
    const text = skMessage(sk);
    if (sk.ai === 'director') {
      S.chat.mode = aiMode(sk, skValues(sk));
      chatSave();
      go('assistant');
      chatSend(text);
      return;
    }
    S.sk.busy = 'run'; S.sk.result = null; render();
    try {
      const mode = sk.category === 'ai' ? aiMode(sk, skValues(sk)) : skillOpts(sk).kind;
      const r = await skChat(text, mode, sk.ai === 'reverse' ? { imagePath: S.sk.images[0], model: S.sk.model || undefined } : {});
      S.sk.result = { id: sk.id, reply: r.reply, prompts: r.prompts || [], model: r.model && r.model.label };
      if (sk.ai === 'scenes' && !S.sk.result.prompts.length) toast('AI tidak mengembalikan adegan dalam blok prompt — lihat jawabannya di bawah.', 'info');
    } catch (e) { toast(msg(e), 'err'); }
    S.sk.busy = ''; render();
  },
  skResUse: (el) => {
    const sk = curSkill();
    const p = S.sk.result && S.sk.result.prompts[Number(el.dataset.i)];
    if (!p) return;
    skApply(sk, p);
    go('studio');
    toast('Prompt dipindahkan ke Studio.', 'ok');
  },
  skResQueue: async (el) => {
    const sk = curSkill();
    const res = S.sk.result;
    if (!res) return;
    const prompts = el.dataset.i == null ? res.prompts : [res.prompts[Number(el.dataset.i)]].filter(Boolean);
    if (prompts.length) await skQueueAdd(prompts, skillOpts(sk), sk.category === 'ai' ? [] : [...S.sk.images]);
  },
  skResCopy: async (el) => { const p = S.sk.result && S.sk.result.prompts[Number(el.dataset.i)]; if (p) { await navigator.clipboard.writeText(p); toast('Prompt disalin.', 'ok'); } },
  skNew: () => skillEditor({ settings: { ...opts() }, template: '' }),
  skSaveStudio: () => {
    const o = opts();
    const imgs = S.studio.images;
    let tpl = S.studio.prompt;
    refTags(imgs).forEach((t, i) => { tpl = tpl.replace(new RegExp('@' + t + '(?![A-Za-z0-9_-])', 'g'), `{@${i + 1}}`); });
    const refs = isFrames(o) ? { min: 2, max: 2 } : imgs.length ? { min: 0, max: Math.min(3, Math.max(1, imgs.length)) } : { min: 0, max: 0 };
    return skillEditor({ template: tpl, settings: { kind: o.kind, sub: o.sub, model: o.model, ratio: o.ratio, count: o.count }, refs, icon: o.kind === 'video' ? 'clapperboard' : 'image' });
  },
  skEdit: () => skillEditor(curSkill()),
  skCopy: () => { const sk = curSkill(); return skillEditor({ ...sk, id: undefined, name: (sk.name + ' (salinan)').slice(0, 60), description: sk.desc || sk.description }); },
  skDelete: async () => {
    const sk = curSkill();
    if (!sk || sk.source !== 'mine') return;
    const ok = await dialog({ title: 'Hapus skill?', body: `<p>Skill <b>${esc(sk.name)}</b> dihapus dari PC ini.</p>`, buttons: [{ label: 'Hapus', value: 'ok', primary: true }, { label: 'Batal', value: 'cancel' }] });
    if (!ok) return;
    S.sk.mine = await call('skills:remove', sk.id);
    S.sk.sel = null;
    render();
  },
  skExport: async () => { const p = await call('skills:export', null); if (p) toast('Skill diekspor ke ' + p, 'ok'); },
  skExportOne: async () => { const p = await call('skills:export', [curSkill().id]); if (p) toast('Skill diekspor ke ' + p, 'ok'); },
  skImport: async () => {
    const r = await call('skills:import');
    if (!r) return;
    S.sk.mine = r.list;
    S.sk.group = 'mine';
    if (r.list[0]) skSelect(r.list[0].id);
    toast(`${r.added} skill diimpor ke Skill saya.`, 'ok');
    render();
  }
});
function studioTab(tab) {
  if (!STUDIO_TABS.some((x) => x[0] === tab)) return;
  S.studioTab = tab;
  if (S.page !== 'studio') { go('studio'); return; }
  $('#page').scrollTop = 0;
  render();
  if (tab === 'skill') { skillsLoad(false); if (!S.chat.catalog) chatCatalog(false).then(() => render()); }
  if (tab === 'buat') galleryAutoLoad();
  if (tab === 'bulk') bulkPlanSoon();
}

/** Baca saldo kredit Flow satu akun (isian manual akun itu dikosongkan agar saldo terbaca yang dipakai). */
async function bulkRead(id, quiet = false) {
  const key = 'bulkReadCredits' + `data-id="${id}"`;
  if (S.busy.has(key)) return false;
  S.busy.add(key);
  render();
  try {
    const r = await call('flow:credits', id);
    const a = accById(id);
    if (a) a.credits = r;
    const f = bulkForm();
    if (f.accounts[id]) { f.accounts[id].credits = ''; bulkSave(); }
    if (!quiet) toast(`${a ? a.label : 'Akun'}: ${r.value} kredit Google Flow.`, 'ok');
    return true;
  } catch (e) { toast(`${(accById(id) || {}).label || 'Akun'}: ${msg(e)}`, 'err'); return false; } finally { S.busy.delete(key); render(); bulkPlanSoon(); }
}

/** Kabar dari jendela alat Google Flow (proses utama). */
async function toolEvent(t) {
  if (!t) return;
  if (t.state === 'saved') { toast(`Hasil alat disimpan: ${t.name} (Unduhan → Alat).`, 'ok'); return; }
  if (t.state === 'signin' || (t.state === 'error' && t.error === 'TOOL_LOAD_FAILED')) {
    const r = await dialog({
      title: t.state === 'signin' ? 'Sesi Google tidak terbawa' : 'Alat gagal dimuat',
      body: `<p>${t.state === 'signin'
        ? `${esc(t.name || 'Alat Google Flow')} meminta masuk Google di jendela aplikasi. Login hanya dilakukan lewat kartu login akun.`
        : `${esc(t.name || 'Alat Google Flow')} gagal dimuat${t.detail ? ` (${esc(t.detail)})` : ''}.`}</p><p class="muted small">Anda bisa membukanya di browser Google Flow akun ini sebagai gantinya (jendela browser akan tampil).</p>`,
      buttons: [{ label: 'Tutup', value: 'cancel' }, { label: 'Buka di browser', value: 'browser', primary: true }]
    });
    if (r && r.value === 'browser' && t.id && t.url) call('flow:openTool', t.id, t.url, { browser: true }).catch((e) => toast(msg(e), 'err'));
    return;
  }
  if (t.state === 'error') toast(msg({ message: t.error, detail: t.detail }), 'err');
}

// ---------- Event ----------
// thumbnail gagal dimuat (file dipindah/terhapus) → sembunyikan, ikon di belakangnya terlihat
document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.classList.contains('pic')) t.classList.add('gone'); }, true);
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || $('#dialog').contains(el)) return;
  e.preventDefault();
  const fn = ACTIONS[el.dataset.act];
  if (fn) Promise.resolve(fn(el)).catch((err) => toast(msg(err), 'err'));
});

const CHANGES = {
  pickAccount: async (el) => { S.settings = await call('settings:set', { activeAccountId: el.value }); render(); if (S.page === 'gallery') galleryAutoLoad(); },
  waitResults: (el) => { S.studio.waitResults = el.checked; },
  gallerySel: (el) => { if (el.checked) S.gallery.selected.add(el.dataset.id); else S.gallery.selected.delete(el.dataset.id); render(); },
  theme: async (el) => { S.settings = await call('settings:set', { theme: el.value }); render(); },
  browserWindow: async (el) => { S.settings = await call('settings:set', { browserWindow: el.value }); render(); toast('Berlaku saat akun dihubungkan / bekerja berikutnya.', 'info'); },
  autoProject: async (el) => { S.settings = await call('settings:set', { autoProject: el.checked }); render(); },
  studioModel: (el) => setStudio({ model: el.value }),
  chatModel: (el) => { S.chat.model = el.value; chatSave(); render(); },
  studioApply: (el) => setStudio({ apply: el.checked }),
  browser: async (el) => {
    if (el.value === 'custom') S.settings = await call('files:pickBrowser');
    else S.settings = await call('settings:set', { browser: { prefer: el.value } });
    render();
  },
  mode: async (el) => {
    if (el.value === 'auto' && !isAuto()) await enableAuto();
    else if (el.value === 'safe' && isAuto()) { S.settings = await call('auto:ack', false); render(); }
  },
  autoNum: async (el) => { S.settings = await call('settings:set', { auto: { [el.dataset.k]: Number(el.value) } }); render(); },
  autoBool: async (el) => { S.settings = await call('settings:set', { auto: { [el.dataset.k]: el.checked } }); render(); }
};
Object.assign(CHANGES, {
  skField: (el) => { const sk = curSkill(); skValues(sk)[el.dataset.k] = el.value; S.sk.edited = null; render(); },
  skModel: (el) => { S.sk.model = el.value; },
  skModelFlow: (el) => { S.sk.over.model = el.value; render(); },
  toolEdge: (el) => { S.tool.opts.edgeOnly = el.checked; },
  toolRenameCat: (el) => { S.tool.opts.cat = el.value; S.tool.plan = null; render(); },
  bulkAcc: (el) => { const f = bulkForm(); f.accounts[el.dataset.id] = { ...(f.accounts[el.dataset.id] || {}), on: el.checked }; bulkSave(); render(); bulkPlanSoon(); },
  bulkParallel: (el) => { bulkForm().parallel = el.checked; bulkSave(); bulkPlanSoon(); },
  bulkNewProject: (el) => { bulkForm().newProject = el.checked; bulkSave(); },
  bulkFile: async (el) => {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((x) => x.replace(/^\uFEFF/, '').trim()).filter(Boolean);
    const f = bulkForm();
    f.prompts = [...f.prompts.split(/\r?\n/).filter((x) => x.trim()), ...lines].slice(0, BULK_MAX).join('\n');
    bulkSave(); render(); bulkPlanSoon();
    toast(`${lines.length} prompt diimpor${lines.length > BULK_MAX ? ` (maks. ${BULK_MAX})` : ''}.`, 'ok');
  }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el || $('#dialog').contains(el)) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) Promise.resolve(fn(el)).catch((err) => toast(msg(err), 'err'));
});
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.input === 'gateKey') { S.gateKey = e.target.value; return; }
  if (e.target.dataset && e.target.dataset.input === 'chatInput') { S.chat.input = e.target.value; return; }
  const inp = e.target.dataset && e.target.dataset.input;
  if (inp && INPUTS[inp]) { INPUTS[inp](e.target); return; }
  if (e.target.dataset && e.target.dataset.input === 'prompt') {
    S.studio.prompt = e.target.value;
    const c = $('#count');
    if (c) c.textContent = `${S.studio.prompt.length}/8000`;
    mentionUpdate(e.target);
  }
});

// input teks di Alat & Skill (tanpa render ulang setiap ketikan bila tidak perlu)
const INPUTS = {
  skField: (el) => {
    const sk = curSkill();
    skValues(sk)[el.dataset.k] = el.value;
    if (S.sk.edited != null) return;
    const ta = $('#sk-prompt');
    if (ta) ta.value = skPrompt(sk);
  },
  skPrompt: (el) => { const was = S.sk.edited == null; S.sk.edited = el.value; if (was) render(); },
  skQuery: (el) => { S.sk.q = el.value; render(); },
  bulkPrompts: (el) => {
    bulkForm().prompts = el.value.slice(0, 400000);
    const n = el.value.split(/\r?\n/).filter((x) => x.trim()).length;
    const c = $('#bulk-lines');
    if (c) { c.textContent = `${n} prompt${n > BULK_MAX ? ` (hanya ${BULK_MAX} pertama dipakai)` : ''}`; c.classList.toggle('warn-text', n > BULK_MAX); }
    bulkSave(); bulkPlanSoon();
  },
  bulkCount: (el) => { bulkForm().count = el.value; bulkSave(); bulkPlanSoon(); },
  bulkCost: (el) => { bulkForm().cost = el.value; bulkSave(); bulkPlanSoon(); },
  bulkCredit: (el) => { const f = bulkForm(); f.accounts[el.dataset.id] = { ...(f.accounts[el.dataset.id] || {}), credits: el.value }; bulkSave(); bulkPlanSoon(); },
  bulkMinDelay: (el) => { bulkForm().minDelay = el.value; bulkSave(); bulkPlanSoon(); },
  bulkMaxDelay: (el) => { bulkForm().maxDelay = el.value; bulkSave(); bulkPlanSoon(); },
  toolSec: (el) => { S.tool.opts.sec = Number(el.value) || 0; },
  toolQuality: (el) => { S.tool.opts.quality = Number(el.value) || 85; const b = $('#tool-q'); if (b) b.textContent = el.value; },
  toolTol: (el) => { S.tool.opts.tol = Number(el.value) || 30; const b = $('#tool-tol'); if (b) b.textContent = el.value; },
  toolPattern: (el) => { S.tool.opts.pattern = el.value; if (S.tool.plan) { S.tool.plan = null; render(); } },
  toolStart: (el) => { S.tool.opts.start = Number(el.value) || 0; if (S.tool.plan) { S.tool.plan = null; render(); } }
};

// ---------- Autocomplete "@" di kolom prompt Studio ----------
const MP = { open: false, list: [], i: 0, start: -1 };
function mentionQuery(ta) {
  const upto = ta.value.slice(0, ta.selectionStart);
  const m = /(^|[\s([{"'“‘,;:])@([A-Za-z0-9_-]{0,40})$/.exec(upto);
  return m ? { start: upto.length - m[2].length - 1, q: m[2].toLowerCase() } : null;
}
function mentionUpdate(ta) {
  const pop = $('#mention-pop');
  if (!pop) return;
  const imgs = S.studio.images;
  const q = imgs.length ? mentionQuery(ta) : null;
  const tags = refTags(imgs);
  const list = q ? tags.map((t, i) => ({ t, i })).filter((x) => x.t.startsWith(q.q) || (q.q.length > 1 && x.t.includes(q.q))) : [];
  if (!list.length) { mentionClose(); return; }
  MP.open = true; MP.list = list; MP.start = q.start; MP.i = Math.min(MP.i, list.length - 1);
  pop.innerHTML = `<div class="mp-head faint small">Tandai gambar referensi</div>` + list.map((x, k) => `<button type="button" class="mp-item ${k === MP.i ? 'on' : ''}" role="option" aria-selected="${k === MP.i}" data-mp="${k}">${S.studio.previews[imgs[x.i]] ? `<img src="${S.studio.previews[imgs[x.i]]}" alt="">` : icon('file-image')}<span>@${esc(x.t)}</span></button>`).join('');
  pop.hidden = false;
}
function mentionClose() { MP.open = false; MP.i = 0; const pop = $('#mention-pop'); if (pop) { pop.hidden = true; pop.innerHTML = ''; } }
function insertMention(tag, fromQuery) {
  const ta = $('#prompt');
  if (!ta || !tag) return;
  const v = ta.value;
  let a = ta.selectionStart, b = ta.selectionEnd;
  if (fromQuery && MP.start >= 0) a = MP.start;
  else if (document.activeElement !== ta) { a = b = v.length; }
  const before = v.slice(0, a), after = v.slice(b);
  const pre = !fromQuery && before && !/[\s([{"'“‘,;:]$/.test(before) ? ' ' : '';
  const ins = pre + '@' + tag + (/^\s/.test(after) ? '' : ' ');
  ta.value = (before + ins + after).slice(0, 8000);
  const pos = Math.min(before.length + ins.length, ta.value.length);
  ta.focus();
  ta.setSelectionRange(pos, pos);
  S.studio.prompt = ta.value;
  const c = $('#count');
  if (c) c.textContent = `${S.studio.prompt.length}/8000`;
  mentionClose();
}
document.addEventListener('mousedown', (e) => {
  const it = e.target.closest && e.target.closest('[data-mp]');
  if (it) { e.preventDefault(); const x = MP.list[Number(it.dataset.mp)]; if (x) insertMention(x.t, true); return; }
  if (MP.open && !(e.target.closest && e.target.closest('#mention-pop, #prompt'))) mentionClose();
});
document.addEventListener('keydown', (e) => {
  if (!MP.open || !e.target || e.target.id !== 'prompt') return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); e.stopImmediatePropagation();
    MP.i = (MP.i + (e.key === 'ArrowDown' ? 1 : MP.list.length - 1)) % MP.list.length;
    mentionUpdate(e.target);
  } else if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
    e.preventDefault(); e.stopImmediatePropagation();
    const x = MP.list[MP.i]; if (x) insertMention(x.t, true);
  } else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); mentionClose(); }
}, true);
document.addEventListener('selectionchange', () => { const ta = $('#prompt'); if (MP.open && ta && document.activeElement === ta) mentionUpdate(ta); });

// seret & lepas gambar (di halaman Studio)
const DROPS = ['#drop', '#tool-drop', '#sk-drop', '#bulk-drop'];
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  for (const id of DROPS) { const d = $(id); if (d) d.classList.toggle('over', d.contains(e.target)); }
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) for (const id of DROPS) { const d = $(id); if (d) d.classList.remove('over'); } });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  for (const id of DROPS) { const d = $(id); if (d) d.classList.remove('over'); }
  if (S.page !== 'studio') return;
  const paths = [...(e.dataTransfer.files || [])].map((f) => fc.pathForFile(f)).filter(Boolean);
  if (!paths.length) return;
  if (S.studioTab === 'alat') {
    if (!S.tool.open || S.tool.open === 'rename') return;
    call('tools:register', paths).then((r) => {
      const list = TOOL_KIND[S.tool.open] === 'video' ? r.videos : r.images;
      if (!list.length) { toast(TOOL_KIND[S.tool.open] === 'video' ? 'Seret berkas video (MP4/WebM/MOV).' : ERR.INVALID_IMAGE, 'err'); return; }
      return toolAddPaths(list);
    }).catch((err) => toast(msg(err), 'err'));
  } else if (S.studioTab === 'skill') skAddImages(paths).catch((err) => toast(msg(err), 'err'));
  else if (S.studioTab === 'bulk') { if ($('#bulk-drop')) bulkAddImages(paths).catch((err) => toast(msg(err), 'err')); }
  else addImages(paths);
});

// pintasan papan ketik
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'license-key') { e.preventDefault(); ACTIONS.licenseActivate(); return; }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target && e.target.id === 'chat-input') { e.preventDefault(); chatSend(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^[1-4]$/.test(e.key) && S.page === 'studio' && licensed() && !$('#dialog').open) {
    e.preventDefault();
    studioTab(STUDIO_TABS[Number(e.key) - 1][0]);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && S.page === 'studio' && S.studioTab === 'buat') {
    e.preventDefault();
    (isAuto() ? ACTIONS.sendGenerate : ACTIONS.send)();
    return;
  }
  // Windows (bilah judul khusus, tanpa menu): pintasan ditangani di sini
  if (!S.info || !(S.info.chrome || {}).customTitlebar || !licensed() || $('#dialog').open) return;
  const pages = NAV.map((n) => n[0]);
  if (e.ctrlKey && !e.shiftKey && /^[1-7]$/.test(e.key)) { e.preventDefault(); go(pages[Number(e.key) - 1]); }
  else if (e.ctrlKey && e.key === ',') { e.preventDefault(); go('settings'); }
  else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); go('accounts'); ACTIONS.addAccount(); }
  else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); S.studioTab = 'buat'; go('studio'); ACTIONS.pickImages(); }
  else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); call('files:openDownloads'); }
  else if (e.key === 'F1') { e.preventDefault(); helpDialog(); }
});

function helpDialog() {
  dialog({
    title: 'Panduan FLOW CONNECT Desktop',
    body: `<ol class="steps">
      <li><div><b>Akun Google → Tambah akun → Masuk ke Google.</b><div class="muted small">Kartu login kecil terbuka; masuk seperti biasa. Kartu menutup sendiri setelah berhasil.</div></div></li>
      <li><div><b>Otomatis: Flow dibuka di latar belakang &amp; project baru dibuat.</b><div class="muted small">Browser tidak tampil. Klik "Lihat Flow" bila ingin melihat jendelanya.</div></div></li>
      <li><div><b>Studio → Buat.</b><div class="muted small">Pilih Video (mode Frame / Bahan) atau Gambar, model, rasio &amp; jumlah. Tulis prompt → Generate (Ctrl+Enter).</div></div></li>
      <li><div><b>Studio → Alat.</b><div class="muted small">12 alat Google Flow (dibuka di jendela Flow) + alat lokal gratis: frame dari video, potong rasio, pecah grid, konversi, hapus latar polos, ganti nama massal.</div></div></li>
      <li><div><b>Studio → Skill.</b><div class="muted small">Isi formulir singkat → prompt detail + setelan otomatis. Simpan skill sendiri, ekspor/impor .json, dan skill dari admin muncul tanpa update.</div></div></li>
      <li><div><b>Mode Aman vs Otomatis.</b><div class="muted small">Aman: jendela Flow muncul, Anda menekan Generate. Otomatis: aplikasi menekan Generate, menunggu, mengunduh — sepenuhnya tersembunyi.</div></div></li>
      <li><div><b>Galeri / Unduhan.</b><div class="muted small">Lihat semua hasil project dan simpan ke PC.</div></div></li>
    </ol>
    <p class="small mt16">Pintasan: Ctrl+1…7 pindah halaman · Alt+1/2/3 Studio → Buat/Alat/Skill · Ctrl+, Pengaturan · Ctrl+N tambah akun · Ctrl+O pilih gambar · F1 panduan.</p>`,
    buttons: [{ label: 'Tutup', value: 'ok', primary: true }]
  });
}

// ---------- Mulai ----------
async function init() {
  S.info = await call('app:info');
  S.settings = S.info.settings;
  S.statuses = S.info.statuses || {};
  S.queue = S.info.queue;
  if (S.info.bulk) S.bulk.st = S.info.bulk;
  S.license = S.info.license;
  S.update = S.info.update;
  S.flowOptions = S.info.flowOptions || {};
  chatRestore();
  document.documentElement.style.setProperty('--accent', S.info.accent);
  document.body.classList.add('platform-' + S.info.platform);
  const chrome = S.info.chrome || {};
  document.body.classList.toggle('has-titlebar', !!chrome.customTitlebar);
  document.body.classList.toggle('mica', !!chrome.mica);
  render();

  fc.on('statuses', (s) => { S.statuses = s; render(); if (S.page === 'gallery' || S.page === 'studio') galleryAutoLoad(); });
  fc.on('settings', (s) => { S.settings = s; render(); });
  fc.on('queue', (q) => {
    const sig = (x) => x.running + '|' + x.jobs.map((j) => j.id + j.status).join(',');
    const same = sig(q) === sig(S.queue);
    const doneBefore = (S.queue.jobs || []).filter((j) => j.status === 'done').length;
    S.queue = q;
    if (q.jobs.filter((j) => j.status === 'done').length > doneBefore) galleryRefreshSoon(); // hasil antrean baru
    if (same && S.page === 'auto' && $('#q-act')) { $('#q-act').textContent = q.activity; renderStatus(); return; }
    render();
  });
  fc.on('bulk', (b) => {
    const sig = (x) => (x.running ? 1 : 0) + '|' + (x.batch ? x.batch.id + x.batch.jobs.map((j) => j.status[0]).join('') + x.batch.accounts.map((a) => a.status).join(',') : '');
    const before = S.bulk.st;
    const doneBefore = before.batch ? before.batch.jobs.filter((j) => j.status === 'done').length : 0;
    const changed = sig(b) !== sig(before);
    S.bulk.st = b;
    if (b.batch && b.batch.jobs.filter((j) => j.status === 'done').length > doneBefore) galleryRefreshSoon();
    if (!changed) return;
    if (before.running && !b.running && b.batch) toast(`${b.batch.stopped ? 'Bulk dihentikan' : 'Bulk selesai'} · durasi ${fmtDurLong(b.batch.finishedAt - b.batch.startedAt)}.`, b.batch.stopped ? 'info' : 'ok');
    if (S.page === 'studio') render();
  });
  fc.on('bulk-activity', (t) => { S.bulk.st.activity = t; const el = $('#bulk-act'); if (el) el.textContent = t; });
  setInterval(tickRuntime, 250); // 4×/detik → angka detik selalu tepat waktu
  fc.on('activity', (t) => { S.activity = t; const el = $('#act-text'); if (el) el.textContent = t; renderStatus(); });
  fc.on('license', (l) => {
    const was = licensed();
    S.license = l;
    if (was && !licensed()) toast(ERR[l.error] || 'Lisensi tidak aktif.', 'err');
    if (was !== licensed() || !S.busy.size) render();
  });
  fc.on('update', (u) => {
    const prev = S.update || {};
    S.update = u;
    // pembaruan baru terdeteksi otomatis (tanpa klik "Periksa pembaruan") → beri tahu langsung di aplikasi
    if (u.state === 'available' && u.version && S.updateToasted !== u.version && prev.state !== 'downloading') {
      S.updateToasted = u.version;
      if (!S.updateChecking && S.updateHidden !== u.version) toast(`Pembaruan versi ${u.version} tersedia — lihat bilah di atas halaman.`, 'ok');
    }
    if (u.state === 'downloading' && $('.update-bar progress')) {
      $('.update-bar progress').value = u.percent;
      const b = $('.update-bar .text b'); if (b) b.textContent = `Mengunduh pembaruan ${u.version}… ${u.percent}%`;
      return;
    }
    render();
  });
  fc.on('update-show', (u) => {
    if (u) S.update = u;
    S.updateHidden = null;
    render();
    $('#page').scrollTop = 0;
    const bar = $('.update-bar'); if (bar) bar.classList.add('attn');
  });
  fc.on('accent', (c) => document.documentElement.style.setProperty('--accent', c));
  fc.on('tool', (t) => toolEvent(t));
  fc.on('login', (l) => {
    if (!S.login || S.login.id !== l.id) return;
    S.login.state = l.state;
    renderLoginSheet();
  });
  fc.on('navigate', (p) => {
    if (!licensed()) return;
    if (p === 'accounts:add') { go('accounts'); ACTIONS.addAccount(); }
    else if (p === 'studio:pick') { S.studioTab = 'buat'; go('studio'); ACTIONS.pickImages(); }
    else if (p === 'studio:alat') studioTab('alat');
    else if (p === 'studio:skill') studioTab('skill');
    else if (p === 'help') helpDialog();
    else go(p);
  });

  // hitung mundur jeda antrean
  setInterval(() => {
    const el = $('#q-next');
    if (el) el.textContent = S.queue.nextAt ? ` · ${Math.max(0, Math.round((S.queue.nextAt - Date.now()) / 1000))} dtk lagi` : '';
  }, 1000);
}

init().catch((e) => {
  document.body.textContent = 'Gagal memuat aplikasi: ' + msg(e);
});
