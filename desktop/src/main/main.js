'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu, Notification, systemPreferences } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');
const { FlowSession, IMAGE_EXT } = require('./flow');
const { AutomationQueue, safeName } = require('./automation');
const browser = require('./browser');

const WEB_URL = 'https://flow-connect-2qu.pages.dev';
const REPO_URL = 'https://github.com/sugionoofficial/FLOW-CONNECT';
const EXTERNAL_OK = [WEB_URL, REPO_URL, 'https://flow.google.com', 'https://support.google.com', 'https://www.google.com/chrome'];

// --smoke-test: dipakai CI untuk memastikan aplikasi hasil build benar-benar terbuka (data di folder sementara)
const SMOKE = process.argv.includes('--smoke-test');
if (SMOKE) app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'fc-smoke-')));

if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.flowconnect.desktop');

let win = null;
let store = null;
let queue = null;
const sessions = new Map();     // accountId → FlowSession
const statuses = new Map();     // accountId → status terakhir
const allowedFiles = new Set(); // gambar yang dipilih pengguna (dialog / seret)

const profileDir = (id) => path.join(app.getPath('userData'), 'profiles', id);
const thumbsDir = () => path.join(app.getPath('userData'), 'thumbs');

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
}

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

function session(id) {
  account(id);
  let s = sessions.get(id);
  if (!s) {
    s = new FlowSession({ profileDir: profileDir(id), getBrowser: () => browser.resolveBrowser(store.data.browser) });
    s.on('change', () => refreshStatus(id));
    sessions.set(id, s);
  }
  return s;
}

async function connected(id) {
  const s = session(id);
  if (!s.connected) await s.connect();
  else await s.ensurePage();
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

// Jendela browser: normal / di belakang aplikasi / diperkecil
async function beforeUi(s) { if (store.data.browserWindow === 'minimized') await s.restore(); }
async function afterUi(s, { show } = {}) {
  if (show) { await s.bringToFront(); return; }
  if (store.data.browserWindow === 'minimized') await s.minimize();
  else if (store.data.browserWindow === 'background' && win) win.focus();
}

function publicSettings() {
  const d = store.data;
  return {
    accounts: d.accounts, activeAccountId: d.activeAccountId, theme: d.theme, browser: d.browser, browserWindow: d.browserWindow,
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
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!win || e.sender !== win.webContents) throw new Error('FORBIDDEN');
    try { return { ok: true, data: await fn(...args) }; } catch (err) { return { ok: false, error: err && err.message ? err.message : String(err) }; }
  });
}

