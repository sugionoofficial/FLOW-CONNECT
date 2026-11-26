'use strict';
// Kode yang dijalankan DI DALAM tab Google Flow (lewat CDP Runtime.evaluate, tidak terkena CSP/Trusted Types).
// Isinya diturunkan dari bookmarklet FLOW CONNECT: status akun/project, RPC baca-saja galeri,
// ambil file media, mencari kolom prompt / input file / tombol Generate.
// Tidak pernah membuat token reCAPTCHA — Generate selalu lewat tombol UI Flow sendiri.

const AGENT_VERSION = 3;

/* eslint-disable */
function fcAgent(V, cfg) {
  var MEDIA_HOSTS = cfg.mediaHosts;

  function projectId() {
    var m = /\/project\/([A-Za-z0-9-]{1,128})/.exec(location.pathname);
    return m ? m[1] : null;
  }
  function status() {
    var wiz = window.WIZ_global_data || {};
    var email = typeof wiz.oPEP7c === 'string' && wiz.oPEP7c.indexOf('@') > 0 ? wiz.oPEP7c : null;
    var title = (document.title || '').replace(/\s*[-–|]\s*Google Flow.*$/i, '') || 'Project';
    return { signedIn: !!wiz.SNlM0e, account: email, projectId: projectId(), projectTitle: projectId() ? title : null, url: location.href };
  }
  function isMediaUrl(u) {
    try {
      var x = new URL(u);
      return (x.protocol === 'https:' || (cfg.allowHttp && x.protocol === 'http:')) && MEDIA_HOSTS.indexOf(x.hostname) >= 0;
    } catch (e) { return false; }
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
    if (payload === undefined) throw new Error(rpcError ? 'RPC_ERROR' : 'NO_PAYLOAD');
    var urls = {};
    walk(payload, function (str) {
      if (str.indexOf('http') !== 0 || !isMediaUrl(str)) return;
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
            mediaId: d[4], title: typeof d[0] === 'string' ? d[0] : '',
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
    return items;
  }

  async function getMedia(mediaId) {
    if (!/^[A-Za-z0-9-]{1,128}$/.test(mediaId || '')) throw new Error('INVALID_MEDIA_ID');
    var r = await batchRead('as29s', [mediaId]);
    var rec = r.urls[mediaId] || r.urls[Object.keys(r.urls)[0]] || {};
    return { image: rec.image || null, video: rec.video || null };
  }

  async function fetchB64(u) {
    if (!isMediaUrl(u)) throw new Error('INVALID_URL');
    var resp;
    try { resp = await fetch(u, { credentials: 'include' }); } catch (e) { resp = await fetch(u); }
    if (!resp.ok) throw new Error('HTTP_' + resp.status);
    var buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length > 300 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
    var s = '';
    for (var i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { mime: resp.headers.get('content-type') || '', b64: btoa(s) };
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function editor() {
    var sels = ['[contenteditable="true"][role="textbox"]', 'textarea', '[contenteditable="true"]', 'input[type="text"][aria-label]'];
    for (var i = 0; i < sels.length; i++) {
      var list = document.querySelectorAll(sels[i]);
      for (var j = list.length - 1; j >= 0; j--) if (visible(list[j]) && !list[j].disabled && !list[j].readOnly) return list[j];
    }
    return null;
  }
  function focusPrompt() {
    var ed = editor();
    if (!ed) throw new Error('PROMPT_BOX_NOT_FOUND');
    ed.scrollIntoView({ block: 'center' });
    ed.focus();
    if (typeof ed.select === 'function') ed.select();
    else {
      var range = document.createRange();
      range.selectNodeContents(ed);
      var sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return { tag: ed.tagName.toLowerCase() };
  }
  function promptText() {
    var ed = editor();
    if (!ed) return null;
    return typeof ed.value === 'string' ? ed.value : ed.innerText;
  }
  function setPromptFallback(text) {
    var ed = editor();
    if (!ed) throw new Error('PROMPT_BOX_NOT_FOUND');
    ed.focus();
    if (ed instanceof HTMLTextAreaElement || ed instanceof HTMLInputElement) {
      var proto = ed instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(ed, text);
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, text);
    }
    return true;
  }
  function markFileInput() {
    var old = document.querySelectorAll('[data-fc-target]');
    for (var i = 0; i < old.length; i++) old[i].removeAttribute('data-fc-target');
    var inputs = Array.prototype.filter.call(document.querySelectorAll('input[type="file"]'), function (el) {
      return !el.disabled && (!el.accept || /image|\*/.test(el.accept));
    });
    if (!inputs.length) return false;
    inputs[inputs.length - 1].setAttribute('data-fc-target', '1');
    return true;
  }
  function pasteFiles(list) {
    var dt = new DataTransfer();
    list.forEach(function (f) {
      var bin = atob(f.b64), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      dt.items.add(new File([arr], f.name, { type: f.mime }));
    });
    var ed = editor();
    if (ed) {
      ed.focus();
      ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return 'paste';
    }
    var t = document.querySelector('main') || document.body;
    ['dragenter', 'dragover', 'drop'].forEach(function (type) { t.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true })); });
    return 'drop';
  }

  var POS = /generat|create|buat|hasilkan|kirim|submit|send|jalankan|\brun\b/i;
  var NEG = /setting|setelan|more|lainnya|menu|close|tutup|cancel|batal|delete|hapus|upload|unggah|tambah|\badd\b|share|bagikan|download|unduh|back|kembali|help|bantuan|account|akun|new project|project baru/i;
  var ICON = /^(arrow_forward|arrow_upward|send|north|east|auto_awesome|spark)$/;
  function findGenerate() {
    var ed = editor();
    var er = ed ? ed.getBoundingClientRect() : null;
    var best = null, bestScore = 0;
    var els = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var label = [el.getAttribute('aria-label') || '', el.getAttribute('title') || '', (el.innerText || '').slice(0, 80)].join(' ').trim();
      var score = 0;
      if (POS.test(label)) score += 3;
      if (NEG.test(label) && !POS.test(label)) score -= 4;
      var icons = el.querySelectorAll('i, span, mat-icon');
      for (var k = 0; k < icons.length; k++) if (ICON.test((icons[k].textContent || '').trim())) { score += 3; break; }
      if (el.type === 'submit') score += 2;
      if (ed) {
        var a = ed;
        for (var lvl = 0; lvl < 6 && a; lvl++, a = a.parentElement) if (a.contains(el)) { score += (6 - lvl) / 2; break; }
        var r = el.getBoundingClientRect();
        var dx = (r.left + r.width / 2) - (er.left + er.width / 2), dy = (r.top + r.height / 2) - (er.top + er.height / 2);
        if (Math.sqrt(dx * dx + dy * dy) < 450) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = el; }
    }
    if (!best || bestScore < 3) return null;
    var disabled = best.disabled || best.getAttribute('aria-disabled') === 'true';
    best.scrollIntoView({ block: 'center', inline: 'center' });
    var rr = best.getBoundingClientRect();
    return {
      x: rr.left + rr.width / 2, y: rr.top + rr.height / 2, w: rr.width, h: rr.height, disabled: !!disabled,
      label: (best.getAttribute('aria-label') || best.innerText || '').trim().slice(0, 60)
    };
  }

  var api = {
    status: status, listMedia: listMedia, getMedia: getMedia, fetchB64: fetchB64, focusPrompt: focusPrompt,
    promptText: promptText, setPromptFallback: setPromptFallback, markFileInput: markFileInput, pasteFiles: pasteFiles,
    findGenerate: findGenerate
  };
  Object.defineProperty(window, '__fcDesktop', {
    configurable: true, enumerable: false,
    value: { v: V, call: function (name, args) { if (!api.hasOwnProperty(name)) throw new Error('UNKNOWN_ACTION'); return api[name].apply(null, args || []); } }
  });
}
/* eslint-enable */

/** Ekspresi Runtime.evaluate: pasang agen (jika belum / versi lama) lalu panggil fungsinya. */
function agentExpression(name, args, cfg) {
  return '(function(){var a=window.__fcDesktop;if(!a||a.v!==' + AGENT_VERSION + ')(' + fcAgent.toString() + ')(' +
    AGENT_VERSION + ',' + JSON.stringify(cfg) + ');return window.__fcDesktop.call(' + JSON.stringify(name) + ',' +
    JSON.stringify(args || []) + ');})()';
}

module.exports = { AGENT_VERSION, agentExpression, fcAgent };
