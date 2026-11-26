'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu, Notification, systemPreferences, safeStorage, screen, powerMonitor } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Store, sanitizeStudio } = require('./store');
const { FlowSession, IMAGE_EXT } = require('./flow');
const { AutomationQueue, safeName } = require('./automation');
const { sanitizeTags } = require('./refs');
const { checkFrames } = require('./catalog');
const browser = require('./browser');
const { LicenseManager } = require('./license');
const { Updater } = require('./updater');

const WEB_URL = 'https://flow-connect-2qu.pages.dev';
const FLOW_URL = 'https://flow.google.com/?hl=en'; // label UI Flow berbahasa Inggris → otomasi setelan lebih andal
// Windows 11: bahan Mica + bilah judul khusus (tombol jendela tetap milik Windows)
const WIN_BUILD = process.platform === 'win32' ? Number(os.release().split('.')[2] || 0) : 0;
const CUSTOM_TITLEBAR = process.platform === 'win32';
const MICA = WIN_BUILD >= 22621;
const REPO_URL = 'https://github.com/sugionoofficial/FLOW-CONNECT';
const EXTERNAL_OK = [WEB_URL, REPO_URL, 'https://github.com/sugionoofficial/FLOW-CONNECT/releases', 'https://flow.google.com', 'https://support.google.com', 'https://www.google.com/chrome'];

// --smoke-test: dipakai CI untuk memastikan aplikasi hasil build benar-benar terbuka (data di folder sementara)
const SMOKE = process.argv.includes('--smoke-test');
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'fc-smoke-')));

if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.flowconnect.desktop');

let win = null;
let store = null;
let queue = null;
let license = null;
let updater = null;
const sessions = new Map();     // accountId → FlowSession
const statuses = new Map();     // accountId → status terakhir
const allowedFiles = new Set(); // gambar yang dipilih pengguna (dialog / seret)
const logins = new Map();       // accountId → { stop } kartu login yang sedang terbuka
const flowOptions = new Map();  // accountId → pilihan model/rasio yang dibaca dari Flow

const profileDir = (id) => path.join(app.getPath('userData'), 'profiles', id);
const thumbsDir = () => path.join(app.getPath('userData'), 'thumbs');

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const liveNotes = new Set(); // simpan referensi agar notifikasi tidak dibuang GC sebelum diklik
function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  liveNotes.add(n);
  const drop = () => liveNotes.delete(n);
  n.on('click', () => { drop(); if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } if (onClick) onClick(); });
  n.on('close', drop);
  setTimeout(drop, 10 * 60 * 1000);
  n.show();
}

/** Pemberitahuan pembaruan: notifikasi Windows + kedipkan ikon taskbar bila jendela tidak sedang aktif. */
function notifyUpdate(title, body, st) {
  notify(title, body, () => send('update-show', st));
  if (win && !win.isDestroyed() && !win.isFocused()) { try { win.flashFrame(true); } catch { /* tidak didukung */ } }
}

// Kunci lisensi disimpan terenkripsi (DPAPI Windows lewat safeStorage) bila tersedia
const crypt = {
  encrypt: (s) => (safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(s).toString('base64') : 'raw:' + s),
  decrypt: (s) => (s.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : s.replace(/^raw:/, ''))
};

function accent() {
  try {
    const c = systemPreferences.getAccentColor && systemPreferences.getAccentColor();
    if (c && /^[0-9a-f]{6,8}$/i.test(c)) return '#' + c.slice(0, 6);
  } catch { /* tidak didukung */ }
  return '#0067c0';
}

function account(id) {
  const a = store.data.accounts.find((x) => x.id === id);
  if (!a) throw new Error('UNKNOWN_ACCOUNT');
  return a;
}

function workArea() {
  try { return (win ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay()).workArea; } catch { return { x: 0, y: 0, width: 1366, height: 768 }; }
}
// kartu login: kecil, di tengah jendela aplikasi
function cardBounds() {
  const wa = workArea();
  const width = 460, height = Math.min(700, wa.height - 40);
  const c = win ? win.getBounds() : wa;
  const x = Math.min(Math.max(wa.x, c.x + (c.width - width) / 2), wa.x + wa.width - width);
  const y = Math.min(Math.max(wa.y, c.y + (c.height - height) / 2), wa.y + wa.height - height);
  return { x, y, width, height };
}
function showBounds() {
  const wa = workArea();
  const width = Math.round(wa.width * 0.8), height = Math.round(wa.height * 0.85);
  return { x: wa.x + (wa.width - width) / 2, y: wa.y + (wa.height - height) / 2, width, height };
}

