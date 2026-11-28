'use strict';
// Alat Google Flow di jendela aplikasi: sesi disalin dari profil Chrome tersembunyi, navigasi dibatasi ke Google,
// halaman masuk Google → cookie disegarkan sekali lalu tawarkan browser, unduhan → Unduhan/Alat.
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createToolWindows, validToolUrl, navAllowed, isSigninUrl, toElectronCookie, safeName } = require('../src/main/toolwin');
const { FlowSession, isGoogleCookieDomain } = require('../src/main/flow');
const { launchBrowser, waitForDebugPort, getJSON, findBrowsers } = require('../src/main/browser');
const { CDPConnection } = require('../src/main/cdp');

const CHROME = process.env.CHROME_PATH || (findBrowsers()[0] || {}).path;
const EXTRA = (process.env.CHROME_ARGS || '--headless=new').split(' ').filter(Boolean);
const TOOL = 'https://flow.google.com/shared/tool/075ead65-520a-4f5e-88bd-f150caa24dc4';

test('Alat Flow: URL alat, navigasi yang diizinkan, halaman masuk, konversi cookie', () => {
  assert.strictEqual(validToolUrl(TOOL, 'flow.google.com'), TOOL);
  assert.strictEqual(validToolUrl('https://flow.google.com/project/abc', 'flow.google.com'), null);
  assert.strictEqual(validToolUrl('http://flow.google.com/shared/tool/075ead65-520a-4f5e-88bd-f150caa24dc4', 'flow.google.com'), null);
  assert.strictEqual(validToolUrl('https://evil.example/shared/tool/075ead65-520a-4f5e-88bd-f150caa24dc4', 'flow.google.com'), null);
  for (const u of [TOOL, 'https://labs.google/fx', 'https://lh3.googleusercontent.com/x', 'https://www.gstatic.com/a.js', 'https://x.usercontent.goog/app', 'blob:https://flow.google.com/1']) assert.ok(navAllowed(u), u);
  for (const u of ['https://evil.example/', 'http://flow.google.com/', 'https://google.com.evil.example/', 'file:///C:/x', 'javascript:alert(1)']) assert.ok(!navAllowed(u), u);
  assert.ok(isSigninUrl('https://accounts.google.com/ServiceLogin?continue=x'));
  assert.ok(isSigninUrl('https://accounts.google.com/v3/signin/identifier?x'));
  assert.ok(!isSigninUrl('https://accounts.google.com/RotateCookies'));
  assert.ok(isGoogleCookieDomain('.google.com') && isGoogleCookieDomain('flow.google.com') && isGoogleCookieDomain('.labs.google'));
  assert.ok(!isGoogleCookieDomain('.notgoogle.com') && !isGoogleCookieDomain('google.com.evil.example') && !isGoogleCookieDomain('example.org'));

  assert.deepStrictEqual(toElectronCookie({ name: 'SID', value: 'v', domain: '.google.com', path: '/', secure: true, httpOnly: true, sameSite: 'None', expires: 2000000000, session: false }),
    { url: 'https://google.com/', name: 'SID', value: 'v', path: '/', secure: true, httpOnly: true, sameSite: 'no_restriction', domain: '.google.com', expirationDate: 2000000000 });
  const host = toElectronCookie({ name: '__Host-GAPS', value: 'g', domain: 'accounts.google.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax', expires: -1, session: true });
  assert.strictEqual(host.domain, undefined, 'cookie host-only / __Host- tanpa domain');
  assert.strictEqual(host.expirationDate, undefined, 'cookie sesi tanpa kedaluwarsa');
  assert.strictEqual(host.url, 'https://accounts.google.com/');
  assert.strictEqual(toElectronCookie({ name: 'x', value: '1', domain: '.google.com', path: '/', secure: false, sameSite: 'None' }).sameSite, 'lax');
  assert.strictEqual(safeName('a/b:c?.png'), 'a_b_c_.png');
  assert.strictEqual(safeName('..\u0001x.mp4'), '_x.mp4');
});

