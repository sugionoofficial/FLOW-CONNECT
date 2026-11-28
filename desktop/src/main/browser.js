'use strict';
// Mencari & menjalankan browser Chromium ASLI yang terpasang di PC (Chrome / Edge / Brave).
// Login Google terjadi di browser asli itu — bukan di dalam aplikasi (Google memblokir login di webview).
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFile } = require('child_process');

const BROWSERS = [
  { id: 'chrome', name: 'Google Chrome' },
  { id: 'edge', name: 'Microsoft Edge' },
  { id: 'brave', name: 'Brave' },
  { id: 'chromium', name: 'Chromium' }
];

function candidatePaths(id) {
  const p = process.platform;
  if (p === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    const rel = {
      chrome: 'Google\\Chrome\\Application\\chrome.exe',
      edge: 'Microsoft\\Edge\\Application\\msedge.exe',
      brave: 'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      chromium: 'Chromium\\Application\\chrome.exe'
    }[id];
    return roots.map((r) => path.join(r, rel));
  }
  if (p === 'darwin') {
    return [{
      chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      chromium: '/Applications/Chromium.app/Contents/MacOS/Chromium'
    }[id]];
  }
  return {
    chrome: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'],
    edge: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
    brave: ['/usr/bin/brave-browser', '/usr/bin/brave'],
    chromium: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']
  }[id];
}

function isFile(f) {
  try { return fs.statSync(f).isFile(); } catch { return false; }
}

/** Daftar browser yang terdeteksi di PC ini. */
function findBrowsers() {
  const out = [];
  for (const b of BROWSERS) {
    const found = candidatePaths(b.id).find(isFile);
    if (found) out.push({ id: b.id, name: b.name, path: found });
  }
  return out;
}

/** Pilih browser sesuai pengaturan: { prefer: 'auto'|'chrome'|'edge'|'brave'|'chromium'|'custom', customPath } */
function resolveBrowser(pref = {}) {
  if (pref.prefer === 'custom') {
    if (pref.customPath && isFile(pref.customPath)) return { id: 'custom', name: path.basename(pref.customPath), path: pref.customPath };
    throw new Error('BROWSER_NOT_FOUND');
  }
  const list = findBrowsers();
  const hit = (pref.prefer && pref.prefer !== 'auto' && list.find((b) => b.id === pref.prefer)) || list[0];
  if (!hit) throw new Error('BROWSER_NOT_FOUND');
  return hit;
}

const PLAIN_ARGS = ['--no-first-run', '--no-default-browser-check'];

const BASE_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  // agar Flow tetap berjalan normal saat jendelanya di belakang / tertutup jendela lain
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling'
];

/**
 * Argumen jendela per mode tampilan browser:
 *  - hidden    : headless (tanpa jendela sama sekali) — eksperimental
 *  - minimized : jendela di luar layar & diperkecil (cadangan bila headless ditolak Flow)
 *  - card      : jendela kecil tanpa bilah alamat (--app) berukuran kartu, khusus login Google
 *  - normal    : jendela biasa
 */
function modeArgs(mode, { card } = {}) {
  if (mode === 'hidden') return ['--headless=new', '--window-size=1440,900', '--hide-scrollbars', '--mute-audio'];
  if (mode === 'minimized') return ['--window-position=-32000,-32000', '--window-size=1440,900', '--mute-audio'];
  if (mode === 'card' && card) return [`--window-size=${Math.round(card.width)},${Math.round(card.height)}`, `--window-position=${Math.round(card.x)},${Math.round(card.y)}`];
  return [];
}

/**
 * Jalankan browser dengan profil khusus (1 profil = 1 akun Google).
 * debug=true membuka port DevTools lokal (127.0.0.1, port acak) agar aplikasi bisa mengendalikan tab Flow.
 * TIDAK memakai --enable-automation (tidak ada banner "dikendalikan software otomatis", navigator.webdriver tetap false).
 * app=true membuka url sebagai jendela aplikasi (tanpa tab & bilah alamat) — dipakai untuk kartu login.
 */
