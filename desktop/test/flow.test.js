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
const HEADLESS = EXTRA.some((a) => a.startsWith('--headless'));
// Uji kartu login dengan jendela Chrome sungguhan (butuh desktop; di CI dijalankan di runner Windows)
const HEADED_ARGS = process.env.CHROME_HEADED_ARGS != null ? process.env.CHROME_HEADED_ARGS.split(' ').filter(Boolean) : null;
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

const BIGPNG = makePng(32, 32, [10, 200, 120]);

function mockFlow() {
  const media = []; // {id, prompt, files, at}
  const generated = [];
  const state = { assets: [], blockNext: 0, projects: 0, rpc: false, terms: false, unsafeNext: 0, failNext: 0, uploads: [], polls: 0, onb: [], firstRun: false, lang: null, blocked: false, homeOnly: false, changelog: null };
  let port;
  // panel setelan meniru Flow terbaru: chip "Video · 8s · x2" → dialog berisi radio + daftar model
  const settingsUi = `
  <button id="chip" aria-label="Settings trigger" aria-haspopup="dialog"><span id="chiptext">Video · 8s · x2</span><i>tune</i></button>
  <div id="panel" role="dialog" style="display:none;position:fixed;right:20px;bottom:120px;background:#fff;border:1px solid #ccc;padding:8px">
    <div role="radiogroup"><button role="radio" data-g="kind" data-v="image"><i>image</i>Image</button><button role="radio" data-g="kind" data-v="video"><i>videocam</i>Video</button></div>
    <div role="radiogroup" id="subs"><button role="radio" data-g="sub" data-v="frames">Frames</button><button role="radio" data-g="sub" data-v="ingredients">Ingredients</button></div>
    <div role="radiogroup"><button role="radio" data-g="ratio" data-v="9:16"><i>crop_9_16</i>9:16</button><button role="radio" data-g="ratio" data-v="16:9"><i>crop_16_9</i>16:9</button><button role="radio" data-g="ratio" data-v="1:1"><i>crop_square</i>1:1</button></div>
    <div role="radiogroup"><button role="radio" data-g="count" data-v="1">x1</button><button role="radio" data-g="count" data-v="2">x2</button><button role="radio" data-g="count" data-v="3">x3</button><button role="radio" data-g="count" data-v="4">x4</button></div>
    <div id="durs"><span>Durasi</span> <b id="durlab"></b><input type="range" id="dur" min="4" max="8" step="1" aria-label="Durasi"></div>
    <button id="modelbtn" aria-haspopup="listbox"><span id="modeltext">Veo 3.1 - Fast</span><i>arrow_drop_down</i></button>
  </div>
  <div id="models" role="listbox" style="display:none;position:fixed;right:20px;bottom:40px;background:#fff;border:1px solid #ccc"></div>`;
  const settingsJs = `
var S={kind:'video',sub:'ingredients',ratio:'16:9',count:'2',duration:'6',model:'Veo 3.1 - Fast'};window.__settings=S;
var MODELS={video:['Omni 1.2 Flash','Omni 1.1 Flash','Veo 3.1 - Lite','Veo 3.1 - Fast','Veo 3.1 - Quality'],image:['🍌 Nano Banana Pro','🍌 Nano Banana 2 Lite','🍌 Nano Banana 2.1']};
// durasi = penggeser seperti Flow ("Durasi 10 Dtk"): Omni maks. 10 dtk, Veo maks. 8 dtk
var dur=document.getElementById('dur');
function durMax(){return /Omni/.test(S.model)?10:8}
dur.addEventListener('input',function(e){if(!e.isTrusted)return;S.duration=dur.value;paint()});
function paint(){document.querySelectorAll('[data-g]').forEach(function(b){b.setAttribute('aria-checked',String(S[b.dataset.g]===b.dataset.v))});
  dur.max=String(durMax());if(Number(S.duration)>durMax())S.duration=String(durMax());dur.value=S.duration;document.getElementById('durlab').textContent=S.duration+' Dtk';
  if(window.paintFrames)paintFrames();
  document.getElementById('subs').style.display=document.getElementById('durs').style.display=S.kind==='video'?'':'none';
  document.getElementById('modeltext').textContent=S.model;document.getElementById('chiptext').textContent=(S.kind==='video'?'Video · '+S.duration+'s':'Image')+' · x'+S.count;}
paint();
document.getElementById('chip').addEventListener('click',function(e){if(!e.isTrusted)return;var p=document.getElementById('panel');p.style.display=p.style.display==='none'?'':'none'});
document.querySelectorAll('[data-g]').forEach(function(b){b.addEventListener('click',function(e){if(!e.isTrusted)return;S[b.dataset.g]=b.dataset.v;if(b.dataset.g==='kind')S.model=MODELS[S.kind][1].replace('🍌 ','');paint()})});
document.getElementById('modelbtn').addEventListener('click',function(e){if(!e.isTrusted)return;var l=document.getElementById('models');l.innerHTML=MODELS[S.kind].map(function(m){return '<div role="option" tabindex="0">'+m+'<small style="display:block">Beta Audio</small></div>'}).join('');l.style.display='';
  l.querySelectorAll('[role=option]').forEach(function(o){o.addEventListener('click',function(ev){if(!ev.isTrusted)return;S.model=o.firstChild.nodeValue.replace('🍌 ','');l.style.display='none';paint()})})});
document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;var fp=document.getElementById('fpop');if(fp&&fp.style.display!=='none'){fp.style.display='none';return}var am=document.getElementById('addmenu');if(am&&am.style.display!=='none'){am.style.display='none';return}var l=document.getElementById('models');if(l.style.display!=='none'){l.style.display='none';return}document.getElementById('panel').style.display='none'});`;
  // mode Frames: slot "Start"/"End" → pemilih aset (cari nama) → gambar terpasang sebagai frame
  const framesJs = String.raw`var FR=[null,null],fslot=0;
function paintFrames(){if(!FR)return;var w=document.getElementById('frames');w.style.display=S.kind==='video'&&S.sub==='frames'?'':'none';
  w.innerHTML=FR.map(function(id,i){return id?'<button class="chip-container" data-id="'+id+'"><img alt=""></button>':'<button class="empty-chip" data-i="'+i+'">'+(i?'End':'Start')+'</button>'}).join('');
  w.querySelectorAll('.empty-chip').forEach(function(b){b.addEventListener('click',function(e){if(!e.isTrusted)return;fslot=Number(b.dataset.i);var fp=document.getElementById('fpop');fp.style.display='';document.getElementById('fq').value='';flist()})})}
function flist(){var q=document.getElementById('fq').value.toLowerCase(),l=document.getElementById('flist');
  l.innerHTML=assets.filter(function(a){return a.title.toLowerCase().indexOf(q)===0}).map(function(a){return '<button class="asset-item" role="option" data-id="'+a.id+'"><img alt=""><span class="asset-title">'+a.title+'</span></button>'}).join('');
  l.querySelectorAll('[role=option]').forEach(function(o){o.addEventListener('click',function(e){if(!e.isTrusted)return;FR[fslot]=o.dataset.id;document.getElementById('fpop').style.display='none';paintFrames()})})}
document.getElementById('fq').addEventListener('input',function(e){if(e.isTrusted)setTimeout(flist,200)});
paintFrames();`;
  // unggah lewat "+" → Upload, pemilih "@" yang membuat .mention-chip, kirim lewat batchexecute
  const refsJs = String.raw`var files=[], assets=(window.__assets||[]).slice(), pick={open:false,i:0,opts:[]};
// sakelar "Flow Agent" (harus mati untuk generate biasa)
document.getElementById('agentbtn').addEventListener('click',function(e){if(!e.isTrusted)return;window.__agentOn=!window.__agentOn;this.setAttribute('aria-pressed',String(window.__agentOn));fetch('/mock/agent?on='+window.__agentOn)});
// "+" → menu → "Upload media" → dialog file → unggah (maseQ)
document.getElementById('add').addEventListener('click',function(e){if(!e.isTrusted)return;var m=document.getElementById('addmenu');m.style.display=m.style.display==='none'?'':'none'});
document.getElementById('upitem').addEventListener('click',function(e){
  if(!e.isTrusted)return;
  document.getElementById('addmenu').style.display='none';
  if(window.__terms){var d=document.createElement('div');d.setAttribute('role','dialog');d.textContent='Before you upload: confirm you have the rights';document.body.appendChild(d);return}
  var inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.addEventListener('change',function(){var f=inp.files[0];if(!f)return;
    f.arrayBuffer().then(function(buf){return fetch('/_/AiSandboxAngularFrontend/data/batchexecute?rpcids=maseQ&rt=c',{method:'POST',body:JSON.stringify({name:f.name,size:buf.byteLength})})})
     .then(function(r){return r.text()}).then(function(t){var m=/"([0-9a-f]{8}-[0-9a-f-]{27})/.exec(t.replace(/\\/g,''));if(m)assets.push({id:m[1],title:f.name});
       // Flow terbaru: foto yang baru diunggah bisa langsung terbuka di tampilan EDIT (prompt di sana = mengedit foto itu)
       if(m&&window.__editAfterUpload)history.pushState({},'',location.pathname.replace(/\/$/,'')+'/edit/'+m[1]+location.search)});
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
  var body={prompt:val(),files:files,refs:refs,frames:FR.filter(Boolean),settings:Object.assign({},S),ua:navigator.userAgent,path:location.pathname,agent:!!window.__agentOn,project:(/\/project\/([\w-]+)/.exec(location.pathname)||[])[1]||null};
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
  // kartu "What's new" Flow (state.changelog = 'icon' | 'svg'): muncul sesaat setelah project terbuka, TIDAK tertutup
  // dengan Escape; panah (tanpa teks) → … → halaman terakhir baru "Get started" aktif (sebelumnya hanya diredupkan)
  const changelogCard = () => {
    if (!state.changelog) return '';
    const next = state.changelog === 'svg' ? '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 11h12l-5-5 1.4-1.4L20 12l-7.4 7.4L11 18l5-5H4z"/></svg>' : '<i class="google-symbols">arrow_forward</i>';
    const back = state.changelog === 'svg' ? '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M20 11H8l5-5-1.4-1.4L4 12l7.4 7.4L13 18l-5-5h12z"/></svg>' : '<i class="google-symbols">arrow_back</i>';
    const pages = state.changelog === 'svg' ? 2 : 3;
    return `<div id="chbd" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50"></div>
<div role="dialog" aria-modal="true" id="chl" style="display:none;position:fixed;left:25%;top:5%;width:50%;height:85%;background:#222;color:#eee;padding:16px;z-index:51;box-sizing:border-box">
<h2 id="cht">A faster, easier-to-reach Flow Agent</h2><p>Click Read More or Use side panel to open the full chat view.</p>
<button id="chback" style="display:none;position:absolute;left:16px;bottom:70px;width:45%;height:32px">${back}</button>
<button id="chnext" style="position:absolute;right:16px;bottom:70px;width:45%;height:32px">${next}</button>
<button id="chall" style="position:absolute;left:16px;bottom:16px">View all changelogs</button>
<button id="chgo" style="position:absolute;right:16px;bottom:16px;opacity:.4">Get started</button></div>
<script>(function(){var p=0,N=${pages},T=['A faster, easier-to-reach Flow Agent','Smarter search in your projects','Tool Builder upgrades'];
function $(i){return document.getElementById(i)}
function paint(){$('cht').textContent=T[p];$('chnext').style.display=p<N-1?'block':'none';$('chback').style.display=p>0?'block':'none';$('chgo').style.opacity=p===N-1?'1':'.4'}
setTimeout(function(){$('chbd').style.display='block';$('chl').style.display='block';paint()},700);
$('chnext').addEventListener('click',function(e){if(!e.isTrusted)return;p=Math.min(N-1,p+1);paint()});
$('chback').addEventListener('click',function(e){if(!e.isTrusted)return;fetch('/mock/onb?step=BACK');p=Math.max(0,p-1);paint()});
$('chall').addEventListener('click',function(){fetch('/mock/onb?step=CHANGELOGS')});
$('chgo').addEventListener('click',function(e){if(!e.isTrusted)return;if(p<N-1){fetch('/mock/onb?step=EARLY');return}fetch('/mock/onb?step=changelog');$('chbd').remove();$('chl').remove()});
})();</script>`;
  };
  const page = (signedIn, ce) => `<!doctype html><html lang="id"><head><title>Film Saya - Google Flow</title></head><body>
<script>window.WIZ_global_data=${JSON.stringify(signedIn ? { SNlM0e: 'AT_TOKEN', oPEP7c: 'kreator@gmail.com', cfb2h: 'bl1', FdrFJe: 'sid' } : {})};window.__rpc=${state.rpc};window.__terms=${state.terms};window.__editAfterUpload=${!!state.editAfterUpload};window.__agentOn=${!!state.agentOn};window.__assets=${state.persistAssets ? JSON.stringify(state.assets.map((a) => ({ id: a.id, title: a.name }))) : '[]'};</script>
<header><button aria-label="Setelan"><i>settings</i></button><button aria-label="Tambah media" id="add"><i>add</i></button><button aria-label="Flow Agent" id="agentbtn" aria-pressed="${!!state.agentOn}"><i>auto_awesome</i></button></header>
<div class="cdk-overlay-pane" id="addmenu" role="menu" style="display:none;position:fixed;left:20px;top:50px;background:#fff;border:1px solid #ccc"><button role="menuitem" id="upitem"><i>upload</i>Upload media</button><button role="menuitem"><i>photo_library</i>Library</button></div>
<flow-add-menu-popover-content id="fpop" style="display:none;position:fixed;left:20px;bottom:200px;background:#fff;border:1px solid #ccc"><input type="text" id="fq" aria-label="Search assets"><div id="flist"></div></flow-add-menu-popover-content>
<div class="cdk-overlay-pane" id="pk" style="display:none;position:fixed;left:20px;bottom:160px;background:#fff;border:1px solid #ccc"></div>
<div id="tiles"></div>
<main><flow-prompt-box class="composer">
  <input type="file" accept="image/*" multiple style="display:none" id="file">
  <div id="chips"></div>
  <div id="frames"></div>
  ${ce ? '<div contenteditable="true" role="textbox" aria-label="Prompt" id="prompt" style="min-height:40px;border:1px solid #ccc"></div>' : '<textarea aria-label="Prompt" id="prompt" rows="3"></textarea>'}
  ${settingsUi}
  <button id="gen" aria-label="Buat" disabled><i>arrow_forward</i></button>
  <div id="alerts"></div>
</flow-prompt-box></main>
<script>
${settingsJs}
${refsJs}
${framesJs}
document.getElementById('file').addEventListener('change',function(e){files=[].map.call(e.target.files,function(f){return f.name});document.getElementById('chips').textContent=files.join(',')});
function val(){var p=document.getElementById('prompt');return p.tagName==='TEXTAREA'?p.value:p.innerText}
document.getElementById('prompt').addEventListener('input',function(){document.getElementById('gen').disabled=!val().trim()});
${genJs}
</script>${changelogCard()}</body></html>`;
  // beranda Flow (daftar project + tombol "New project") & halaman sambutan publik
  // akun baru (state.firstRun): dialog syarat (centang dulu) → dialog sambutan (dengan tawaran langganan yang TIDAK boleh
  // diklik); bahasa akun tak dikenal (state.lang) → label "New project" hanya bila ?hl=en; state.blocked → Flow tidak tersedia
  const home = (q, hl) => `<!doctype html><html><head><title>Google Flow</title></head><body>
<script>window.WIZ_global_data={SNlM0e:'AT_TOKEN',oPEP7c:'kreator@gmail.com',cfb2h:'bl1',FdrFJe:'sid'};</script>
<header><button aria-label="Akun"><i>account_circle</i></button></header>
${state.blocked ? '<main><h1>Flow isn’t available in your country yet</h1><p>We’re working to bring Flow to more places.</p></main>' : `<main><div class="grid"><a href="#" id="old">Project lama</a><button id="np"><i>add_2</i><span>${state.lang && hl !== 'en' ? 'Proyèk Énggal Pisan' : 'New project'}</span></button></div></main>`}
${state.firstRun ? `<div role="dialog" aria-modal="true" id="terms" style="position:fixed;inset:20%;background:#fff;border:1px solid #888;padding:12px"><h2>Welcome to Flow</h2><p>Review the Terms of Service.</p>
<label><input type="checkbox" id="agreecb"> I agree to the Google Terms of Service</label> <button id="tcont" disabled>Continue</button></div>
<div role="dialog" id="tour" style="display:none;position:fixed;inset:25%;background:#fff;border:1px solid #888;padding:12px"><p>Here's how Flow works</p><button id="pro">Upgrade to Google AI Pro</button> <button id="gotit">Got it</button></div>
<script>
var cb=document.getElementById('agreecb'),tc=document.getElementById('tcont');
cb.addEventListener('change',function(e){if(!e.isTrusted)return;tc.disabled=!cb.checked});
tc.addEventListener('click',function(e){if(!e.isTrusted)return;fetch('/mock/onb?step=terms');document.getElementById('terms').remove();document.getElementById('tour').style.display='block'});
document.getElementById('gotit').addEventListener('click',function(e){if(!e.isTrusted)return;fetch('/mock/onb?step=tour');document.getElementById('tour').remove()});
document.getElementById('pro').addEventListener('click',function(){fetch('/mock/onb?step=UPSELL')});
</script>` : ''}
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
      if (req.method === 'GET' && u.pathname === '/' && (u.searchParams.get('view') === 'home' || (state.homeOnly && !u.searchParams.get('view')))) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(home(keep, u.searchParams.get('hl'))); }
      if (u.pathname === '/mock/onb') { state.onb.push(u.searchParams.get('step')); if (state.firstRun && u.searchParams.get('step') === 'tour') state.firstRun = false; if (u.searchParams.get('step') === 'changelog') state.changelog = null; res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && u.pathname === '/mock-login') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        // state.rejectLogin = n → Google menolak n kali berikutnya ("This browser or app may not be secure")
        const to = state.rejectLogin > 0 ? (state.rejectLogin--, 'https://accounts.google.com/v3/signin/rejected?rrk=46&hl=en') : null;
        return res.end('<!doctype html><title>Login</title><p>Masuk…</p><script>fetch("/mock/wd?v="+navigator.webdriver);setTimeout(function(){location.href=' + (to ? JSON.stringify(to) : 'new URLSearchParams(location.search).get("continue")') + '},1200)</script>');
      }
      if (u.pathname === '/mock/agent') { state.agentOn = u.searchParams.get('on') === 'true'; res.writeHead(204); return res.end(); }
      if (u.pathname === '/mock/wd') { state.webdriver = u.searchParams.get('v'); res.writeHead(204); return res.end();
      }
      if (u.pathname === '/mock/project') { state.projects++; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ id: 'p-new-' + state.projects })); }
      if (req.method === 'GET' && (u.pathname === '/' || u.pathname.startsWith('/project/'))) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'fc_sess=1; Path=/; HttpOnly' });
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
          const upId = uuid(state.uploads.length, 'eeee');
          state.assets.push({ id: upId, name: j.name, at: Date.now() - 5000 }); // Flow mencatat unggahan di project juga
          return out([['wrb.fr', 'maseQ', JSON.stringify([[upId, 'p-test-1'], j.name]), null, null, null, 'generic']]);
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
        if (rpcName === 'ogiZ0b' && state.v2) {
          // Flow 2026-11: satu generate xN → N record gambar berbagi SATU workflow; URL bertanda tangan di detail[13]
          const count = Math.max(1, Number((j.settings || {}).count) || 1);
          const wf = uuid(generated.length + 1, 'ffff');
          const pid = j.project || 'p-test-1';
          const tuples = [];
          for (let i = 0; i < count; i++) {
            const id = uuid(media.length + 1, 'abcd');
            const det = Array(14).fill(null);
            det[1] = 1000 + i; det[7] = j.prompt; det[13] = `https://flow-content.google/image/${id}?Expires=1&Signature=x`;
            media.push({ id, wf, v2: true, hidden: !!state.lag, prompt: j.prompt, files: j.refs, at: Date.now() - 5000 });
            tuples.push([id, null, wf, null, null, null, [det, null, [1376, 768]]]);
          }
          generated.push({ ...j, wf, mediaId: tuples[0][0] });
          return out([['wrb.fr', 'ogiZ0b', JSON.stringify([pid, tuples, [[wf, null, null, [j.prompt.slice(0, 30), [Math.floor(Date.now() / 1000), 0], false], pid]]]), null, null, null, 'generic']]);
        }
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
          const rows = media.filter((m) => !m.v2).map((m) => ['asset-' + m.id, 'f', null, [m.prompt.slice(0, 30), [Math.floor(m.at / 1000), 0], false, null, m.id, 'op', Date.now() - m.at > 1500], 'p-test-1']);
          // format 2026-11: baris workflow TANPA media id + record gambar 7 slot (tanpa status) per gambar
          const v2 = media.filter((m) => m.v2 && !m.hidden);
          for (const wf of [...new Set(v2.map((m) => m.wf))]) {
            const first = v2.find((m) => m.wf === wf);
            rows.push([wf, null, null, [first.prompt.slice(0, 30), [Math.floor(first.at / 1000), 0], false], 'p-test-1']);
          }
          for (const m of v2) { const det = Array(14).fill(null); det[13] = `http://127.0.0.1:${port}/image/${m.id}?sig=1`; rows.push([m.id, null, m.wf, null, null, null, [det, null, [1376, 768]]]); }
          if (state.rpc) {
            // Flow 2026: poster di dalam record sebagai /asb/<token> (tanpa media id, butuh cookie) + unggahan ikut terdaftar
            const old = media.filter((m) => !m.v2);
            rows.slice(0, old.length).forEach((r, i) => r.push([[null, `http://127.0.0.1:${port}/asb/tok${i}x${old[i].id.slice(0, 8)}=w512`]]));
            for (const a of state.assets) rows.push(['asset-' + a.id, 'f', null, [a.name, [Math.floor(a.at / 1000), 0], false, null, a.id, 'op', true], 'p-test-1', [[null, `http://127.0.0.1:${port}/asb/up${a.id.slice(0, 8)}=w512`]]]);
            payload = [rows, []];
          } else payload = [rows, media.map((m) => `http://127.0.0.1:${port}/image/${m.id}?sig=1`)];
        } else if (rpc === 'as29s') {
          const id = JSON.parse(JSON.parse(params.get('f.req'))[0][0][1])[0];
          payload = [[`http://127.0.0.1:${port}/image/${id}?sig=2`]];
        }
        const line = JSON.stringify([['wrb.fr', rpc, JSON.stringify(payload), null, null, null, 'generic']]);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(`)]}'\n\n${line.length}\n${line}\n`);
      }
      if (u.pathname.startsWith('/asb/')) {
        if (!/(^|;\s*)fc_sess=1/.test(req.headers.cookie || '')) { res.writeHead(403, { 'content-type': 'text/html' }); return res.end('<html>login</html>'); }
        res.writeHead(200, { 'content-type': 'image/png' });
        return res.end(BIGPNG);
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
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows: file terkunci */ } });

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
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
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
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1) kartu login: jendela --app, tidak dikendalikan; selesai saat Google mengalihkan ke Flow → kartu ditutup
  const states = [];
  s.on('login', (x) => states.push(x));
  const lr = await s.loginCard({ card: { x: 100, y: 100, width: 460, height: 640 }, timeoutMs: 30000 });
  assert.deepStrictEqual(lr, { ok: true });
  assert.deepStrictEqual(states, ['card', 'done']);
  assert.strictEqual(await existingDebugPort(profileDir), null, 'kartu login sudah ditutup');
  // halaman login Google harus melihat browser biasa: navigator.webdriver = false (tanpa port debug/CDP).
  // Chrome headless selalu true, jadi hanya diperiksa bila headed (lihat uji "Kartu login (Chrome asli…)").
  if (!HEADLESS) assert.strictEqual(mock.state.webdriver, 'false', 'Google menolak login bila navigator.webdriver = true');
  else assert.ok(mock.state.webdriver, 'halaman login dimuat');
  assert.ok(!fs.existsSync(path.join(profileDir, 'fc-login-netlog.json')), 'log jaringan login dihapus');

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
  assert.deepStrictEqual(JSON.parse(cur), { kind: 'image', sub: 'ingredients', ratio: '9:16', count: '3', duration: '6', model: 'Nano Banana Pro' });
  assert.strictEqual(await s.call('overlayOpen'), false, 'panel setelan ditutup lagi');
  const scan = await s.scanSettings();
  assert.deepStrictEqual(scan.models, ['Nano Banana Pro', 'Nano Banana 2 Lite', 'Nano Banana 2.1']);

  // 5) generate: Flow menolak di mode tersembunyi → otomatis pindah ke jendela diperkecil lalu ulang sekali
  mock.state.blockNext = 1;
  const orig = s.waitForNew.bind(s);
  s.waitForNew = (before, o) => orig(before, { ...o, intervalMs: 700 });
  const logs = [];
  let fell = null;
  const res = await s.generate(
    { prompt: 'Penari kecak saat senja, sinematik', options: { kind: 'video', sub: 'ingredients', model: 'Veo 3.1 - Quality', ratio: '16:9', count: 1, duration: 6 } },
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
  // Veo → durasi 8 detik (penggeser Flow digeser dengan tombol End), durasi lain yang diminta diabaikan
  assert.deepStrictEqual(g.settings, { kind: 'video', sub: 'ingredients', ratio: '16:9', count: '1', duration: '8', model: 'Veo 3.1 - Quality' });

  // mode Frame tanpa foto awal & akhir → ditolak sebelum menyentuh Flow
  const n0 = mock.generated.length;
  await assert.rejects(() => s.generate({ prompt: 'x', options: { kind: 'video', sub: 'frames', model: 'Omni 1.2 Flash' } }, { timeoutMs: 30000 }), /FRAMES_REQUIRED/);
  await assert.rejects(() => s.prepare({ prompt: 'x', images: ['/a.png'], options: { kind: 'video', sub: 'frames' } }), /FRAMES_REQUIRED/);
  assert.strictEqual(mock.generated.length, n0);

  // 6) tanpa penolakan: generate berikutnya langsung jalan; model yang tidak ada di Flow → Nano Banana 2.1
  const res2 = await s.generate({ prompt: 'Sawah terasering Bali, drone', options: { kind: 'image', model: 'Imagen 4', ratio: '1:1', count: 1 } }, { timeoutMs: 30000 });
  assert.strictEqual(res2.fellBack, false);
  assert.strictEqual(res2.settings.missing.length, 0);
  assert.strictEqual(mock.generated[mock.generated.length - 1].settings.model, 'Nano Banana 2.1');
  await sleep(10);
});

