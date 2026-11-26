// Tampilan FLOW CONNECT Desktop — JavaScript biasa, tanpa framework, tanpa akses Node (lihat preload).
import { icon } from './icons.js';

const fc = window.fc;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function call(channel, ...args) {
  const r = await fc.call(channel, ...args);
  if (!r || !r.ok) throw new Error((r && r.error) || 'ERROR');
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
  FORBIDDEN: 'Tidak diizinkan.'
};
const msg = (e) => {
  const k = (e && e.message) || String(e);
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
  studio: { images: [], previews: {}, prompt: '', busy: '', waitResults: true, log: [] },
  gallery: { key: '', items: [], loading: false, error: null, thumbs: {}, selected: new Set(), busy: new Set() },
  busy: new Set(),
  activity: ''
};
const acc = () => (S.settings ? S.settings.accounts.find((a) => a.id === S.settings.activeAccountId) : null);
const accById = (id) => S.settings.accounts.find((a) => a.id === id);
const st = (id) => S.statuses[id] || { connected: false };
const isAuto = () => S.settings && S.settings.mode === 'auto' && !!S.settings.autoAck;
const fmtTime = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const fmtDate = (t) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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
  if (!s.connected) return infobar('warning', 'plug', 'Akun belum terhubung.', 'Aplikasi akan membuka Google Flow di browser Anda.', btn('connect', 'Hubungkan', { ic: 'plug', cls: 'primary', data: `data-id="${a.id}"` }));
  if (!s.signedIn) return infobar('warning', 'log-in', 'Belum masuk ke Google Flow.', ' Masuk langsung di jendela browser yang terbuka, atau gunakan "Masuk ke Google".', btn('showFlow', 'Tampilkan Flow', { ic: 'app-window', data: `data-id="${a.id}"` }) + btn('login', 'Masuk ke Google', { ic: 'log-in', data: `data-id="${a.id}"` }));
  if (needProject && !s.projectId) return infobar('', 'info', 'Belum ada project terbuka.', ' Buka atau buat project di Google Flow.', btn('showFlow', 'Tampilkan Flow', { ic: 'app-window', data: `data-id="${a.id}"` }));
  return null;
}

