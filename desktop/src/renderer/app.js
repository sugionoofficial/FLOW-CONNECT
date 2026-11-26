// Tampilan FLOW CONNECT Desktop — JavaScript biasa, tanpa framework, tanpa akses Node (lihat preload).
import { icon } from './icons.js';

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
  FRAME_SLOT_NOT_FOUND: 'Slot frame awal/akhir tidak ditemukan di Google Flow.',
  FRAME_NOT_ATTACHED: 'Gambar tidak bisa dipasang sebagai frame di Google Flow.',
  GENERATE_FAILED: 'Google Flow gagal membuat hasil.',
  FLOW_UNUSUAL_ACTIVITY: 'Google Flow mendeteksi "aktivitas tidak biasa" dan menolak permintaan. Tunggu beberapa menit, perpanjang jeda antrean, lalu coba lagi.',
  FLOW_CONTENT_POLICY: 'Ditolak filter keamanan Google Flow (prompt atau gambar dianggap melanggar kebijakan). Ubah prompt / gambar lalu coba lagi.',
  FLOW_REFUSED: 'Google Flow menolak permintaan ini.',
  INSUFFICIENT_CREDITS: 'Kredit Google Flow tidak cukup untuk setelan ini. Kurangi jumlah / pilih model lebih murah, atau isi ulang kredit.',
  NO_RESULTS: 'Flow tidak mengembalikan hasil.'
};
const DETAIL = new Set(['FLOW_ERROR', 'GENERATE_FAILED', 'FLOW_REFUSED', 'UPLOAD_FAILED', 'UPLOAD_REJECTED', 'REFERENCE_NOT_ATTACHED', 'FRAME_NOT_ATTACHED', 'GENERATE_TIMEOUT', 'GENERATE_NOT_STARTED', 'INSUFFICIENT_CREDITS', 'FLOW_CONTENT_POLICY']);
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
  info: null,
  settings: null,
  statuses: {},
  queue: { running: false, activity: '', jobs: [] },
  studio: { images: [], previews: {}, prompt: '', busy: '', waitResults: true, log: [], sel: null },
  flowOptions: {},
  login: null,     // { id, state, error } kartu login yang sedang berjalan
  gallery: { key: '', items: [], loading: false, error: null, thumbs: {}, selected: new Set(), busy: new Set() },
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
const fileUrl = (p) => {
  const u = String(p).replace(/\\/g, '/').split('/').map((x, i) => (i === 0 && /^[A-Za-z]:$/.test(x) ? x : encodeURIComponent(x))).join('/');
  return u.startsWith('/') ? 'file://' + u : 'file:///' + u;
};
const normText = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------- Katalog setelan Google Flow (nama sesuai label di Flow) ----------
const MODELS = {
  video: [['Veo 3.1 - Fast', 'Cepat · hemat kredit'], ['Veo 3.1 - Quality', 'Kualitas tertinggi'], ['Veo 3.1 - Lite', 'Paling hemat'], ['Gemini Omni Flash', 'Klip 10 dtk · edit percakapan'], ['Veo 2 - Fast', 'Tanpa audio'], ['Veo 2 - Quality', 'Tanpa audio']],
  image: [['Nano Banana 2', 'Bawaan · cepat'], ['Nano Banana Pro', 'Detail tinggi'], ['Imagen 4', 'Fotorealistis']]
};
const SUBS = [['text', 'Teks', 'type', 'Teks ke Video'], ['frames', 'Frame', 'film', 'Frame ke Video'], ['ingredients', 'Bahan', 'layers', 'Bahan ke Video']];
const RATIOS = { video: ['16:9', '9:16'], image: ['16:9', '9:16', '1:1', '4:3', '3:4'] };
const opts = () => S.settings.studio;
function modelList(kind) {
  const a = acc();
  const fo = a && S.flowOptions[a.id];
  const list = MODELS[kind].map(([v, d]) => ({ v, d }));
  if (fo && fo.models) {
    for (const m of fo.models) {
      if ((kind === 'image') !== /imagen|nano|banana/i.test(m)) continue;
      if (!list.some((x) => normText(x.v) === normText(m))) list.push({ v: m, d: 'Dibaca dari Flow' });
    }
  }
  const cur = opts().model;
  if (cur !== 'auto' && !list.some((x) => x.v === cur) && (kind === 'image') === /imagen|nano|banana/i.test(cur)) list.push({ v: cur, d: '' });
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
  ['gallery', 'Galeri', 'images'],
  ['auto', 'Otomatis', 'bot'],
  ['downloads', 'Unduhan', 'download']
];

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
        <div class="hero-art" aria-hidden="true"><div class="orb o1"></div><div class="orb o2"></div><div class="glass-card">${icon('clapperboard', 'xl')}<div><b>Veo 3.1</b><span>16:9 · x2 · 8 dtk</span></div></div><div class="glass-card two">${icon('image', 'xl')}<div><b>Nano Banana</b><span>Gambar · 1:1</span></div></div></div>
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
          <li><div><b>Pilih mode, model &amp; rasio di Studio</b><div class="muted small">Video (Teks / Frame / Bahan) atau Gambar, Veo 3.1 / Nano Banana / Imagen, 16:9 / 9:16, x1–x4 — diterapkan ke setelan Flow sebelum Generate.</div></div></li>
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
    const a = acc();
    const s = a ? st(a.id) : {};
    const warn = readiness(false);
    const ready = !warn;
    const o = opts();
    const imgs = S.studio.images;
    const busy = S.studio.busy;
    const video = o.kind === 'video';
    const chip = (k, v, label, ic, title) => `<button class="chip ${String(o[k]) === String(v) ? 'on' : ''}" data-act="studioOpt" data-k="${k}" data-v="${v}" ${title ? `title="${esc(title)}"` : ''}>${ic ? icon(ic) : ''}<span>${label}</span></button>`;
    const refLabel = !video ? 'Gambar referensi' : o.sub === 'frames' ? 'Frame awal &amp; akhir' : o.sub === 'ingredients' ? 'Bahan (karakter, objek, gaya)' : 'Gambar referensi';
    const tags = refTags(imgs);
    const refHint = !video ? (imgs.length ? 'Ketik @ di prompt untuk menunjuk gambar.' : 'Opsional — untuk edit / gaya.') : o.sub === 'ingredients' && imgs.length ? 'Ketik @ di prompt untuk menunjuk bahan.' : o.sub === 'frames' ? 'Gambar ke-1 = frame awal, ke-2 = frame akhir.' : o.sub === 'ingredients' ? 'Maks. 3 bahan agar konsisten antar adegan.' : 'Opsional. Untuk animasi gambar, pilih "Frame".';
    const models = modelList(o.kind);
    const g = S.gallery;
    const items = g.key ? g.items : [];
    const cur = items.find((x) => x.mediaId === S.studio.sel) || items[0];
    const local = cur && S.settings.downloads.find((d) => d.mediaId === cur.mediaId);
    const stage = busy
      ? `<div class="stage-busy"><div class="pulse">${icon('sparkles', 'xl')}</div><div class="stage-title">${busy === 'send' ? 'Mengirim ke Google Flow…' : 'Google Flow sedang membuat…'}</div><div class="muted small" id="act-text">${esc(S.activity)}</div><div class="progress indet"><i></i></div></div>`
      : cur
        ? (cur.isVideo && local && /\.(mp4|webm)$/i.test(local.path)
          ? `<video class="stage-media" src="${esc(fileUrl(local.path))}" controls loop muted autoplay playsinline></video>`
          : g.thumbs[cur.mediaId] ? `<img class="stage-media" src="${g.thumbs[cur.mediaId]}" alt="">` : `<div class="stage-empty">${icon(cur.isVideo ? 'video' : 'file-image', 'xl')}<div class="muted">${cur.done ? 'Memuat pratinjau…' : 'Masih diproses Flow…'}</div></div>`)
        : `<div class="stage-empty">${icon('square-play', 'xl')}<div class="stage-title">Hasil generate tampil di sini</div><div class="muted small">Tulis prompt, pilih model, lalu tekan ${isAuto() ? 'Generate' : 'Kirim ke Flow'}.</div></div>`;
    return `
      <div class="page-head"><h1>Studio</h1><div class="tools">${accountPicker()}
        ${a && s.signedIn ? `<span class="pill" title="${esc(s.projectTitle || '')}">${icon('clapperboard')}<span class="ellipsis">${s.projectId ? esc(s.projectTitle || 'Project') : 'Belum ada project'}</span></span>${btn('newProject', 'Project baru', { ic: S.busy.has('newProject' + `data-id="${a.id}"`) ? 'loader-circle' : 'folder-plus', data: `data-id="${a.id}"`, disabled: !!busy })}` : ''}
        ${a && s.connected ? btn('showFlow', '', { ic: 'app-window', cls: 'icon', title: 'Lihat jendela Google Flow', data: `data-id="${a.id}"` }) : ''}
      </div></div>
      ${warn || ''}
      <div class="studio">
        <div class="card composer">
          <div class="seg" role="tablist" aria-label="Jenis hasil">
            <button class="seg-btn ${video ? 'on' : ''}" data-act="studioOpt" data-k="kind" data-v="video" role="tab" aria-selected="${video}">${icon('clapperboard')}<span>Video</span></button>
            <button class="seg-btn ${!video ? 'on' : ''}" data-act="studioOpt" data-k="kind" data-v="image" role="tab" aria-selected="${!video}">${icon('image')}<span>Gambar</span></button>
          </div>
          ${video ? `<div class="chips modes">${SUBS.map(([v, l, ic, t]) => chip('sub', v, l, ic, t)).join('')}</div>` : ''}
          <div class="prompt-wrap">
            <textarea id="prompt" class="input prompt" rows="6" maxlength="8000" placeholder="${video ? 'Kamera drone perlahan maju di atas sawah terasering Bali saat matahari terbit, kabut tipis, sinematik…' : 'Foto produk kopi susu gula aren di meja kayu, cahaya pagi, gaya editorial…'}" data-input="prompt">${esc(S.studio.prompt)}</textarea>
            <div class="mention-pop" id="mention-pop" role="listbox" hidden></div>
            <div class="prompt-foot"><span class="faint small" id="count">${S.studio.prompt.length}/8000</span><span class="faint small">${imgs.length ? '@ = tandai gambar · ' : ''}Ctrl+Enter</span></div>
          </div>
          <div class="refs">
            <div class="refs-head"><b>${refLabel}</b><span class="faint small">${refHint}</span><span class="right faint small">${imgs.length}/10</span></div>
            <div class="ref-row" id="drop">
              ${imgs.map((p, i) => `<div class="thumb" title="${esc(p)}">${S.studio.previews[p] ? `<img src="${S.studio.previews[p]}" alt="">` : icon('file-image', 'lg')}${video && o.sub === 'frames' && i < 2 ? `<span class="tag">${i ? 'Akhir' : 'Awal'}</span>` : `<button class="reftag" data-act="insertTag" data-tag="${esc(tags[i])}" title="Sisipkan @${esc(tags[i])} ke prompt">@${esc(tags[i])}</button>`}${btn('removeImage', '', { ic: 'x', cls: 'x sm', title: 'Hapus', data: `data-i="${i}"` })}</div>`).join('')}
              <button class="thumb add" data-act="pickImages" title="Tambah gambar (atau seret ke sini)">${icon('image-plus', 'lg')}<span class="small">Tambah</span></button>
            </div>
          </div>
          <div class="opts ${o.apply ? '' : 'off'}">
            <div class="opt wide"><span class="opt-l">${icon('cpu')} Model</span>
              <select class="input" data-change="studioModel" ${o.apply ? '' : 'disabled'} aria-label="Model">
                <option value="auto" ${o.model === 'auto' ? 'selected' : ''}>Bawaan Flow (tidak diubah)</option>
                ${models.map((m) => `<option value="${esc(m.v)}" ${o.model === m.v ? 'selected' : ''}>${esc(m.v)}${m.d ? ' — ' + esc(m.d) : ''}</option>`).join('')}
              </select>
              ${a && s.connected ? btn('studioScan', '', { ic: S.busy.has('studioScan') ? 'loader-circle' : 'scan-search', cls: 'subtle icon', title: 'Baca daftar model dari Google Flow', disabled: !!busy }) : ''}
            </div>
            <div class="opt"><span class="opt-l">${icon('ratio')} Rasio</span><div class="chips">${RATIOS[o.kind].map((r) => chip('ratio', r, r)).join('')}</div></div>
            <div class="opt"><span class="opt-l">${icon('hash')} Jumlah</span><div class="chips">${[1, 2, 3, 4].map((n) => chip('count', n, 'x' + n)).join('')}</div></div>
            ${video ? `<div class="opt"><span class="opt-l">${icon('timer')} Durasi</span><div class="chips">${chip('duration', 0, 'Bawaan', '', 'Pakai durasi bawaan Flow')}${[4, 6, 8].map((n) => chip('duration', n, n + ' dtk')).join('')}</div></div>` : ''}
          </div>
          <label class="switch apply"><input type="checkbox" data-change="studioApply" ${o.apply ? 'checked' : ''}><span class="small">Terapkan setelan ini ke Google Flow sebelum ${isAuto() ? 'Generate' : 'mengirim'}</span></label>
          <div class="actionbar cta-bar">
            ${isAuto()
              ? btn('sendGenerate', busy === 'generate' ? 'Membuat…' : 'Generate', { ic: busy === 'generate' ? 'loader-circle' : 'sparkles', cls: 'cta', disabled: !ready || !!busy }) +
                btn('queueAdd', 'Antrean', { ic: 'list-plus', disabled: !a || !!busy, title: 'Tambah ke antrean otomatis' }) +
                `<label class="check small"><input type="checkbox" data-change="waitResults" ${S.studio.waitResults ? 'checked' : ''}> Tunggu hasil${S.settings.auto.autoDownload ? ' &amp; unduh' : ''}</label>`
              : btn('send', busy === 'send' ? 'Mengirim…' : 'Kirim ke Flow', { ic: busy === 'send' ? 'loader-circle' : 'send', cls: 'cta', disabled: !ready || !!busy }) +
                `<span class="muted small grow">Mode Aman: jendela Flow muncul agar Anda menekan Generate. <a data-act="go" data-page="settings">Mode Otomatis</a> menjalankan semuanya tersembunyi.</span>`}
          </div>
        </div>
        <div class="card preview">
          <div class="card-head">${icon('square-play')}<h3>Pratinjau</h3>${cur && !busy ? `<span class="faint small ellipsis">${esc(cur.title || '')}</span>` : ''}
            <span class="right hrow">${cur && !busy ? btn('galleryDownload', '', { ic: g.busy.has(cur.mediaId) ? 'loader-circle' : 'download', cls: 'subtle icon sm', title: 'Unduh', data: `data-id="${cur.mediaId}"`, disabled: !cur.done }) : ''}${local ? btn('showFile', '', { ic: 'folder-open', cls: 'subtle icon sm', title: 'Tampilkan di folder', data: `data-path="${esc(local.path)}"` }) : ''}</span></div>
          <div class="stage r-${o.ratio.replace(':', '-')}">${stage}</div>
          ${items.length ? `<div class="strip">${items.slice(0, 14).map((it) => `<button class="strip-item ${cur && cur.mediaId === it.mediaId ? 'on' : ''}" data-act="studioSel" data-id="${it.mediaId}" title="${esc(it.title || '')}">${g.thumbs[it.mediaId] ? `<img src="${g.thumbs[it.mediaId]}" alt="">` : icon(it.isVideo ? 'video' : 'file-image')}${it.isVideo ? `<span class="vtag">${icon('play')}</span>` : ''}</button>`).join('')}</div>` : `<div class="muted small strip-empty">${s.projectId ? 'Belum ada hasil di project ini.' : 'Hasil project akan muncul di sini.'}</div>`}
        </div>
      </div>
      <details class="card logcard" ${S.studio.log.length ? 'open' : ''}><summary><b>Aktivitas</b><span class="faint small">${S.studio.log.length ? S.studio.log.length + ' catatan' : 'Belum ada aktivitas'}</span></summary>
        ${S.studio.log.length ? `<ul class="log">${S.studio.log.map((l) => `<li><time>${fmtTime(l.t)}</time><span class="${l.k}">${icon(l.k === 'ok' ? 'circle-check' : l.k === 'err' ? 'circle-x' : 'info')}</span><span>${esc(l.text)}</span></li>`).join('')}</ul>` : ''}
      </details>`;
  },

  gallery() {
    const a = acc();
    const s = a ? st(a.id) : {};
    const warn = readiness(true);
    const g = S.gallery;
    const n = g.selected.size;
    return `
      <div class="page-head"><h1>Galeri</h1><div class="tools">${accountPicker()}
        ${btn('galleryRefresh', 'Muat ulang', { ic: 'refresh-cw', disabled: !!warn || g.loading })}
        ${g.items.length ? btn('gallerySelectAll', n === g.items.length ? 'Batal pilih' : 'Pilih semua', { ic: 'check' }) : ''}
        ${btn('galleryDownloadSel', n ? `Unduh (${n})` : 'Unduh', { ic: 'download', cls: 'primary', disabled: !n })}
      </div></div>
      ${warn || `<p class="subtitle">Project: <b>${esc(s.projectTitle || s.projectId)}</b> · ${g.items.length} hasil</p>`}
      ${g.error ? infobar('error', 'circle-x', 'Gagal memuat galeri.', ' ' + esc(msg({ message: g.error })), btn('galleryRefresh', 'Coba lagi', { ic: 'rotate-ccw' })) : ''}
      ${g.loading && !g.items.length ? '<div class="activity"><div class="progress indet grow"><i></i></div></div>' : ''}
      ${!warn && !g.loading && !g.items.length && !g.error ? `<div class="card empty">${icon('images', 'xl')}<div>Belum ada hasil di project ini.</div></div>` : ''}
      ${!warn ? `<div class="gallery">${g.items.map((it) => `
        <div class="tile ${g.selected.has(it.mediaId) ? 'sel' : ''}">
          <div class="media">
            ${g.thumbs[it.mediaId] ? `<img src="${g.thumbs[it.mediaId]}" alt="">` : icon(it.isVideo ? 'video' : 'file-image', 'xl')}
            <input type="checkbox" data-change="gallerySel" data-id="${it.mediaId}" ${g.selected.has(it.mediaId) ? 'checked' : ''} aria-label="Pilih">
            ${it.isVideo ? '<span class="badge">Video</span>' : ''}${!it.done ? '<span class="badge">Memproses…</span>' : ''}
          </div>
          <div class="meta"><div class="grow"><div class="t" title="${esc(it.title)}">${esc(it.title || (it.isVideo ? 'Video' : 'Gambar'))}</div><div class="d">${it.createdAt ? fmtDate(it.createdAt) : ''}</div></div>
            ${btn('galleryDownload', '', { ic: g.busy.has(it.mediaId) ? 'loader-circle' : 'download', cls: 'subtle sm icon' + (g.busy.has(it.mediaId) ? ' busy' : ''), title: 'Unduh', data: `data-id="${it.mediaId}"`, disabled: !it.done || g.busy.has(it.mediaId) })}
          </div>
        </div>`).join('')}</div>` : ''}`;
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
    const d = S.settings.downloads;
    return `
      <div class="page-head"><h1>Unduhan</h1><div class="tools">${btn('openDownloads', 'Buka folder unduhan', { ic: 'folder-open' })}</div></div>
      <p class="subtitle mono">${esc(S.settings.downloadDir)}</p>
      ${d.length ? `<table class="table"><thead><tr><th>Nama</th><th>Akun</th><th>Waktu</th><th class="act"></th></tr></thead><tbody>
        ${d.map((x) => `<tr>
          <td><div class="hrow">${icon(/\.(mp4|webm)$/i.test(x.name) ? 'video' : 'file-image', 'faint')}<span class="ellipsis" title="${esc(x.path)}">${esc(x.name)}</span></div></td>
          <td class="ellipsis">${esc((accById(x.accountId) || {}).label || '—')}</td>
          <td class="muted">${fmtDate(x.at)}</td>
          <td class="act">${btn('openFile', 'Buka', { cls: 'sm', data: `data-path="${esc(x.path)}"` })}${btn('showFile', '', { ic: 'folder-open', cls: 'sm subtle icon', title: 'Tampilkan di folder', data: `data-path="${esc(x.path)}"` })}${btn('forgetFile', '', { ic: 'x', cls: 'sm subtle icon', title: 'Hapus dari daftar', data: `data-path="${esc(x.path)}"` })}</td>
        </tr>`).join('')}</tbody></table>`
        : `<div class="card empty">${icon('download', 'xl')}<div>Belum ada unduhan.</div><div class="muted small">Unduh hasil dari Galeri, atau aktifkan unduh otomatis di Mode Otomatis.</div></div>`}`;
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
  $('#nav-bottom').innerHTML = item(['settings', 'Pengaturan', 'settings']);
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
  renderNav();
  renderStatus();
  $('#page').innerHTML = updateBanner() + PAGES[S.page]();
  $('#page').scrollTop = scroll;
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { /* bukan input teks */ } }
  }
  afterRender();
}

