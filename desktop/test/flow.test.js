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

// PNG nyata 64x64 (Flow menolak gambar 1x1)
function makePng(w = 64, h = 64, rgb = [220, 120, 40]) {
  const zlib = require('zlib');
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0] ^ x; raw[o + 1] = rgb[1] ^ y; raw[o + 2] = rgb[2]; }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function mockFlow() {
  const media = []; // {id, prompt, files, at}
  const generated = [];
  const state = { blockNext: 0, projects: 0, rpc: false, terms: false, unsafeNext: 0, failNext: 0, uploads: [], polls: 0 };
  let port;
  // panel setelan meniru Flow terbaru: chip "Video · 8s · x2" → dialog berisi radio + daftar model
  const settingsUi = `
  <button id="chip" aria-label="Settings trigger" aria-haspopup="dialog"><span id="chiptext">Video · 8s · x2</span><i>tune</i></button>
  <div id="panel" role="dialog" style="display:none;position:fixed;right:20px;bottom:120px;background:#fff;border:1px solid #ccc;padding:8px">
    <div role="radiogroup"><button role="radio" data-g="kind" data-v="image"><i>image</i>Image</button><button role="radio" data-g="kind" data-v="video"><i>videocam</i>Video</button></div>
    <div role="radiogroup" id="subs"><button role="radio" data-g="sub" data-v="frames">Frames</button><button role="radio" data-g="sub" data-v="ingredients">Ingredients</button></div>
    <div role="radiogroup"><button role="radio" data-g="ratio" data-v="9:16"><i>crop_9_16</i>9:16</button><button role="radio" data-g="ratio" data-v="16:9"><i>crop_16_9</i>16:9</button><button role="radio" data-g="ratio" data-v="1:1"><i>crop_square</i>1:1</button></div>
    <div role="radiogroup"><button role="radio" data-g="count" data-v="1">x1</button><button role="radio" data-g="count" data-v="2">x2</button><button role="radio" data-g="count" data-v="3">x3</button><button role="radio" data-g="count" data-v="4">x4</button></div>
    <div role="radiogroup" id="durs"><button role="radio" data-g="duration" data-v="4">4s</button><button role="radio" data-g="duration" data-v="6">6s</button><button role="radio" data-g="duration" data-v="8">8s</button></div>
    <button id="modelbtn" aria-haspopup="listbox"><span id="modeltext">Veo 3.1 - Fast</span><i>arrow_drop_down</i></button>
  </div>
  <div id="models" role="listbox" style="display:none;position:fixed;right:20px;bottom:40px;background:#fff;border:1px solid #ccc"></div>`;
  const settingsJs = `
var S={kind:'video',sub:'ingredients',ratio:'16:9',count:'2',duration:'8',model:'Veo 3.1 - Fast'};window.__settings=S;
var MODELS={video:['Veo 3.1 - Lite','Veo 3.1 - Fast','Veo 3.1 - Quality'],image:['🍌 Nano Banana 2','🍌 Nano Banana Pro','Imagen 4']};
function paint(){document.querySelectorAll('[data-g]').forEach(function(b){b.setAttribute('aria-checked',String(S[b.dataset.g]===b.dataset.v))});
  document.getElementById('subs').style.display=document.getElementById('durs').style.display=S.kind==='video'?'':'none';
  document.getElementById('modeltext').textContent=S.model;document.getElementById('chiptext').textContent=(S.kind==='video'?'Video · '+S.duration+'s':'Image')+' · x'+S.count;}
paint();
document.getElementById('chip').addEventListener('click',function(e){if(!e.isTrusted)return;var p=document.getElementById('panel');p.style.display=p.style.display==='none'?'':'none'});
document.querySelectorAll('[data-g]').forEach(function(b){b.addEventListener('click',function(e){if(!e.isTrusted)return;S[b.dataset.g]=b.dataset.v;if(b.dataset.g==='kind')S.model=MODELS[S.kind][1].replace('🍌 ','');paint()})});
document.getElementById('modelbtn').addEventListener('click',function(e){if(!e.isTrusted)return;var l=document.getElementById('models');l.innerHTML=MODELS[S.kind].map(function(m){return '<div role="option" tabindex="0">'+m+'<small style="display:block">Beta Audio</small></div>'}).join('');l.style.display='';
  l.querySelectorAll('[role=option]').forEach(function(o){o.addEventListener('click',function(ev){if(!ev.isTrusted)return;S.model=o.firstChild.nodeValue.replace('🍌 ','');l.style.display='none';paint()})})});
document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;var am=document.getElementById('addmenu');if(am&&am.style.display!=='none'){am.style.display='none';return}var l=document.getElementById('models');if(l.style.display!=='none'){l.style.display='none';return}document.getElementById('panel').style.display='none'});`;
  // unggah lewat "+" → Upload, pemilih "@" yang membuat .mention-chip, kirim lewat batchexecute
  const refsJs = String.raw`var files=[], assets=[], pick={open:false,i:0,opts:[]};
// "+" → menu → "Upload media" → dialog file → unggah (maseQ)
document.getElementById('add').addEventListener('click',function(e){if(!e.isTrusted)return;var m=document.getElementById('addmenu');m.style.display=m.style.display==='none'?'':'none'});
document.getElementById('upitem').addEventListener('click',function(e){
  if(!e.isTrusted)return;
  document.getElementById('addmenu').style.display='none';
  if(window.__terms){var d=document.createElement('div');d.setAttribute('role','dialog');d.textContent='Before you upload: confirm you have the rights';document.body.appendChild(d);return}
  var inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.addEventListener('change',function(){var f=inp.files[0];if(!f)return;
    f.arrayBuffer().then(function(buf){return fetch('/_/AiSandboxAngularFrontend/data/batchexecute?rpcids=maseQ&rt=c',{method:'POST',body:JSON.stringify({name:f.name,size:buf.byteLength})})})
     .then(function(r){return r.text()}).then(function(t){var m=/"([0-9a-f]{8}-[0-9a-f-]{27})/.exec(t.replace(/\\/g,''));if(m)assets.push({id:m[1],title:f.name})});
  });
  inp.click();
});
function rpcPost(rpc,body){return fetch('/_/AiSandboxAngularFrontend/data/batchexecute?rpcids='+rpc+'&rt=c',{method:'POST',body:JSON.stringify(body)}).then(function(r){return r.text()})}
// pemilih "@"
function caretInfo(){var sel=getSelection();if(!sel.rangeCount)return null;var r=sel.getRangeAt(0),n=r.startContainer;if(n.nodeType!==3)return null;var m=/@([\w.-]*)$/.exec(n.data.slice(0,r.startOffset));return m?{node:n,off:r.startOffset,len:m[0].length,q:m[1]}:null}
function paintPick(){var pk=document.getElementById('pk');if(!pick.open||!pick.opts.length){pk.style.display='none';pk.innerHTML='';pick.open=false;return}
  pk.innerHTML=pick.opts.map(function(a,i){return '<button class="asset-item" role="option" aria-selected="'+(i===pick.i)+'"><img alt=""><span class="asset-title">'+a.title+'</span></button>'}).join('');pk.style.display=''}
document.getElementById('prompt').addEventListener('input',function(){var ci=caretInfo();if(!ci){pick.open=false;paintPick();return}
  var q=ci.q.toLowerCase();pick.opts=assets.filter(function(a){return a.title.toLowerCase().indexOf(q)===0});pick.open=true;pick.i=0;setTimeout(paintPick,300)});
document.getElementById('prompt').addEventListener('keydown',function(e){if(!pick.open)return;
  if(e.key==='ArrowDown'){e.preventDefault();pick.i=Math.min(pick.i+1,pick.opts.length-1);paintPick()}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();pick.open=false;paintPick()}
  else if(e.key==='Enter'){e.preventDefault();var a=pick.opts[pick.i],ci=caretInfo();if(!a||!ci)return;
    var r=document.createRange();r.setStart(ci.node,ci.off-ci.len);r.setEnd(ci.node,ci.off);r.deleteContents();
    var c=document.createElement('span');c.className='mention-chip';c.contentEditable='false';c.setAttribute('data-entity-id',a.id);c.setAttribute('data-reference-type','media');c.textContent=a.title.replace(/\.\w+$/,'');
    r.insertNode(c);r.setStartAfter(c);r.collapse(true);var sel=getSelection();sel.removeAllRanges();sel.addRange(r);
    pick.open=false;paintPick();document.getElementById('gen').disabled=false}
},true);`;
  const genJs = String.raw`document.getElementById('gen').addEventListener('click',function(e){
  if(!e.isTrusted) return; // klik harus asli
  var refs=[].map.call(document.querySelectorAll('.mention-chip'),function(c){return c.getAttribute('data-entity-id')});
  var body={prompt:val(),files:files,refs:refs,settings:Object.assign({},S),ua:navigator.userAgent,project:(/\/project\/([\w-]+)/.exec(location.pathname)||[])[1]||null};
  var done=function(pid){
    if(location.pathname==='/') history.pushState({},'', '/project/'+pid+location.search);
    var p=document.getElementById('prompt'); if(p.tagName==='TEXTAREA') p.value=''; else p.textContent=''; document.getElementById('gen').disabled=true; files=[]; document.getElementById('chips').textContent='';
  };
  var alertMsg=function(t){var a=document.createElement('div');a.setAttribute('role','alert');a.textContent=t;document.getElementById('alerts').appendChild(a)};
  if(window.__rpc){ // Flow 2026: kirim lewat batchexecute (gambar: ogiZ0b, video: YhhmEf), status video: jwpduf
    rpcPost(S.kind==='image'?'ogiZ0b':'YhhmEf',body).then(function(t){
      var pid=(/p-[\w-]+/.exec(t)||['p-test-1'])[0];done(pid);
      if(/UNUSUAL_ACTIVITY/.test(t))alertMsg('We noticed some unusual activity.');
      if(S.kind==='video'){var wf=(/"wf":"([\w-]+)"/.exec(t.replace(/\\/g,''))||[])[1];if(!wf)return;
        var poll=function(){rpcPost('jwpduf',{wf:wf}).then(function(t2){t2=t2.replace(/\\/g,'');if(/"running"/.test(t2))setTimeout(poll,800);else if(/"failed"/.test(t2)){var d=document.createElement('div');d.className='tile';d.textContent='Failed';document.getElementById('tiles').appendChild(d)}})};setTimeout(poll,800)}
    });
    return;
  }
  fetch('/mock/generate',{method:'POST',body:JSON.stringify(body)})
    .then(function(r){return r.json()}).then(function(j){
      if(j.error){alertMsg(j.error);return;}
      done(j.projectId);
    });
});
`;
  const page = (signedIn, ce) => `<!doctype html><html lang="id"><head><title>Film Saya - Google Flow</title></head><body>
<script>window.WIZ_global_data=${JSON.stringify(signedIn ? { SNlM0e: 'AT_TOKEN', oPEP7c: 'kreator@gmail.com', cfb2h: 'bl1', FdrFJe: 'sid' } : {})};window.__rpc=${state.rpc};window.__terms=${state.terms};</script>
<header><button aria-label="Setelan"><i>settings</i></button><button aria-label="Tambah media" id="add"><i>add</i></button></header>
<div class="cdk-overlay-pane" id="addmenu" role="menu" style="display:none;position:fixed;left:20px;top:50px;background:#fff;border:1px solid #ccc"><button role="menuitem" id="upitem"><i>upload</i>Upload media</button><button role="menuitem"><i>photo_library</i>Library</button></div>
<div class="cdk-overlay-pane" id="pk" style="display:none;position:fixed;left:20px;bottom:160px;background:#fff;border:1px solid #ccc"></div>
<div id="tiles"></div>
<main><flow-prompt-box class="composer">
  <input type="file" accept="image/*" multiple style="display:none" id="file">
  <div id="chips"></div>
  ${ce ? '<div contenteditable="true" role="textbox" aria-label="Prompt" id="prompt" style="min-height:40px;border:1px solid #ccc"></div>' : '<textarea aria-label="Prompt" id="prompt" rows="3"></textarea>'}
  ${settingsUi}
  <button id="gen" aria-label="Buat" disabled><i>arrow_forward</i></button>
  <div id="alerts"></div>
</flow-prompt-box></main>
<script>
${settingsJs}
${refsJs}
document.getElementById('file').addEventListener('change',function(e){files=[].map.call(e.target.files,function(f){return f.name});document.getElementById('chips').textContent=files.join(',')});
function val(){var p=document.getElementById('prompt');return p.tagName==='TEXTAREA'?p.value:p.innerText}
document.getElementById('prompt').addEventListener('input',function(){document.getElementById('gen').disabled=!val().trim()});
${genJs}
</script></body></html>`;
  // beranda Flow (daftar project + tombol "New project") & halaman sambutan publik
  const home = (q) => `<!doctype html><html><head><title>Google Flow</title></head><body>
<script>window.WIZ_global_data={SNlM0e:'AT_TOKEN',oPEP7c:'kreator@gmail.com',cfb2h:'bl1',FdrFJe:'sid'};</script>
<header><button aria-label="Akun"><i>account_circle</i></button></header>
<main><div class="grid"><a href="#" id="old">Project lama</a><button id="np"><i>add_2</i><span>New project</span></button></div></main>
<script>document.getElementById('np').addEventListener('click',function(e){if(!e.isTrusted)return;fetch('/mock/project',{method:'POST'}).then(function(r){return r.json()}).then(function(j){location.href='/project/'+j.id+${JSON.stringify(q)}})});</script></body></html>`;
  const landing = (q) => `<!doctype html><html><head><title>Flow</title></head><body><main><h1>Flow</h1>
<a role="button" href="/?view=home${q.replace(/^\?/, '&')}" id="cta">Create with Google Flow</a></main>
<script>document.getElementById('cta').addEventListener('click',function(e){if(!e.isTrusted)e.preventDefault()});</script></body></html>`;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const keep = u.searchParams.get('ce') === '1' ? '?ce=1' : '';
      if (req.method === 'GET' && u.pathname === '/' && u.searchParams.get('view') === 'landing') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(landing(keep)); }
      if (req.method === 'GET' && u.pathname === '/' && u.searchParams.get('view') === 'home') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(home(keep)); }
      if (req.method === 'GET' && u.pathname === '/mock-login') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><title>Login</title><p>Masuk…</p><script>setTimeout(function(){location.href=new URLSearchParams(location.search).get("continue")},1200)</script>');
      }
      if (u.pathname === '/mock/project') { state.projects++; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id: 'p-new-' + state.projects })); }
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname.startsWith('/project/'))) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(page(u.searchParams.get('signedout') !== '1', u.searchParams.get('ce') === '1'));
      }
      if (u.pathname === '/mock/generate') {
        const j = JSON.parse(body);
        if (state.blockNext > 0) {
          state.blockNext--;
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ error: 'We noticed unusual activity. Please try again later.' }));
        }
        generated.push(j);
        const id = '0000000' + generated.length + '-aaaa-bbbb-cccc-111122223333';
        media.push({ id, prompt: j.prompt, files: j.files, at: Date.now() });
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ projectId: (/\/project\/([\w-]+)/.exec(req.headers.referer || '') || [])[1] || 'p-test-1' }));
      }
      const rpcName = u.pathname === '/_/AiSandboxAngularFrontend/data/batchexecute' ? u.searchParams.get('rpcids') : null;
      if (['maseQ', 'ogiZ0b', 'YhhmEf', 'jwpduf'].includes(rpcName)) {
        const j = JSON.parse(body || '{}');
        const out = (rows) => { const line = JSON.stringify(rows); res.writeHead(200, { 'content-type': 'application/json' }); res.end(`)]}'\n\n${line.length}\n${line}\n`); };
        const refuse = (code, reason) => out([['wrb.fr', rpcName, null, null, null, [code, null, reason ? [['type.googleapis.com/google.rpc.ErrorInfo', [reason, 'aisandbox']]] : []], 'generic']]);
        const uuid = (n, tag) => `${String(n).padStart(8, '0')}-${tag}-4ccc-8ddd-${String(Date.now()).slice(-12).padStart(12, '0')}`;
        if (rpcName === 'maseQ') {
          state.uploads.push(j);
          if (j.size < 200) return refuse(3); // gambar 1x1 ditolak Flow (gRPC 3)
          return out([['wrb.fr', 'maseQ', JSON.stringify([[uuid(state.uploads.length, 'eeee'), 'p-test-1'], j.name]), null, null, null, 'generic']]);
        }
        if (rpcName === 'jwpduf') {
          state.polls++;
          const g = generated.find((x) => x.wf === j.wf);
          if (!g) return refuse(5);
          g.polls = (g.polls || 0) + 1;
          const failed = g.fail && g.polls > 1;
          return out([['wrb.fr', 'jwpduf', JSON.stringify([failed ? 'failed' : g.fail ? 'running' : 'done', [[g.wf, 'aaaaaaaa-0000-4000-8000-000000000001', g.mediaId, null, null, [null, null, null, null, null, null, null, null, failed ? [7, [13, 'Audio generation failed for this prompt']] : [g.fail ? 2 : 3]]]]]), null, null, null, 'generic']]);
        }
        if (state.blockNext > 0) { state.blockNext--; return refuse(8, 'PUBLIC_ERROR_UNUSUAL_ACTIVITY'); }
        if (rpcName === 'ogiZ0b' && state.unsafeNext > 0) { state.unsafeNext--; return refuse(3, 'PUBLIC_ERROR_UNSAFE_GENERATION'); }
        const fail = rpcName === 'YhhmEf' && state.failNext > 0;
        if (fail) state.failNext--;
        const n = generated.length + 1;
        const id = '0000000' + n + '-aaaa-bbbb-cccc-111122223333';
        const wf = uuid(n, 'ffff');
        generated.push({ ...j, wf, mediaId: id, fail });
        if (!fail) media.push({ id, prompt: j.prompt, files: j.refs, at: Date.now() - (rpcName === 'ogiZ0b' ? 5000 : 0) });
        const pid = j.project || 'p-test-1';
        if (rpcName === 'ogiZ0b') return out([['wrb.fr', 'ogiZ0b', JSON.stringify([pid, [[id, null, wf, null, null, null, [['https://flow-content.google/image/' + id + '?sig=1', 1024, 1024]]]]]), null, null, null, 'generic']]);
        return out([['wrb.fr', 'YhhmEf', JSON.stringify([pid, { wf }, [[wf, 'aaaaaaaa-0000-4000-8000-000000000001', id, null, null, [null, null, null, null, null, null, null, null, [6]]]]]), null, null, null, 'generic']]);
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
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve({ server, port, media, generated, state }); }));
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
  assert.strictEqual(mock.generated[0].prompt, 'Prompt kedua menggantikan');
  assert.deepStrictEqual(mock.generated[0].files, ['referensi.png']);
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

