'use strict';
// Uji integrasi: browser Chromium sungguhan (headless) + server tiruan "Google Flow".
// Menjalankan kode FlowSession yang sama dengan aplikasi: luncurkan browser, CDP, agen, prompt,
// lampirkan gambar, klik Generate, tunggu hasil, unduh.
// Jalankan: CHROME_PATH=/path/ke/chrome node --test test/
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FlowSession } = require('../src/main/flow');
const { findBrowsers } = require('../src/main/browser');
const { AutomationQueue } = require('../src/main/automation');
const { Store } = require('../src/main/store');

const CHROME = process.env.CHROME_PATH || (findBrowsers()[0] || {}).path;
const EXTRA = (process.env.CHROME_ARGS || '--headless=new').split(' ').filter(Boolean);
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function mockFlow() {
  const media = []; // {id, prompt, files, at}
  const generated = [];
  let port;
  const page = (signedIn, ce) => `<!doctype html><html lang="id"><head><title>Film Saya - Google Flow</title></head><body>
<script>window.WIZ_global_data=${JSON.stringify(signedIn ? { SNlM0e: 'AT_TOKEN', oPEP7c: 'kreator@gmail.com', cfb2h: 'bl1', FdrFJe: 'sid' } : {})};</script>
<header><button aria-label="Setelan"><i>settings</i></button><button aria-label="Tambah media"><i>add</i></button></header>
<main><div class="composer">
  <input type="file" accept="image/*" multiple style="display:none" id="file">
  <div id="chips"></div>
  ${ce ? '<div contenteditable="true" role="textbox" aria-label="Prompt" id="prompt" style="min-height:40px;border:1px solid #ccc"></div>' : '<textarea aria-label="Prompt" id="prompt" rows="3"></textarea>'}
  <button id="gen" aria-label="Buat" disabled><i>arrow_forward</i></button>
</div></main>
<script>
var files=[];
document.getElementById('file').addEventListener('change',function(e){files=[].map.call(e.target.files,function(f){return f.name});document.getElementById('chips').textContent=files.join(',')});
function val(){var p=document.getElementById('prompt');return p.tagName==='TEXTAREA'?p.value:p.innerText}
document.getElementById('prompt').addEventListener('input',function(){document.getElementById('gen').disabled=!val().trim()});
document.getElementById('gen').addEventListener('click',function(e){
  if(!e.isTrusted) return; // klik harus asli
  fetch('/mock/generate',{method:'POST',body:JSON.stringify({prompt:val(),files:files})})
    .then(function(r){return r.json()}).then(function(j){ if(location.pathname==='/') history.pushState({},'', '/project/'+j.projectId); });
  var p=document.getElementById('prompt'); if(p.tagName==='TEXTAREA') p.value=''; else p.textContent=''; document.getElementById('gen').disabled=true; files=[]; document.getElementById('chips').textContent='';
});
</script></body></html>`;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname.startsWith('/project/'))) {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end(page(u.searchParams.get('signedout') !== '1', u.searchParams.get('ce') === '1'));
      }
      if (u.pathname === '/mock/generate') {
        const j = JSON.parse(body);
        generated.push(j);
        const id = '0000000' + generated.length + '-aaaa-bbbb-cccc-111122223333';
        media.push({ id, prompt: j.prompt, files: j.files, at: Date.now() });
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ projectId: 'p-test-1' }));
      }
      if (u.pathname === '/_/AiSandboxAngularFrontend/data/batchexecute') {
        const params = new URLSearchParams(body);
        if (params.get('at') !== 'AT_TOKEN' || req.headers['x-same-domain'] !== '1') { res.writeHead(400); return res.end(); }
        const rpc = u.searchParams.get('rpcids');
        let payload;
        if (rpc === 'Zzl0ze') {
          const rows = media.map((m) => ['asset-' + m.id, 'f', null, [m.prompt.slice(0, 30), [Math.floor(m.at / 1000), 0], false, null, m.id, 'op', Date.now() - m.at > 1500], 'p-test-1']);
          payload = [rows, media.map((m) => `http://127.0.0.1:${port}/image/${m.id}?sig=1`)];
        } else if (rpc === 'as29s') {
          const id = JSON.parse(JSON.parse(params.get('f.req'))[0][0][1])[0];
          payload = [[`http://127.0.0.1:${port}/image/${id}?sig=2`]];
        }
        const line = JSON.stringify([['wrb.fr', rpc, JSON.stringify(payload), null, null, null, 'generic']]);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(`)]}'\n\n${line.length}\n${line}\n`);
      }
      if (u.pathname.startsWith('/image/')) {
        if (u.searchParams.get('sig') !== '1' && u.searchParams.get('sig') !== '2') { res.writeHead(403); return res.end(); }
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(PNG);
      }
      res.writeHead(404); res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve({ server, port, media, generated }); }));
}

