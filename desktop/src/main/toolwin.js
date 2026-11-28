'use strict';
// Alat Google Flow (flow.google.com/shared/tool/…) dibuka di JENDELA APLIKASI, bukan di browser:
// sesi akun disalin dari profil Chrome akun itu (yang tetap tersembunyi) ke sesi Electron terpisah per akun.
// Tidak ada login di jendela ini — bila Google meminta masuk, cookie disegarkan sekali; masih diminta →
// jendela ditutup dan pengguna ditawari membuka alat di browser (cara lama).
const path = require('path');
const fs = require('fs');

const TOOL_PATH = /^\/shared\/tool\/[0-9a-f-]{36}$/;
const SYNC_MS = 90 * 1000; // cookie disegarkan berkala dari profil Chrome (token sesi Google berumur pendek)
const ALLOW_PERMS = new Set(['clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'pointerLock']);

function validToolUrl(url, flowHost) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && u.host === flowHost && TOOL_PATH.test(u.pathname) ? u.toString() : null;
  } catch { return null; }
}

/** Host yang boleh dibuka DI DALAM jendela alat (selain itu → browser bawaan sistem). */
function navAllowed(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol === 'about:' || u.protocol === 'blob:' || u.protocol === 'data:') return true;
    if (u.protocol !== 'https:') return false;
    return /(^|\.)(google\.com|google|googleusercontent\.com|gstatic\.com|usercontent\.goog|withgoogle\.com)$/i.test(u.hostname);
  } catch { return false; }
}

/** Halaman masuk Google = sesi tidak terbawa. */
function isSigninUrl(url) {
  try {
    const u = new URL(String(url));
    return u.hostname === 'accounts.google.com' && /^\/(ServiceLogin|v3\/signin|signin|AccountChooser|InteractiveLogin|o\/oauth2\/.*signin)/i.test(u.pathname);
  } catch { return false; }
}

/** Cookie CDP (Storage.getCookies) → detail untuk session.cookies.set() Electron. */
function toElectronCookie(c) {
  if (!c || !c.name || !c.domain) return null;
  const host = String(c.domain).replace(/^\./, '');
  const hostOnly = !String(c.domain).startsWith('.');
  const out = {
    url: `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`,
    name: c.name, value: String(c.value ?? ''), path: c.path || '/',
    secure: !!c.secure, httpOnly: !!c.httpOnly,
    sameSite: c.sameSite === 'Strict' ? 'strict' : c.sameSite === 'Lax' ? 'lax' : c.sameSite === 'None' ? 'no_restriction' : 'unspecified'
  };
  if (!hostOnly && !c.name.startsWith('__Host-')) out.domain = c.domain;
  if (!c.session && Number(c.expires) > 0) out.expirationDate = Number(c.expires);
  if (out.sameSite === 'no_restriction' && !out.secure) out.sameSite = 'lax';
  return out;
}

