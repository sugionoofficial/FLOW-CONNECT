'use strict';
// Render build/icon.svg → build/icon.png & src/renderer/icon.png (512×512) memakai Chromium + klien CDP aplikasi.
// Pakai: CHROME_PATH=/path/chrome node scripts/render-icon.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launchBrowser, waitForDebugPort, getJSON, findBrowsers } = require('../src/main/browser');
const { CDPConnection } = require('../src/main/cdp');

(async () => {
  const exe = process.env.CHROME_PATH || findBrowsers()[0].path;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-icon-'));
  launchBrowser({ exe, profileDir: prof, debug: true, url: 'about:blank', extraArgs: (process.env.CHROME_ARGS || '--headless=new').split(' ') });
  const port = await waitForDebugPort(prof);
  const [t] = (await getJSON(port, '/json/list')).filter((x) => x.type === 'page');
  const page = await CDPConnection.connect(t.webSocketDebuggerUrl);
  const svg = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'), 'utf8');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 512, height: 512, deviceScaleFactor: 1, mobile: false });
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await page.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent('<style>html,body{margin:0;background:transparent}svg{display:block}</style>' + svg) });
  await new Promise((r) => setTimeout(r, 800));
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 512, height: 512, scale: 1 } });
  for (const out of ['build/icon.png', 'src/renderer/icon.png']) fs.writeFileSync(path.join(__dirname, '..', out), Buffer.from(data, 'base64'));
  const v = await getJSON(port, '/json/version');
  const b = await CDPConnection.connect(v.webSocketDebuggerUrl);
  await b.send('Browser.close').catch(() => {});
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