function afterRender() {
  const bar = $('#q-bar');
  if (bar) {
    const t = S.queue.jobs.length;
    const d = S.queue.jobs.filter((j) => j.status !== 'pending' && j.status !== 'running').length;
    bar.style.width = (t ? (d / t) * 100 : 0) + '%';
  }
  if (S.page === 'gallery' || S.page === 'studio') loadThumbs();
}

function go(page) {
  if (!PAGES[page]) return;
  S.page = page;
  $('#page').scrollTop = 0;
  render();
  $('#page').focus();
  if (page === 'gallery' || page === 'studio') galleryAutoLoad();
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
  for (const p of list) {
    if (S.studio.images.length >= 10) { toast('Maksimal 10 gambar.', 'err'); break; }
    if (!S.studio.images.includes(p)) S.studio.images.push(p);
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
  return [sub, o.model === 'auto' ? 'model bawaan' : o.model, o.ratio, 'x' + o.count, o.kind === 'video' && o.duration ? o.duration + ' dtk' : ''].filter(Boolean).join(' · ');
}
function setStudio(patch) {
  const o = { ...opts(), ...patch };
  if (patch.kind && patch.kind !== opts().kind) {
    if (o.model !== 'auto' && !modelList(o.kind).some((m) => m.v === o.model)) o.model = 'auto';
    if (!RATIOS[o.kind].includes(o.ratio)) o.ratio = '16:9';
  }
  S.settings.studio = o;
  render();
  call('settings:set', { studio: o }).catch((e) => toast(msg(e), 'err'));
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
  removeImage: (el) => { S.studio.images.splice(Number(el.dataset.i), 1); render(); },
  insertTag: (el) => insertMention(el.dataset.tag, false),
  clearImages: () => { S.studio.images = []; render(); },
  async send() {
    const a = acc();
    if (!a || S.studio.busy) return;
    S.studio.busy = 'send';
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
    S.studio.busy = '';
    S.activity = '';
    render();
  },
  async sendGenerate() {
    const a = acc();
    if (!a || S.studio.busy || !isAuto()) return;
    if (!S.studio.prompt.trim() && !S.studio.images.length) { toast(ERR.NOTHING_TO_SEND, 'err'); return; }
    S.studio.busy = 'generate';
    S.activity = 'Menyiapkan Google Flow…';
    render();
    try {
      const r = await call('flow:run', a.id, { prompt: S.studio.prompt, images: S.studio.images, tags: refTags(S.studio.images), options: opts(), waitResults: S.studio.waitResults });
      if (r.refs && r.refs.length) log(`${r.refs.length} gambar referensi terunggah di Flow & ditandai: ${r.refs.map((x) => '@' + x.tag).join(', ')}.`, 'ok');
      log(`Generate ditekan${r.click && r.click.label ? ' ("' + r.click.label + '")' : ''}.${settingsNote(r.settings)}${mentionNote(r.mentions)}${r.fellBack ? ' Mode tersembunyi ditolak — beralih ke jendela diperkecil.' : ''}`, 'ok');
      if (r.items) {
        log(`${r.items.length} hasil siap${r.files.length ? `, ${r.files.length} file diunduh` : ''}.`, 'ok');
        toast(`${r.items.length} hasil siap${r.files.length ? ' & sudah diunduh' : ''}.`, 'ok');
        S.studio.sel = r.items[0] ? r.items[0].mediaId : null;
      } else toast('Generate ditekan. Hasil muncul di pratinjau saat selesai.', 'ok');
      S.gallery.key = '';
    } catch (e) { log(msg(e), 'err'); toast(msg(e), 'err'); }
    S.studio.busy = '';
    S.activity = '';
    render();
    galleryAutoLoad();
  },

  // Galeri
  galleryRefresh: () => galleryLoad(true),
  gallerySelectAll: () => {
    const g = S.gallery;
    if (g.selected.size === g.items.length) g.selected.clear();
    else g.items.filter((i) => i.done).forEach((i) => g.selected.add(i.mediaId));
    render();
  },
  galleryDownload: (el) => downloadItems([el.dataset.id]),
  galleryDownloadSel: () => downloadItems([...S.gallery.selected]),

  // Otomatis
  enableAuto: () => enableAuto(),
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
    S.update = await call('update:check');
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
function galleryAutoLoad() {
  const k = galleryKey();
  if (k && k !== S.gallery.key) galleryLoad(false);
}
async function galleryLoad(force) {
  const k = galleryKey();
  const g = S.gallery;
  if (!k || g.loading) return;
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
}
let thumbRunning = 0;
function loadThumbs() {
  const g = S.gallery;
  const a = acc();
  if (!a) return;
  const todo = g.items.slice(0, S.page === 'studio' ? 14 : g.items.length).filter((i) => i.image && g.thumbs[i.mediaId] === undefined);
  while (thumbRunning < 3 && todo.length) {
    const it = todo.shift();
    g.thumbs[it.mediaId] = null;
    thumbRunning++;
    call('flow:thumb', a.id, it)
      .then((url) => { g.thumbs[it.mediaId] = url; })
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

// ---------- Event ----------
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
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el || $('#dialog').contains(el)) return;
  const fn = CHANGES[el.dataset.change];
  if (fn) Promise.resolve(fn(el)).catch((err) => toast(msg(err), 'err'));
});
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.input === 'gateKey') { S.gateKey = e.target.value; return; }
  if (e.target.dataset && e.target.dataset.input === 'prompt') {
    S.studio.prompt = e.target.value;
    const c = $('#count');
    if (c) c.textContent = `${S.studio.prompt.length}/8000`;
    mentionUpdate(e.target);
  }
});

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
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  const d = $('#drop');
  if (d) d.classList.toggle('over', d.contains(e.target));
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) { const d = $('#drop'); if (d) d.classList.remove('over'); } });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const d = $('#drop');
  if (d) d.classList.remove('over');
  if (S.page !== 'studio') return;
  const paths = [...(e.dataTransfer.files || [])].map((f) => fc.pathForFile(f)).filter(Boolean);
  if (paths.length) addImages(paths);
});