test('FlowSession mengendalikan browser asli lewat CDP', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 120000 }, async (t) => {
  const mock = await mockFlow();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-test-'));
  const s = new FlowSession({
    profileDir: path.join(tmp, 'profile'),
    getBrowser: () => ({ path: CHROME }),
    flowUrl: `http://127.0.0.1:${mock.port}/`,
    agentCfg: { mediaHosts: ['127.0.0.1'], allowHttp: true },
    extraArgs: EXTRA
  });
  t.after(async () => { await s.closeBrowser(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows: file terkunci */ } });

  await s.connect();
  assert.ok(s.connected, 'tersambung');
  const flowTabs = async () => (await s._targets()).filter((x) => s._isFlow(x)).length;
  assert.strictEqual(await flowTabs(), 1, 'tidak membuka tab Flow ganda');

  // menyambung ulang ke browser yang sama (seperti aplikasi dibuka ulang)
  const port1 = s.port;
  s.disconnect();
  await s.connect();
  assert.strictEqual(s.port, port1, 'memakai browser yang sudah berjalan');
  assert.strictEqual(await flowTabs(), 1);

  const st = await s.status();
  assert.strictEqual(st.signedIn, true);
  assert.strictEqual(st.account, 'kreator@gmail.com');
  assert.strictEqual(st.projectId, null);

  // tidak ada agen di window yang bisa dihitung (non-enumerable)
  const page = await s.ensurePage();
  const keys = await page.send('Runtime.evaluate', { expression: 'Object.keys(window).includes("__fcDesktop")', returnByValue: true });
  assert.strictEqual(keys.result.value, false);

  // gambar → input file asli
  const img = path.join(tmp, 'referensi.png');
  fs.writeFileSync(img, PNG);
  const si = await s.sendImages([img]);
  assert.strictEqual(si.method, 'file-input');
  await assert.rejects(() => Promise.resolve().then(() => s.sendImages([path.join(tmp, 'x.exe')])), /INVALID_IMAGE/);

  // prompt
  await s.sendPrompt('Kucing neon di atap Jakarta, sinematik');
  assert.strictEqual(await s.call('promptText'), 'Kucing neon di atap Jakarta, sinematik');
  await s.sendPrompt('Prompt kedua menggantikan');
  assert.strictEqual(await s.call('promptText'), 'Prompt kedua menggantikan');

  // generate: klik tombol "Buat" (bukan Setelan / Tambah media) dengan klik asli (isTrusted)
  const g = await s.clickGenerate();
  assert.strictEqual(g.method, 'click');
  assert.match(g.label, /Buat/);
  const res = await s.waitForNew([], { intervalMs: 700, timeoutMs: 20000 });
  assert.strictEqual(mock.generated.length, 1);
  assert.deepStrictEqual(mock.generated[0], { prompt: 'Prompt kedua menggantikan', files: ['referensi.png'] });
  assert.strictEqual(res.projectId, 'p-test-1');
  assert.strictEqual(res.items.length, 1);
  assert.ok(res.items[0].image.includes('/image/'));

  // galeri & unduh
  const items = await s.listMedia('p-test-1');
  assert.strictEqual(items.length, 1);
  await assert.rejects(() => s.listMedia('../x'), /INVALID_PROJECT_ID/);
  const file = await s.download(items[0], path.join(tmp, 'unduhan'));
  assert.ok(fs.readFileSync(file).equals(PNG), 'file terunduh utuh');
  assert.ok(file.endsWith('.png'));
  const m = await s.getMedia(items[0].mediaId);
  assert.ok(m.image.endsWith('sig=2'));
  await assert.rejects(() => s.fetchMedia('https://evil.example/x.png'), /INVALID_URL/);

  // tanpa gambar baru → hasil generate ke-2 terdeteksi sebagai item baru saja
  await s.sendPrompt('Hujan di sawah');
  await s.clickGenerate();
  const res2 = await s.waitForNew(items.map((i) => i.mediaId), { intervalMs: 700, timeoutMs: 20000 });
  assert.strictEqual(res2.items.length, 1);
  assert.notStrictEqual(res2.items[0].mediaId, items[0].mediaId);

  // navigasi hanya ke host Flow
  await assert.rejects(() => s.navigate('https://evil.example/'), /INVALID_URL/);
  await s.navigate(`http://127.0.0.1:${mock.port}/?signedout=1`);
  await new Promise((r) => setTimeout(r, 800));
  const st2 = await s.status();
  assert.strictEqual(st2.signedIn, false);
  await assert.rejects(() => s.listMedia('p-test-1'), /NOT_SIGNED_IN/);
});

