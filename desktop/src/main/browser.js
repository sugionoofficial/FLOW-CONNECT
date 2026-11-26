'use strict';
// Mencari & menjalankan browser Chromium ASLI yang terpasang di PC (Chrome / Edge / Brave).
// Login Google terjadi di browser asli itu — bukan di dalam aplikasi (Google memblokir login di webview).
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

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

const BASE_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  // agar Flow tetap berjalan normal saat jendelanya di belakang / tertutup jendela lain
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling'
];

/**
 * Jalankan browser dengan profil khusus (1 profil = 1 akun Google).
 * debug=true membuka port DevTools lokal (127.0.0.1, port acak) agar aplikasi bisa mengendalikan tab Flow.
 * TIDAK memakai --enable-automation (tidak ada banner "dikendalikan software otomatis", navigator.webdriver tetap false).
 */
function launchBrowser({ exe, profileDir, url, debug, extraArgs = [] }) {
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [`--user-data-dir=${profileDir}`, ...BASE_ARGS, ...extraArgs];
  if (debug) {
    try { fs.unlinkSync(path.join(profileDir, 'DevToolsActivePort')); } catch { /* belum ada */ }
    args.push('--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1');
  }
  if (url) args.push(url);
  const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => { /* dilaporkan lewat waitForDebugPort */ });
  child.unref();
  return child;
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

module.exports = { findBrowsers, resolveBrowser, launchBrowser, existingDebugPort, waitForDebugPort, getJSON, BASE_ARGS };