// ---------- Halaman ----------
const NAV = [
  ['home', 'Beranda', 'house'],
  ['accounts', 'Akun Google', 'users'],
  ['studio', 'Studio', 'send'],
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
    return `
      <div class="page-head"><h1>Beranda</h1></div>
      <p class="subtitle">Kendalikan Google Flow dari satu aplikasi. Proses generate tetap dilakukan Google Flow dengan akun Google Anda sendiri.</p>
      ${nb ? infobar('error', 'circle-x', 'Browser tidak ditemukan.', ' Instal Google Chrome atau Microsoft Edge, lalu buka ulang aplikasi.', btn('external', 'Unduh Chrome', { ic: 'external-link', data: 'data-url="https://www.google.com/chrome"' })) : ''}
      ${!S.settings.accounts.length ? infobar('', 'sparkles', 'Selamat datang!', ' Mulai dengan menambahkan akun Google Anda.', btn('addAccount', 'Tambah akun', { ic: 'plus', cls: 'primary' })) : ''}
      <div class="grid c3">
        <div class="card stat">
          <div class="label">${icon('users')} Akun aktif</div>
          <div class="value ellipsis">${a ? esc(a.label) : '—'}</div>
          <div class="muted small ellipsis">${a ? esc(a.email || 'Email terdeteksi setelah masuk') : 'Belum ada akun'}</div>
          <div class="actions">${a ? `${si.badge}` : ''}</div>
          <div class="actions">${a ? (s.connected ? btn('showFlow', 'Tampilkan Flow', { ic: 'app-window', cls: 'sm', data: `data-id="${a.id}"` }) : btn('connect', 'Hubungkan', { ic: 'plug', cls: 'sm primary', data: `data-id="${a.id}"` })) : btn('addAccount', 'Tambah akun', { ic: 'plus', cls: 'sm primary' })}</div>
        </div>
        <div class="card stat">
          <div class="label">${icon(isAuto() ? 'bot' : 'shield-check')} Mode kerja</div>
          <div class="value">${isAuto() ? 'Otomatis' : 'Aman'}</div>
          <div class="muted small">${isAuto() ? 'Aplikasi boleh menekan Generate untuk Anda.' : 'Anda sendiri yang menekan Generate di Flow.'}</div>
          <div class="actions">${btn('go', 'Ubah', { cls: 'sm', data: 'data-page="settings"' })}</div>
        </div>
        <div class="card stat">
          <div class="label">${icon('download')} Unduhan</div>
          <div class="value">${S.settings.downloads.length} file</div>
          <div class="muted small ellipsis" title="${esc(S.settings.downloadDir)}">${esc(S.settings.downloadDir)}</div>
          <div class="actions">${btn('openDownloads', 'Buka folder', { ic: 'folder-open', cls: 'sm' })}</div>
        </div>
      </div>
      <h2>Cara kerja</h2>
      <div class="card">
        <ol class="steps">
          <li><div><b>Tambah akun</b><div class="muted small">Setiap akun Google mendapat profil browser tersendiri di PC ini.</div></div></li>
          <li><div><b>Masuk ke Google (sekali saja)</b><div class="muted small">Browser biasa terbuka. Masuk ke akun Google Anda, lalu tutup jendelanya. Login tersimpan di PC Anda, tidak dikirim ke mana pun.</div></div></li>
          <li><div><b>Hubungkan</b><div class="muted small">Aplikasi membuka Google Flow di browser itu dan mengendalikannya dari sini.</div></div></li>
          <li><div><b>Kirim gambar &amp; prompt dari Studio</b><div class="muted small">Mode Aman: Anda menekan Generate di Flow. Mode Otomatis: aplikasi yang menekan, menunggu, lalu mengunduh hasilnya.</div></div></li>
        </ol>
      </div>`;
  },

  accounts() {
    const list = S.settings.accounts;
    return `
      <div class="page-head"><h1>Akun Google</h1><div class="tools">${btn('addAccount', 'Tambah akun', { ic: 'plus', cls: 'primary' })}</div></div>
      <p class="subtitle">Satu akun = satu profil browser terpisah. Anda bisa memakai beberapa akun sekaligus.</p>
      ${list.length ? '' : `<div class="card empty">${icon('users', 'xl')}<div>Belum ada akun.</div><div class="actionbar center">${btn('addAccount', 'Tambah akun', { ic: 'plus', cls: 'primary' })}</div></div>`}
      <div class="rows">
        ${list.map((a) => {
          const s = st(a.id);
          const si = statusInfo(a.id);
          const d = `data-id="${a.id}"`;
          return `<div class="row">
            <div class="avatar">${esc((a.label || '?').trim().charAt(0).toUpperCase())}</div>
            <div class="text">
              <div class="title">${esc(a.label)} ${a.id === S.settings.activeAccountId ? '<span class="badge accent">Aktif</span>' : ''}</div>
              <div class="desc">${esc(a.email || 'Email terdeteksi setelah masuk & terhubung')}${s.projectTitle ? ' · Project: ' + esc(s.projectTitle) : ''}</div>
            </div>
            <div class="ctrl">
              ${si.badge}
              ${a.id !== S.settings.activeAccountId ? btn('setActive', '', { ic: 'check', cls: 'subtle icon', title: 'Jadikan akun aktif', data: d }) : ''}
              ${btn('login', 'Masuk ke Google', { ic: 'log-in', data: d, disabled: s.connected, title: s.connected ? 'Putuskan dulu untuk membuka jendela login biasa' : '' })}
              ${s.connected
                ? btn('showFlow', '', { ic: 'app-window', cls: 'icon', title: 'Tampilkan Google Flow', data: d }) + btn('disconnect', 'Putuskan', { ic: 'unplug', data: d })
                : btn('connect', 'Hubungkan', { ic: 'plug', cls: 'primary', data: d })}
              ${btn('renameAccount', '', { ic: 'pencil', cls: 'subtle icon', title: 'Ganti nama', data: d })}
              ${btn('removeAccount', '', { ic: 'trash-2', cls: 'subtle icon danger', title: 'Hapus akun', data: d })}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${list.length ? `<h2>Tentang login</h2>${infobar('', 'shield-check', '', '"Masuk ke Google" membuka browser biasa (Chrome/Edge) <b>tanpa</b> kendali aplikasi, jadi login Google berjalan normal. Setelah berhasil masuk, tutup jendela browser itu lalu klik <b>Hubungkan</b>. Kata sandi & cookie Google hanya tersimpan di profil browser di PC ini.')}` : ''}`;
  },

  studio() {
    const a = acc();
    const s = a ? st(a.id) : {};
    const warn = readiness(false);
    const ready = !warn;
    const imgs = S.studio.images;
    const busy = S.studio.busy;
    return `
      <div class="page-head"><h1>Studio</h1><div class="tools">${accountPicker()}${a && s.connected ? btn('showFlow', 'Tampilkan Flow', { ic: 'app-window', data: `data-id="${a.id}"` }) : ''}</div></div>
      ${warn || (s.projectId ? '' : infobar('', 'info', 'Belum ada project terbuka.', ' Prompt tetap bisa dikirim ke halaman Flow yang sedang terbuka; untuk galeri & unduh otomatis, buka sebuah project.'))}
      ${ready && s.projectId ? infobar('success', 'circle-check', 'Siap.', ` Project: <b>${esc(s.projectTitle || s.projectId)}</b>`) : ''}
      <div class="studio">
        <div class="card">
          <div class="card-head">${icon('image-plus')}<h3>Gambar referensi</h3><span class="right faint small">${imgs.length}/10</span></div>
          <div class="drop" id="drop">
            ${icon('file-image', 'xl')}
            <div>Seret gambar ke sini</div>
            ${btn('pickImages', 'Pilih gambar…', { ic: 'folder-open', cls: 'sm' })}
          </div>
          ${imgs.length ? `<div class="thumbs">${imgs.map((p, i) => `<div class="thumb" title="${esc(p)}">${S.studio.previews[p] ? `<img src="${S.studio.previews[p]}" alt="">` : icon('file-image', 'lg')}${btn('removeImage', '', { ic: 'x', cls: 'x sm', title: 'Hapus', data: `data-i="${i}"` })}</div>`).join('')}</div>
          <div class="actionbar">${btn('clearImages', 'Hapus semua', { cls: 'sm subtle' })}</div>` : ''}
        </div>
        <div class="card">
          <div class="card-head">${icon('pencil')}<h3>Prompt</h3><span class="right faint small" id="count">${S.studio.prompt.length}/8000</span></div>
          <textarea id="prompt" class="input" rows="7" maxlength="8000" placeholder="Jelaskan gambar atau video yang ingin dibuat Google Flow…" data-input="prompt">${esc(S.studio.prompt)}</textarea>
          <div class="actionbar">
            ${isAuto()
              ? btn('sendGenerate', 'Kirim &amp; Generate', { ic: busy === 'generate' ? 'loader-circle' : 'zap', cls: 'primary', disabled: !ready || !!busy }) +
                btn('send', 'Kirim saja', { ic: 'send', disabled: !ready || !!busy }) +
                btn('queueAdd', 'Tambah ke antrean', { ic: 'list-plus', disabled: !a || !!busy }) +
                `<label class="check small"><input type="checkbox" data-change="waitResults" ${S.studio.waitResults ? 'checked' : ''}> Tunggu hasil${S.settings.auto.autoDownload ? ' &amp; unduh' : ''}</label>`
              : btn('send', 'Kirim ke Flow', { ic: busy === 'send' ? 'loader-circle' : 'send', cls: 'primary', disabled: !ready || !!busy }) +
                `<span class="muted small">Gambar & prompt dimasukkan ke Google Flow, lalu jendela Flow ditampilkan agar Anda menekan Generate.</span>`}
          </div>
          ${busy ? `<div class="activity"><div class="progress indet grow"><i></i></div></div><div class="muted small" id="act-text">${esc(S.activity)}</div>` : ''}
        </div>
      </div>
      <h2>Aktivitas</h2>
      <div class="card">${S.studio.log.length ? `<ul class="log">${S.studio.log.map((l) => `<li><time>${fmtTime(l.t)}</time><span class="${l.k}">${icon(l.k === 'ok' ? 'circle-check' : l.k === 'err' ? 'circle-x' : 'info')}</span><span>${esc(l.text)}</span></li>`).join('')}</ul>` : '<div class="muted small">Belum ada aktivitas.</div>'}</div>`;
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
          <td class="prompt"><div class="ellipsis" title="${esc(j.prompt)}">${esc(j.prompt)}</div>${j.error ? `<div class="small err-text">${esc(msg({ message: j.error }))}</div>` : ''}</td>
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
        <div class="row">${icon('eye', 'lg')}<div class="text"><div class="title">Jendela Google Flow</div><div class="desc">Cara menampilkan browser saat aplikasi bekerja. Jendela tidak bisa disembunyikan total — Flow perlu tampil agar berjalan normal.</div></div>
          <div class="ctrl"><select class="input" data-change="browserWindow">${[['normal', 'Biasa'], ['background', 'Di belakang aplikasi'], ['minimized', 'Diperkecil (dipulihkan saat bekerja)']].map(([v, l]) => `<option value="${v}" ${s.browserWindow === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
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
      <h2>Tentang</h2>
      <div class="rows">
        <div class="row">${icon('info', 'lg')}<div class="text"><div class="title">FLOW CONNECT Desktop ${esc(S.info.version)}</div><div class="desc">Tidak berafiliasi dengan Google. Google Flow adalah layanan Google Labs.</div></div>
          <div class="ctrl">${btn('external', 'Situs', { ic: 'external-link', cls: 'subtle', data: `data-url="${S.info.webUrl}"` })}${btn('external', 'GitHub', { ic: 'external-link', cls: 'subtle', data: 'data-url="https://github.com/sugionoofficial/FLOW-CONNECT"' })}</div></div>
      </div>`;
  }
};

// ---------- Render ----------
function renderNav() {
  const item = ([id, label, ic]) => `<button class="nav-item ${S.page === id ? 'active' : ''}" data-act="go" data-page="${id}">${icon(ic, 'lg')}<span>${label}</span>${id === 'auto' && S.queue.running ? '<span class="badge accent">Berjalan</span>' : ''}</button>`;
  $('#nav-items').innerHTML = NAV.map(item).join('');
  $('#nav-bottom').innerHTML = item(['settings', 'Pengaturan', 'settings']);
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
  $('#statusbar').innerHTML = `${left}<span class="grow ellipsis faint">${esc(act || '')}</span><span>${isAuto() ? 'Mode Otomatis' : 'Mode Aman'}</span><span class="sep"></span><span>v${esc(S.info.version)}</span>`;
}

function render() {
  if (!S.info) return;
  // pertahankan fokus & posisi kursor saat render ulang
  const ae = document.activeElement;
  const keep = ae && ae.id && $('#page').contains(ae) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
  const scroll = $('#page').scrollTop;
  renderNav();
  renderStatus();
  $('#page').innerHTML = PAGES[S.page]();
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
  if (S.page === 'gallery') loadThumbs();
}

function go(page) {
  if (!PAGES[page]) return;
  S.page = page;
  $('#page').scrollTop = 0;
  render();
  $('#page').focus();
  if (page === 'gallery') galleryAutoLoad();
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
      body: `<p>Browser akan terbuka di halaman login Google. Setelah berhasil masuk ke Google Flow, <b>tutup jendela browser itu</b>, lalu klik <b>Hubungkan</b> pada akun "${esc(a.label)}".</p>`,
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
  login: (el) => busy('login' + `data-id="${el.dataset.id}"`, async () => {
    await call('accounts:login', el.dataset.id);
    toast('Browser dibuka. Setelah masuk ke Google Flow, tutup jendela itu lalu klik Hubungkan.', 'info');
  }),
  connect: (el) => busy('connect' + `data-id="${el.dataset.id}"`, async () => {
    S.activity = 'Membuka Google Flow…';
    const s = await call('accounts:connect', el.dataset.id);
    S.statuses[el.dataset.id] = s;
    S.activity = '';
    toast(s.signedIn ? 'Terhubung ke Google Flow.' : 'Terhubung. Silakan masuk ke akun Google di jendela browser.', s.signedIn ? 'ok' : 'info');
  }),
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
  showFlow: (el) => call('flow:show', el.dataset.id).catch((e) => toast(msg(e), 'err')),

  // Studio
  pickImages: async () => { const list = await call('files:pickImages'); if (list.length) addImages(list); },
  removeImage: (el) => { S.studio.images.splice(Number(el.dataset.i), 1); render(); },
  clearImages: () => { S.studio.images = []; render(); },
  async send() {
    const a = acc();
    if (!a || S.studio.busy) return;
    S.studio.busy = 'send';
    S.activity = 'Mengirim ke Google Flow…';
    render();
    try {
      const r = await call('flow:send', a.id, { prompt: S.studio.prompt, images: S.studio.images });
      const parts = [];
      if (r.images) parts.push(`${r.images.count} gambar (${r.images.method === 'file-input' ? 'unggah' : r.images.method})`);
      if (r.prompt) parts.push('prompt');
      log(`Terkirim ke Flow: ${parts.join(' + ')}.`, 'ok');
      await call('flow:afterSend', a.id, !isAuto());
      toast(isAuto() ? 'Terkirim ke Google Flow.' : 'Terkirim. Tekan Generate di jendela Google Flow.', 'ok');
    } catch (e) { log(msg(e), 'err'); toast(msg(e), 'err'); }
    S.studio.busy = '';
    S.activity = '';
    render();
  },
  async sendGenerate() {
    const a = acc();
    if (!a || S.studio.busy || !isAuto()) return;
    S.studio.busy = 'generate';
    S.activity = 'Mengirim ke Google Flow…';
    render();
    try {
      if (S.studio.prompt.trim() || S.studio.images.length) {
        await call('flow:send', a.id, { prompt: S.studio.prompt, images: S.studio.images });
        log('Gambar/prompt terkirim.', 'ok');
        await new Promise((r) => setTimeout(r, 1500));
      }
      S.activity = 'Menekan Generate…';
      render();
      const r = await call('flow:generate', a.id, { waitResults: S.studio.waitResults });
      log(`Generate ditekan (${r.click.method === 'click' ? 'tombol "' + (r.click.label || 'Generate') + '"' : 'Enter'}).`, 'ok');
      if (r.items) {
        log(`${r.items.length} hasil siap${r.files.length ? `, ${r.files.length} file diunduh` : ''}.`, 'ok');
        toast(`${r.items.length} hasil siap${r.files.length ? ' & sudah diunduh' : ''}.`, 'ok');
        S.gallery.key = '';
      } else toast('Generate ditekan.', 'ok');
    } catch (e) { log(msg(e), 'err'); toast(msg(e), 'err'); }
    S.studio.busy = '';
    S.activity = '';
    render();
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
      body: `<p>Tulis <b>satu prompt per baris</b> — setiap baris menjadi satu tugas. Gambar referensi (opsional) dipakai untuk semua tugas ini.</p>
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
      S.queue = await call('queue:add', { prompts, images, accountId: r.el.querySelector('[name=acc]').value });
      toast(`${prompts.length} tugas ditambahkan.`, 'ok');
      if (S.page !== 'auto') go('auto'); else render();
    } catch (e) { toast(msg(e), 'err'); }
  },
  queueStart: async () => { try { S.queue = await call('queue:start'); render(); } catch (e) { toast(msg(e), 'err'); } },
  queueStop: async () => { S.queue = await call('queue:stop'); render(); },
  queueClear: async () => { S.queue = await call('queue:clear'); render(); },
  queueRemove: async (el) => { S.queue = await call('queue:remove', el.dataset.id); render(); },
  queueRetry: async (el) => { S.queue = await call('queue:retry', el.dataset.id); render(); },

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
  const todo = g.items.filter((i) => i.image && g.thumbs[i.mediaId] === undefined);
  while (thumbRunning < 3 && todo.length) {
    const it = todo.shift();
    g.thumbs[it.mediaId] = null;
    thumbRunning++;
    call('flow:thumb', a.id, it)
      .then((url) => { g.thumbs[it.mediaId] = url; })
      .catch(() => { g.thumbs[it.mediaId] = null; })
      .finally(() => { thumbRunning--; if (S.page === 'gallery') render(); });
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
  browserWindow: async (el) => { S.settings = await call('settings:set', { browserWindow: el.value }); render(); },
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
  if (e.target.dataset && e.target.dataset.input === 'prompt') {
    S.studio.prompt = e.target.value;
    const c = $('#count');
    if (c) c.textContent = `${S.studio.prompt.length}/8000`;
  }
});

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
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && S.page === 'studio') {
    e.preventDefault();
    (isAuto() ? ACTIONS.sendGenerate : ACTIONS.send)();
  }
});