function launchBrowser({ exe, profileDir, url, debug, extraArgs = [], mode = 'normal', card, app = false, plain = false, netLog = null }) {
  fs.mkdirSync(profileDir, { recursive: true });
  // plain = browser biasa untuk login Google: tanpa port debug & tanpa flag tambahan (Google menolak login bila
  // navigator.webdriver = true, dan Chrome menyalakannya setiap kali ada --remote-debugging-port/pipe)
  const args = [`--user-data-dir=${profileDir}`, ...(plain ? PLAIN_ARGS : BASE_ARGS), ...modeArgs(mode, { card }), ...extraArgs];
  if (netLog) args.push(`--log-net-log=${netLog}`); // hanya untuk tahu kapan Google mengalihkan ke Flow (tidak terlihat oleh halaman)
  if (plain) debug = false;
  if (app && args.some((a) => a.startsWith('--headless'))) app = false; // headless mengabaikan --app
  if (debug) {
    try { fs.unlinkSync(path.join(profileDir, 'DevToolsActivePort')); } catch { /* belum ada */ }
    args.push('--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1');
  }
  if (url) args.push(app ? `--app=${url}` : url);
  try { fs.writeFileSync(path.join(profileDir, 'fc-mode'), mode); } catch { /* tidak penting */ }
  const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: mode === 'hidden' });
  child.on('error', () => { /* dilaporkan lewat waitForDebugPort */ });
  child.unref();
  return child;
}

/** Mode tampilan terakhir yang dipakai browser profil ini (untuk menyambung ulang ke browser yang sudah berjalan). */
function launchedMode(profileDir) {
  try { return fs.readFileSync(path.join(profileDir, 'fc-mode'), 'utf8').trim() || 'normal'; } catch { return 'normal'; }
}

/** Tunggu proses browser profil ini benar-benar selesai (kunci profil dilepas) sebelum meluncurkan ulang. */
async function waitForExit(profileDir, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  const locks = ['SingletonLock', 'lockfile'].map((f) => path.join(profileDir, f));
  while (Date.now() < end) {
    const portAlive = await existingDebugPort(profileDir);
    const locked = locks.some((f) => { try { fs.lstatSync(f); return true; } catch { return false; } });
    if (!portAlive && !locked) break;
    if (!portAlive && process.platform === 'win32') {
      // Windows: "lockfile" dikunci selama browser berjalan; bila bisa dihapus, browser sudah keluar
      try { fs.unlinkSync(locks[1]); } catch { /* masih dipakai */ }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * User-Agent & Client Hints tanpa jejak "HeadlessChrome" untuk mode tersembunyi.
 * @param {string} product  mis. "HeadlessChrome/131.0.6778.86" (dari Browser.getVersion)
 * @param {string} exePath  untuk mengenali Edge / Brave
 */
function cleanUserAgent(product, exePath = '', platform = process.platform) {
  const full = (/\/([\d.]+)/.exec(product || '') || [])[1] || '131.0.0.0';
  const major = full.split('.')[0];
  const edge = /msedge|microsoft edge/i.test(exePath);
  const plat = platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
  const userAgent = `Mozilla/5.0 (${plat}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36${edge ? ` Edg/${major}.0.0.0` : ''}`;
  const brand = edge ? 'Microsoft Edge' : 'Google Chrome';
  const brands = [{ brand: 'Not_A Brand', version: '24' }, { brand: 'Chromium', version: major }, { brand, version: major }];
  return {
    userAgent,
    acceptLanguage: 'en-US,en;q=0.9,id;q=0.8',
    platform: platform === 'win32' ? 'Win32' : platform === 'darwin' ? 'MacIntel' : 'Linux x86_64',
    userAgentMetadata: {
      brands, fullVersionList: brands.map((b) => ({ brand: b.brand, version: b.brand === 'Not_A Brand' ? '24.0.0.0' : full })), fullVersion: full,
      platform: platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux',
      platformVersion: platform === 'win32' ? '15.0.0' : platform === 'darwin' ? '14.5.0' : '6.5.0',
      architecture: 'x86', model: '', mobile: false, bitness: '64', wow64: false
    }
  };
}

function getJSON(port, p, method = 'GET', timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, timeout }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('HTTP_' + res.statusCode));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}

function readPortFile(profileDir) {
  try {
    const [port] = fs.readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8').split(/\r?\n/);
    const n = Number(port);
    return n > 0 && n < 65536 ? n : null;
  } catch { return null; }
}

/** Port DevTools dari browser profil ini yang SUDAH berjalan (mis. setelah aplikasi dibuka ulang). */
async function existingDebugPort(profileDir) {
  const port = readPortFile(profileDir);
  if (!port) return null;
  try { await getJSON(port, '/json/version', 'GET', 1500); return port; } catch { return null; }
}

async function waitForDebugPort(profileDir, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const port = await existingDebugPort(profileDir);
    if (port) return port;
    await new Promise((r) => setTimeout(r, 300));
  }
  // Profil sedang dipakai jendela browser lain (tanpa port debug) → browser baru langsung menyerahkan ke jendela lama.
  throw new Error('PROFILE_IN_USE');
}