const safeName = (n) => [...String(n || 'unduhan')].map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch)).join('').replace(/^\.+/, '').slice(0, 120) || 'unduhan';
function uniquePath(dir, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let p = path.join(dir, name);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${stem} (${i})${ext}`);
  return p;
}

/**
 * @param {object} o
 * @param {typeof import('electron')} o.electron
 * @param {(id:string)=>Promise<any>} o.getSession  FlowSession tersambung (mode tersembunyi tidak diubah)
 * @param {(id:string)=>{label:string}} o.account
 * @param {()=>string} o.downloadDir
 * @param {(channel:string, payload:any)=>void} o.send
 * @param {()=>any} o.parent  jendela utama
 * @param {string} o.icon
 * @param {()=>boolean} o.dark
 * @param {(p:string)=>void} [o.onSaved]
 */
function createToolWindows(o) {
  const { BrowserWindow, session: esession, shell } = o.electron;
  const open = new Map(); // `${accountId}|${url}` → BrowserWindow
  const prepared = new Set(); // partisi yang sudah dipasang handler-nya

  const partition = (id) => 'persist:fc-tool-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '');

  async function syncCookies(id, ses) {
    const s = await o.getSession(id);
    const list = await s.exportCookies();
    let n = 0;
    for (const c of list) {
      const d = toElectronCookie(c);
      if (!d) continue;
      try { await ses.cookies.set(d); n++; } catch { /* cookie ditolak Electron → lewati */ }
    }
    return n;
  }

  function prepare(id, ses) {
    if (prepared.has(id)) return;
    prepared.add(id);
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOW_PERMS.has(perm)));
    ses.setPermissionCheckHandler((_wc, perm) => ALLOW_PERMS.has(perm));
    // hasil ekspor alat (gambar/video) → folder Unduhan → Alat, tanpa dialog
    ses.on('will-download', (_e, item) => {
      const dir = path.join(o.downloadDir(), 'Alat');
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ditangani saat simpan */ }
      const file = uniquePath(dir, safeName(item.getFilename()));
      item.setSavePath(file);
      item.once('done', (_ev, state) => {
        if (state === 'completed') { if (o.onSaved) o.onSaved(file); o.send('tool', { state: 'saved', name: path.basename(file), path: file }); }
        else o.send('tool', { state: 'error', error: 'DOWNLOAD_FAILED' });
      });
    });
  }

  /** Buka (atau fokuskan) jendela alat untuk akun ini. */
  async function openTool(id, url, name, flowHost) {
    const target = validToolUrl(url, flowHost);
    if (!target) throw new Error('INVALID_URL');
    const key = `${id}|${target}`;
    const have = open.get(key);
    if (have && !have.isDestroyed()) { if (have.isMinimized()) have.restore(); have.focus(); return { how: 'app', reused: true }; }

    const s = await o.getSession(id);
    const ses = esession.fromPartition(partition(id));
    prepare(id, ses);
    const ua = await s.userAgentInfo();
    ses.setUserAgent(ua.userAgent, ua.acceptLanguage);
    if (!(await syncCookies(id, ses))) throw new Error('NOT_SIGNED_IN');

    const label = (o.account(id) || {}).label || '';
    const title = `${name || 'Alat Google Flow'}${label ? ' — ' + label : ''}`;
    const w = new BrowserWindow({
      width: 1280, height: 820, minWidth: 720, minHeight: 480, show: false, title,
      backgroundColor: o.dark() ? '#0d0f14' : '#ffffff', icon: o.icon, autoHideMenuBar: true,
      webPreferences: { partition: partition(id), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, webviewTag: false }
    });
    w.removeMenu();
    open.set(key, w);
    const wc = w.webContents;
    // Client Hints konsisten dengan User-Agent Chrome akun ini
    try { wc.debugger.attach('1.3'); await wc.debugger.sendCommand('Emulation.setUserAgentOverride', ua); } catch { /* opsional */ }

    let signinTries = 0;
    const onNav = (e, next) => {
      if (isSigninUrl(next)) {
        if (e && e.preventDefault) e.preventDefault();
        if (signinTries++ === 0) {
          syncCookies(id, ses).then(() => wc.loadURL(target)).catch(() => {});
        } else {
          o.send('tool', { state: 'signin', id, url: target, name: name || '' });
          w.close();
        }
        return;
      }
      if (!navAllowed(next)) {
        if (e && e.preventDefault) e.preventDefault();
        if (/^https:/i.test(next)) shell.openExternal(next);
      }
    };
    wc.on('will-navigate', (e, next) => onNav(e, next));
    wc.on('will-redirect', (e, next) => onNav(e, next));
    wc.setWindowOpenHandler(({ url: next }) => {
      if (navAllowed(next) && !isSigninUrl(next)) {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: o.icon, webPreferences: { partition: partition(id), contextIsolation: true, sandbox: true, nodeIntegration: false } } };
      }
      if (/^https:/i.test(next)) shell.openExternal(next);
      return { action: 'deny' };
    });
    wc.on('page-title-updated', (e, t) => { e.preventDefault(); w.setTitle(t && !/^Google Flow$/i.test(t) ? `${t} — ${title}` : title); });
    wc.on('did-fail-load', (_e, code, desc, failedUrl, isMain) => {
      if (isMain && code !== -3) o.send('tool', { state: 'error', error: 'TOOL_LOAD_FAILED', detail: `${desc} (${code})`, id, url: target, name: name || '' });
    });

    const timer = setInterval(() => { syncCookies(id, ses).catch(() => {}); }, SYNC_MS);
    w.once('ready-to-show', () => w.show());
    w.on('closed', () => { clearInterval(timer); if (open.get(key) === w) open.delete(key); });
    await w.loadURL(target).catch((e) => { if (!/ERR_ABORTED/.test(String(e && e.message))) throw e; });
    return { how: 'app' };
  }

  /** Akun dihapus: tutup jendela alatnya & hapus sesi salinan (cookie) akun itu. */
  async function forget(id) {
    for (const [k, w] of open) if (k.startsWith(id + '|')) { try { if (!w.isDestroyed()) w.close(); } catch { /* sudah tertutup */ } open.delete(k); }
    prepared.delete(id);
    await esession.fromPartition(partition(id)).clearStorageData();
  }

  function closeAll() { for (const w of open.values()) { try { if (!w.isDestroyed()) w.close(); } catch { /* sudah tertutup */ } } open.clear(); }
  function count() { return [...open.values()].filter((w) => !w.isDestroyed()).length; }

  return { openTool, forget, closeAll, count };
}

module.exports = { createToolWindows, validToolUrl, navAllowed, isSigninUrl, toElectronCookie, safeName, uniquePath };