test('Kartu login → mode tersembunyi → project baru → setelan Flow → cadangan otomatis', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 180000 }, async (t) => {
  const { existingDebugPort } = require('../src/main/browser');
  const mock = await mockFlow();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-hidden-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const flowUrl = `${base}/?view=landing&ce=1`;
  const profileDir = path.join(tmp, 'profile');
  const s = new FlowSession({
    profileDir, getBrowser: () => ({ path: CHROME }), flowUrl, getMode: () => 'hidden',
    loginUrl: `${base}/mock-login?continue=${encodeURIComponent(flowUrl)}`,
    agentCfg: { mediaHosts: ['127.0.0.1'], allowHttp: true }, extraArgs: EXTRA
  });
  t.after(async () => { await s.closeBrowser(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1) kartu login: jendela --app, tidak dikendalikan; selesai saat Google mengalihkan ke Flow → kartu ditutup
  const states = [];
  s.on('login', (x) => states.push(x));
  const lr = await s.loginCard({ card: { x: 100, y: 100, width: 460, height: 640 }, timeoutMs: 30000 });
  assert.deepStrictEqual(lr, { ok: true });
  assert.deepStrictEqual(states, ['card', 'done']);
  assert.strictEqual(await existingDebugPort(profileDir), null, 'kartu login sudah ditutup');

  // 2) sambung dalam mode tersembunyi: UA & Client Hints tanpa "Headless"
  await s.connect();
  assert.strictEqual(s.mode, 'hidden');
  assert.strictEqual(fs.readFileSync(path.join(profileDir, 'fc-mode'), 'utf8'), 'hidden');
  const page = await s.ensurePage();
  const ua = (await page.send('Runtime.evaluate', { expression: 'JSON.stringify([navigator.userAgent, (navigator.userAgentData||{brands:[]}).brands.map(b=>b.brand)])', returnByValue: true })).result.value;
  assert.doesNotMatch(ua, /Headless/i, 'tidak ada jejak HeadlessChrome: ' + ua);
  assert.match(ua, /Chrome\/\d+/);

  // 3) project baru: halaman sambutan → "Create with Google Flow" → beranda → "New project"
  const np = await s.newProject();
  assert.strictEqual(np.projectId, 'p-new-1');
  assert.strictEqual((await s.status()).projectId, 'p-new-1');

  // 4) setelan Flow lewat klik asli di panel setelan
  const r1 = await s.applySettings({ kind: 'image', model: 'Nano Banana Pro', ratio: '9:16', count: 3 });
  assert.deepStrictEqual(r1.missing, []);
  let cur = (await page.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__settings)', returnByValue: true })).result.value;
  assert.deepStrictEqual(JSON.parse(cur), { kind: 'image', sub: 'ingredients', ratio: '9:16', count: '3', duration: '8', model: 'Nano Banana Pro' });
  assert.strictEqual(await s.call('overlayOpen'), false, 'panel setelan ditutup lagi');
  const scan = await s.scanSettings();
  assert.deepStrictEqual(scan.models, ['Nano Banana 2', 'Nano Banana Pro', 'Imagen 4']);

  // 5) generate: Flow menolak di mode tersembunyi → otomatis pindah ke jendela diperkecil lalu ulang sekali
  mock.state.blockNext = 1;
  const orig = s.waitForNew.bind(s);
  s.waitForNew = (before, o) => orig(before, { ...o, intervalMs: 700 });
  const logs = [];
  let fell = null;
  const res = await s.generate(
    { prompt: 'Penari kecak saat senja, sinematik', options: { kind: 'video', sub: 'frames', model: 'Veo 3.1 - Quality', ratio: '16:9', count: 1, duration: 6 } },
    { onLog: (x) => logs.push(x), timeoutMs: 30000, onFallback: (v) => { fell = v; } }
  );
  assert.ok(fell && fell.suspect && /unusual activity/.test(fell.error), 'penolakan terdeteksi');
  assert.strictEqual(res.fellBack, true);
  assert.strictEqual(s.mode, 'minimized');
  assert.strictEqual(res.projectId, 'p-new-1', 'project yang sama dibuka lagi setelah cadangan');
  assert.strictEqual(res.items.length, 1);
  assert.ok(logs.some((l) => /jendela diperkecil/.test(l)));
  const g = mock.generated[mock.generated.length - 1];
  assert.strictEqual(g.prompt, 'Penari kecak saat senja, sinematik');
  assert.deepStrictEqual(g.settings, { kind: 'video', sub: 'frames', ratio: '16:9', count: '1', duration: '6', model: 'Veo 3.1 - Quality' });

  // 6) tanpa penolakan: generate berikutnya langsung jalan
  const res2 = await s.generate({ prompt: 'Sawah terasering Bali, drone', options: { kind: 'image', model: 'Imagen 4', ratio: '1:1', count: 1 } }, { timeoutMs: 30000 });
  assert.strictEqual(res2.fellBack, false);
  assert.strictEqual(res2.settings.missing.length, 0);
  assert.strictEqual(mock.generated[mock.generated.length - 1].settings.model, 'Imagen 4');
  await sleep(10);
});

test('Skill Foto: unggah referensi ke Flow → @ chip → generate gambar → hasil; kegagalan terdeteksi cepat', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 240000 }, async (t) => {
  const mock = await mockFlow();
  mock.state.rpc = true;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-photo-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const s = new FlowSession({
    profileDir: path.join(tmp, 'profile'), getBrowser: () => ({ path: CHROME }),
    flowUrl: `${base}/?ce=1`, agentCfg: { mediaHosts: ['127.0.0.1', 'flow-content.google'], allowHttp: true }, extraArgs: EXTRA
  });
  t.after(async () => { await s.closeBrowser(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  await s.connect();
  await s.navigate(`${base}/project/p-test-1?ce=1`);
  await new Promise((r) => setTimeout(r, 800));

  const kucing = path.join(tmp, 'Kucing Oren.png');
  const latar = path.join(tmp, 'latar.png');
  fs.writeFileSync(kucing, makePng(64, 64, [230, 130, 30]));
  fs.writeFileSync(latar, makePng(48, 32, [20, 90, 200]));

  // 1) unggah lewat "+" → Upload → dialog file; dikonfirmasi dari balasan maseQ Flow
  const up = await s.uploadReference(kucing, 'kucing-oren');
  assert.strictEqual(up.how, 'menu');
  assert.match(up.mediaId, /^00000001-eeee-/);
  assert.match(up.name, /^kucing-oren-[0-9a-f]{6}\.png$/);
  assert.strictEqual(mock.state.uploads.length, 1);
  assert.ok(mock.state.uploads[0].size > 200, 'file asli terunggah');

  // gambar 1x1 ditolak Flow → dilaporkan, bukan menunggu
  const tiny = path.join(tmp, 'kecil.png');
  fs.writeFileSync(tiny, PNG);
  await assert.rejects(() => s.uploadReference(tiny, 'kecil'), /UPLOAD_REJECTED/);

  // 2) skill foto: dua referensi, satu disebut di tengah prompt, satu tidak disebut (tetap ditandai)
  const logs = [];
  const res = await s.generate(
    { prompt: 'Foto @kucing-oren duduk di kafe, gaya editorial', images: [kucing, latar], tags: ['kucing-oren', 'latar'], options: { kind: 'image', model: 'Nano Banana Pro', ratio: '1:1', count: 1 } },
    { onLog: (x) => logs.push(x), timeoutMs: 60000 }
  );
  assert.strictEqual(res.items.length, 1);
  assert.deepStrictEqual(res.refs.map((r) => r.tag), ['kucing-oren', 'latar']);
  assert.deepStrictEqual(res.mentions.ok.sort(), ['kucing-oren', 'latar']);
  const g = mock.generated[mock.generated.length - 1];
  assert.strictEqual(g.settings.kind, 'image');
  assert.strictEqual(g.refs.length, 2, 'kedua gambar terpasang sebagai referensi');
  assert.match(g.prompt, /kucing-oren-[0-9a-f]{6}\s+duduk di kafe, gaya editorial$/, 'teks prompt utuh setelah chip: ' + g.prompt);
  assert.ok(logs.some((l) => /Mengunggah gambar 2\/2/.test(l)));
  assert.ok(logs.some((l) => /Tidak disebut di prompt/.test(l)));
  assert.ok(!res.items.some((i) => res.refs.some((r) => r.mediaId === i.mediaId)), 'gambar referensi bukan hasil');

  // 3) ditolak filter keamanan (balasan ogiZ0b) → gagal dalam hitungan detik
  mock.state.unsafeNext = 1;
  let t0 = Date.now();
  await assert.rejects(() => s.generate({ prompt: 'sesuatu yang ditolak', options: { kind: 'image', count: 1 } }, { timeoutMs: 120000 }), /FLOW_CONTENT_POLICY/);
  assert.ok(Date.now() - t0 < 40000, 'penolakan terdeteksi cepat');

  // 4) video gagal saat diproses (status jwpduf) → GENERATE_FAILED dengan pesan Flow
  mock.state.failNext = 1;
  t0 = Date.now();
  await assert.rejects(
    () => s.generate({ prompt: 'Penari kecak', options: { kind: 'video', sub: 'ingredients', count: 1 } }, { timeoutMs: 120000 }),
    (e) => e.message === 'GENERATE_FAILED' && /Audio generation failed|Failed/.test(e.detail || '')
  );
  assert.ok(Date.now() - t0 < 60000, 'kegagalan video terdeteksi cepat');

  // 5) @ yang menunjuk gambar yang tidak bisa ditemukan di Flow → Generate dibatalkan
  const n0 = mock.generated.length;
  const orig = s._mention.bind(s);
  s._mention = async () => false;
  await assert.rejects(() => s.generate({ prompt: '@latar pantai', images: [latar], tags: ['latar'], options: { kind: 'image', count: 1 } }, { timeoutMs: 60000 }), /REFERENCE_NOT_ATTACHED/);
  s._mention = orig;
  assert.strictEqual(mock.generated.length, n0, 'tidak ada generate tanpa referensi');

  // 6) dialog persetujuan unggah pertama Flow → pengguna diminta menyetujui sekali
  mock.state.terms = true;
  await s.navigate(`${base}/project/p-test-1?ce=1`);
  await new Promise((r) => setTimeout(r, 800));
  await assert.rejects(() => s.uploadReference(latar, 'latar', { timeoutMs: 4000 }), /UPLOAD_TERMS/);
});