/** Tunggu proses anak keluar; true bila keluar sebelum batas waktu. */
function waitChild(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    child.once('exit', () => { clearTimeout(t); resolve(true); });
  });
}

/**
 * Tutup browser TANPA port debug dengan cara wajar (seperti menekan X), agar cookie login sempat tersimpan.
 * Windows: taskkill tanpa /F (mengirim WM_CLOSE); lainnya: SIGTERM. Bila tidak menutup, dipaksa.
 */
async function closeGracefully(child, profileDir, timeoutMs = 10000) {
  const kill = (force) => {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', ...(force ? ['/F'] : [])], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
      else process.kill(child.pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch { /* sudah keluar */ }
  };
  if (child && child.pid && !(await waitChild(child, 0))) {
    kill(false);
    if (!(await waitChild(child, timeoutMs))) { kill(true); await waitChild(child, 5000); }
  }
  if (profileDir) await waitForExit(profileDir);
}

/**
 * Baca log jaringan Chrome (--log-net-log) secara bertahap → URL yang dimuat. Hanya URL; cookie tidak dicatat
 * (mode bawaan Chrome membuang data pribadi). Dipakai untuk mendeteksi akhir login tanpa menyentuh halaman.
 */
class NetLogReader {
  constructor(file) { this.file = file; this.pos = 0; this.tail = ''; }
  read() {
    let fd;
    try { fd = fs.openSync(this.file, 'r'); } catch { return []; }
    try {
      const size = fs.fstatSync(fd).size;
      if (size <= this.pos) return [];
      const buf = Buffer.alloc(Math.min(size - this.pos, 8 * 1024 * 1024));
      const n = fs.readSync(fd, buf, 0, buf.length, this.pos);
      this.pos += n;
      const text = this.tail + buf.toString('utf8', 0, n);
      this.tail = text.slice(-2048);
      const urls = [];
      const re = /"url":"((?:[^"\\]|\\.){1,4000})"/g;
      let m;
      while ((m = re.exec(text))) { try { urls.push(JSON.parse('"' + m[1] + '"')); } catch { /* terpotong */ } }
      return urls;
    } finally { fs.closeSync(fd); }
  }
}

/**
 * Baris daftar proses → proses browser yang memakai profil `profileDir` (dicocokkan dari --user-data-dir).
 * Murni (bisa dites). text: baris "pid<spasi/tab>baris-perintah".
 * → [{pid, main, debug, headless}]  main = proses utama (tanpa --type=); debug = dikendalikan lewat port/pipe DevTools.
 */
