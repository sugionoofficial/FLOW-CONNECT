/* FLOW CONNECT — bookmarklet untuk flow.google.com
 * Dijalankan oleh pengguna di tab Google Flow miliknya sendiri (klik bookmark).
 * Menghubungkan tab ini dengan FLOW CONNECT lewat window.postMessage:
 *  - status (akun & project), galeri (RPC baca-saja), ambil file media
 *  - menaruh gambar / prompt ke UI Flow (Flow sendiri yang upload & generate)
 * Tidak membuat token reCAPTCHA dan tidak menekan Generate.
 * Tanpa innerHTML/eval (aman untuk Trusted Types). __FC_ORIGIN__ diganti saat bookmarklet dibuat.
 */
(function () {
  var FC_ORIGIN = '__FC_ORIGIN__';
  var VERSION = '1.0.0';
  var MEDIA_HOST = 'flow-content.google';
  if (location.hostname !== 'flow.google.com') {
    if (confirm('Bookmarklet FLOW CONNECT hanya bekerja di Google Flow. Buka flow.google.com sekarang?')) location.href = 'https://flow.google.com/';
    return;
  }
  if (window.__fcBridge) { window.__fcBridge.show(); window.__fcBridge.announce(); return; }

  var peers = [];
  var fcWin = null;

  function projectId() {
    var m = /\/project\/([A-Za-z0-9-]{1,128})/.exec(location.pathname);
    return m ? m[1] : null;
  }
  function status() {
    var wiz = window.WIZ_global_data || {};
    var email = typeof wiz.oPEP7c === 'string' && wiz.oPEP7c.indexOf('@') > 0 ? wiz.oPEP7c : null;
    var pid = projectId();
    var title = (document.title || '').replace(/\s*[-–|]\s*Google Flow.*$/i, '') || 'Project';
    return { version: VERSION, flowOpen: true, signedIn: !!wiz.SNlM0e, account: email, projects: pid ? [{ id: pid, title: title, tabId: 0 }] : [] };
  }

  function walk(n, fn) {
    if (typeof n === 'string') fn(n);
    else if (Array.isArray(n)) for (var i = 0; i < n.length; i++) walk(n[i], fn);
  }

  async function batchRead(rpcid, inner) {
    var wiz = window.WIZ_global_data || {};
    if (!wiz.SNlM0e) throw new Error('NOT_SIGNED_IN');
    var freq = JSON.stringify([[[rpcid, JSON.stringify(inner), null, 'generic']]]);
    var hl = (document.documentElement.lang || navigator.language || 'en').split('-')[0];
    var url = '/_/AiSandboxAngularFrontend/data/batchexecute?rpcids=' + encodeURIComponent(rpcid) +
      '&source-path=' + encodeURIComponent(location.pathname || '/') +
      '&bl=' + encodeURIComponent(wiz.cfb2h || '') + '&f.sid=' + encodeURIComponent(wiz.FdrFJe || '') +
      '&hl=' + encodeURIComponent(hl) + '&_reqid=' + (Math.floor(Math.random() * 900000) + 100000) + '&rt=c';
    var resp = await fetch(url, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-same-domain': '1' },
      body: new URLSearchParams({ 'f.req': freq, at: wiz.SNlM0e })
    });
    var text = await resp.text();
    if (!resp.ok) throw new Error('HTTP_' + resp.status);
    var body = text.indexOf(")]}'") === 0 ? text.slice(text.indexOf('\n') + 1) : text;
    var payload, rpcError, lines = body.split('\n');
    for (var i = 0; i < lines.length && payload === undefined; i++) {
      var s = lines[i].trim();
      if (s.charAt(0) !== '[') continue;
      var chunk; try { chunk = JSON.parse(s); } catch (e) { continue; }
      if (!Array.isArray(chunk)) continue;
      for (var j = 0; j < chunk.length; j++) {
        var en = chunk[j];
        if (!Array.isArray(en) || en[0] !== 'wrb.fr' || en[1] !== rpcid) continue;
        if (en[2] == null) rpcError = en[5] || true;
        else { try { payload = JSON.parse(en[2]); } catch (e) { payload = en[2]; } }
      }
    }
    if (payload === undefined) throw new Error(rpcError ? 'RPC_ERROR ' + JSON.stringify(rpcError) : 'NO_PAYLOAD');
    var urls = {};
    walk(payload, function (str) {
      if (str.indexOf('https://') !== 0 || str.indexOf(MEDIA_HOST) < 0) return;
      var m = /\/(image|video)\/([A-Za-z0-9-]+)/.exec(str);
      if (!m) return;
      var rec = urls[m[2]] = urls[m[2]] || {};
      if (!rec[m[1]]) rec[m[1]] = str;
    });
    return { payload: payload, urls: urls };
  }

  async function listMedia(pid) {
    if (!/^[A-Za-z0-9-]{1,128}$/.test(pid || '')) throw new Error('INVALID_PROJECT_ID');
    var r = await batchRead('Zzl0ze', ['projects/' + pid, null, null, null, [1]]);
    var items = [], seen = {};
    (function visit(n) {
      if (!Array.isArray(n)) return;
      var d = n[3];
      if (n.length >= 4 && Array.isArray(d) && d.length > 4 && typeof d[4] === 'string' && /^[0-9a-fA-F-]{36}$/.test(d[4])) {
        if (!seen[d[4]]) {
          seen[d[4]] = 1;
          var u = r.urls[d[4]] || {};
          items.push({
            mediaId: d[4], assetId: typeof n[0] === 'string' ? n[0] : null, title: typeof d[0] === 'string' ? d[0] : '',
            createdAt: Array.isArray(d[1]) && typeof d[1][0] === 'number' ? d[1][0] * 1000 : null,
            isVideo: d[2] === true || d[2] === 1, done: d.length > 6 ? !!d[6] : true,
            image: u.image || null, video: u.video || null
          });
        }
        return;
      }
      for (var i = 0; i < n.length; i++) visit(n[i]);
    })(r.payload);
    items.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return { items: items };
  }

  async function getMedia(mediaId) {
    if (!/^[A-Za-z0-9-]{1,128}$/.test(mediaId || '')) throw new Error('INVALID_MEDIA_ID');
    var r = await batchRead('as29s', [mediaId]);
    var rec = r.urls[mediaId] || r.urls[Object.keys(r.urls)[0]] || {};
    return { image: rec.image || null, video: rec.video || null };
  }

  function isMediaUrl(u) {
    try { var x = new URL(u); return x.protocol === 'https:' && x.hostname === MEDIA_HOST; } catch (e) { return false; }
  }
  async function fetchBlob(u) {
    if (!isMediaUrl(u)) throw new Error('INVALID_URL');
    var resp = await fetch(u, { credentials: 'include' });
    if (!resp.ok) throw new Error('HTTP_' + resp.status);
    return { blob: await resp.blob() };
  }

  function editor() {
    return document.querySelector('[contenteditable="true"][role="textbox"]') || document.querySelector('textarea') || document.querySelector('[contenteditable="true"]');
  }
  function sendImage(files) {
    if (!Array.isArray(files) || !files.length || files.length > 10) throw new Error('INVALID_FILES');
    var dt = new DataTransfer();
    files.forEach(function (f) {
      if (!(f instanceof Blob) || !/^image\//.test(f.type)) throw new Error('INVALID_IMAGE');
      dt.items.add(f instanceof File ? f : new File([f], 'gambar.png', { type: f.type }));
    });
    var inputs = Array.prototype.filter.call(document.querySelectorAll('input[type="file"]'), function (i) { return !i.disabled && (!i.accept || /image|\*/.test(i.accept)); });
    if (inputs.length) {
      try {
        var input = inputs[inputs.length - 1];
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { method: 'file-input', count: files.length };
      } catch (e) { /* lanjut */ }
    }
    var ed = editor();
    if (ed) {
      ed.focus();
      ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return { method: 'paste', count: files.length };
    }
    var t = document.querySelector('main') || document.body;
    ['dragenter', 'dragover', 'drop'].forEach(function (type) { t.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true })); });
    return { method: 'drop', count: files.length };
  }
  function sendPrompt(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('INVALID_PROMPT');
    var ed = editor();
    if (!ed) throw new Error('PROMPT_BOX_NOT_FOUND');
    ed.focus();
    if (ed instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ed, text);
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, text);
    }
    return { ok: true };
  }

  var actions = {
    ping: function () { return { version: VERSION }; },
    status: status,
    listMedia: function (p) { return listMedia(p.projectId); },
    getMedia: function (p) { return getMedia(p.mediaId); },
    fetchBlob: function (p) { return fetchBlob(p.url); },
    sendImage: function (p) { return sendImage(p.files); },
    sendPrompt: function (p) { return sendPrompt(p.text); }
  };

  function post(win, msg) {
    try { msg.source = 'fc-bookmarklet'; win.postMessage(msg, FC_ORIGIN); } catch (e) { /* jendela tertutup */ }
  }
  function addPeer(w) { if (w && peers.indexOf(w) < 0) peers.push(w); setState(); }

  window.addEventListener('message', async function (e) {
    if (e.origin !== FC_ORIGIN) return;
    var m = e.data;
    if (!m || m.source !== 'flow-connect' || typeof m.type !== 'string') return;
    addPeer(e.source);
    if (m.type === 'hello') { post(e.source, { type: 'hello', data: status() }); return; }
    var fn = actions[m.type];
    if (!fn) { post(e.source, { id: m.id, ok: false, error: 'UNKNOWN_ACTION' }); return; }
    try {
      var data = await fn(m.payload || {});
      post(e.source, { id: m.id, ok: true, data: data });
    } catch (err) {
      post(e.source, { id: m.id, ok: false, error: String((err && err.message) || err) });
    }
  });

  /* ───── panel kecil di pojok Flow ───── */
  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:280px;padding:14px;border-radius:16px;' +
    'background:rgba(10,10,20,.92);border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 50px -10px rgba(124,58,237,.55);' +
    'color:#fff;font:13px/1.45 Inter,system-ui,sans-serif;backdrop-filter:blur(12px)';
  var head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
  var dot = document.createElement('span');
  dot.style.cssText = 'width:9px;height:9px;border-radius:50%;background:#fbbf24;flex:none';
  var title = document.createElement('b');
  title.textContent = 'FLOW CONNECT';
  title.style.cssText = 'flex:1;background:linear-gradient(90deg,#a78bfa,#22d3ee);-webkit-background-clip:text;color:transparent;letter-spacing:.04em';
  var close = document.createElement('button');
  close.textContent = '×';
  close.title = 'Sembunyikan';
  close.style.cssText = 'background:none;border:0;color:#ffffff99;font-size:18px;cursor:pointer;line-height:1';
  var info = document.createElement('div');
  info.style.cssText = 'color:#ffffffb3;font-size:12px';
  var btn = document.createElement('button');
  btn.textContent = 'Buka FLOW CONNECT';
  btn.style.cssText = 'margin-top:10px;width:100%;padding:8px;border:0;border-radius:10px;color:#fff;font-weight:600;cursor:pointer;background:linear-gradient(90deg,#7c3aed,#06b6d4)';
  head.appendChild(dot); head.appendChild(title); head.appendChild(close);
  panel.appendChild(head); panel.appendChild(info); panel.appendChild(btn);
  document.documentElement.appendChild(panel);

  function alive() { peers = peers.filter(function (w) { try { return !w.closed; } catch (e) { return false; } }); return peers.length > 0; }
  function setState() {
    var s = status(), on = alive();
    dot.style.background = on ? '#34d399' : '#fbbf24';
    info.textContent = (on ? 'Terhubung dengan FLOW CONNECT. ' : 'Menunggu FLOW CONNECT… ') +
      (s.signedIn ? (s.account ? 'Akun: ' + s.account + '. ' : '') : 'Login ke Google Flow dulu. ') +
      (s.projects.length ? 'Project terbuka.' : 'Buka sebuah project.');
    btn.style.display = on ? 'none' : 'block';
  }
  function announce() {
    var targets = [];
    try { if (window.opener) targets.push(window.opener); } catch (e) { /* COOP */ }
    if (fcWin) targets.push(fcWin);
    peers.forEach(function (w) { targets.push(w); });
    targets.forEach(function (w) { post(w, { type: 'hello', data: status() }); });
  }
  close.onclick = function () { panel.style.display = 'none'; };
  btn.onclick = function () {
    fcWin = window.open(FC_ORIGIN + '/app/studio?via=bookmarklet', 'flow-connect-studio');
    var n = 0, t = setInterval(function () { announce(); if (++n > 40 || alive()) clearInterval(t); }, 500);
  };

  var lastUrl = location.href;
  setInterval(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      peers.forEach(function (w) { post(w, { type: 'status', data: status() }); });
    }
    setState();
  }, 1000);

  window.__fcBridge = { show: function () { panel.style.display = 'block'; }, announce: announce };
  setState();
  announce();
})();