function registerIpc() {
  handle('app:info', () => ({
    version: app.getVersion(), platform: process.platform, accent: accent(), browsers: browser.findBrowsers(),
    settings: publicSettings(), statuses: Object.fromEntries(statuses), queue: queue.state(), webUrl: WEB_URL
  }));
  handle('settings:set', (patch) => {
    store.set(patch || {});
    nativeTheme.themeSource = store.data.theme;
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
  handle('accounts:login', (id) => { session(id).openForLogin(); });
  handle('accounts:connect', async (id) => {
    const s = await connected(id);
    await afterUi(s);
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
    const url = item.image;
    if (!url) return null;
    fs.mkdirSync(thumbsDir(), { recursive: true });
    const hit = fs.readdirSync(thumbsDir()).find((f) => f.startsWith(item.mediaId + '.'));
    let buffer, mime;
    if (hit) {
      buffer = fs.readFileSync(path.join(thumbsDir(), hit));
      mime = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(hit)] || 'image/jpeg';
    } else {
      ({ buffer, mime } = await (await connected(id)).fetchMedia(url));
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
  handle('flow:send', async (id, { prompt, images }) => {
    const imgs = (images || []).filter((p) => allowedFiles.has(p) && checkImage(p));
    if ((images || []).length !== imgs.length) throw new Error('INVALID_IMAGE');
    if (!imgs.length && !(prompt || '').trim()) throw new Error('NOTHING_TO_SEND');
    const s = await connected(id);
    await beforeUi(s);
    const out = {};
    if (imgs.length) out.images = await s.sendImages(imgs);
    if ((prompt || '').trim()) { await new Promise((r) => setTimeout(r, imgs.length ? 2500 : 0)); out.prompt = await s.sendPrompt(prompt); }
    return out;
  });
  handle('flow:afterSend', async (id, show) => { const s = session(id); if (s.connected) await afterUi(s, { show }); });
  handle('flow:generate', async (id, { waitResults }) => {
    if (store.data.mode !== 'auto' || !store.data.autoAck) throw new Error('AUTO_MODE_DISABLED');
    const s = await connected(id);
    await beforeUi(s);
    const st = await s.status();
    const before = st.projectId ? (await s.listMedia(st.projectId)).map((i) => i.mediaId) : [];
    const click = await s.clickGenerate();
    await afterUi(s);
    if (!waitResults) return { click };
    const res = await s.waitForNew(before, { timeoutMs: store.data.auto.timeoutMin * 60000, onProgress: (t) => send('activity', t) });
    const files = [];
    if (store.data.auto.autoDownload) {
      for (const item of res.items) {
        const file = await s.download(item, path.join(store.data.downloadDir, safeName(account(id).label)));
        files.push(file);
        addDownload({ path: file, name: path.basename(file), mediaId: item.mediaId, accountId: id, at: Date.now() });
      }
    }
    notify('Hasil Google Flow siap', `${res.items.length} hasil${files.length ? ' sudah diunduh' : ''}.`);
    return { click, items: res.items, files };
  });

  // Antrean Mode Otomatis
  handle('queue:add', (job) => {
    const imgs = (job.images || []).filter((p) => allowedFiles.has(p) && checkImage(p));
    if ((job.images || []).length !== imgs.length) throw new Error('INVALID_IMAGE');
    queue.add({ prompts: job.prompts, images: imgs, accountId: job.accountId });
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

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1200, height: 780, minWidth: 940, minHeight: 600, show: false,
    title: 'FLOW CONNECT Desktop',
    backgroundColor: dark ? '#202020' : '#f3f3f3',
    icon: path.join(__dirname, '..', 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, '..', 'preload', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (SMOKE) runSmoke();
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_OK.some((ok) => url === ok || url.startsWith(ok + '/'))) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
}

function runSmoke() {
  const fail = (why) => { console.error('SMOKE GAGAL:', why); app.exit(1); };
  setTimeout(() => fail('timeout'), 45000);
  win.webContents.on('console-message', (e) => { const m = e.message || ''; if ((e.level === 'error' || e.level === 3) && !/favicon/.test(m)) console.error('[renderer]', m); });
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const pages = [];
      for (const p of ['home', 'accounts', 'studio', 'gallery', 'auto', 'downloads', 'settings']) {
        const h1 = await win.webContents.executeJavaScript(`(async () => { document.querySelector('[data-page="${p}"]').click(); await new Promise(r => setTimeout(r, 150)); const h = document.querySelector('#page h1'); return h ? h.textContent : null; })()`);
        if (!h1) return fail('halaman ' + p + ' kosong');
        pages.push(h1);
      }
      const hasBridge = await win.webContents.executeJavaScript('typeof window.fc === "object" && typeof require === "undefined" && typeof process === "undefined"');
      if (!hasBridge) return fail('preload/isolasi tidak sesuai');
      console.log('SMOKE OK:', pages.join(' | '), '| browser:', browser.findBrowsers().map((b) => b.name).join(', ') || '-');
      app.exit(0);
    } catch (e) { fail(e.message); }
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'), path.join(app.getPath('downloads'), 'FLOW CONNECT'));
  nativeTheme.themeSource = store.data.theme;
  queue = new AutomationQueue({ store, getSession: connected, onDownloaded: addDownload });
  queue.on('update', (st) => send('queue', st));
  queue.on('job-failed', (j) => notify('Tugas otomatis gagal', `${j.prompt.slice(0, 60)} — ${j.error}`));
  queue.on('finished', ({ done, failed }) => { if (done + failed) notify('Antrean otomatis selesai', `${done} berhasil, ${failed} gagal.`); });
  registerIpc();
  buildMenu();
  createWindow();
  nativeTheme.on('updated', () => send('theme', nativeTheme.shouldUseDarkColors));
  if (systemPreferences.on) {
    try { systemPreferences.on('accent-color-changed', () => send('accent', accent())); } catch { /* tidak didukung */ }
  }

  // Sambung ulang otomatis ke browser akun yang masih terbuka dari sesi sebelumnya
  for (const a of store.data.accounts) {
    if (await browser.existingDebugPort(profileDir(a.id))) session(a.id).connect().catch(() => {});
  }
  setInterval(() => { pollStatuses().catch(() => {}); }, 4000);
});

app.on('window-all-closed', () => {
  // Browser Google Flow dibiarkan terbuka agar proses yang berjalan tidak terputus.
  if (store) store.flush();
  for (const s of sessions.values()) s.disconnect();
  app.quit();
});