/**
 * Mode tampilan browser untuk akun ini:
 *  - Pengaturan "Tersembunyi" + Mode Otomatis → headless (eksperimental)
 *  - Mode Aman perlu jendela Flow untuk ditekan Generate → jendela diperkecil, ditampilkan saat dibutuhkan
 *  - Headless pernah ditolak Flow untuk akun ini → jendela diperkecil (cadangan otomatis)
 */
function desiredMode(id) {
  const w = store.data.browserWindow;
  if (w !== 'hidden') return w === 'normal' ? 'normal' : 'minimized';
  const a = store.data.accounts.find((x) => x.id === id);
  if (store.data.mode !== 'auto' || !store.data.autoAck || (a && a.headlessFailedAt)) return 'minimized';
  return 'hidden';
}

function session(id) {
  account(id);
  let s = sessions.get(id);
  if (!s) {
    s = new FlowSession({
      profileDir: profileDir(id), flowUrl: FLOW_URL, getBrowser: () => browser.resolveBrowser(store.data.browser),
      getMode: () => desiredMode(id), getShowBounds: showBounds, uploads: uploadSet
    });
    s.on('upload', (mediaId) => {
      store.data.uploads = [mediaId, ...(store.data.uploads || []).filter((x) => x !== mediaId)].slice(0, 5000);
      store.save();
    });
    s.on('change', () => refreshStatus(id));
    s.on('login', (state) => send('login', { id, state }));
    sessions.set(id, s);
  }
  return s;
}

// media id gambar referensi yang pernah diunggah aplikasi → tidak ditampilkan di galeri / pratinjau
let uploadSet = null;
function initUploads() { uploadSet = new Set(store.data.uploads || []); }

async function connected(id) {
  const s = session(id);
  if (!s.connected) await s.connect();
  else await s.ensurePage();
  return s;
}

function markHeadlessFailed(id, reason) {
  const a = store.data.accounts.find((x) => x.id === id);
  if (!a || a.headlessFailedAt) return;
  a.headlessFailedAt = Date.now();
  a.headlessReason = String(reason || '').slice(0, 200);
  store.save();
  send('settings', publicSettings());
  send('activity', 'Mode tersembunyi ditolak Google Flow — akun ini memakai jendela diperkecil.');
}

/**
 * Sambungkan akun dengan mode yang benar; cadangan otomatis bila Flow tampak keluar akun di mode tersembunyi;
 * buat project baru bila belum ada (opsi project).
 */
async function connectAccount(id, { project = false } = {}) {
  const s = session(id);
  const want = desiredMode(id);
  if (!s.connected) await s.connect();
  else if (s.mode && s.mode !== want && !(queue.running && want === 'minimized' && s.mode === 'hidden')) await s.relaunch(want);
  else await s.ensurePage();
  const a = account(id);
  let st = await s.status();
  if (s.mode === 'hidden' && !st.signedIn && a.signedInAt) {
    send('activity', 'Flow tidak terbaca di mode tersembunyi — mencoba jendela diperkecil…');
    await s.relaunch('minimized');
    st = await s.status();
    if (st.signedIn) markHeadlessFailed(id, 'Flow keluar akun di mode tersembunyi');
  }
  if (st.signedIn && !a.signedInAt) { a.signedInAt = Date.now(); store.save(); }
  if (project && st.signedIn && !st.projectId && store.data.autoProject) {
    send('activity', 'Membuat project baru di Google Flow…');
    await s.newProject().catch((e) => send('activity', 'Project baru belum dibuat: ' + e.message));
  }
  return s;
}