function parseProfileProcesses(text, profileDir, platform = process.platform) {
  const win = platform === 'win32';
  const norm = (x) => { let v = String(x || '').replace(/\\/g, '/').replace(/\/+$/, ''); return win ? v.toLowerCase() : v; };
  const want = 'user-data-dir=' + norm(profileDir);
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const cmd = m[2];
    const c = norm(cmd);
    let i = c.indexOf(want);
    let hit = false;
    while (i >= 0 && !hit) {
      const next = c.charAt(i + want.length);
      hit = next === '' || next === '"' || next === ' ' || next === "'";
      if (!hit) i = c.indexOf(want, i + 1);
    }
    if (!hit) continue;
    out.push({ pid: Number(m[1]), main: !/\s--type=/.test(cmd), debug: /--remote-debugging-(port|pipe)/.test(cmd), headless: /--headless/.test(cmd) });
  }
  return out;
}

function listProcessesText(timeout = 12000) {
  return new Promise((resolve) => {
    const done = (err, stdout) => resolve(err && !stdout ? '' : String(stdout || ''));
    if (process.platform === 'win32') {
      const ps = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-CimInstance Win32_Process -Filter \"CommandLine like '%user-data-dir=%'\" | ForEach-Object { [string]$_.ProcessId + ' ' + $_.CommandLine }";
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true, timeout, maxBuffer: 32 * 1024 * 1024 }, done);
    } else {
      execFile('ps', ['-axww', '-o', 'pid=,command='], { timeout, maxBuffer: 32 * 1024 * 1024 }, done);
    }
  });
}

/** Proses browser (Chrome/Edge/…) yang sedang memakai folder profil ini — termasuk yang tidak lagi dikenali aplikasi. */
async function profileProcesses(profileDir) {
  return parseProfileProcesses(await listProcessesText(), profileDir).filter((p) => p.pid !== process.pid);
}

/**
 * Tutup SEMUA proses browser yang memakai profil ini (wajar dulu, lalu dipaksa).
 * Penting sebelum membuka browser POLOS untuk login Google: Chrome/Edge hanya boleh satu proses per profil — bila
 * masih ada proses lama yang dijalankan dengan port debug (mis. Flow tersembunyi yang \"tertinggal\"), peluncuran baru
 * hanya menyerahkan URL ke proses lama itu, sehingga halaman login terbuka di browser yang dikendalikan dan Google
 * menolak: "This browser or app may not be secure".
 * @returns {Promise<{killed:number, debug:boolean}>}
 */
async function killProfile(profileDir, { graceMs = 6000 } = {}) {
  let procs = await profileProcesses(profileDir);
  if (!procs.length) return { killed: 0, debug: false };
  const debug = procs.some((p) => p.debug || p.headless);
  const kill = (pid, force) => {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
      else process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch { /* sudah keluar */ }
  };
  const waitGone = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 400));
      procs = await profileProcesses(profileDir);
      if (!procs.length) return true;
    }
    return false;
  };
  const n = procs.length;
  const mains = procs.filter((p) => p.main);
  for (const p of mains.length ? mains : procs) kill(p.pid, false);
  if (!(await waitGone(graceMs))) {
    for (const p of procs) kill(p.pid, true);
    await waitGone(5000);
  }
  await waitForExit(profileDir, 8000);
  return { killed: n, debug };
}

/** URL halaman penolakan login Google ("This browser or app may not be secure"). */
function isLoginRejectedUrl(u) {
  return /^https:\/\/accounts\.google\.com\/(v\d\/)?signin\/rejected\b/.test(String(u || ''));
}

module.exports = { findBrowsers, resolveBrowser, launchBrowser, launchedMode, modeArgs, waitForExit, cleanUserAgent, existingDebugPort, waitForDebugPort, getJSON, BASE_ARGS, PLAIN_ARGS, closeGracefully, waitChild, NetLogReader, parseProfileProcesses, profileProcesses, killProfile, isLoginRejectedUrl };
