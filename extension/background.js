/**
 * FLOW CONNECT Bridge — service worker.
 *
 * Menghubungkan website FLOW CONNECT dengan tab Google Flow (flow.google.com)
 * milik pengguna sendiri. Semua proses tetap terjadi di Google Flow asli:
 *
 *  • status       → apakah ada tab Flow, akun yang login, project yang terbuka
 *  • listMedia    → membaca daftar media project (RPC baca-saja, tanpa reCAPTCHA)
 *  • getMedia     → URL media (gambar/video) dari Flow
 *  • download     → unduh media lewat chrome.downloads
 *  • sendImage    → menaruh gambar ke UI Flow (seperti drag-and-drop / paste);
 *                   upload dilakukan oleh Flow sendiri
 *  • sendPrompt   → menuliskan prompt ke kotak prompt Flow (tidak menekan Generate)
 *  • openFlow     → membuka / fokus tab Flow
 *
 * Yang SENGAJA tidak dilakukan: memanggil endpoint generate/upload Flow langsung
 * atau membuat token reCAPTCHA. Itu melewati proteksi Google dan berisiko akun
 * pengguna ditandai. Generate selalu ditekan pengguna di Google Flow.
 */

const VERSION = chrome.runtime.getManifest().version
const FLOW_ORIGIN = 'https://flow.google.com'
const FLOW_HOME = `${FLOW_ORIGIN}/`
const MEDIA_HOST = 'flow-content.google'
const ALLOWED_ORIGINS = [
  /^https:\/\/flow-connect-2qu\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.flow-connect-2qu\.pages\.dev$/,
  /^http:\/\/localhost:5173$/,
]
const RPC_PROJECT_MEDIA = 'Zzl0ze'
const RPC_MEDIA = 'as29s'
const PROJECT_ID_RE = /^[A-Za-z0-9-]{1,128}$/

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ───────────── tab helpers ───────────── */

async function flowTabs() {
  return chrome.tabs.query({ url: [`${FLOW_ORIGIN}/*`] })
}

function projectIdFromUrl(url) {
  const m = /\/project\/([A-Za-z0-9-]{1,128})/.exec(url || '')
  return m ? m[1] : null
}

async function revive(tab) {
  if (!tab.discarded) return tab
  await chrome.tabs.reload(tab.id)
  await waitForComplete(tab.id)
  return chrome.tabs.get(tab.id)
}

function waitForComplete(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listener)
      clearTimeout(timer)
      resolve()
    }
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') done()
    }
    const timer = setTimeout(done, timeout)
    chrome.tabs.onUpdated.addListener(listener)
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done()).catch(done)
  })
}

/** Tab Flow yang paling cocok: tab project tertentu → tab project mana pun → tab Flow apa pun. */
async function pickTab(projectId) {
  const tabs = await flowTabs()
  const tab =
    (projectId && tabs.find((t) => projectIdFromUrl(t.url) === projectId)) ||
    tabs.find((t) => projectIdFromUrl(t.url) && !t.discarded) ||
    tabs.find((t) => !t.discarded) ||
    tabs[0]
  return tab ? revive(tab) : null
}

async function runInTab(tabId, func, args = []) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args })
  return res?.result
}

/* ───────────── page-side functions (dijalankan di tab Flow, MAIN world) ───────────── */

function pageInfo() {
  const wiz = globalThis.WIZ_global_data || {}
  const email = typeof wiz.oPEP7c === 'string' && wiz.oPEP7c.includes('@') ? wiz.oPEP7c : null
  return {
    signedIn: !!wiz.SNlM0e,
    email,
    title: document.title,
    lang: document.documentElement.lang || null,
  }
}