async function refreshStatus(id) {
  const s = sessions.get(id);
  const st = s ? await s.status() : { connected: false };
  const prev = statuses.get(id);
  statuses.set(id, st);
  const acc = store.data.accounts.find((a) => a.id === id);
  if (acc && st.account && acc.email !== st.account) { acc.email = st.account; store.save(); send('settings', publicSettings()); }
  if (JSON.stringify(prev) !== JSON.stringify(st)) send('statuses', Object.fromEntries(statuses));
  return st;
}

async function pollStatuses() {
  for (const id of sessions.keys()) {
    if (sessions.get(id).connected) await refreshStatus(id).catch(() => {});
  }
}


function publicSettings() {
  const d = store.data;
  return {
    accounts: d.accounts, activeAccountId: d.activeAccountId, theme: d.theme, browser: d.browser, browserWindow: d.browserWindow,
    autoProject: d.autoProject, studio: d.studio,
    downloadDir: d.downloadDir, mode: d.mode, autoAck: d.autoAck, auto: d.auto, downloads: d.downloads.slice(0, 300)
  };
}

function addDownload(rec) {
  store.data.downloads.unshift(rec);
  store.data.downloads = store.data.downloads.slice(0, 300);
  store.save();
  send('settings', publicSettings());
}

function checkImage(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !IMAGE_EXT[path.extname(p).toLowerCase()]) return false;
  try { const st = fs.statSync(p); return st.isFile() && st.size <= 30 * 1024 * 1024; } catch { return false; }
}

function insideDownloads(p) {
  const rel = path.relative(path.resolve(store.data.downloadDir), path.resolve(p));
  return (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) || store.data.downloads.some((d) => d.path === p);
}

// ---------- IPC ----------
// Saluran yang boleh dipakai sebelum lisensi aktif
const UNGATED = new Set(['app:info', 'license:activate', 'license:verify', 'license:deactivate', 'update:check', 'update:download', 'update:install', 'shell:external', 'settings:set']);

function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!win || e.sender !== win.webContents) throw new Error('FORBIDDEN');
    try {
      if (!UNGATED.has(channel) && !license.licensed) throw new Error('LICENSE_REQUIRED');
      return { ok: true, data: await fn(...args) };
    } catch (err) { return { ok: false, error: err && err.message ? err.message : String(err), detail: err && err.detail ? String(err.detail).slice(0, 300) : undefined }; }
  });
}