// pintasan papan ketik
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target && e.target.id === 'license-key') { e.preventDefault(); ACTIONS.licenseActivate(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && S.page === 'studio') {
    e.preventDefault();
    (isAuto() ? ACTIONS.sendGenerate : ACTIONS.send)();
    return;
  }
  // Windows (bilah judul khusus, tanpa menu): pintasan ditangani di sini
  if (!S.info || !(S.info.chrome || {}).customTitlebar || !licensed() || $('#dialog').open) return;
  const pages = ['home', 'accounts', 'studio', 'gallery', 'auto', 'downloads'];
  if (e.ctrlKey && !e.shiftKey && /^[1-6]$/.test(e.key)) { e.preventDefault(); go(pages[Number(e.key) - 1]); }
  else if (e.ctrlKey && e.key === ',') { e.preventDefault(); go('settings'); }
  else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); go('accounts'); ACTIONS.addAccount(); }
  else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); go('studio'); ACTIONS.pickImages(); }
  else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); call('files:openDownloads'); }
  else if (e.key === 'F1') { e.preventDefault(); helpDialog(); }
});

function helpDialog() {
  dialog({
    title: 'Panduan FLOW CONNECT Desktop',
    body: `<ol class="steps">
      <li><div><b>Akun Google → Tambah akun → Masuk ke Google.</b><div class="muted small">Kartu login kecil terbuka; masuk seperti biasa. Kartu menutup sendiri setelah berhasil.</div></div></li>
      <li><div><b>Otomatis: Flow dibuka di latar belakang &amp; project baru dibuat.</b><div class="muted small">Browser tidak tampil. Klik "Lihat Flow" bila ingin melihat jendelanya.</div></div></li>
      <li><div><b>Studio.</b><div class="muted small">Pilih Video / Gambar, mode (Teks / Frame / Bahan), model, rasio &amp; jumlah. Tulis prompt → Generate (Ctrl+Enter).</div></div></li>
      <li><div><b>Mode Aman vs Otomatis.</b><div class="muted small">Aman: jendela Flow muncul, Anda menekan Generate. Otomatis: aplikasi menekan Generate, menunggu, mengunduh — sepenuhnya tersembunyi.</div></div></li>
      <li><div><b>Galeri / Unduhan.</b><div class="muted small">Lihat semua hasil project dan simpan ke PC.</div></div></li>
    </ol>
    <p class="small mt16">Pintasan: Ctrl+1…6 pindah halaman · Ctrl+, Pengaturan · Ctrl+N tambah akun · Ctrl+O pilih gambar · F1 panduan.</p>`,
    buttons: [{ label: 'Tutup', value: 'ok', primary: true }]
  });
}