/** batchexecute baca-saja di konteks halaman Flow. Mengembalikan payload yang sudah di-parse. */
async function pageBatchRead(rpcid, inner, mediaHost) {
  const wiz = globalThis.WIZ_global_data || {}
  const at = wiz.SNlM0e
  if (!at) return { error: 'NOT_SIGNED_IN' }
  const freq = JSON.stringify([[[rpcid, JSON.stringify(inner), null, 'generic']]])
  const hl = (document.documentElement.lang || navigator.language || 'en').split('-')[0]
  const reqid = Math.floor(Math.random() * 900000) + 100000
  const url =
    `/_/AiSandboxAngularFrontend/data/batchexecute?rpcids=${encodeURIComponent(rpcid)}` +
    `&source-path=${encodeURIComponent(location.pathname || '/')}` +
    `&bl=${encodeURIComponent(wiz.cfb2h || '')}&f.sid=${encodeURIComponent(wiz.FdrFJe || '')}` +
    `&hl=${encodeURIComponent(hl)}&_reqid=${reqid}&rt=c`
  let text
  try {
    const resp = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-same-domain': '1' },
      body: new URLSearchParams({ 'f.req': freq, at }),
    })
    text = await resp.text()
    if (!resp.ok) return { error: `HTTP_${resp.status}` }
  } catch (e) {
    return { error: String(e && e.message || e) }
  }

  // parse ")]}'" + chunk berawalan panjang → envelope ["wrb.fr", rpcid, "<json>", ..., err]
  const body = text.startsWith(")]}'") ? text.slice(text.indexOf('\n') + 1) : text
  let payload, rpcError
  const lines = body.split('\n')
  for (const line of lines) {
    const s = line.trim()
    if (!s.startsWith('[')) continue
    let chunk
    try { chunk = JSON.parse(s) } catch { continue }
    for (const entry of Array.isArray(chunk) ? chunk : []) {
      if (!Array.isArray(entry) || entry[0] !== 'wrb.fr' || entry[1] !== rpcid) continue
      if (entry[2] == null) rpcError = entry[5] ?? true
      else try { payload = JSON.parse(entry[2]) } catch { payload = entry[2] }
    }
    if (payload !== undefined) break
  }
  if (payload === undefined) return { error: rpcError ? `RPC_ERROR ${JSON.stringify(rpcError)}` : 'NO_PAYLOAD' }

  // kumpulkan URL media dari payload
  const urls = {}
  const walk = (n, fn) => {
    if (typeof n === 'string') fn(n)
    else if (Array.isArray(n)) for (const x of n) walk(x, fn)
  }
  walk(payload, (s) => {
    if (!s.startsWith('https://') || !s.includes(mediaHost)) return
    const m = /\/(image|video)\/([A-Za-z0-9-]+)/.exec(s)
    if (!m) return
    const rec = (urls[m[2]] = urls[m[2]] || {})
    if (!rec[m[1]]) rec[m[1]] = s
  })

  if (rpcid === 'Zzl0ze') {
    // entri: [assetId, folderId, null, [title, [sec, nanos], isVideo, null, mediaId, opId, done], projectId]
    const items = []
    const seen = new Set()
    const visit = (n) => {
      if (!Array.isArray(n)) return
      const d = n[3]
      if (n.length >= 4 && Array.isArray(d) && d.length > 4 && typeof d[4] === 'string' && /^[0-9a-fA-F-]{36}$/.test(d[4])) {
        if (!seen.has(d[4])) {
          seen.add(d[4])
          const ts = Array.isArray(d[1]) && typeof d[1][0] === 'number' ? d[1][0] * 1000 : null
          items.push({
            mediaId: d[4],
            assetId: typeof n[0] === 'string' ? n[0] : null,
            title: typeof d[0] === 'string' ? d[0] : '',
            createdAt: ts,
            isVideo: d[2] === true || d[2] === 1,
            done: d.length > 6 ? !!d[6] : true,
            image: urls[d[4]]?.image || null,
            video: urls[d[4]]?.video || null,
          })
        }
        return
      }
      for (const x of n) visit(x)
    }
    visit(payload)
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    return { items }
  }
  return { urls }
}

/** Taruh file gambar ke UI Flow seperti pengguna melakukan drag-and-drop / paste. */
async function pageDropImages(files) {
  // decode manual (fetch(data:) bisa diblokir CSP halaman)
  const toFile = async ({ dataUrl, name, type }) => {
    const [head, b64] = dataUrl.split(',', 2)
    const mime = type || (/^data:([^;]+)/.exec(head) || [])[1] || 'image/png'
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new File([bytes], name || 'gambar.png', { type: mime })
  }
  const list = await Promise.all(files.map(toFile))
  const dt = new DataTransfer()
  list.forEach((f) => dt.items.add(f))

  // 1) input file milik Flow (cara paling setara dengan memilih file manual)
  const inputs = [...document.querySelectorAll('input[type="file"]')].filter((i) => !i.disabled && (!i.accept || /image|\*/.test(i.accept)))
  if (inputs.length) {
    const input = inputs[inputs.length - 1]
    try {
      input.files = dt.files
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return { method: 'file-input', count: list.length }
    } catch { /* lanjut cara berikutnya */ }
  }

  // 2) paste ke kotak prompt
  const editor =
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"]')
  if (editor) {
    editor.focus()
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    editor.dispatchEvent(ev)
    return { method: 'paste', count: list.length }
  }

  // 3) drop ke area utama
  const target = document.querySelector('main') || document.body
  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
  }
  return { method: 'drop', count: list.length }
}

/** Tulis prompt ke kotak prompt Flow tanpa menekan Generate. */
function pageInsertPrompt(text) {
  const editor =
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"]')
  if (!editor) return { error: 'PROMPT_BOX_NOT_FOUND' }
  editor.focus()
  if (editor instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(editor, text)
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    document.execCommand('selectAll', false)
    document.execCommand('insertText', false, text)
  }
  return { ok: true }
}

/* ───────────── actions ───────────── */