test('Mode Otomatis: antrean berjalan end-to-end (kolom prompt contenteditable)', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 120000 }, async (t) => {
  const mock = await mockFlow();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-auto-'));
  const s = new FlowSession({
    profileDir: path.join(tmp, 'profile'), getBrowser: () => ({ path: CHROME }),
    flowUrl: `http://127.0.0.1:${mock.port}/?ce=1`, agentCfg: { mediaHosts: ['127.0.0.1'], allowHttp: true }, extraArgs: EXTRA
  });
  t.after(async () => { await s.closeBrowser(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  await s.connect();
  // project sudah ada sebelumnya
  await s.navigate(`http://127.0.0.1:${mock.port}/project/p-test-1?ce=1`);
  await new Promise((r) => setTimeout(r, 800));

  const store = new Store(tmp, path.join(tmp, 'unduhan'));
  store.data.accounts.push({ id: 'a1', label: 'Uji/Akun', email: null });
  // Mode Otomatis harus disetujui dulu
  const downloaded = [];
  const q = new AutomationQueue({ store, getSession: async () => s, onDownloaded: (d) => downloaded.push(d) });
  q.add({ prompts: ['Pasar terapung saat fajar', 'Kereta api melintasi sawah'], images: [], accountId: 'a1' });
  await assert.rejects(() => q.start(), /AUTO_MODE_DISABLED/);
  assert.throws(() => q.add({ prompts: ['x'], accountId: 'zzz' }), /UNKNOWN_ACCOUNT/);

  store.data.autoAck = new Date().toISOString();
  store.data.mode = 'auto';
  Object.assign(store.data.auto, { minDelay: 1, maxDelay: 1, timeoutMin: 1, autoDownload: true, maxPerRun: 10 });
  // waitForNew di antrean memakai interval default 6 dtk → percepat untuk uji
  const orig = s.waitForNew.bind(s);
  s.waitForNew = (before, o) => orig(before, { ...o, intervalMs: 700 });

  const acts = [];
  q.on('update', (st) => acts.push(st.activity));
  await q.start();
  assert.deepStrictEqual(store.data.queue.map((j) => j.status), ['done', 'done']);
  assert.deepStrictEqual(mock.generated.map((g) => g.prompt), ['Pasar terapung saat fajar', 'Kereta api melintasi sawah']);
  assert.strictEqual(downloaded.length, 2);
  for (const d of downloaded) assert.ok(fs.readFileSync(d.path).equals(PNG));
  assert.ok(downloaded[0].path.includes(path.join('unduhan', 'Uji Akun')), 'folder per akun, nama aman');
  assert.ok(acts.some((a) => /Jeda/.test(a)), 'ada jeda antar tugas');
  assert.match(q.activity, /2 berhasil, 0 gagal/);

  // batas per sesi
  q.add({ prompts: ['a', 'b', 'c'], accountId: 'a1' });
  store.data.auto.maxPerRun = 1;
  await q.start();
  assert.deepStrictEqual(store.data.queue.map((j) => j.status), ['done', 'done', 'done', 'pending', 'pending']);
  assert.match(q.activity, /Batas 1 tugas/);
  q.clearFinished();
  assert.strictEqual(store.data.queue.length, 2);
  store.flush();
  assert.ok(JSON.parse(fs.readFileSync(path.join(tmp, 'settings.json'), 'utf8')).queue.length === 2, 'antrean tersimpan');
});