/** Electron tiruan secukupnya untuk createToolWindows. */
function fakeElectron() {
  const wins = [], opened = [], sessions = {};
  class WC extends EventEmitter {
    constructor() { super(); this.loaded = []; this.debugger = { attach() {}, sendCommand: async (m, p) => { this.uaOverride = p; } }; }
    setWindowOpenHandler(fn) { this.openHandler = fn; }
    async loadURL(u) { this.loaded.push(u); }
  }
  class BW extends EventEmitter {
    constructor(opts) { super(); this.opts = opts; this.webContents = new WC(); this.destroyed = false; this.title = opts.title; wins.push(this); setTimeout(() => this.emit('ready-to-show'), 1); }
    removeMenu() {}
    show() { this.shown = true; }
    loadURL(u) { return this.webContents.loadURL(u); }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    focus() { this.focused = true; }
    setTitle(t) { this.title = t; }
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const mkSes = () => {
    const ses = new EventEmitter();
    ses.jar = [];
    ses.cookies = { set: async (d) => { if (d.name === 'bad') throw new Error('x'); ses.jar.push(d); } };
    ses.setUserAgent = (ua, lang) => { ses.ua = ua; ses.lang = lang; };
    ses.setPermissionRequestHandler = (fn) => { ses.perm = fn; };
    ses.setPermissionCheckHandler = () => {};
    return ses;
  };
  return {
    wins, opened, sessions,
    electron: { BrowserWindow: BW, shell: { openExternal: (u) => opened.push(u) }, session: { fromPartition: (p) => (sessions[p] = sessions[p] || mkSes()) } }
  };
}

test('Alat Flow di jendela aplikasi: salin sesi, batasi navigasi, masuk Google → tawarkan browser, unduhan ke Unduhan/Alat', async () => {
  const fe = fakeElectron();
  const events = [];
  const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-tw-'));
  let exports = 0;
  const flow = {
    exportCookies: async () => { exports++; return [{ name: 'SID', value: 's', domain: '.google.com', path: '/', secure: true, httpOnly: true, sameSite: 'None', expires: 2e9 }, { name: 'bad', value: '1', domain: '.google.com', path: '/' }]; },
    userAgentInfo: async () => ({ userAgent: 'Mozilla/5.0 Chrome/142.0.0.0', acceptLanguage: 'en-US', userAgentMetadata: {} })
  };
  const saved = [];
  const tw = createToolWindows({ electron: fe.electron, getSession: async () => flow, account: () => ({ label: 'Kerja' }), downloadDir: () => dl, send: (c, p) => events.push([c, p]), icon: 'i.png', dark: () => true, onSaved: (p) => saved.push(p) });

  await assert.rejects(() => tw.openTool('a1', 'https://evil.example/x', 'X', 'flow.google.com'), /INVALID_URL/);
  const r = await tw.openTool('a1', TOOL, 'Teks Animasi', 'flow.google.com');
  assert.strictEqual(r.how, 'app');
  assert.strictEqual(fe.wins.length, 1);
  const w = fe.wins[0], wc = w.webContents;
  const ses = fe.sessions['persist:fc-tool-a1'];
  assert.strictEqual(w.opts.webPreferences.partition, 'persist:fc-tool-a1', 'sesi terpisah per akun');
  assert.ok(w.opts.webPreferences.sandbox && w.opts.webPreferences.contextIsolation && !w.opts.webPreferences.nodeIntegration);
  assert.strictEqual(w.title, 'Teks Animasi — Kerja');
  assert.deepStrictEqual(ses.jar.map((c) => c.name), ['SID'], 'cookie Google disalin (yang ditolak dilewati)');
  assert.strictEqual(ses.ua, 'Mozilla/5.0 Chrome/142.0.0.0');
  assert.ok(wc.uaOverride && wc.uaOverride.userAgentMetadata, 'Client Hints disamakan');
  assert.deepStrictEqual(wc.loaded, [TOOL]);
  assert.ok(ses.perm && (() => { let v; ses.perm(null, 'media', (x) => { v = x; }); return v === false; })(), 'izin kamera/mikrofon ditolak');

  // buka lagi → fokus jendela yang sama
  assert.deepStrictEqual(await tw.openTool('a1', TOOL, 'Teks Animasi', 'flow.google.com'), { how: 'app', reused: true });
  assert.strictEqual(fe.wins.length, 1);
  assert.ok(w.focused);

  // navigasi keluar Google → dicegah & dibuka di browser sistem; popup Google diizinkan dengan sesi yang sama
  let prevented = false;
  wc.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://evil.example/');
  assert.ok(prevented);
  assert.deepStrictEqual(fe.opened, ['https://evil.example/']);
  const pop = wc.openHandler({ url: 'https://flow.google.com/shared/tool/x' });
  assert.strictEqual(pop.action, 'allow');
  assert.strictEqual(pop.overrideBrowserWindowOptions.webPreferences.partition, 'persist:fc-tool-a1');
  assert.strictEqual(wc.openHandler({ url: 'https://example.org/' }).action, 'deny');

  // halaman masuk Google: pertama → segarkan cookie & muat ulang; kedua → tutup + tawarkan browser
  const ex0 = exports;
  wc.emit('will-redirect', { preventDefault() {} }, 'https://accounts.google.com/ServiceLogin?continue=x');
  await new Promise((res) => setTimeout(res, 20));
  assert.strictEqual(exports, ex0 + 1);
  assert.deepStrictEqual(wc.loaded, [TOOL, TOOL]);
  assert.ok(!w.destroyed);
  wc.emit('will-navigate', { preventDefault() {} }, 'https://accounts.google.com/v3/signin/identifier');
  assert.ok(w.destroyed, 'jendela ditutup');
  assert.deepStrictEqual(events.find((e) => e[0] === 'tool' && e[1].state === 'signin')[1], { state: 'signin', id: 'a1', url: TOOL, name: 'Teks Animasi' });
  assert.strictEqual(tw.count(), 0);

  // unduhan dari alat → Unduhan/Alat tanpa dialog, nama unik
  await tw.openTool('a1', TOOL, 'Teks Animasi', 'flow.google.com');
  fs.mkdirSync(path.join(dl, 'Alat'), { recursive: true });
  fs.writeFileSync(path.join(dl, 'Alat', 'hasil.png'), 'x');
  const item = new EventEmitter();
  item.getFilename = () => 'hasil.png';
  item.setSavePath = (p) => { item.path = p; };
  ses.emit('will-download', {}, item);
  assert.strictEqual(item.path, path.join(dl, 'Alat', 'hasil (2).png'));
  item.emit('done', {}, 'completed');
  assert.deepStrictEqual(saved, [item.path]);
  assert.ok(events.some((e) => e[1].state === 'saved' && e[1].name === 'hasil (2).png'));
  // akun tanpa cookie Google → belum masuk
  flow.exportCookies = async () => [];
  await assert.rejects(() => tw.openTool('a2', TOOL, 'X', 'flow.google.com'), /NOT_SIGNED_IN/);
  ses.clearStorageData = async () => { ses.cleared = true; };
  await tw.forget('a1');
  assert.ok(ses.cleared && tw.count() === 0, 'akun dihapus → sesi salinan dibersihkan');
  tw.closeAll();
  assert.strictEqual(tw.count(), 0);
  fs.rmSync(dl, { recursive: true, force: true });
});

test('FlowSession.exportCookies: hanya cookie Google dari profil Chrome (termasuk HttpOnly), UA tanpa HeadlessChrome', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 60000 }, async (t) => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-ck-'));
  launchBrowser({ exe: CHROME, profileDir: prof, debug: true, url: 'about:blank', extraArgs: EXTRA });
  const port = await waitForDebugPort(prof);
  const v = await getJSON(port, '/json/version');
  const b = await CDPConnection.connect(v.webSocketDebuggerUrl);
  t.after(async () => {
    await b.send('Browser.close').catch(() => {});
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ }
  });
  await b.send('Storage.setCookies', { cookies: [
    { name: 'SID', value: 'abc', domain: '.google.com', path: '/', secure: true, httpOnly: true, sameSite: 'None', expires: Math.floor(Date.now() / 1000) + 3600 },
    { name: 'flowpref', value: '1', domain: 'flow.google.com', path: '/', secure: true },
    { name: 'other', value: 'x', domain: '.example.org', path: '/', secure: true }
  ] });
  const s = new FlowSession({ profileDir: prof, getBrowser: () => ({ path: CHROME }) });
  s.port = port;
  const list = await s.exportCookies();
  assert.deepStrictEqual(list.map((c) => c.name).sort(), ['SID', 'flowpref']);
  assert.ok(list.find((c) => c.name === 'SID').httpOnly);
  const ua = await s.userAgentInfo();
  assert.ok(/Chrome\/\d+/.test(ua.userAgent) && !/Headless/.test(ua.userAgent), ua.userAgent);
  s.disconnect();
});