test('Kartu login: proses browser lama (berport debug, tak dikenal aplikasi) ditutup dulu; Google menolak → dibuka ulang sekali, lalu LOGIN_REJECTED', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 180000 }, async (t) => {
  const browser = require('../src/main/browser');
  const mock = await mockFlow();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-reject-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const flowUrl = `${base}/?view=landing&ce=1`;
  const profileDir = path.join(tmp, 'profile');
  const s = new FlowSession({
    profileDir, getBrowser: () => ({ path: CHROME }), flowUrl, getMode: () => 'hidden',
    loginUrl: `http://localhost:${mock.port}/mock-login?continue=${encodeURIComponent(flowUrl)}`,
    agentCfg: { mediaHosts: ['127.0.0.1'], allowHttp: true }, extraArgs: EXTRA
  });
  t.after(async () => { await browser.killProfile(profileDir).catch(() => {}); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  // halaman login di host lain (localhost) daripada Flow (127.0.0.1) — seperti accounts.google.com ↔ flow.google.com

  // browser Flow tersembunyi yang "tertinggal": masih berjalan dengan port debug, tetapi file port-nya hilang
  const orphan = browser.launchBrowser({ exe: CHROME, profileDir, url: 'about:blank', debug: true, mode: 'hidden', extraArgs: EXTRA });
  await browser.waitForDebugPort(profileDir);
  fs.rmSync(path.join(profileDir, 'DevToolsActivePort'), { force: true });
  assert.strictEqual(await browser.existingDebugPort(profileDir), null, 'aplikasi tidak lagi mengenali proses itu');
  const found = await browser.profileProcesses(profileDir);
  assert.ok(found.some((p) => p.pid === orphan.pid && p.main && p.debug), 'proses lama ditemukan dari baris perintah: ' + JSON.stringify(found));

  // 1) Google menolak sekali → kartu ditutup, dibuka ulang di proses baru → berhasil
  mock.state.rejectLogin = 1;
  const states = [];
  s.on('login', (x) => states.push(x));
  const t1 = Date.now();
  const lr = await s.loginCard({ card: { x: 100, y: 100, width: 460, height: 640 }, timeoutMs: 90000 });
  console.log('tolak → ulang → berhasil setelah', Date.now() - t1, 'ms');
  assert.deepStrictEqual(lr, { ok: true });
  assert.deepStrictEqual(states, ['card', 'retry', 'card', 'done']);
  assert.ok(!alive(orphan.pid), 'proses berport debug yang lama sudah ditutup sebelum kartu login dibuka');
  assert.deepStrictEqual(await browser.profileProcesses(profileDir), [], 'kartu login juga sudah ditutup');

  // 2) masih ditolak setelah dibuka ulang → LOGIN_REJECTED (tidak menunggu sampai batas waktu)
  mock.state.rejectLogin = 2;
  const t0 = Date.now();
  await assert.rejects(() => s.loginCard({ card: { x: 100, y: 100, width: 460, height: 640 }, timeoutMs: 120000 }), /LOGIN_REJECTED/);
  console.log('LOGIN_REJECTED setelah', Date.now() - t0, 'ms');
  assert.ok(Date.now() - t0 < 90000, 'penolakan terdeteksi tanpa menunggu batas waktu kartu (120 dtk)');
  assert.deepStrictEqual(await browser.profileProcesses(profileDir), []);

  // 3) "login di browser biasa" juga menutup proses lama profil ini lebih dulu
  const orphan2 = browser.launchBrowser({ exe: CHROME, profileDir, url: 'about:blank', debug: true, mode: 'hidden', extraArgs: EXTRA });
  await browser.waitForDebugPort(profileDir);
  fs.rmSync(path.join(profileDir, 'DevToolsActivePort'), { force: true });
  await s.openForLogin();
  assert.ok(!alive(orphan2.pid), 'proses lama ditutup sebelum browser biasa dibuka');
  await new Promise((r) => setTimeout(r, 1500));
  const plain = await browser.profileProcesses(profileDir);
  assert.ok(plain.length && plain.every((p) => !p.debug), 'browser biasa tanpa port debug: ' + JSON.stringify(plain));
});

test('Kartu login (Chrome asli berjendela): tanpa port debug → navigator.webdriver=false, Google tidak menolak', { skip: !(CHROME && HEADED_ARGS) && 'set CHROME_HEADED_ARGS (butuh desktop)', timeout: 120000 }, async (t) => {
  const { existingDebugPort } = require('../src/main/browser');
  const mock = await mockFlow();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-card-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const flowUrl = `${base}/?view=landing&ce=1`;
  const profileDir = path.join(tmp, 'profile');
  const s = new FlowSession({
    profileDir, getBrowser: () => ({ path: CHROME }), flowUrl, getMode: () => 'normal',
    loginUrl: `${base}/mock-login?continue=${encodeURIComponent(flowUrl)}`, extraArgs: HEADED_ARGS
  });
  t.after(() => { mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  const lr = await s.loginCard({ card: { x: 100, y: 100, width: 460, height: 640 }, timeoutMs: 60000 });
  assert.deepStrictEqual(lr, { ok: true });
  assert.strictEqual(mock.state.webdriver, 'false', 'navigator.webdriver harus false agar Google mengizinkan login');
  assert.strictEqual(await existingDebugPort(profileDir), null);
  assert.ok(!fs.existsSync(path.join(profileDir, 'fc-login-netlog.json')), 'log jaringan login dihapus');
});

test('Gambar x4 (format Flow terbaru): semua hasil tampil di galeri & pratinjau, juga saat daftar Flow terlambat', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 180000 }, async (t) => {
  const mock = await mockFlow();
  mock.state.rpc = true;
  mock.state.v2 = true;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-x4-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const known = new Map();
  const s = new FlowSession({
    profileDir: path.join(tmp, 'profile'), getBrowser: () => ({ path: CHROME }), known,
    flowUrl: `${base}/?ce=1`, agentCfg: { mediaHosts: ['127.0.0.1', 'flow-content.google'], allowHttp: true }, extraArgs: EXTRA
  });
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  const events = [];
  s.on('results', (pid, list) => events.push([pid, list.length]));
  await s.connect();
  await s.navigate(`${base}/project/p-test-1?ce=1`);
  await new Promise((r) => setTimeout(r, 800));

  // 1) 4 gambar dalam satu generate (satu workflow) → keempatnya terbaca dari record gambar di daftar Flow
  const res = await s.generate({ prompt: "Candi Borobudur saat kabut pagi", options: { kind: "image", model: "Nano Banana 2.1", ratio: "16:9", count: 4 } }, { timeoutMs: 60000 });
  assert.strictEqual(mock.generated[mock.generated.length - 1].settings.count, '4');
  assert.strictEqual(res.items.length, 4, '4 hasil');
  assert.ok(res.items.every((i) => i.done && i.image && i.image.includes('/image/' + i.mediaId)), 'setiap hasil punya URL gambarnya sendiri');
  const gal = await s.listMedia('p-test-1', { known: false });
  assert.deepStrictEqual(gal.map((i) => i.mediaId).sort(), res.items.map((i) => i.mediaId).sort(), 'galeri Flow memuat keempat gambar (tanpa baris workflow palsu)');
  assert.ok(gal.every((i) => i.done && i.image && i.title.startsWith('Candi Borobudur')), 'gambar siap + judul dari workflow');
  const th = await s.fetchMedia(gal[0].image);
  assert.match(th.mime, /^image\//);

  // 2) daftar Flow terlambat (gambar belum terdaftar) → hasil dari balasan generate tetap tampil di galeri
  mock.state.lag = true;
  const res2 = await s.generate({ prompt: "Pantai Kuta saat senja", options: { kind: "image", count: 4 } }, { timeoutMs: 60000 });
  assert.strictEqual(res2.items.length, 4);
  const flowOnly = (await s.listMedia('p-test-1', { known: false })).map((i) => i.mediaId);
  assert.ok(res2.items.every((i) => !flowOnly.includes(i.mediaId)), 'daftar Flow memang belum memuatnya');
  const all = await s.listMedia('p-test-1');
  assert.strictEqual(all.length, 8, 'galeri aplikasi: 8 hasil');
  assert.ok(res2.items.every((i) => all.some((x) => x.mediaId === i.mediaId && x.done && x.image)), 'hasil terbaru tampil & siap');
  assert.ok(all.slice(0, 4).every((x) => res2.items.some((i) => i.mediaId === x.mediaId)), 'hasil terbaru di depan (pratinjau)');
  assert.deepStrictEqual(events.map((e) => e[1]), [4, 8], 'hasil dicatat untuk disimpan');
  assert.strictEqual(known.get('p-test-1').length, 8);

  // 3) setelah Flow mendaftarkannya: tidak ganda
  mock.media.forEach((m) => { m.hidden = false; });
  assert.strictEqual((await s.listMedia('p-test-1')).length, 8, 'tanpa duplikat');
});

test('Skill Foto: unggah referensi ke Flow → @ chip → generate gambar → hasil; kegagalan terdeteksi cepat', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 360000 }, async (t) => {
  const mock = await mockFlow();
  mock.state.rpc = true;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-photo-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const s = new FlowSession({
    profileDir: path.join(tmp, 'profile'), getBrowser: () => ({ path: CHROME }),
    flowUrl: `${base}/?ce=1`, agentCfg: { mediaHosts: ['127.0.0.1', 'flow-content.google'], allowHttp: true }, extraArgs: EXTRA
  });
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
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
  // pratinjau: poster /asb/ (tanpa media id di URL) dikenali dari record & diambil lewat jaringan browser (cookie)
  assert.match(res.items[0].image, /\/asb\/tok/, 'URL pratinjau ditemukan di record: ' + res.items[0].image);
  const thumb = await s.fetchMedia(res.items[0].image);
  assert.strictEqual(thumb.mime, 'image/png');
  assert.ok(thumb.buffer.equals(BIGPNG), 'thumbnail utuh lewat cookie browser');
  assert.ok((await s._browserFetch(res.items[0].image)).buffer.equals(BIGPNG), 'jaringan browser membawa cookie akun');
  await assert.rejects(() => s._browserFetch('https://evil.example/x.png'), /INVALID_URL/);
  // galeri: hanya hasil generate — gambar unggahan disembunyikan (id tercatat, dan juga dari judul nama file)
  const gal = await s.listMedia('p-test-1');
  assert.deepStrictEqual(gal.map((i) => i.mediaId), res.items.map((i) => i.mediaId));
  assert.ok(gal.every((i) => i.image && i.image.includes('/asb/tok')), 'setiap hasil punya thumbnail');
  assert.ok((await s.listMedia('p-test-1', { uploads: true })).length > gal.length, 'unggahan memang ada di project Flow');
  const known = new Set(s.uploads);
  s.uploads.clear();
  assert.strictEqual((await s.listMedia('p-test-1')).length, gal.length, 'unggahan lama (tanpa catatan) juga disaring');
  known.forEach((x) => s.uploads.add(x));

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

  // 4b) mode Frame: foto awal & akhir diunggah lalu dipasang ke slot Start/End; Omni → durasi 10 detik
  const fr = await s.generate(
    { prompt: 'Kucing berlari ke arah kamera', images: [kucing, latar], tags: ['kucing-oren', 'latar'], options: { kind: 'video', sub: 'frames', model: 'Omni 1.2 Flash', ratio: '16:9', count: 1 } },
    { timeoutMs: 60000 }
  );
  const gf = mock.generated[mock.generated.length - 1];
  assert.deepStrictEqual(gf.settings, { kind: 'video', sub: 'frames', ratio: '16:9', count: '1', duration: '10', model: 'Omni 1.2 Flash' });
  assert.deepStrictEqual(gf.frames, fr.refs.map((r) => r.mediaId), 'frame awal = foto ke-1, frame akhir = foto ke-2');
  assert.strictEqual(gf.refs.length, 0, 'frame tidak ditandai sebagai bahan @');
  assert.strictEqual(gf.prompt.trim(), 'Kucing berlari ke arah kamera');
  assert.deepStrictEqual(fr.settings.missing, []);

  // 4c) Bulk (reuseRefs): gambar yang sama cukup diunggah sekali per project; aset lama hilang → unggah ulang otomatis
  const up0 = mock.state.uploads.length;
  const bulkJob = (prompt) => ({ prompt, images: [kucing], tags: ['kucing-oren'], reuseRefs: true, options: { kind: 'image', model: 'Nano Banana Pro', ratio: '1:1', count: 1 } });
  await s.generate(bulkJob('Foto @kucing-oren di taman'), { timeoutMs: 60000 });
  assert.strictEqual(mock.state.uploads.length, up0 + 1, 'unggahan pertama');
  // pesan galat lama yang masih tampil (sisa tugas sebelumnya) tidak boleh menggagalkan tugas berikutnya
  const evalPage = async (expression) => (await s.ensurePage()).send('Runtime.evaluate', { expression });
  await evalPage(`document.getElementById('alerts').insertAdjacentHTML('beforeend', '<div role="alert" id="stale">Something went wrong. Generation failed.</div>')`);
  const logs2 = [];
  await s.generate(bulkJob('Foto @kucing-oren di pantai'), { onLog: (x) => logs2.push(x), timeoutMs: 60000 });
  await evalPage(`document.getElementById('stale').remove()`);
  assert.strictEqual(mock.state.uploads.length, up0 + 1, 'tidak diunggah ulang');
  assert.ok(logs2.some((l) => /Memakai gambar @kucing-oren/.test(l)), logs2.join(' | '));
  const gb = mock.generated[mock.generated.length - 1];
  assert.strictEqual(gb.refs.length, 1, 'referensi lama terpasang');
  assert.match(gb.prompt, /di pantai$/);
  for (const v of s._refCache.values()) v.stem = 'sudah-dihapus-000000';
  const mention0 = s._mention.bind(s);
  s._mention = async (stem) => (stem === 'sudah-dihapus-000000' ? false : mention0(stem)); // aset lama tak ditawarkan (tanpa menunggu)
  const logs3 = [];
  await s.generate(bulkJob('Foto @kucing-oren di gunung'), { onLog: (x) => logs3.push(x), timeoutMs: 90000 });
  s._mention = mention0;
  assert.strictEqual(mock.state.uploads.length, up0 + 2, 'diunggah ulang setelah aset lama tidak ditawarkan');
  assert.ok(logs3.some((l) => /mengunggah ulang/.test(l)));
  assert.strictEqual(mock.generated[mock.generated.length - 1].refs.length, 1);

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

test('Akun Google baru: dialog syarat & sambutan ditutup, bahasa akun tak dikenal → beranda bahasa Inggris, Flow tidak tersedia → pesan jelas', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 120000 }, async (t) => {
  const mock = await mockFlow();
  Object.assign(mock.state, { firstRun: true, lang: 'su', homeOnly: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-new-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const s = new FlowSession({ profileDir: path.join(tmp, 'profile'), getBrowser: () => ({ path: CHROME }), flowUrl: `${base}/`, agentCfg: { mediaHosts: ['127.0.0.1'], allowHttp: true }, extraArgs: EXTRA });
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  await s.connect();
  await s.navigate(`${base}/`);
  await new Promise((r) => setTimeout(r, 600));
  const np = await s.newProject();
  assert.match(np.projectId, /^p-new-/);
  assert.deepStrictEqual(mock.state.onb, ['terms', 'tour'], 'syarat dicentang + Continue, lalu Got it — tawaran langganan tidak diklik');
  assert.strictEqual(mock.state.projects, 1, 'tepat satu project');
  // Flow tidak tersedia untuk akun ini → FLOW_UNAVAILABLE dengan teks Flow, tanpa menunggu lama
  Object.assign(mock.state, { blocked: true });
  const t0 = Date.now();
  await assert.rejects(() => s.newProject(), (e) => e.message === 'FLOW_UNAVAILABLE' && /available in your country/.test(e.detail));
  assert.ok(Date.now() - t0 < 20000);
});

test('Kartu "What\'s new" Flow setelah project baru (tak bisa ditutup Escape): panah berikutnya → Get started', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 120000 }, async (t) => {
  const mock = await mockFlow();
  Object.assign(mock.state, { homeOnly: true, changelog: 'icon' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-chl-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const s = new FlowSession({ profileDir: path.join(tmp, 'profile'), getBrowser: () => ({ path: CHROME }), flowUrl: `${base}/`, agentCfg: { mediaHosts: ['127.0.0.1'], allowHttp: true }, extraArgs: EXTRA });
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  await s.connect();
  await s.navigate(`${base}/`);
  await new Promise((r) => setTimeout(r, 600));
  const np = await s.newProject();
  assert.match(np.projectId, /^p-new-/);
  assert.strictEqual(mock.state.projects, 1, 'tepat satu project');
  assert.deepStrictEqual(mock.state.onb, ['changelog'], 'panah → panah → Get started; "View all changelogs" / kembali tidak diklik');
  assert.strictEqual(await s.call('overlayOpen'), false, 'kartu sudah tertutup');
  // varian ikon svg tanpa nama, ditemukan lewat _closeOverlays (dipakai sebelum mengetik prompt / setelan)
  mock.state.onb.length = 0;
  Object.assign(mock.state, { changelog: 'svg' });
  await s.navigate(`${base}/project/p-test-1?ce=1`);
  await new Promise((r) => setTimeout(r, 1400));
  assert.strictEqual(await s.call('overlayOpen'), true);
  await s._closeOverlays();
  assert.deepStrictEqual(mock.state.onb, ['changelog']);
  assert.strictEqual(await s.call('overlayOpen'), false);
});

// "AI" tiruan yang hanya membaca teks halaman yang dikirim aplikasi (seperti model sungguhan): memeriksa jalur
// pageMap → tangkapan layar bernomor → keputusan → navTarget → klik
function fakePageAi(log) {
  return async ({ text, image }) => {
    log.push({ text, image });
    const els = [...text.matchAll(/^#(\d+) (\S+) (?:"([^"]*)"|icon:(\S*))(.*?) @/gm)].map((m) => ({
      id: +m[1], role: m[2], label: m[3] || '', icon: m[4] || '', dialog: /\[D\]/.test(m[5]), disabled: /looks disabled/.test(m[5]), checked: /\(checked\)/.test(m[5])
    }));
    const pagePath = /PAGE: (\S+)/.exec(text)[1];
    const say = (o) => ({ reply: 'Baik.\n' + JSON.stringify(o), model: { id: 'm', label: 'AI Tiruan' } });
    const e = els.find((x) => x.dialog && x.role === 'checkbox' && !x.checked)
      || els.find((x) => x.dialog && !x.disabled && /arrow_forward/.test(x.icon))
      || els.find((x) => x.dialog && !x.disabled && /^(continue|get started|got it|i agree)$/i.test(x.label));
    if (e) return say({ action: 'click', id: e.id, reason: 'kartu di depan' });
    if (pagePath.startsWith('/project/')) return say({ action: 'done', reason: 'project terbuka' });
    const np = els.find((x) => /new project|proy[eè]k [eé]nggal/i.test(x.label));
    if (np) return say({ action: 'click', id: np.id, reason: 'tombol project baru' });
    return say({ action: 'wait', reason: 'memuat' });
  };
}

test('AI pembaca halaman: syarat + sambutan + bahasa asing + kartu "What\'s new" dibaca AI, satu project, tombol terlarang tidak pernah ditawarkan', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 180000 }, async (t) => {
  const mock = await mockFlow();
  Object.assign(mock.state, { firstRun: true, lang: 'su', homeOnly: true, changelog: 'icon' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-ai-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const log = [], events = [];
  let reader = fakePageAi(log);
  const s = new FlowSession({ profileDir: path.join(tmp, 'profile'), getBrowser: () => ({ path: CHROME }), flowUrl: `${base}/`, agentCfg: { mediaHosts: ['127.0.0.1'], allowHttp: true }, extraArgs: EXTRA,
    pageReader: (req) => reader(req) });
  s.on('ai', (ev) => events.push(ev));
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  await s.connect();
  await s.navigate(`${base}/`);
  await new Promise((r) => setTimeout(r, 600));
  const np = await s.newProject();
  assert.match(np.projectId, /^p-new-/);
  assert.strictEqual(mock.state.projects, 1, 'tepat satu project');
  assert.deepStrictEqual(mock.state.onb, ['terms', 'tour', 'changelog'], 'centang → Continue → Got it → panah → panah → Get started; tanpa Upgrade / changelog / kembali');
  assert.ok(np.ai && np.ai.steps >= 6 && np.ai.model === 'AI Tiruan', JSON.stringify(np.ai));
  assert.ok(log.every((x) => /^data:image\/jpeg;base64,/.test(x.image)), 'setiap langkah disertai tangkapan layar');
  assert.ok(log.some((x) => /"Proyèk Énggal Pisan"/.test(x.text)), 'tombol berbahasa lain dibaca AI tanpa pindah ke bahasa Inggris');
  assert.ok(log.some((x) => /I agree to the Google Terms of Service/.test(x.text)), 'kotak centang memakai teks labelnya');
  for (const x of log) assert.doesNotMatch(x.text.split('ELEMENTS')[1], /Upgrade|changelogs/i, 'tombol terlarang tidak masuk daftar');
  assert.strictEqual(await s.call('overlayOpen'), false);
  assert.strictEqual(await s.call('navMarks', [false]), true);
  assert.strictEqual(await s.call('pageMap').then(() => s.ensurePage()).then((p) => p.send('Runtime.evaluate', { expression: '!!document.getElementById("__fcMarks")', returnByValue: true })).then((r) => r.result.value), false, 'nomor penanda sudah dilepas');
  assert.ok(events.some((e) => e.action === 'click' && e.label === 'ikon arrow_forward'));

  // AI menjawab asal → tiga kali tidak terpakai → cara biasa tetap membuat project
  Object.assign(mock.state, { lang: null, changelog: null });
  reader = async () => ({ reply: 'Saya rasa tombol biru.', model: null });
  const np2 = await s.newProject();
  assert.match(np2.projectId, /^p-new-2$/);
  assert.strictEqual(mock.state.projects, 2);

  // batas harian AI → langsung cara biasa, AI tidak dipanggil lagi selama 10 menit
  let n = 0;
  reader = async () => { n++; throw new Error('DAILY_LIMIT'); };
  const np3 = await s.newProject();
  assert.match(np3.projectId, /^p-new-3$/);
  await s.newProject();
  assert.strictEqual(n, 1);
  assert.ok(events.some((e) => e.error === 'DAILY_LIMIT'));
});

test('Generate biasa, BUKAN edit: foto unggahan yang terbuka di tampilan edit, tampilan edit & Flow Agent → kembali ke grid dulu', { skip: !CHROME && 'Chrome tidak ditemukan (set CHROME_PATH)', timeout: 300000 }, async (t) => {
  const mock = await mockFlow();
  mock.state.rpc = true;
  mock.state.persistAssets = true; // aset unggahan tetap ada setelah halaman dimuat ulang (seperti Flow asli)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-noedit-'));
  const base = `http://127.0.0.1:${mock.port}`;
  const s = new FlowSession({
    profileDir: path.join(tmp, 'profile'), getBrowser: () => ({ path: CHROME }),
    flowUrl: `${base}/?ce=1`, agentCfg: { mediaHosts: ['127.0.0.1', 'flow-content.google'], allowHttp: true }, extraArgs: EXTRA
  });
  t.after(async () => { await Promise.race([s.closeBrowser().catch(() => {}), new Promise((r) => setTimeout(r, 15000))]); mock.server.closeAllConnections(); mock.server.close(); try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* Windows */ } });
  await s.connect();
  await s.navigate(`${base}/project/p-test-1?ce=1`);
  await new Promise((r) => setTimeout(r, 800));
  const wajah = path.join(tmp, 'wajah.png');
  fs.writeFileSync(wajah, makePng(64, 64, [200, 150, 120]));
  const job = (prompt) => ({ prompt, images: [wajah], tags: ['wajah'], reuseRefs: true, options: { kind: 'image', model: 'Nano Banana 2.1', ratio: '9:16', count: 1 } });

  // 1) Flow membuka foto yang baru diunggah di tampilan EDIT → aplikasi kembali ke grid, foto jadi bahan "@", generate biasa
  mock.state.editAfterUpload = true;
  await s.navigate(`${base}/project/p-test-1?ce=1`);
  await new Promise((r) => setTimeout(r, 600));
  const logs = [];
  const r1 = await s.generate(job('A POV selfie photo of @wajah at the beach'), { onLog: (x) => logs.push(x), timeoutMs: 60000 });
  const g1 = mock.generated[mock.generated.length - 1];
  assert.strictEqual(g1.path, '/project/p-test-1', 'Generate ditekan di grid project, bukan di /edit/');
  assert.deepStrictEqual(g1.refs, r1.refs.map((r) => r.mediaId), 'foto unggahan dipakai sebagai bahan @, bukan diedit');
  assert.ok(logs.some((l) => /kembali ke grid project/.test(l)), logs.join(' | '));
  assert.strictEqual(r1.items.length, 1);
  mock.state.editAfterUpload = false;

  // 2) tugas berikutnya dimulai saat Flow masih di tampilan edit sebuah gambar → keluar dulu
  await s.navigate(`${base}/project/p-test-1/edit/${r1.items[0].mediaId}?ce=1`);
  await new Promise((r) => setTimeout(r, 600));
  assert.strictEqual((await s.call('viewState')).sub, 'edit');
  const up0 = mock.state.uploads.length;
  await s.generate(job('A POV selfie photo of @wajah in a cafe'), { timeoutMs: 60000 });
  const g2 = mock.generated[mock.generated.length - 1];
  assert.strictEqual(g2.path, '/project/p-test-1');
  assert.strictEqual(g2.refs.length, 1);
  assert.strictEqual(mock.state.uploads.length, up0, 'foto yang sama dipakai ulang, tidak diunggah lagi');

  // 3) "Flow Agent" menyala → dimatikan sebelum generate
  mock.state.agentOn = true;
  await s.navigate(`${base}/project/p-test-1?ce=1`);
  await new Promise((r) => setTimeout(r, 600));
  assert.ok((await s.call('viewState')).agent, 'sakelar Flow Agent terbaca menyala');
  await s.generate({ prompt: 'Sunset over rice terraces', options: { kind: 'image', count: 1 } }, { timeoutMs: 60000 });
  const g3 = mock.generated[mock.generated.length - 1];
  assert.strictEqual(g3.agent, false, 'generate biasa, bukan lewat Flow Agent');
  assert.strictEqual(mock.state.agentOn, false);

  // 4) masuk tampilan edit tepat sebelum Generate → dibatalkan (FLOW_EDIT_MODE, diulang oleh Bulk), tidak ada generate
  const n0 = mock.generated.length;
  const prep0 = s.prepareComposer.bind(s);
  s.prepareComposer = async (j, say) => { const out = await prep0(j, say); await (await s.ensurePage()).send('Runtime.evaluate', { expression: `history.pushState({}, '', '/project/p-test-1/edit/x1?ce=1')` }); return out; };
  await assert.rejects(() => s.generate({ prompt: 'Mountain lake', options: { kind: 'image', count: 1 } }, { timeoutMs: 60000 }), /FLOW_EDIT_MODE/);
  s.prepareComposer = prep0;
  assert.strictEqual(mock.generated.length, n0, 'tidak menekan Generate di tampilan edit');
  assert.strictEqual((await s.call('viewState')).sub, null, 'sudah kembali ke grid');
});
