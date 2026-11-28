'use strict';
// Kode yang dijalankan DI DALAM tab Google Flow (lewat CDP Runtime.evaluate, tidak terkena CSP/Trusted Types).
// Isinya diturunkan dari bookmarklet FLOW CONNECT: status akun/project, RPC baca-saja galeri,
// ambil file media, mencari kolom prompt / input file / tombol Generate.
// Tidak pernah membuat token reCAPTCHA — Generate selalu lewat tombol UI Flow sendiri.

const AGENT_VERSION = 16;

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
  // Media Flow: CDN bertanda tangan (flow-content.google/{image,video}/…), poster/gambar galeri
  // (lh3.googleusercontent.com/asb/…, flow.google.com/asb/…), atau rute labs getMediaUrlRedirect.
  function isMediaUrl(u) {
    try {
      var x = new URL(u);
      if (!(x.protocol === 'https:' || (cfg.allowHttp && x.protocol === 'http:'))) return false;
      var h = x.hostname;
      if (MEDIA_HOSTS.indexOf(h) >= 0) return true;
      if (h === 'flow-content.google' || /\.googleusercontent\.com$/.test(h)) return true;
      if ((h === 'flow.google.com' || h === 'labs.google') && (/^\/asb\//.test(x.pathname) || /getMediaUrlRedirect/.test(x.pathname))) return true;
      return false;
    } catch (e) { return false; }
  }
  function mediaKind(u) {
    try { var p = new URL(u).pathname; return /\/video\/|\.(mp4|webm)$/i.test(p) ? 'video' : 'image'; } catch (e) { return null; }
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

  // URL tidak selalu memuat media id (poster /asb/<token>, CDN /video/<workflow id>) → URL milik item adalah
  // URL di simpul TERKECIL yang memuat tepat satu media id item (record item + saudaranya).
  function urlsNear(payload, itemIds) {
    var out = {};
    (function post(n) {
      if (typeof n === 'string') {
        if (itemIds[n]) return { ids: [n], urls: [] };
        if (n.indexOf('http') === 0 && isMediaUrl(n)) return { ids: [], urls: [n] };
        return null;
      }
      if (!Array.isArray(n)) return null;
      var acc = { ids: [], urls: [] };
      for (var i = 0; i < n.length; i++) {
        var c = post(n[i]);
        if (!c) continue;
        for (var a = 0; a < c.ids.length; a++) if (acc.ids.indexOf(c.ids[a]) < 0) acc.ids.push(c.ids[a]);
        if (acc.urls.length < 12) acc.urls = acc.urls.concat(c.urls);
      }
      if (acc.urls.length && acc.ids.length === 1) {
        var id = acc.ids[0], rec = out[id] = out[id] || {};
        for (var q = 0; q < acc.urls.length; q++) { var k = mediaKind(acc.urls[q]); if (k && !rec[k]) rec[k] = acc.urls[q]; }
        acc.urls = []; // dipakai di sini → tidak bocor ke item tetangga
      }
      return acc;
    })(payload);
    return out;
  }

  var UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  function isUuid(x) { return typeof x === 'string' && UUID_RE.test(x); }
  function at(n) { var c = n; for (var i = 1; i < arguments.length; i++) { if (!Array.isArray(c) || arguments[i] >= c.length) return undefined; c = c[arguments[i]]; } return c; }
  function mediaUrl(x) { return typeof x === 'string' && x.indexOf('http') === 0 && isMediaUrl(x) ? x : null; }
  function urlIn(n, kind, id) { // URL media di dalam simpul n (utamakan yang memuat id)
    var best = null;
    walk(n, function (str) {
      var u = mediaUrl(str);
      if (!u || (kind && mediaKind(u) !== kind)) return;
      if (id && u.indexOf(id) >= 0) best = u;
      else if (!best) best = u;
    });
    return best;
  }

  // Daftar isi project (Zzl0ze). Tiga bentuk yang dibaca & digabung (diukur komunitas gflow-cli, 2026):
  //  - baris workflow   [workflow, _, _, [judul, [dtk], video?, _, media id utama, …], project, …]
  //  - record GAMBAR    [media id, _, workflow, _, _, _, [[detail… url di 13], _, [lebar, tinggi]]]   (7 slot, tanpa status)
  //  - record MEDIA     [workflow, project, media id, _, _, [DETAIL… status di 8, poster di 10], _, [info media, [lebar, tinggi, …, mime di 6]]]
  //                      dipakai untuk VIDEO maupun GAMBAR (gflow-cli, diukur 2026-11-24): gambar membawa mime image/* di [7][1][6],
  //                      video hasil generate membawa info media (list) di [7][0], video unggahan [7][0] = null & [7][1] = [l, t, [durasi]].
  // Satu generate x4 bisa berbagi satu workflow → setiap gambar diambil dari record-nya sendiri.
  async function listMedia(pid) {
    if (!/^[A-Za-z0-9-]{1,128}$/.test(pid || '')) throw new Error('INVALID_PROJECT_ID');
    var r = await batchRead('Zzl0ze', ['projects/' + pid, null, null, null, [1]]);
    var items = [], byId = {}, wfMeta = {};
    function add(it) { byId[it.mediaId] = it; items.push(it); return it; }
    (function visit(n) {
      if (!Array.isArray(n)) return;
      var d = n[3];
      if (n.length >= 4 && Array.isArray(d) && typeof n[0] === 'string') {
        var meta = {
          title: typeof d[0] === 'string' ? d[0] : '',
          createdAt: Array.isArray(d[1]) && typeof d[1][0] === 'number' ? d[1][0] * 1000 : null,
          isVideo: d[2] === true || d[2] === 1
        };
        if (typeof d[0] === 'string' && !wfMeta[n[0]]) wfMeta[n[0]] = meta;
        if (d.length > 4 && typeof d[4] === 'string' && /^[0-9a-fA-F-]{36}$/.test(d[4])) {
          if (!byId[d[4]]) {
            var u = r.urls[d[4]] || {};
            add({
              mediaId: d[4], workflowId: n[0], title: meta.title, createdAt: meta.createdAt, isVideo: meta.isVideo,
              // gambar tidak punya status di Flow (hanya tercatat setelah jadi); slot 6 hanya berarti untuk video
              done: d.length > 6 ? (meta.isVideo ? !!d[6] : d[6] !== false) : true,
              image: u.image || null, video: u.video || null
            });
          }
          return;
        }
      }
      for (var i = 0; i < n.length; i++) visit(n[i]);
    })(r.payload);

    // record media: gambar (7 slot) & video (status) — sumber yang paling pasti untuk media id & URL
    var recs = [];
    (function visit(n) {
      if (!Array.isArray(n)) return;
      if (n.length >= 7 && isUuid(n[0]) && isUuid(n[2]) && Array.isArray(n[6]) && Array.isArray(n[6][0])) {
        var det = n[6][0];
        recs.push({ mediaId: n[0], workflowId: n[2], isVideo: false, done: true, image: mediaUrl(det[13]) || urlIn(det, 'image', n[0]) || urlIn(n, 'image', n[0]), video: null });
        return;
      }
      if (n.length >= 6 && isUuid(n[0]) && isUuid(n[1]) && isUuid(n[2]) && Array.isArray(n[5])) {
        var st = at(n, 5, 8, 0), mime = at(n, 7, 1, 6), info = at(n, 7, 0);
        if (typeof mime === 'string' && /^image\//i.test(mime)) {
          // GAMBAR dalam bentuk record media (mis. foto Frame/Bahan yang diunggah) — bukan video
          recs.push({
            mediaId: n[2], workflowId: n[0], isVideo: false, kind: 'image', noInfo: info == null,
            done: st !== 1, image: mediaUrl(at(n, 5, 10)) || urlIn(n, 'image', n[2]) || urlIn(n, 'image'), video: null
          });
          return;
        }
        var vUrl = mediaUrl(at(n, 7, 0, 8)) || urlIn(n[7], 'video');
        var known = Array.isArray(info) || (info === null && Array.isArray(at(n, 7, 1, 2))) || typeof st === 'number' || !!vUrl;
        recs.push({ mediaId: n[2], workflowId: n[0], isVideo: true, kind: known ? 'video' : null, done: typeof st === 'number' ? st === 3 : null, image: mediaUrl(at(n, 5, 10)), video: vUrl });
        return;
      }
      for (var i = 0; i < n.length; i++) visit(n[i]);
    })(r.payload);
    var recWf = {}, gen7 = {};
    for (var g = 0; g < recs.length; g++) if (!recs[g].kind && !recs[g].isVideo) gen7[recs[g].mediaId] = 1;
    for (var q = 0; q < recs.length; q++) {
      var rc = recs[q], cur = byId[rc.mediaId];
      recWf[rc.workflowId] = 1;
      // gambar tanpa info generate & tanpa record hasil generate (7 slot) = gambar yang diunggah (referensi)
      var up = rc.kind === 'image' && rc.noInfo && !gen7[rc.mediaId];
      if (cur) {
        if (rc.kind) cur.isVideo = rc.isVideo; // jenis dari record media lebih pasti daripada baris workflow
        if (up) cur.upload = true;
        if (!cur.image) cur.image = rc.image;
        if (!cur.video) cur.video = rc.video;
        if (rc.done !== null) cur.done = rc.done;
        if (!cur.workflowId) cur.workflowId = rc.workflowId;
        continue;
      }
      var m = wfMeta[rc.workflowId] || {};
      var it2 = add({ mediaId: rc.mediaId, workflowId: rc.workflowId, title: m.title || '', createdAt: m.createdAt || null, isVideo: rc.isVideo, done: rc.done !== null ? rc.done : true, image: rc.image, video: rc.video, fromRecord: true });
      if (up) it2.upload = true;
    }
    // baris workflow yang "media id"-nya tidak punya record, padahal workflow-nya punya → bukan media sungguhan
    items = items.filter(function (it) { return it.fromRecord || !it.workflowId || !recWf[it.workflowId] || recs.some(function (x) { return x.mediaId === it.mediaId; }); });

    var itemIds = {};
    for (var k = 0; k < items.length; k++) itemIds[items[k].mediaId] = 1;
    var near = urlsNear(r.payload, itemIds);
    for (var j = 0; j < items.length; j++) {
      var nu = near[items[j].mediaId] || {};
      if (!items[j].image) items[j].image = nu.image || null;
      if (!items[j].video) items[j].video = nu.video || null;
      delete items[j].fromRecord;
    }
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
    var sels = ['flow-prompt-box [contenteditable="true"]', '[contenteditable="true"][role="textbox"]', 'textarea', '[contenteditable="true"]', 'input[type="text"][aria-label]'];
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
  var STRONG = /^(start generation|generate|mulai membuat|buat sekarang)$/i;
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
      if (STRONG.test(label.trim())) score += 4;
      if (POS.test(label)) score += 3;
      // tombol yang membuka dialog/menu (mis. "Create" untuk menambah bahan, chip setelan) bukan Generate
      if (el.getAttribute('aria-haspopup') || el.getAttribute('aria-expanded') !== null) score -= 6;
      if (NEG.test(label) && !POS.test(label)) score -= 4;
      var icons = el.querySelectorAll('i, span, mat-icon');
      for (var k = 0; k < icons.length; k++) {
        var it = (icons[k].textContent || '').trim();
        if (ICON.test(it)) { score += 3; break; }
        if (/^(add|add_2|tune|settings)$/.test(it)) { score -= 3; break; }
      }
      if (el.type === 'submit') score += 2;
      if (el.closest && el.closest('flow-prompt-box') && hasLig(el, 'arrow_forward')) score += 4;
      if (el.classList && (el.classList.contains('prompt-warning-button') || el.classList.contains('mention-chip'))) score -= 10;
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


  // ---------- Kontrol UI Flow (Project baru, setelan model/mode/rasio) ----------
  var ICON_SEL = 'i, mat-icon, .material-icons, .material-symbols-outlined, .google-symbols, [class*="icon" i][aria-hidden="true"]';
  function labelOf(el) {
    var a = (el.getAttribute('aria-label') || '').trim();
    if (a) return a.replace(/\s+/g, ' ');
    var out = '';
    (function rec(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) out += c.nodeValue + ' ';
        else if (c.nodeType === 1 && !(c.matches && c.matches(ICON_SEL)) && c.getAttribute('aria-hidden') !== 'true') rec(c);
      }
    })(el);
    out = out.replace(/\s+/g, ' ').trim();
    return out || (el.getAttribute('title') || '').trim();
  }
  // teks utama elemen (mis. "Veo 3.1 - Fast" tanpa keterangan kecil "Beta Audio")
  function primaryText(el) {
    var out = '';
    (function rec(n) {
      for (var c = n.firstChild; c && !out; c = c.nextSibling) {
        if (c.nodeType === 3) { if (c.nodeValue.trim()) out = c.nodeValue.trim(); }
        else if (c.nodeType === 1 && !(c.matches && c.matches(ICON_SEL)) && c.getAttribute('aria-hidden') !== 'true') rec(c);
      }
    })(el);
    return out.replace(/^[^0-9A-Za-z\u00c0-\u024f\u4e00-\u9fff]+/, '').trim();
  }
  function norm(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u4e00-\u9fff]+/g, ''); }
  var OVERLAY_SEL = '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], .cdk-overlay-pane, [data-state="open"][role="presentation"]';
  function overlays() {
    return Array.prototype.filter.call(document.querySelectorAll(OVERLAY_SEL), visible);
  }
  function overlayOpen() { return overlays().length > 0; }
  function isChecked(el) {
    var ac = el.getAttribute('aria-checked'), as = el.getAttribute('aria-selected'), ap = el.getAttribute('aria-pressed'), ds = el.getAttribute('data-state');
    return ac === 'true' || as === 'true' || ap === 'true' || ds === 'on' || ds === 'checked' || ds === 'active' || el.checked === true;
  }
  function box(el, extra) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    var r = el.getBoundingClientRect();
    var o = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, label: labelOf(el).slice(0, 80),
      checked: isChecked(el), disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true') };
    for (var k in extra || {}) o[k] = extra[k];
    return o;
  }
  /**
   * Cari elemen yang bisa diklik.
   * spec: { roles:[...], re:'regex', flags:'i', norm:'teks-target' (cocok teks dinormalisasi), scope:'overlay'|'page'|'auto', exclude:'regex' }
   */
  function find(spec) {
    var roles = spec.roles || ['button'];
    var sel = roles.map(function (r) { return r === 'button' ? 'button, [role="button"]' : r === 'link' ? 'a[href], [role="link"]' : '[role="' + r + '"]'; }).join(', ');
    var re = spec.re ? new RegExp(spec.re, spec.flags || 'i') : null;
    var ex = spec.exclude ? new RegExp(spec.exclude, 'i') : null;
    var target = spec.norm ? norm(spec.norm) : null;
    function search(root) {
      var best = null, bestScore = 0;
      var els = root.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!visible(el)) continue;
        var lab = labelOf(el);
        if (ex && ex.test(lab)) continue;
        var score = 0;
        if (re && re.test(lab)) score = 10;
        if (spec.lig && hasLig(el, spec.lig)) score = Math.max(score, 15);
        if (target) {
          var n = norm(lab);
          if (n === target || norm(primaryText(el)) === target) score = 12;
          else if (n.indexOf(target) === 0) score = Math.max(score, 8 - Math.min(4, (n.length - target.length) / 4));
          else if (target.length > 3 && n.indexOf(target) > 0) score = Math.max(score, 5);
        }
        if (score > bestScore) { bestScore = score; best = el; }
      }
      return best;
    }
    var scope = spec.scope || 'auto';
    var hit = null;
    if (scope !== 'page') {
      var ov = overlays();
      for (var j = ov.length - 1; j >= 0 && !hit; j--) hit = search(ov[j]);
    }
    if (!hit && scope !== 'overlay') hit = search(document);
    return hit ? box(hit) : null;
  }
  // "New project" dalam berbagai bahasa akun Google (ikon "add" di depan diabaikan)
  var NEW_PROJECT = /^(?:\+|add|add_2|add_circle)?\s*(new project|create (a )?new project|start (a )?new project|create (your )?first project|create project|project baru|proyek baru|projek baru|buat project( baru)?|buat proyek( baru)?|proyek anyar|proyék anyar|nuevo proyecto|novo projeto|nouveau projet|neues projekt|nuovo progetto|nieuw project|nowy projekt|yeni proje|новый проект|dự án mới|โปรเจกต์ใหม่|โปรเจ็กต์ใหม่|新しいプロジェクト|새 프로젝트|新建项目|新建項目|新增專案|مشروع جديد)\s*$/i;
  var NEW_PROJECT_LOOSE = /\b(new project|project baru|proyek baru)\b/i;
  var LANDING_CTA = /^(create with (google )?flow|get started|start creating|try (it )?now|try flow|coba flow|mulai membuat|mulai|ayo mulai)$/i;
  function newProjectTarget() {
    var els = document.querySelectorAll('button, [role="button"], a[href], [role="link"], [tabindex="0"]');
    var cta = null, loose = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var lab = labelOf(el);
      if (NEW_PROJECT.test(lab)) return box(el, { kind: 'new' });
      if (!loose && lab.length <= 40 && NEW_PROJECT_LOOSE.test(lab)) loose = el;
      if (!cta && LANDING_CTA.test(lab)) cta = el;
    }
    if (loose) return box(loose, { kind: 'new' });
    return cta ? box(cta, { kind: 'cta' }) : null;
  }

  // ---------- Sambutan / persetujuan pertama kali (akun Google yang baru memakai Flow) ----------
  var ONB_OK = /^(i agree|agree|accept|i accept|accept all|agree and continue|accept and continue|i understand|continue|get started|let['’]?s go|let['’]?s get started|got it|ok|okay|next|done|start creating|try (it )?now|skip|skip tour|close|dismiss|no thanks|no,? thanks|not now|maybe later|create|create project|setuju|saya setuju|setuju dan lanjutkan|terima|saya mengerti|mengerti|lanjutkan|lanjut|mulai|oke|berikutnya|selanjutnya|selesai|lewati|tutup|tidak sekarang|nanti saja|tidak,? terima kasih|buat|buat project)$/i;
  var ONB_BAD = /sign ?out|log ?out|keluar|switch account|ganti akun|add account|tambah akun|subscribe|upgrade|buy|purchase|beli|langganan|tingkatkan|delete|hapus|google ai (pro|ultra)|add ai credits|tambah kredit/i;
  var ONB_RANK = [/agree|accept|setuju|terima|understand|mengerti/i, /^(create|buat)/i, /continue|lanjut|get started|let['’]?s|mulai|start/i, /got it|^ok|oke|done|selesai/i, /next|berikutnya|selanjutnya/i, /no,? thanks|not now|maybe later|tidak|nanti/i, /skip|lewati|close|dismiss|tutup/i];
  var PAGE_AGREE = /^(i agree|agree and continue|accept and continue|i accept|setuju dan lanjutkan|saya setuju)$/i;
  function onbRank(lab) { for (var i = 0; i < ONB_RANK.length; i++) if (ONB_RANK[i].test(lab)) return i; return ONB_RANK.length; }
  // nama ikon tombol tanpa teks (Material Symbols: "arrow_forward", atau data-icon / aria-label pada svg)
  function iconName(el) {
    var ic = el.querySelectorAll(ICON_SEL + ', svg, [data-icon]');
    var out = '';
    for (var i = 0; i < ic.length; i++) out += ' ' + (ic[i].getAttribute('data-icon') || ic[i].getAttribute('aria-label') || ic[i].textContent || '');
    return out.replace(/\s+/g, ' ').trim().toLowerCase();
  }
  // tombol kelihatan nonaktif (Flow kadang hanya meredupkan "Get started" sampai halaman terakhir)
  function looksDisabled(el, root) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    for (var n = el; n && n !== root && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (parseFloat(cs.opacity) < 0.55 || cs.pointerEvents === 'none' || cs.cursor === 'not-allowed') return true;
    }
    return false;
  }
  var PAGER_NEXT_LABEL = /^(next|next page|next slide|berikutnya|selanjutnya|halaman berikutnya|›|»|→|>)$/i;
  var ICON_WORD = /^(arrow_forward(_ios)?|arrow_right(_alt)?|chevron_right|navigate_next|keyboard_arrow_right|east|arrow_back(_ios)?|arrow_left|chevron_left|navigate_before|keyboard_arrow_left|west|close)$/;
  var PAGER_NEXT_ICON = /arrow_forward|arrow_right|chevron_right|navigate_next|keyboard_arrow_right|east|forward|next|right/;
  var PAGER_BACK_ICON = /arrow_back|arrow_left|chevron_left|navigate_before|keyboard_arrow_left|west|back|previous|prev|left/;
  // tombol panah "berikutnya" di kartu berhalaman (mis. kartu "What's new" / changelog Flow): teks kosong / ikon panah
  function pagerKind(el, root) {
    var lab = labelOf(el);
    if (ICON_WORD.test(lab)) lab = ''; // ligatur ikon tanpa kelas ikon terbaca sebagai teks
    if (lab) {
      if (PAGER_NEXT_LABEL.test(lab)) return 'next';
      if (/^(back|previous|sebelumnya|kembali|‹|«|←|<)$/i.test(lab)) return 'back';
      return null;
    }
    var ic = iconName(el) || (ICON_WORD.test(labelOf(el)) ? labelOf(el) : '');
    if (ic) { if (PAGER_BACK_ICON.test(ic)) return 'back'; if (PAGER_NEXT_ICON.test(ic)) return 'next'; if (/close|clear|cancel/.test(ic)) return 'close'; }
    // ikon svg tanpa nama di bagian bawah kartu: separuh kanan = berikutnya, separuh kiri = kembali;
    // di bagian atas kartu (pojok) = tombol tutup
    var r = el.getBoundingClientRect(), rr = root.getBoundingClientRect();
    if (r.width < 16 || r.height < 16) return null;
    if (r.top + r.height / 2 < rr.top + rr.height * 0.4) return 'close';
    return (r.left + r.width / 2) > (rr.left + rr.width / 2) ? 'next' : 'back';
  }
  function dialogHasSignOut(root) {
    if (/sign ?out|log ?out/i.test(root.innerText || '')) return true;
    var bs = root.querySelectorAll('button, [role="button"], a, [role="menuitem"], [role="link"]');
    for (var i = 0; i < bs.length; i++) if (SIGN_OUT.test(labelOf(bs[i]))) return true;
    return false;
  }
  function onboardingTarget() {
    var dl = Array.prototype.filter.call(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], .cdk-overlay-pane, dialog[open]'), visible);
    for (var d = dl.length - 1; d >= 0; d--) {
      var root = dl[d];
      var txt = root.innerText || '';
      if (dialogHasSignOut(root) || root.querySelector('[contenteditable="true"], [role="textbox"]')) continue; // panel akun / kolom prompt: jangan disentuh
      // kotak centang persetujuan (syarat & ketentuan) dicentang dulu
      var cbs = root.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
      for (var c = 0; c < cbs.length; c++) {
        var cb = cbs[c];
        if (isChecked(cb) || cb.disabled) continue;
        var hit = visible(cb) && cb.getBoundingClientRect().width >= 8 ? cb : cb.closest('label, mat-checkbox, .mdc-checkbox, .mdc-form-field');
        if (hit && visible(hit)) return box(hit, { kind: 'checkbox', dialog: maskText(txt).slice(0, 120) });
      }
      var bs = root.querySelectorAll('button, [role="button"], a[role="button"]');
      var best = null, bestRank = 99, next = null, close = null;
      for (var b = 0; b < bs.length; b++) {
        var el = bs[b];
        if (!visible(el) || looksDisabled(el, root)) continue;
        var lab = labelOf(el);
        if (ONB_BAD.test(lab)) continue;
        var pk = pagerKind(el, root);
        if (pk === 'next' && !next) next = el;
        if (pk === 'close' && !close) close = el;
        if (!ONB_OK.test(lab)) continue;
        var r = onbRank(lab);
        if (r < bestRank) { bestRank = r; best = el; }
      }
      // kartu berhalaman: panah "berikutnya" dulu sampai halaman terakhir (di sana "Get started" aktif);
      // persetujuan (I agree) tetap didahulukan, dan kartu yang berputar tanpa akhir tidak diikuti terus
      root.__fcNext = root.__fcNext || 0;
      if (next && bestRank > 0 && root.__fcNext < 12) { root.__fcNext++; return box(next, { kind: 'next', dialog: maskText(txt).slice(0, 120) }); }
      if (best) return box(best, { kind: 'dismiss', dialog: maskText(txt).slice(0, 120) });
      if (close) return box(close, { kind: 'close', dialog: maskText(txt).slice(0, 120) });
    }
    // halaman persetujuan penuh (bukan dialog): hanya tombol "I agree" yang jelas
    var pb = document.querySelectorAll('button, [role="button"]');
    for (var k = 0; k < pb.length; k++) {
      if (visible(pb[k]) && !pb[k].disabled && PAGE_AGREE.test(labelOf(pb[k]))) return box(pb[k], { kind: 'agree' });
    }
    return null;
  }
  function maskText(t) { return String(t || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '•••@•••').replace(/\s+/g, ' ').trim(); }
  // Flow tidak bisa dipakai akun ini (negara, usia, admin Workspace, daftar tunggu)
  var BLOCKED = /(isn['’]?t|is not|not) (yet )?available (in your (country|region)|for your account|to you|for this account)|unavailable in your (country|region)|tidak tersedia (di negara|di wilayah|untuk akun)|verify your age|confirm your age|must be (at least )?18|verifikasi usia|konfirmasi usia|contact your (administrator|admin)|hubungi administrator|(doesn['’]?t|does not) have access to (google )?flow|tidak memiliki akses ke (google )?flow|join the waitlist|gabung (ke )?daftar tunggu/i;
  function flowBlocked() {
    var t = ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ');
    var m = BLOCKED.exec(t);
    if (!m) return null;
    var i = Math.max(0, m.index - 60);
    return { text: maskText(t.slice(i, m.index + 140)) };
  }
  // ringkasan halaman untuk pesan galat (tanpa email)
  function pageSummary() {
    var h = Array.prototype.filter.call(document.querySelectorAll('h1, h2, [role="heading"]'), visible)[0];
    var seen = {}, labels = [];
    var bs = document.querySelectorAll('button, [role="button"], a[href]');
    for (var i = 0; i < bs.length && labels.length < 10; i++) {
      if (!visible(bs[i])) continue;
      var l = maskText(labelOf(bs[i])).slice(0, 30);
      if (l && !seen[l]) { seen[l] = 1; labels.push(l); }
    }
    return { path: location.pathname, lang: (document.documentElement.lang || ''), heading: maskText(h ? h.innerText : '').slice(0, 80), buttons: labels, dialogs: overlays().length };
  }
  // ---------- AI pembaca halaman: daftar elemen bernomor yang boleh diklik + teks terlihat ----------
  var NAV_SEL = 'button, [role="button"], a[href], [role="link"], [role="tab"], [role="checkbox"], input[type="checkbox"], [role="menuitem"], [role="radio"], [role="switch"], [role="option"], [tabindex="0"]';
  var NAV_BAD = /sign ?out|log ?out|keluar|switch account|ganti akun|add account|tambah akun|subscribe|upgrade|buy|purchase|beli|langganan|tingkatkan|delete|hapus|google ai (pro|ultra)|add ai credits|tambah kredit|changelog|share|bagikan/i;
  function navOnTop(el) {
    var r = el.getBoundingClientRect();
    var x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    var t = document.elementFromPoint(x, y);
    return !!t && (t === el || el.contains(t) || t.contains(el));
  }
  // label untuk AI: teks tombol; kotak centang → teks <label> miliknya; ligatur ikon → kosong (nama ikon dikirim terpisah)
  function navLabel(el) {
    var lab = labelOf(el);
    if (!lab && el.labels && el.labels.length) lab = (el.labels[0].innerText || '').replace(/\s+/g, ' ').trim();
    if (!lab && el.getAttribute('aria-labelledby')) { var lb = document.getElementById(el.getAttribute('aria-labelledby')); if (lb) lab = (lb.innerText || '').trim(); }
    if (/^(arrow_|chevron_|navigate_|keyboard_arrow_|east$|west$|close$)/.test(lab)) lab = '';
    return lab.slice(0, 120);
  }
  function pageMap() {
    var dl = Array.prototype.filter.call(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]'), function (d) { return visible(d) && !dialogHasSignOut(d); });
    var inDialog = function (el) { for (var i = 0; i < dl.length; i++) if (dl[i].contains(el)) return true; return false; };
    var all = document.querySelectorAll(NAV_SEL), els = [], out = [];
    for (var i = 0; i < all.length && out.length < 70; i++) {
      var el = all[i];
      if (!visible(el)) continue;
      if (el.parentElement && el.parentElement.closest('button, [role="button"], a[href], [role="link"], [role="menuitem"], [role="option"]')) continue; // bagian dalam tombol lain
      if (el.matches('[contenteditable="true"], textarea, input:not([type="checkbox"]), [role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog')) continue;
      var r = el.getBoundingClientRect();
      if (r.width * r.height > 0.35 * innerWidth * innerHeight) continue; // wadah besar, bukan tombol
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth || r.width < 6 || r.height < 6) continue;
      if (!navOnTop(el)) continue; // tertutup kartu / dialog lain → tidak bisa diklik sekarang
      var lab = navLabel(el);
      if (NAV_BAD.test(lab)) continue;
      var host = '';
      if (el.tagName === 'A' && el.href) { try { host = new URL(el.href).host; } catch (e) { host = ''; } }
      if (host && host !== location.host) continue; // tautan ke luar Flow
      var root = el.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open]') || document.body;
      var o = { id: out.length, role: (el.getAttribute('role') || (el.tagName === 'INPUT' ? 'checkbox' : el.tagName.toLowerCase())), label: maskText(lab).slice(0, 80),
        icon: lab ? '' : (iconName(el) || '').slice(0, 30), dialog: inDialog(el), disabled: looksDisabled(el, root), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      if (o.role === 'checkbox' || el.getAttribute('aria-checked') != null) o.checked = isChecked(el);
      if (el.tagName === 'A') o.link = true;
      els.push(el);
      out.push(o);
    }
    // elemen di dalam dialog di depan daftar
    var order = out.map(function (o, k) { return k; }).sort(function (a, b) { return (out[b].dialog ? 1 : 0) - (out[a].dialog ? 1 : 0) || a - b; });
    var sorted = [], sEls = [];
    order.forEach(function (k, n) { var o = out[k]; o.id = n; sorted.push(o); sEls.push(els[k]); });
    window.__fcNav = sEls;
    var dtext = dl.map(function (d) { return d.innerText || ''; }).join(' | ');
    return { path: location.pathname, title: document.title, lang: document.documentElement.lang || '', vw: innerWidth, vh: innerHeight, dialogs: dl.length,
      dialogText: maskText(dtext).slice(0, 2000), text: maskText((document.body && document.body.innerText) || '').slice(0, 2000), elements: sorted };
  }
  // tanda tangan halaman: berubah bila alamat, jumlah dialog, atau teks terlihat berubah
  function pageSig() {
    var t = location.pathname + '|' + overlays().length + '|' + ((document.body && document.body.innerText) || '');
    var h = 0;
    for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return String(h);
  }
  // elemen pilihan AI → kotak klik, hanya bila masih elemen yang sama (label sama, terlihat, tidak terlarang)
  function navTarget(id, label) {
    var el = (window.__fcNav || [])[id];
    if (!el || !el.isConnected || !visible(el)) return null;
    var lab = navLabel(el);
    if (maskText(lab).slice(0, 80) !== String(label || '') || NAV_BAD.test(lab)) return null;
    return box(el, { kind: NEW_PROJECT.test(lab) || (lab.length <= 40 && NEW_PROJECT_LOOSE.test(lab)) ? 'new' : 'ai' });
  }
  // nomor di atas setiap elemen untuk tangkapan layar (dilepas lagi setelah difoto; tidak menghalangi klik)
  function navMarks(on) {
    var old = document.getElementById('__fcMarks');
    if (old) old.remove();
    if (!on) return true;
    var wrap = document.createElement('div');
    wrap.id = '__fcMarks';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    (window.__fcNav || []).forEach(function (el, i) {
      if (!el.isConnected) return;
      var r = el.getBoundingClientRect();
      var f = document.createElement('div');
      f.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;outline:2px solid #ff2d55;outline-offset:1px';
      var b = document.createElement('div');
      b.textContent = String(i);
      b.style.cssText = 'position:fixed;left:' + Math.max(0, r.left - 2) + 'px;top:' + Math.max(0, r.top - 16) + 'px;background:#ff2d55;color:#fff;font:bold 12px/14px sans-serif;padding:1px 4px;border-radius:3px';
      wrap.appendChild(f);
      wrap.appendChild(b);
    });
    document.documentElement.appendChild(wrap);
    return true;
  }
  // chip setelan di samping kolom prompt (mis. "Video · 8s · x2" / aria-label "Settings trigger")
  function settingsTrigger() {
    var ed = editor();
    var er = ed ? ed.getBoundingClientRect() : null;
    var els = document.querySelectorAll('button, [role="button"], [role="combobox"]');
    var best = null, bestScore = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var lab = labelOf(el), all = (el.getAttribute('aria-label') || '') + ' ' + (el.innerText || '');
      var score = 0;
      if (/settings trigger|generation settings|setelan (pembuatan|generate)/i.test(all)) score += 10;
      if (el.classList && el.classList.contains('settings-trigger-button')) score += 20;
      if (/(^|[\s·•|])x[1-4]([\s·•|]|$)/i.test(all)) score += 4;
      if (/\b(video|image|images|gambar|视频|图片|圖片)\b/i.test(all)) score += 2;
      if (/\b\d{1,2}\s?s\b|16:9|9:16/.test(all)) score += 2;
      if (/^(tune|settings)$/i.test(lab) || /^(tune|settings)/.test((el.innerText || '').trim())) score += 3;
      if (/to video|create image/i.test(all)) score -= 4; // pemilih mode lama, bukan panel setelan
      if (er) {
        var r = el.getBoundingClientRect();
        var dy = Math.abs((r.top + r.height / 2) - (er.top + er.height / 2));
        if (dy < 200) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return best && bestScore >= 5 ? box(best) : null;
  }
  // pemilih mode gaya lama: combobox "Text to Video"
  function legacyModeTrigger() {
    return find({ roles: ['combobox', 'button'], re: '^(text|frames|ingredients) to video$|^create image$|^(teks|frame|bahan) ke video$|^buat gambar$', scope: 'page' });
  }
  // pemicu daftar model (tombol/combobox bertuliskan nama model)
  function modelTrigger() {
    return find({ roles: ['combobox', 'button'], re: '(veo|imagen|nano ?banana|omni|gemini|lyria)', exclude: '^(start generation|generate)$', scope: 'auto' });
  }
  function optionLabels() {
    var out = [];
    var els = document.querySelectorAll('[role="option"], [role="menuitemradio"], [role="menuitem"], [role="radio"], [role="tab"]');
    for (var i = 0; i < els.length; i++) {
      if (!visible(els[i])) continue;
      var lab = labelOf(els[i]);
      if (lab && lab.length <= 80) out.push({ role: els[i].getAttribute('role'), label: lab, primary: primaryText(els[i]) || lab, checked: isChecked(els[i]) });
    }
    return out;
  }
  var SUSPECT = /unusual (traffic|activity)|re-?captcha|captcha|not a robot|verify (it.s you|you are human|that you)|automated (queries|requests)|aktivitas tidak biasa|bukan robot|something went wrong|try again later|terjadi kesalahan|coba lagi nanti/i;
  var FAIL = /fail|error|couldn.t|could not|unable|violat|policy|quota|limit reached|out of credits|insufficient|gagal|tidak dapat|kuota|kredit tidak cukup|melanggar/i;
  // "unusual activity"/captcha sungguhan (akun perlu istirahat) vs "something went wrong" biasa (cukup diulang)
  var UNUSUAL = /unusual (traffic|activity)|re-?captcha|captcha|not a robot|verify (it.s you|you are human|that you)|automated (queries|requests)|aktivitas tidak biasa|bukan robot/i;
  // semua pesan galat yang terlihat → [{text, suspect, unusual}] (dipakai Generate untuk mengabaikan pesan lama)
  function pageErrors() {
    var out = [];
    var els = document.querySelectorAll('[role="alert"], [role="alertdialog"], [aria-live="assertive"], [aria-live="polite"], [role="status"], .snackbar, [class*="snackbar" i], [class*="toast" i]');
    for (var i = 0; i < els.length && out.length < 10; i++) {
      if (!visible(els[i])) continue;
      var t = (els[i].innerText || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 300) continue;
      var e = SUSPECT.test(t) ? { suspect: true, unusual: UNUSUAL.test(t), text: t.slice(0, 200) } : FAIL.test(t) ? { suspect: false, unusual: false, text: t.slice(0, 200) } : null;
      if (e && !out.some(function (x) { return x.text === e.text; })) out.push(e);
    }
    return out;
  }
  function pageError() {
    return pageErrors()[0] || null;
  }

  // ---------- Referensi gambar: unggah, pemilih "@", chip, slot frame ----------
  function ligs(el) {
    var out = [], ic = el.querySelectorAll(ICON_SEL);
    for (var i = 0; i < ic.length; i++) out.push((ic[i].textContent || '').trim());
    return out;
  }
  function hasLig(el, lig) { return ligs(el).indexOf(lig) >= 0; }
  function promptBox() {
    var ed = editor();
    if (!ed) return null;
    return (ed.closest && ed.closest('flow-prompt-box')) || ed.parentElement;
  }
  function inOverlay(el) { return !!(el.closest && el.closest(OVERLAY_SEL)); }
  // ---------- Penjaga mode: Bulk/Studio harus generate BIASA di grid project ----------
  // Flow punya tampilan edit (/project/<id>/edit/<media>): prompt di sana MENGEDIT gambar itu dan hasilnya menumpuk
  // sebagai versi di bawah satu kartu. Juga: kartu terpilih di grid & sakelar "Flow Agent" mengubah arti prompt.
  // → { sub: 'edit'|… |null (segmen setelah id project), selected: n kartu terpilih, agent: {kotak sakelar}|null,
  //     clearSel: {kotak tombol batal pilih}|null, back: {kotak tombol kembali}|null }
  function viewState() {
    var m = /\/project\/[A-Za-z0-9-]{1,128}\/?(.*)$/.exec(location.pathname);
    var rest = m ? m[1].replace(/\/+$/, '') : '';
    var sub = rest ? rest.split('/')[0].toLowerCase() || 'view' : null;
    var tiles = document.querySelectorAll('flow-grid-tile-container');
    var selected = 0;
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      // pilihan grid Flow = ".selected" di dalam kartu (Ctrl+klik) / kotak centang kartu
      if (t.getAttribute('aria-selected') === 'true' || t.classList.contains('selected') || t.querySelector('.selected, input[type="checkbox"]:checked')) selected++;
    }
    var agent = null, clearSel = null, back = null;
    var els = document.querySelectorAll('button, [role="button"], [role="switch"]');
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      if (!visible(el)) continue;
      var lab = labelOf(el);
      if (!agent && /^(flow )?agent$/i.test(lab) && (el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true')) agent = box(el);
      else if (!clearSel && /^(clear selection|deselect all|unselect all|batalkan pilihan|hapus pilihan|batal pilih)$/i.test(lab)) clearSel = box(el);
      else if (!back && sub && (/^(back|kembali|back button to go to previous page|go back|close|tutup)$/i.test(lab) || hasLig(el, 'arrow_back'))) back = box(el);
    }
    return { sub: sub, path: location.pathname, selected: selected, agent: agent, clearSel: clearSel, back: back };
  }
  // tombol "+" untuk menambah media: toolbar Flow (di luar kotak prompt) lebih dulu, lalu "+" di kotak prompt
  function toolbarAdd() {
    var els = document.querySelectorAll('button, [role="button"]');
    var best = null, bestScore = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el) || inOverlay(el)) continue;
      var lab = labelOf(el), score = 0, insideBox = !!(el.closest && el.closest('flow-prompt-box'));
      if (hasLig(el, 'add') && !insideBox) score = 10;
      else if (hasLig(el, 'add_2') || hasLig(el, 'add')) score = 7;
      if (/^(add( media| ingredients?( to the prompt box)?| images?)?|upload( media)?|tambah( media| gambar| bahan)?|unggah( media)?)$/i.test(lab)) score = Math.max(score, 8);
      if (/new project|project baru|proyek baru/i.test(lab)) score = 0;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return best ? box(best) : null;
  }
  // entri "Upload" di menu yang terbuka setelah "+"
  function uploadMenuItem() {
    var ov = overlays();
    for (var j = ov.length - 1; j >= 0; j--) {
      var els = ov[j].querySelectorAll('[role="menuitem"], [role="option"], button, [role="button"]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!visible(el)) continue;
        if (hasLig(el, 'upload') || hasLig(el, 'upload_file') || /^(upload( media| image| from (computer|device))?|unggah( media| gambar)?|dari perangkat)$/i.test(labelOf(el))) return box(el);
      }
    }
    return null;
  }
  function dialogCount() {
    return Array.prototype.filter.call(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'), visible).length;
  }
  // pilihan aset di pemilih "@" (dan pemilih frame)
  function mentionOptions() {
    var els = Array.prototype.filter.call(document.querySelectorAll('button.asset-item[role="option"], .asset-item[role="option"]'), visible);
    if (!els.length) {
      var ov = overlays();
      for (var j = ov.length - 1; j >= 0 && !els.length; j--) els = Array.prototype.filter.call(ov[j].querySelectorAll('[role="option"]'), visible);
    }
    return els.map(function (el, i) {
      var t = el.querySelector('.asset-title');
      var title = ((t && t.textContent) || primaryText(el) || labelOf(el) || '').replace(/\s+/g, ' ').trim();
      var b = box(el);
      return { i: i, title: title.slice(0, 120), x: b.x, y: b.y, w: b.w, h: b.h };
    });
  }
  function mentionChips() {
    var root = promptBox() || document;
    var els = root.querySelectorAll('.mention-chip');
    return Array.prototype.map.call(els, function (c) {
      return { text: (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120), type: c.getAttribute('data-reference-type') || '', id: c.getAttribute('data-entity-id') || '' };
    });
  }
  function caretToEnd() {
    var ed = editor();
    if (!ed) throw new Error('PROMPT_BOX_NOT_FOUND');
    ed.focus();
    if (typeof ed.setSelectionRange === 'function') { var n = ed.value.length; ed.setSelectionRange(n, n); }
    else {
      var r = document.createRange();
      r.selectNodeContents(ed);
      r.collapse(false);
      var sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return { chips: mentionChips().length, text: promptText() };
  }
  // penggeser durasi di panel setelan ("Durasi 10 Dtk")
  function sliderEl() {
    var ov = overlays();
    for (var j = ov.length - 1; j >= 0; j--) {
      var els = Array.prototype.filter.call(ov[j].querySelectorAll('input[type="range"], [role="slider"]'), visible);
      if (els.length) return els[0];
    }
    return null;
  }
  function durationSlider() {
    var el = sliderEl();
    if (!el) return null;
    var num = function (a, d) { var v = parseFloat(a); return isNaN(v) ? d : v; };
    var range = el.tagName === 'INPUT';
    return {
      now: num(range ? el.value : el.getAttribute('aria-valuenow'), null),
      min: num(range ? el.min : el.getAttribute('aria-valuemin'), 0),
      max: num(range ? el.max : el.getAttribute('aria-valuemax'), 100)
    };
  }
  function focusDurationSlider() {
    var el = sliderEl();
    if (!el) return false;
    el.scrollIntoView({ block: 'nearest' });
    el.focus();
    return document.activeElement === el;
  }
  // slot frame kosong (Awal / Akhir) pada mode Frames to Video
  function emptyFrameChip() {
    var els = Array.prototype.filter.call(document.querySelectorAll('flow-prompt-box button.empty-chip, button.empty-chip'), visible);
    if (els.length) return box(els[0]);
    return find({ roles: ['button'], re: '^(start|end|first|last|awal|akhir)( frame)?$', scope: 'page' });
  }
  function boundFrames() {
    return Array.prototype.filter.call(document.querySelectorAll('flow-prompt-box button.chip-container'), function (b) { return visible(b) && !!b.querySelector('img'); }).length;
  }
  function picker() {
    var p = Array.prototype.filter.call(document.querySelectorAll('flow-add-menu-popover-content'), visible).pop();
    if (!p) return { open: false };
    var input = Array.prototype.filter.call(p.querySelectorAll('input[type="text"], input:not([type]), input[type="search"]'), visible)[0];
    var confirm = Array.prototype.filter.call(document.querySelectorAll('button.detail-add-to-prompt-btn'), visible)[0];
    return { open: true, search: input ? box(input) : null, confirm: confirm ? box(confirm) : null };
  }
  function focusPickerSearch() {
    var p = Array.prototype.filter.call(document.querySelectorAll('flow-add-menu-popover-content'), visible).pop();
    var input = p && p.querySelector('input');
    if (!input) return false;
    input.focus();
    input.select();
    return true;
  }
  // Flow mengganti tombol kirim dengan peringatan kredit tidak cukup
  function creditsWarning() {
    var el = Array.prototype.filter.call(document.querySelectorAll('button.prompt-warning-button'), visible)[0];
    return el ? (labelOf(el) || 'credits').slice(0, 120) : null;
  }
  // kartu hasil yang gagal di grid project
  var TILE_FAIL = /^(failed|generation failed|failed to generate|couldn.t (generate|create)[^]*|could not (generate|create)[^]*|something went wrong[^]*|we noticed some unusual activity[^]*|[^]*violat[^]*polic[^]*|[^]*might violate[^]*|gagal|gagal (membuat|menghasilkan)[^]*|tidak dapat (membuat|menghasilkan)[^]*)$/i;
  function failedTiles() {
    var texts = [], box0 = promptBox();
    var els = document.querySelectorAll('main *, [role="main"] *, body > div *');
    for (var i = 0; i < els.length && texts.length < 50; i++) {
      var el = els[i];
      if (el.children.length > 2) continue;
      var raw = el.textContent || '';
      if (!raw || raw.length > 400) continue;
      var t = raw.replace(/\s+/g, ' ').trim();
      if (!t || t.length > 200 || !TILE_FAIL.test(t) || (box0 && box0.contains(el)) || inOverlay(el) || !visible(el)) continue;
      if (texts.indexOf(t) < 0 || el.children.length === 0) texts.push(t);
    }
    return { count: texts.length, texts: texts.slice(0, 5) };
  }
  // bilah persetujuan cookie Google menutupi kotak prompt → pilih "Tolak"
  function cookieReject() {
    var el = Array.prototype.filter.call(document.querySelectorAll('button.glue-cookie-notification-bar__reject'), visible)[0];
    return el ? box(el) : null;
  }

  // ---------- Saldo kredit Flow (panel "Account details") ----------
  // HANYA membaca: panel ini juga memuat "Sign out" — selain tombol pembuka & tombol tutup panel, jangan klik apa pun.
  var SIGN_OUT = /sign ?out|log ?out|keluar|switch account|ganti akun|add account|tambah akun/i;
  function accountDetailsButton() {
    var els = document.querySelectorAll('button, [role="button"]');
    var exact = null, loose = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var aria = (el.getAttribute('aria-label') || '').trim();
      var lab = aria || labelOf(el);
      if (SIGN_OUT.test(lab)) continue;
      if (/^(account details|detail akun|account menu|menu akun)$/i.test(aria) || /^(account details|detail akun)$/i.test(lab)) { exact = el; break; }
      // tombol avatar/paket: label tersembunyi "Account details" di dalamnya, atau aria "Google Account: …"
      if (!loose && (/^google account\b/i.test(aria) || /account details|detail akun/i.test(el.textContent || ''))) loose = el;
    }
    var hit = exact || loose;
    return hit ? box(hit) : null;
  }
  // tombol "Close account panel" (panel akun Flow tidak tertutup dengan Escape)
  function accountPanelClose() {
    var els = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var lab = (el.getAttribute('aria-label') || labelOf(el) || '').trim();
      if (/^(close account panel|tutup panel akun|close account details)$/i.test(lab)) return box(el);
    }
    return null;
  }
  var CREDIT_WORD = '(?:google\\s+)?(?:flow\\s+|ai\\s+)?(?:credits?|kredit)';
  var CREDITS_A = new RegExp('(\\d[\\d.,]*)\\s*' + CREDIT_WORD + '(?!\\s*(?:cost|per))', 'i');
  var CREDITS_B = new RegExp('(?:google\\s+)?(?:flow|ai)\\s+(?:credits?|kredit)\\D{0,30}?(\\d[\\d.,]*)', 'i');
  function toNum(t) {
    var n = parseInt(String(t || '').replace(/[.,\s]/g, ''), 10);
    return isFinite(n) && n >= 0 && n < 100000000 ? n : null;
  }
  function creditsNumber(t, loose) {
    t = String(t || '').replace(/\s+/g, ' ');
    if (/add (ai )?credits|get (more )?credits|beli kredit|tambah kredit/i.test(t) && !/\d/.test(t.replace(/add (ai )?credits/ig, ''))) return null;
    var m = CREDITS_B.exec(t) || (loose ? CREDITS_A.exec(t) : (/\b(flow|ai|google)\b/i.test(t) && CREDITS_A.exec(t)));
    return m ? toNum(m[1]) : null;
  }
  // panel akun yang sedang terbuka: overlay/dialog yang memuat tombol tutup panel, alamat email, atau "credits"
  function accountPanel() {
    var ov = overlays();
    for (var j = ov.length - 1; j >= 0; j--) {
      if (ov[j].querySelector('.credit-cost-label')) continue; // popover setelan (label biaya), bukan panel akun
      var t = ov[j].textContent || '';
      if (/(flow|ai)\s+credits?|kredit|sign ?out|close account panel|@[a-z0-9.-]+\.[a-z]{2,}/i.test(t) || ov[j].querySelector('[aria-label="Close account panel"]')) return ov[j];
    }
    var c = accountPanelClose();
    if (c) {
      var el = document.elementFromPoint(c.x, c.y);
      for (var k = 0; el && k < 12; k++, el = el.parentElement) if ((el.textContent || '').length > 40) return el;
    }
    return null;
  }
  function creditsBalance() {
    // 1) tautan/tombol "N Google Flow credits" (paket gratis) / "N AI credits" (paket Google AI)
    var links = document.querySelectorAll('a[href], [role="link"], button, [role="button"], [role="menuitem"]');
    for (var i = 0; i < links.length; i++) {
      if (!visible(links[i]) || SIGN_OUT.test(labelOf(links[i]))) continue;
      var n = creditsNumber(labelOf(links[i]) + ' ' + (links[i].textContent || ''), false);
      if (n !== null) return { credits: n, via: 'link' };
    }
    // 2) teks terkecil di panel akun yang memuat angka + "credits"
    var panel = accountPanel();
    if (panel) {
      var els = panel.querySelectorAll('*');
      for (var k = els.length - 1; k >= 0; k--) {
        var el = els[k];
        if (el.children.length > 4 || !visible(el)) continue;
        var v = creditsNumber(el.textContent, true);
        if (v !== null) return { credits: v, via: 'panel' };
      }
    }
    return null;
  }
  // diagnosa bila saldo tak terbaca: cuplikan teks panel akun (email disamarkan)
  function accountPanelText() {
    var p = accountPanel();
    var t = p ? (p.innerText || p.textContent || '') : '';
    return t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '•••@•••').replace(/\s+/g, ' ').trim().slice(0, 160);
  }
  function scrollTopPage() { try { window.scrollTo(0, 0); } catch (e) { /* abaikan */ } return true; }

  var api = {
    accountDetailsButton: accountDetailsButton, creditsBalance: creditsBalance, accountPanelClose: accountPanelClose,
    accountPanelText: accountPanelText, scrollTopPage: scrollTopPage,
    status: status, listMedia: listMedia, getMedia: getMedia, fetchB64: fetchB64, focusPrompt: focusPrompt,
    promptText: promptText, setPromptFallback: setPromptFallback, markFileInput: markFileInput, pasteFiles: pasteFiles,
    findGenerate: findGenerate, find: find, newProjectTarget: newProjectTarget, settingsTrigger: settingsTrigger,
    onboardingTarget: onboardingTarget, flowBlocked: flowBlocked, pageSummary: pageSummary, pageMap: pageMap, pageSig: pageSig, navTarget: navTarget, navMarks: navMarks,
    legacyModeTrigger: legacyModeTrigger, modelTrigger: modelTrigger, overlayOpen: overlayOpen, optionLabels: optionLabels,
    pageError: pageError, pageErrors: pageErrors, toolbarAdd: toolbarAdd, uploadMenuItem: uploadMenuItem, dialogCount: dialogCount,
    mentionOptions: mentionOptions, mentionChips: mentionChips, caretToEnd: caretToEnd, emptyFrameChip: emptyFrameChip,
    boundFrames: boundFrames, picker: picker, focusPickerSearch: focusPickerSearch, creditsWarning: creditsWarning,
    failedTiles: failedTiles, cookieReject: cookieReject, viewState: viewState, durationSlider: durationSlider, focusDurationSlider: focusDurationSlider
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
