'use strict';
// Kode yang dijalankan DI DALAM tab Google Flow (lewat CDP Runtime.evaluate, tidak terkena CSP/Trusted Types).
// Isinya diturunkan dari bookmarklet FLOW CONNECT: status akun/project, RPC baca-saja galeri,
// ambil file media, mencari kolom prompt / input file / tombol Generate.
// Tidak pernah membuat token reCAPTCHA — Generate selalu lewat tombol UI Flow sendiri.

const AGENT_VERSION = 5;

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
  var NEW_PROJECT = /^\+?\s*(new project|create (a )?new project|start new project|project baru|proyek baru|buat project( baru)?|buat proyek( baru)?|nuevo proyecto|新建项目|新建項目|新增專案)\s*$/i;
  var LANDING_CTA = /^(create with (google )?flow|get started|start creating|try (it )?now|coba flow|mulai membuat)$/i;
  function newProjectTarget() {
    var els = document.querySelectorAll('button, [role="button"], a[href], [role="link"], [tabindex="0"]');
    var cta = null;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!visible(el)) continue;
      var lab = labelOf(el);
      if (NEW_PROJECT.test(lab)) return box(el, { kind: 'new' });
      if (!cta && LANDING_CTA.test(lab)) cta = el;
    }
    return cta ? box(cta, { kind: 'cta' }) : null;
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
  function pageError() {
    var els = document.querySelectorAll('[role="alert"], [role="alertdialog"], [aria-live="assertive"], [aria-live="polite"], [role="status"], .snackbar, [class*="snackbar" i], [class*="toast" i]');
    for (var i = 0; i < els.length; i++) {
      if (!visible(els[i])) continue;
      var t = (els[i].innerText || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 300) continue;
      if (SUSPECT.test(t)) return { suspect: true, text: t.slice(0, 200) };
      if (FAIL.test(t)) return { suspect: false, text: t.slice(0, 200) };
    }
    return null;
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

  var api = {
    status: status, listMedia: listMedia, getMedia: getMedia, fetchB64: fetchB64, focusPrompt: focusPrompt,
    promptText: promptText, setPromptFallback: setPromptFallback, markFileInput: markFileInput, pasteFiles: pasteFiles,
    findGenerate: findGenerate, find: find, newProjectTarget: newProjectTarget, settingsTrigger: settingsTrigger,
    legacyModeTrigger: legacyModeTrigger, modelTrigger: modelTrigger, overlayOpen: overlayOpen, optionLabels: optionLabels,
    pageError: pageError, toolbarAdd: toolbarAdd, uploadMenuItem: uploadMenuItem, dialogCount: dialogCount,
    mentionOptions: mentionOptions, mentionChips: mentionChips, caretToEnd: caretToEnd, emptyFrameChip: emptyFrameChip,
    boundFrames: boundFrames, picker: picker, focusPickerSearch: focusPickerSearch, creditsWarning: creditsWarning,
    failedTiles: failedTiles, cookieReject: cookieReject
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