// ---------- Mulai ----------
async function init() {
  S.info = await call('app:info');
  S.settings = S.info.settings;
  S.statuses = S.info.statuses || {};
  S.queue = S.info.queue;
  S.license = S.info.license;
  S.update = S.info.update;
  S.flowOptions = S.info.flowOptions || {};
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
    S.queue = q;
    if (same && S.page === 'auto' && $('#q-act')) { $('#q-act').textContent = q.activity; renderStatus(); return; }
    render();
  });
  fc.on('activity', (t) => { S.activity = t; const el = $('#act-text'); if (el) el.textContent = t; renderStatus(); });
  fc.on('license', (l) => {
    const was = licensed();
    S.license = l;
    if (was && !licensed()) toast(ERR[l.error] || 'Lisensi tidak aktif.', 'err');
    if (was !== licensed() || !S.busy.size) render();
  });
  fc.on('update', (u) => {
    S.update = u;
    if (u.state === 'downloading' && $('.update-bar progress')) {
      $('.update-bar progress').value = u.percent;
      const b = $('.update-bar .text b'); if (b) b.textContent = `Mengunduh pembaruan ${u.version}… ${u.percent}%`;
      return;
    }
    render();
  });
  fc.on('accent', (c) => document.documentElement.style.setProperty('--accent', c));
  fc.on('login', (l) => {
    if (!S.login || S.login.id !== l.id) return;
    S.login.state = l.state;
    renderLoginSheet();
  });
  fc.on('navigate', (p) => {
    if (!licensed()) return;
    if (p === 'accounts:add') { go('accounts'); ACTIONS.addAccount(); }
    else if (p === 'studio:pick') { go('studio'); ACTIONS.pickImages(); }
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