const actions = {
  async ping() {
    return { version: VERSION }
  },

  async status() {
    const tabs = await flowTabs()
    const projects = []
    let account = null
    let signedIn = false
    for (const t of tabs) {
      const pid = projectIdFromUrl(t.url)
      if (pid && !projects.some((p) => p.id === pid)) projects.push({ id: pid, title: (t.title || '').replace(/\s*[-–|]\s*Google Flow.*$/i, '') || 'Project', tabId: t.id })
    }
    const tab = tabs.find((t) => !t.discarded && t.status === 'complete')
    if (tab) {
      try {
        const info = await runInTab(tab.id, pageInfo)
        signedIn = !!info?.signedIn
        account = info?.email || null
      } catch { /* tab belum siap */ }
    }
    return { version: VERSION, flowOpen: tabs.length > 0, signedIn, account, projects }
  },

  async openFlow({ url } = {}) {
    const target = typeof url === 'string' && url.startsWith(FLOW_ORIGIN) ? url : FLOW_HOME
    const pid = projectIdFromUrl(target)
    const existing = pid ? await pickTab(pid) : (await flowTabs())[0]
    if (existing && (!pid || projectIdFromUrl(existing.url) === pid)) {
      await chrome.tabs.update(existing.id, { active: true })
      await chrome.windows.update(existing.windowId, { focused: true })
      return { tabId: existing.id, reused: true }
    }
    const t = await chrome.tabs.create({ url: target, active: true })
    return { tabId: t.id, reused: false }
  },

  async listMedia({ projectId }) {
    if (!PROJECT_ID_RE.test(projectId || '')) throw new Error('INVALID_PROJECT_ID')
    const tab = await pickTab(projectId)
    if (!tab) throw new Error('NO_FLOW_TAB')
    const res = await runInTab(tab.id, pageBatchRead, [RPC_PROJECT_MEDIA, [`projects/${projectId}`, null, null, null, [1]], MEDIA_HOST])
    if (!res || res.error) throw new Error(res?.error || 'NO_RESULT')
    return { items: res.items }
  },

  async getMedia({ mediaId }) {
    if (!/^[A-Za-z0-9-]{1,128}$/.test(mediaId || '')) throw new Error('INVALID_MEDIA_ID')
    const tab = await pickTab()
    if (!tab) throw new Error('NO_FLOW_TAB')
    const res = await runInTab(tab.id, pageBatchRead, [RPC_MEDIA, [mediaId], MEDIA_HOST])
    if (!res || res.error) throw new Error(res?.error || 'NO_RESULT')
    const rec = res.urls[mediaId] || Object.values(res.urls)[0] || {}
    return { image: rec.image || null, video: rec.video || null }
  },

  async fetchThumb({ url }) {
    if (!isMediaUrl(url)) throw new Error('INVALID_URL')
    const resp = await fetch(url, { credentials: 'include' })
    if (!resp.ok) throw new Error(`HTTP_${resp.status}`)
    const blob = await resp.blob()
    if (blob.size > 12 * 1024 * 1024) throw new Error('TOO_LARGE')
    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
    return { dataUrl: `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}` }
  },

  async download({ url, filename }) {
    if (!isMediaUrl(url)) throw new Error('INVALID_URL')
    const safe = String(filename || 'flow-connect').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120)
    const id = await chrome.downloads.download({ url, filename: `FLOW CONNECT/${safe}`, saveAs: false, conflictAction: 'uniquify' })
    return { downloadId: id }
  },

  async sendImage({ files, projectId }) {
    if (!Array.isArray(files) || !files.length || files.length > 10) throw new Error('INVALID_FILES')
    for (const f of files) {
      if (typeof f.dataUrl !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(f.dataUrl)) throw new Error('INVALID_IMAGE')
    }
    const tab = await pickTab(projectId)
    if (!tab) throw new Error('NO_FLOW_TAB')
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
    await sleep(300)
    const res = await runInTab(tab.id, pageDropImages, [files])
    if (!res || res.error) throw new Error(res?.error || 'NO_RESULT')
    return res
  },

  async sendPrompt({ text, projectId }) {
    if (typeof text !== 'string' || !text.trim() || text.length > 8000) throw new Error('INVALID_PROMPT')
    const tab = await pickTab(projectId)
    if (!tab) throw new Error('NO_FLOW_TAB')
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
    await sleep(300)
    const res = await runInTab(tab.id, pageInsertPrompt, [text])
    if (!res || res.error) throw new Error(res?.error || 'NO_RESULT')
    return res
  },
}

function isMediaUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === MEDIA_HOST
  } catch {
    return false
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  const origin = sender.origin || (sender.url ? new URL(sender.url).origin : '')
  if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    reply({ ok: false, error: 'ORIGIN_NOT_ALLOWED' })
    return false
  }
  const fn = msg && actions[msg.type]
  if (!fn) {
    reply({ ok: false, error: 'UNKNOWN_ACTION' })
    return false
  }
  Promise.resolve()
    .then(() => fn(msg.payload || {}))
    .then((data) => reply({ ok: true, data }))
    .catch((e) => reply({ ok: false, error: String((e && e.message) || e) }))
  return true
})

// popup
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || msg?.type !== 'status') return false
  actions.status().then((data) => reply({ ok: true, data })).catch((e) => reply({ ok: false, error: String(e) }))
  return true
})