function registerIpc() {
  handle('app:info', () => ({
    version: app.getVersion(), platform: process.platform, accent: accent(), browsers: browser.findBrowsers(),
    settings: publicSettings(), statuses: Object.fromEntries(statuses), queue: queue.state(), webUrl: WEB_URL,
    license: license.state(), update: updater.state(), chrome: { customTitlebar: CUSTOM_TITLEBAR, mica: MICA },
    flowOptions: Object.fromEntries(flowOptions)
  }));

  // Lisensi
  handle('license:activate', (key) => license.activate(key));
  handle('license:verify', () => license.verify());
  handle('license:deactivate', async () => {
    queue.stop();
    return license.deactivate();
  });

  // Pembaruan aplikasi
  handle('update:check', () => updater.check());
  handle('update:download', async () => {
    const r = await updater.download();
    if (r && r.url) await shell.openExternal(r.url);
    return updater.state();
  });
  handle('update:install', () => updater.install(beforeUpdateQuit));
  handle('settings:set', (patch) => {
    store.set(patch || {});
    nativeTheme.themeSource = store.data.theme;
    updateTitlebar();
    return publicSettings();
  });
  handle('auto:ack', (agree) => {
    store.data.autoAck = agree ? new Date().toISOString() : null;
    store.data.mode = agree ? 'auto' : 'safe';
    if (!agree) queue.stop();
    store.save();
    return publicSettings();
  });

  // Akun
  handle('accounts:add', (label) => {
    const name = String(label || '').trim().slice(0, 40) || `Akun ${store.data.accounts.length + 1}`;
    const acc = { id: crypto.randomUUID(), label: name, email: null, createdAt: Date.now() };
    store.data.accounts.push(acc);
    if (!store.data.activeAccountId) store.data.activeAccountId = acc.id;
    store.save();
    return publicSettings();
  });
  handle('accounts:rename', (id, label) => {
    account(id).label = String(label || '').trim().slice(0, 40) || account(id).label;
    store.save();
    return publicSettings();
  });
  handle('accounts:remove', async (id, deleteProfile) => {
    account(id);
    const s = sessions.get(id);
    if (s) { await s.closeBrowser(); sessions.delete(id); }
    statuses.delete(id);
    store.data.accounts = store.data.accounts.filter((a) => a.id !== id);
    store.data.queue = store.data.queue.filter((j) => j.accountId !== id || j.status === 'running');
    if (store.data.activeAccountId === id) store.data.activeAccountId = store.data.accounts[0] ? store.data.accounts[0].id : null;
    store.save();
    if (deleteProfile) {
      await new Promise((r) => setTimeout(r, 1500));
      fs.rmSync(profileDir(id), { recursive: true, force: true });
    }
    send('statuses', Object.fromEntries(statuses));
    return publicSettings();
  });
  // Kartu login Google → (otomatis) sambung tersembunyi → project baru
  handle('accounts:login', async (id) => {
    const s = session(id);
    if (logins.has(id)) throw new Error('LOGIN_IN_PROGRESS');
    if (queue.running) throw new Error('QUEUE_RUNNING');
    const ctl = { stop: false };
    logins.set(id, ctl);
    try {
      const r = await s.loginCard({ card: cardBounds(), shouldStop: () => ctl.stop });
      if (!r.ok) { send('login', { id, state: 'closed' }); return { ok: false, status: await refreshStatus(id) }; }
      send('login', { id, state: 'connecting' });
      await connectAccount(id);
      const st = await s.status();
      if (st.signedIn) { const a = account(id); a.signedInAt = Date.now(); delete a.headlessFailedAt; store.save(); }
      if (store.data.autoProject && !st.projectId) {
        send('login', { id, state: 'project' });
        await s.newProject().catch((e) => send('activity', 'Project baru belum dibuat: ' + e.message));
      }
      const fin = await refreshStatus(id);
      send('login', { id, state: fin.signedIn ? 'done' : 'not-signed-in' });
      return { ok: !!fin.signedIn, status: fin };
    } catch (e) {
      send('login', { id, state: 'error', error: e.message });
      throw e;
    } finally { logins.delete(id); }
  });
  handle('accounts:loginCancel', (id) => { const c = logins.get(id); if (c) c.stop = true; });
  // cadangan: jendela browser biasa tanpa kendali (bila kartu login bermasalah)
  handle('accounts:loginWindow', async (id) => {
    const s = session(id);
    if (s.connected) await s.closeBrowser();
    await browser.waitForExit(profileDir(id));
    s.openForLogin();
  });
  handle('accounts:resetHeadless', (id) => {
    const a = account(id);
    delete a.headlessFailedAt;
    delete a.headlessReason;
    store.save();
    return publicSettings();
  });
  handle('accounts:connect', async (id) => {
    await connectAccount(id, { project: true });
    return refreshStatus(id);
  });
  handle('accounts:disconnect', async (id, close) => {
    const s = session(id);
    if (close) await s.closeBrowser(); else s.disconnect();
    return refreshStatus(id);
  });

  // Google Flow
  handle('flow:status', (id) => refreshStatus(id));
  handle('flow:show', async (id) => { const s = await connected(id); await s.bringToFront(); });
  handle('flow:navigate', async (id, url) => { const s = await connected(id); await s.navigate(url); });
  handle('flow:listMedia', async (id, projectId) => (await connected(id)).listMedia(projectId));
  handle('flow:thumb', async (id, item) => {
    if (!item || !/^[A-Za-z0-9-]{1,128}$/.test(item.mediaId || '')) throw new Error('INVALID_MEDIA_ID');
    fs.mkdirSync(thumbsDir(), { recursive: true });
    const hit = fs.readdirSync(thumbsDir()).find((f) => f.startsWith(item.mediaId + '.'));
    let buffer, mime;
    if (hit) {
      buffer = fs.readFileSync(path.join(thumbsDir(), hit));
      mime = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(hit)] || 'image/jpeg';
    } else {
      const s = await connected(id);
      let url = item.image;
      if (!url) { const m = await s.getMedia(item.mediaId).catch(() => ({})); url = m.image || null; } // URL dari record media (as29s)
      if (!url) return null;
      ({ buffer, mime } = await s.fetchMedia(url));
      if (!/^image\//.test(mime)) return null;
      fs.writeFileSync(path.join(thumbsDir(), item.mediaId + ({ 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[mime] || '.jpg')), buffer);
    }
    return `data:${mime};base64,${buffer.toString('base64')}`;
  });
  handle('flow:download', async (id, item) => {
    const acc = account(id);
    const file = await (await connected(id)).download(item, path.join(store.data.downloadDir, safeName(acc.label)));
    addDownload({ path: file, name: path.basename(file), mediaId: item.mediaId, accountId: id, at: Date.now() });
    return file;
  });
  const checkImages = (images) => {
    const imgs = (images || []).filter((p) => allowedFiles.has(p) && checkImage(p));
    if ((images || []).length !== imgs.length) throw new Error('INVALID_IMAGE');
    return imgs;
  };
  handle('flow:newProject', async (id) => {
    const s = await connectAccount(id);
    await s.newProject();
    return refreshStatus(id);
  });
  handle('flow:scan', async (id) => {
    const s = await connectAccount(id);
    const r = await s.scanSettings();
    flowOptions.set(id, { ...r, at: Date.now() });
    return flowOptions.get(id);
  });
  // MODE AMAN: masukkan setelan, gambar & prompt ke Flow; pengguna sendiri yang menekan Generate
  // gambar diunggah ke Flow dulu (ditunggu sampai tersimpan), lalu prompt ditulis dengan chip "@" ke gambar itu
  handle('flow:send', async (id, { prompt, images, tags, options }) => {
    const imgs = checkImages(images);
    if (!imgs.length && !(prompt || '').trim()) throw new Error('NOTHING_TO_SEND');
    checkFrames(options ? sanitizeStudio(options) : null, imgs);
    const s = await connectAccount(id, { project: true });
    const r = await s.prepare({ prompt: (prompt || '').trim(), images: imgs, tags: sanitizeTags(tags, imgs), options: options || null }, (t) => send('activity', t));
    return { settings: r.settings, refs: r.prep.refs, mentions: r.prep.mentions };
  });
  handle('flow:afterSend', async (id, show) => {
    const s = session(id);
    if (!s.connected) return;
    if (show) await s.bringToFront(); else await s.endWork();
  });
  // MODE OTOMATIS: setelan → gambar → prompt → Generate → (tunggu & unduh), dengan cadangan headless → jendela diperkecil
  handle('flow:run', async (id, { prompt, images, tags, options, waitResults }) => {
    if (store.data.mode !== 'auto' || !store.data.autoAck) throw new Error('AUTO_MODE_DISABLED');
    const imgs = checkImages(images);
    if (!imgs.length && !(prompt || '').trim()) throw new Error('NOTHING_TO_SEND');
    checkFrames(options ? sanitizeStudio(options) : null, imgs);
    const s = await connectAccount(id);
    const res = await s.generate({ prompt: (prompt || '').trim(), images: imgs, tags: sanitizeTags(tags, imgs), options: options || null }, {
      onLog: (t) => send('activity', t), wait: !!waitResults, timeoutMs: store.data.auto.timeoutMin * 60000,
      onFallback: (v) => markHeadlessFailed(id, v.error)
    });
    const files = [];
    if (res.items && store.data.auto.autoDownload) {
      for (const item of res.items) {
        send('activity', 'Mengunduh hasil…');
        const file = await s.download(item, path.join(store.data.downloadDir, safeName(account(id).label)));
        files.push(file);
        addDownload({ path: file, name: path.basename(file), mediaId: item.mediaId, accountId: id, at: Date.now() });
      }
    }
    if (res.items) notify('Hasil Google Flow siap', `${res.items.length} hasil${files.length ? ' sudah diunduh' : ''}.`);
    refreshStatus(id).catch(() => {});
    return { click: res.click, settings: res.settings, refs: res.refs, mentions: res.mentions, items: res.items || null, files, fellBack: res.fellBack, mode: res.mode, projectId: res.projectId };
  });

  // Antrean Mode Otomatis
  handle('queue:add', (job) => {
    const imgs = (job.images || []).filter((p) => allowedFiles.has(p) && checkImage(p));
    if ((job.images || []).length !== imgs.length) throw new Error('INVALID_IMAGE');
    queue.add({ prompts: job.prompts, images: imgs, tags: sanitizeTags(job.tags, imgs), accountId: job.accountId, options: job.options || null });
    return queue.state();
  });
  handle('queue:remove', (id) => { queue.remove(id); return queue.state(); });
  handle('queue:retry', (id) => { queue.retry(id); return queue.state(); });
  handle('queue:clear', () => { queue.clearFinished(); return queue.state(); });
  handle('queue:start', () => { queue.start().catch((e) => send('activity', e.message)); return queue.state(); });
  handle('queue:stop', () => { queue.stop(); return queue.state(); });

  // Berkas
  handle('files:pickImages', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Pilih gambar referensi', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Gambar', extensions: Object.keys(IMAGE_EXT).map((e) => e.slice(1)) }]
    });
    const list = r.canceled ? [] : r.filePaths.filter(checkImage).slice(0, 10);
    list.forEach((p) => allowedFiles.add(p));
    return list;
  });
  handle('files:register', (paths) => {
    const list = (Array.isArray(paths) ? paths : []).filter(checkImage).slice(0, 10);
    list.forEach((p) => allowedFiles.add(p));
    return list;
  });
  handle('files:preview', (p) => {
    if (!allowedFiles.has(p) || !checkImage(p)) throw new Error('INVALID_IMAGE');
    const mime = IMAGE_EXT[path.extname(p).toLowerCase()];
    if (fs.statSync(p).size > 8 * 1024 * 1024 || mime === 'image/heic') return null;
    return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
  });
  handle('files:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Pilih folder unduhan', properties: ['openDirectory', 'createDirectory'], defaultPath: store.data.downloadDir });
    if (r.canceled || !r.filePaths[0]) return publicSettings();
    store.set({ downloadDir: r.filePaths[0] });
    return publicSettings();
  });
  handle('files:pickBrowser', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Pilih file browser (chrome.exe / msedge.exe)', properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return publicSettings();
    store.set({ browser: { prefer: 'custom', customPath: r.filePaths[0] } });
    return publicSettings();
  });
  handle('files:open', async (p) => {
    if (!insideDownloads(p)) throw new Error('FORBIDDEN');
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
  });
  handle('files:show', (p) => {
    if (!insideDownloads(p)) throw new Error('FORBIDDEN');
    shell.showItemInFolder(p);
  });
  handle('files:openDownloads', async () => {
    fs.mkdirSync(store.data.downloadDir, { recursive: true });
    await shell.openPath(store.data.downloadDir);
  });
  handle('files:forget', (p) => {
    store.data.downloads = store.data.downloads.filter((d) => d.path !== p);
    store.save();
    return publicSettings();
  });
  handle('shell:external', (url) => {
    if (!EXTERNAL_OK.some((ok) => url === ok || url.startsWith(ok + '/'))) throw new Error('FORBIDDEN');
    return shell.openExternal(url);
  });
}