function helpDialog() {
  dialog({
    title: 'Panduan FLOW CONNECT Desktop',
    body: `<ol class="steps">
      <li><div><b>Akun Google → Tambah akun.</b><div class="muted small">Satu akun mendapat satu profil browser.</div></div></li>
      <li><div><b>Masuk ke Google.</b><div class="muted small">Login di browser biasa yang terbuka, lalu tutup jendelanya.</div></div></li>
      <li><div><b>Hubungkan.</b><div class="muted small">Google Flow terbuka; buka atau buat sebuah project.</div></div></li>
      <li><div><b>Studio.</b><div class="muted small">Pilih gambar &amp; tulis prompt → Kirim (Ctrl+Enter). Mode Aman: tekan Generate di Flow. Mode Otomatis: aplikasi yang menekan &amp; mengunduh.</div></div></li>
      <li><div><b>Galeri / Unduhan.</b><div class="muted small">Lihat hasil project dan simpan ke PC.</div></div></li>
    </ol>
    <p class="small mt16">Jika muncul "jendela browser masih terbuka", tutup semua jendela browser akun itu lalu klik Hubungkan lagi.</p>`,
    buttons: [{ label: 'Tutup', value: 'ok', primary: true }]
  });
}

// ---------- Mulai ----------
async function init() {
  S.info = await call('app:info');
  S.settings = S.info.settings;
  S.statuses = S.info.statuses || {};
  S.queue = S.info.queue;
  document.documentElement.style.setProperty('--accent', S.info.accent);
  document.body.classList.add('platform-' + S.info.platform);
  render();

  fc.on('statuses', (s) => { S.statuses = s; render(); if (S.page === 'gallery') galleryAutoLoad(); });
  fc.on('settings', (s) => { S.settings = s; render(); });
  fc.on('queue', (q) => {
    const sig = (x) => x.running + '|' + x.jobs.map((j) => j.id + j.status).join(',');
    const same = sig(q) === sig(S.queue);
    S.queue = q;
    if (same && S.page === 'auto' && $('#q-act')) { $('#q-act').textContent = q.activity; renderStatus(); return; }
    render();
  });
  fc.on('activity', (t) => { S.activity = t; const el = $('#act-text'); if (el) el.textContent = t; renderStatus(); });
  fc.on('accent', (c) => document.documentElement.style.setProperty('--accent', c));
  fc.on('navigate', (p) => {
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