// ---------- Jendela & menu ----------
function buildMenu() {
  const go = (page) => () => send('navigate', page);
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Berkas',
      submenu: [
        { label: 'Tambah akun Google…', accelerator: 'CmdOrCtrl+N', click: go('accounts:add') },
        { label: 'Pilih gambar referensi…', accelerator: 'CmdOrCtrl+O', click: go('studio:pick') },
        { type: 'separator' },
        { label: 'Buka folder unduhan', accelerator: 'CmdOrCtrl+Shift+D', click: () => shell.openPath(store.data.downloadDir) },
        { type: 'separator' },
        { label: 'Pengaturan', accelerator: 'CmdOrCtrl+,', click: go('settings') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Tutup jendela' } : { role: 'quit', label: 'Keluar' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Urungkan' }, { role: 'redo', label: 'Ulangi' }, { type: 'separator' },
        { role: 'cut', label: 'Potong' }, { role: 'copy', label: 'Salin' }, { role: 'paste', label: 'Tempel' },
        { role: 'selectAll', label: 'Pilih semua' }
      ]
    },
    {
      label: 'Tampilan',
      submenu: [
        { label: 'Beranda', accelerator: 'CmdOrCtrl+1', click: go('home') },
        { label: 'Akun', accelerator: 'CmdOrCtrl+2', click: go('accounts') },
        { label: 'Studio', accelerator: 'CmdOrCtrl+3', click: go('studio') },
        { label: 'Galeri', accelerator: 'CmdOrCtrl+4', click: go('gallery') },
        { label: 'Otomatis', accelerator: 'CmdOrCtrl+5', click: go('auto') },
        { label: 'Unduhan', accelerator: 'CmdOrCtrl+6', click: go('downloads') },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Ukuran asli' }, { role: 'zoomIn', label: 'Perbesar' }, { role: 'zoomOut', label: 'Perkecil' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Layar penuh' },
        ...(app.isPackaged ? [] : [{ role: 'reload', label: 'Muat ulang' }, { role: 'toggleDevTools', label: 'Alat pengembang' }])
      ]
    },
    {
      label: 'Bantuan',
      submenu: [
        { label: 'Panduan penggunaan', click: go('help') },
        { label: 'Situs FLOW CONNECT', click: () => shell.openExternal(WEB_URL) },
        { label: 'Kode sumber (GitHub)', click: () => shell.openExternal(REPO_URL) },
        { label: 'Periksa pembaruan…', click: () => { send('navigate', 'settings'); updater.check(); } },
        { type: 'separator' },
        {
          label: 'Tentang FLOW CONNECT Desktop',
          click: () => dialog.showMessageBox(win, {
            type: 'info', title: 'Tentang', message: `FLOW CONNECT Desktop ${app.getVersion()}`,
            detail: 'Mengendalikan Google Flow di browser Anda sendiri. Proses generate tetap dilakukan Google Flow dengan akun Google Anda.\n\nTidak berafiliasi dengan Google.'
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function titlebarColors() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { color: MICA ? '#00000000' : (dark ? '#0d0f14' : '#eef0f5'), symbolColor: dark ? '#e8eaf0' : '#1b1d24', height: 40 };
}
function updateTitlebar() {
  if (!win || !CUSTOM_TITLEBAR) return;
  try { win.setTitleBarOverlay(titlebarColors()); } catch { /* tidak didukung */ }
}

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1320, height: 840, minWidth: 980, minHeight: 640, show: false,
    title: 'FLOW CONNECT Desktop',
    backgroundColor: MICA ? '#00000000' : (dark ? '#0d0f14' : '#eef0f5'),
    ...(MICA ? { backgroundMaterial: 'mica' } : {}),
    ...(CUSTOM_TITLEBAR ? { titleBarStyle: 'hidden', titleBarOverlay: titlebarColors() } : {}),
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  if (CUSTOM_TITLEBAR) win.removeMenu(); // pintasan papan ketik ditangani tampilan
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (SMOKE) runSmoke();
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_OK.some((ok) => url === ok || url.startsWith(ok + '/'))) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
  // kembali ke aplikasi → periksa pembaruan bila sudah lama (tanpa harus klik "Periksa pembaruan")
  win.on('focus', () => { try { win.flashFrame(false); } catch { /* tidak didukung */ } if (updater) updater.nudge(); });
}

function runSmoke() {
  const fail = (why) => { console.error('SMOKE GAGAL:', why); app.exit(1); };
  setTimeout(() => fail('timeout'), 45000);
  win.webContents.on('console-message', (e) => { const m = e.message || ''; if ((e.level === 'error' || e.level === 3) && !/favicon/.test(m)) console.error('[renderer]', m); });
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      // 1) tanpa lisensi → layar aktivasi
      const gate = await win.webContents.executeJavaScript(`!!document.querySelector('#gate') && !document.querySelector('[data-page="home"]')`);
      if (!gate) return fail('layar lisensi tidak tampil');
      // 2) kunci palsu ditolak server lisensi (cek koneksi ke Supabase; galat jaringan hanya peringatan)
      try { await license.activate('FC-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA'); return fail('kunci palsu diterima'); }
      catch (e) { if (e.message === 'NETWORK') console.warn('SMOKE: server lisensi tidak terjangkau'); else if (e.message !== 'INVALID_KEY') return fail('respons lisensi: ' + e.message); else console.log('SMOKE: server lisensi menolak kunci palsu (OK)'); }
      // 3) lisensi uji → tampilan utama
      store.data.license = { key: 'raw:FC-SMOKE-TESTS-00000-00000-00000', hint: 'FC-SMOKE…00000', info: { ok: true, label: 'Uji asap', email: 'smoke@test' }, checkedAt: Date.now(), error: null };
      license.emit('change', license.state());
      await new Promise((r) => setTimeout(r, 500));
      const pages = [];
      for (const p of ['home', 'accounts', 'studio', 'gallery', 'auto', 'downloads', 'settings']) {
        const h1 = await win.webContents.executeJavaScript(`(async () => { document.querySelector('[data-page="${p}"]').click(); await new Promise(r => setTimeout(r, 150)); const h = document.querySelector('#page h1'); return h ? h.textContent : null; })()`);
        if (!h1) return fail('halaman ' + p + ' kosong');
        pages.push(h1);
      }
      const hasBridge = await win.webContents.executeJavaScript('typeof window.fc === "object" && typeof require === "undefined" && typeof process === "undefined"');
      if (!hasBridge) return fail('preload/isolasi tidak sesuai');
      console.log('SMOKE OK:', pages.join(' | '), '| update:', updater.state().state, '| browser:', browser.findBrowsers().map((b) => b.name).join(', ') || '-');
      app.exit(0);
    } catch (e) { fail(e.message); }
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'), path.join(app.getPath('downloads'), 'FLOW CONNECT'));
  initUploads();
  nativeTheme.themeSource = store.data.theme;
  queue = new AutomationQueue({ store, getSession: (id) => connectAccount(id), onDownloaded: addDownload, onFallback: (id, v) => markHeadlessFailed(id, v && v.error) });
  queue.on('update', (st) => send('queue', st));
  queue.on('job-failed', (j) => notify('Tugas otomatis gagal', `${j.prompt.slice(0, 60)} — ${j.error}`));
  queue.on('finished', ({ done, failed }) => { if (done + failed) notify('Antrean otomatis selesai', `${done} berhasil, ${failed} gagal.`); });
  license = new LicenseManager({ store, version: app.getVersion(), crypt });
  license.on('change', (st) => {
    send('license', st);
    if (!license.licensed) queue.stop();
  });
  updater = new Updater({ app });
  updater.on('change', (st) => send('update', st));
  updater.on('available', (st) => notifyUpdate('Pembaruan FLOW CONNECT tersedia', st.portable ? `Versi ${st.version} tersedia. Klik untuk mengunduh versi baru.` : `Versi ${st.version} siap. Klik "Update sekarang" — tanpa instal ulang.`, st));
  updater.on('ready', (st) => notifyUpdate('Pembaruan siap dipasang', `Versi ${st.version} sudah diunduh. Klik "Mulai ulang & perbarui".`, st));
  for (const ev of ['resume', 'unlock-screen']) { try { powerMonitor.on(ev, () => setTimeout(() => updater.nudge(), 15000)); } catch { /* tidak didukung */ } }
  registerIpc();
  buildMenu();
  createWindow();
  nativeTheme.on('updated', () => { send('theme', nativeTheme.shouldUseDarkColors); updateTitlebar(); });
  if (systemPreferences.on) {
    try { systemPreferences.on('accent-color-changed', () => send('accent', accent())); } catch { /* tidak didukung */ }
  }

  // Sambung ulang otomatis ke browser akun yang masih terbuka dari sesi sebelumnya
  for (const a of store.data.accounts) {
    if (await browser.existingDebugPort(profileDir(a.id))) session(a.id).connect().catch(() => {});
  }
  setInterval(() => { pollStatuses().catch(() => {}); }, 4000);
  if (!SMOKE) { license.start(); updater.start(); }
});

function beforeUpdateQuit() {
  queue.stop();
  if (store) store.flush();
  for (const s of sessions.values()) s.disconnect();
}

app.on('window-all-closed', () => {
  // Browser Google Flow dibiarkan terbuka agar proses yang berjalan tidak terputus.
  if (store) store.flush();
  for (const s of sessions.values()) s.disconnect();
  app.quit();
});
