// Edge Function: prompt-chat
// Chat pembuat prompt untuk aplikasi desktop FLOW CONNECT (dan uji coba di halaman Admin).
// - Desktop mengirim kunci lisensi + device id → diverifikasi ke tabel licenses/license_devices.
// - Web mengirim JWT pengguna (Authorization: Bearer <access token>).
// - Kunci API provider (mis. OpenCode Console) diambil dari Supabase Vault; tidak pernah dikirim ke klien.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_MESSAGES = 24
const MAX_CHARS = 6000
const KEY_RE = /^FC(-[A-Z0-9]{5}){5}$/

async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Base URL API: buang "/" di akhir dan endpoint yang sering ikut tertempel (…/v1/responses → …/v1). */
function apiBase(raw: unknown) {
  return String(raw ?? '').trim().replace(/\/+$/, '').replace(/\/(chat\/completions|completions|responses|models|messages)$/i, '').replace(/\/+$/, '')
}
/** Header tambahan: OpenRouter menganjurkan HTTP-Referer & X-Title (nama aplikasi di dasbor mereka). */
function extraHeaders(base: string): Record<string, string> {
  let host = ''
  try { host = new URL(base).hostname } catch { /* base_url tidak valid → tanpa header tambahan */ }
  return /(^|\.)openrouter\.ai$/i.test(host)
    ? { 'HTTP-Referer': 'https://flow-connect-2qu.pages.dev', 'X-Title': 'FLOW CONNECT' }
    : {}
}
/** Cloudflare Workers AI: https://api.cloudflare.com/client/v4/accounts/<akun>/ai/v1 → alamat katalog model (…/ai/models/search). */
function cloudflareSearch(base: string) {
  const m = base.match(/^(https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[A-Za-z0-9]+\/ai)\/v1$/)
  return m ? `${m[1]}/models/search` : null
}
// deno-lint-ignore no-explicit-any
const cfProps = (m: any) => Object.fromEntries((Array.isArray(m?.properties) ? m.properties : []).map((p: any) => [String(p?.property_id ?? ''), p?.value]))
// deno-lint-ignore no-explicit-any
function cfPrice(v: any, kind: 'input' | 'output') {
  if (!Array.isArray(v)) return null
  const row = v.find((x) => x && new RegExp(kind, 'i').test(String(x.unit ?? '')) && /M/.test(String(x.unit ?? '')))
  const n = Number(row?.price)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const truthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'
const perM = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 10000) / 10000 : null
}

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
type Msg = { role: 'user' | 'assistant'; content: string | Part[] }
// gambar opsional (skill "Rekayasa balik prompt"): data URL kecil, ditempel ke pesan pengguna terakhir — butuh model yang mendukung gambar
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/
const MAX_IMAGE = 4_500_000
function cleanMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_CHARS) }))
}

// ───────────────────────── AI pembaca halaman ─────────────────────────
// Instruksi tetap di server (bukan dari klien / admin chat). Jawaban: SATU objek JSON.
const PAGE_SYSTEM = `You operate Google Flow (Google's AI video tool) in a browser on behalf of the signed-in user.
Each turn you receive: the GOAL, previous steps, the page path/title, visible text, a numbered list of the ONLY elements you may click (with label, icon name, position, whether they are inside a dialog/card and whether they look disabled) and often a screenshot where the same numbers are drawn on the elements.
Reply with ONLY one JSON object, no prose, no code fence:
{"action":"click","id":<number>,"reason":"<short>"}  click that element
{"action":"done","reason":"<short>"}                 the goal is already reached (e.g. an empty project editor is open and nothing covers it)
{"action":"wait","reason":"<short>"}                 the page is still loading / changing
{"action":"blocked","reason":"<the message shown>"}  Flow says it is not available for this account (country, age, admin, waitlist) or a step needs the human (sign in, verification, payment)
Rules:
- NEVER choose: sign out / log out / switch or add account, upgrade, subscribe, buy, purchase, add credits, Google AI Pro/Ultra offers, delete, share, settings, feedback, help, links that leave Flow (changelogs, terms pages, "View all", "Learn more").
- A dialog / card / overlay that covers the page must be handled first. Welcome, terms, tour and "What's new" cards: tick the required agreement checkbox, use the NEXT arrow (unlabeled icon button such as arrow_forward on the right) until the last page, then press "Get started" / "Continue" / "Got it" / "I agree". A button that looks disabled becomes active later — do not press it yet.
- To create a project press the button for a new project (e.g. "New project", "+ New project", or the same in another language). Press it at most once; if a previous step already pressed it, prefer "wait".
- Do not repeat a click that changed nothing; choose another element or "wait".
- Only use ids from the list.`
const PAGE_MAX_CHARS = 14000
// deno-lint-ignore no-explicit-any
async function pageReader(admin: any, body: any, licenseId: string | null, userId: string | null, isAdmin: boolean) {
  const text = typeof body.page === 'string' ? body.page.slice(0, PAGE_MAX_CHARS) : ''
  if (!text.trim()) return json({ error: 'EMPTY_MESSAGE' }, 400)
  let image: string | null = null
  if (body.image != null) {
    const img = String(body.image)
    if (img.length > MAX_IMAGE || !IMAGE_RE.test(img)) return json({ error: 'INVALID_IMAGE' }, 400)
    image = img
  }
  const { data: settings } = await admin.from('ai_settings').select('*').eq('id', 1).single()
  if (settings && settings.page_reader_enabled === false) return json({ error: 'PAGE_READER_OFF' }, 503)
  const limit = settings?.page_reader_daily_limit ?? 300
  if (!isAdmin) {
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('license_id', licenseId).eq('category', 'page').gte('created_at', since.toISOString())
    if ((count ?? 0) >= limit) return json({ error: 'DAILY_LIMIT', limit }, 429)
  }
  // urutan model: pilihan admin → model lain yang bisa membaca gambar → model chat bawaan (tanpa gambar)
  const { data: rows, error: mErr } = await admin.from('ai_models')
    .select('id, model_id, label, config, is_default, sort, provider:ai_providers!inner(id, name, kind, base_url, enabled)')
    .eq('category', 'chat').eq('enabled', true).eq('provider.enabled', true)
    .order('is_default', { ascending: false }).order('sort')
  if (mErr) return json({ error: 'CONFIG', detail: mErr.message }, 500)
  // deno-lint-ignore no-explicit-any
  const all: any[] = (rows ?? []).filter((m: any) => m.provider?.kind === 'openai_compat')
  // deno-lint-ignore no-explicit-any
  const vis = (m: any) => truthy(m?.config?.vision)
  const chosen = all.find((m) => m.id === settings?.page_reader_model_id)
  const chain = [chosen, ...all.filter((m) => m !== chosen && vis(m)).slice(0, 2), all.find((m) => m !== chosen && !vis(m))]
    .filter((m, i, a) => m && a.indexOf(m) === i).slice(0, 4)
  if (!chain.length) return json({ error: 'NO_MODEL' }, 503)
  let lastErr: string | null = null
  let status = 502
  for (const model of chain) {
    const provider = model.provider
    const { data: secret } = await admin.rpc('ai_provider_secret', { p_provider: provider.id })
    if (!secret) { lastErr = 'NO_API_KEY'; continue }
    const withImage = !!image && (vis(model) || model === chosen)
    const user = withImage
      ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }]
      : text
    const payload = {
      model: model.model_id,
      messages: [{ role: 'system', content: PAGE_SYSTEM }, { role: 'user', content: user }],
      max_tokens: 400, temperature: 0, stream: false,
    }
    let ok = false, reply = '', errText: string | null = null
    let usage: { prompt_tokens?: number; completion_tokens?: number } = {}
    try {
      const base = apiBase(provider.base_url)
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...extraHeaders(base) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45_000),
      })
      const out = await res.json().catch(() => null)
      if (res.ok && out?.choices?.[0]) {
        reply = String(out.choices[0].message?.content ?? '').trim()
        usage = out.usage ?? {}
        ok = /\{[\s\S]*"action"[\s\S]*\}/.test(reply)
        if (!ok) errText = reply ? `NO_JSON: ${reply.slice(0, 120)}` : 'EMPTY_REPLY'
      } else {
        status = res.status === 429 ? 429 : 502
        errText = `HTTP ${res.status}: ${String(out?.error?.message ?? out?.message ?? out?.errors?.[0]?.message ?? '').slice(0, 300)}`
      }
    } catch (e) {
      errText = `NETWORK: ${(e as Error).message}`.slice(0, 300)
    }
    const cfg = model.config ?? {}
    const inT = usage.prompt_tokens ?? null
    const outT = usage.completion_tokens ?? null
    const cost = inT != null && outT != null && (cfg.input_per_m != null || cfg.output_per_m != null)
      ? (inT * Number(cfg.input_per_m ?? 0) + outT * Number(cfg.output_per_m ?? 0)) / 1e6
      : null
    await admin.from('ai_usage').insert({
      license_id: licenseId, user_id: userId, provider_id: provider.id, model_id: model.model_id, category: 'page',
      input_tokens: inT, output_tokens: outT, cost_usd: cost, ok, error: errText,
    })
    if (ok) return json({ reply, model: { id: model.id, label: model.label }, vision: withImage, usage: { input: inT, output: outT } })
    lastErr = errText
  }
  return json({ error: lastErr === 'NO_API_KEY' ? 'NO_API_KEY' : 'PROVIDER_ERROR', detail: isAdmin ? lastErr : undefined }, status)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))

  // ── 1) siapa pemanggilnya ──
  let licenseId: string | null = null
  let userId: string | null = null
  let isAdmin = false
  const licenseKey = String(body.license_key ?? '').toUpperCase().replace(/\s/g, '')
  if (licenseKey) {
    if (!KEY_RE.test(licenseKey)) return json({ error: 'INVALID_KEY' }, 401)
    const { data: lic } = await admin
      .from('licenses')
      .select('id, user_id, revoked_at, expires_at')
      .eq('key_hash', await sha256hex(licenseKey))
      .maybeSingle()
    if (!lic) return json({ error: 'INVALID_KEY' }, 401)
    if (lic.revoked_at) return json({ error: 'REVOKED' }, 401)
    if (lic.expires_at && Date.parse(lic.expires_at) < Date.now()) return json({ error: 'EXPIRED' }, 401)
    const { data: dev } = await admin
      .from('license_devices')
      .select('id')
      .eq('license_id', lic.id)
      .eq('device_id', String(body.device_id ?? ''))
      .maybeSingle()
    if (!dev) return json({ error: 'INVALID_DEVICE' }, 401)
    licenseId = lic.id
    userId = lic.user_id
  } else {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data } = await userClient.auth.getUser()
    if (!data?.user) return json({ error: 'NOT_AUTHENTICATED' }, 401)
    userId = data.user.id
  }
  if (userId) {
    const { data: a } = await admin.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle()
    isAdmin = !!a
  }
  // ── admin: ambil daftar model langsung dari provider (GET {base}/models, pakai kunci di Vault) ──
  if (body.action === 'list_models') {
    if (!isAdmin || licenseId) return json({ error: 'NOT_ADMIN' }, 403)
    const { data: prov } = await admin.from('ai_providers').select('id, kind, base_url').eq('id', String(body.provider ?? '')).maybeSingle()
    if (!prov) return json({ error: 'NOT_FOUND' }, 404)
    const base = apiBase(prov.base_url)
    const { data: secret } = await admin.rpc('ai_provider_secret', { p_provider: prov.id })
    const cf = cloudflareSearch(base)
    if (cf) {
      // Workers AI menjawab /v1/models dengan 405 — katalognya di …/ai/models/search (format Cloudflare)
      if (!secret) return json({ error: 'NO_API_KEY' }, 503)
      try {
        // deno-lint-ignore no-explicit-any
        const rows: any[] = []
        for (let page = 1; page <= 5; page++) {
          const res = await fetch(`${cf}?task=${encodeURIComponent('Text Generation')}&per_page=100&page=${page}`, {
            headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(30_000),
          })
          const out = await res.json().catch(() => null)
          if (!res.ok || !out?.success) return json({ error: 'PROVIDER_ERROR', detail: `HTTP ${res.status}: ${String(out?.errors?.[0]?.message ?? '').slice(0, 300)}` }, 502)
          const list = Array.isArray(out.result) ? out.result : []
          rows.push(...list)
          if (list.length < 100) break
        }
        const models = rows
          .filter((m) => m && typeof m.name === 'string' && (!m.task?.name || m.task.name === 'Text Generation'))
          .map((m) => {
            const pr = cfProps(m)
            return {
              id: m.name,
              name: `${m.name.replace(/^@[a-z]+\//, '')}${truthy(pr.beta) ? ' (beta)' : ''}`,
              context: Number(pr.context_window ?? pr.max_input_tokens) || null,
              input_per_m: cfPrice(pr.price, 'input'),
              output_per_m: cfPrice(pr.price, 'output'),
              free: false,
              outputs: ['text'],
              vision: truthy(pr.vision),
            }
          })
        return json({ models, base, note: 'cloudflare' })
      } catch (e) {
        return json({ error: 'PROVIDER_ERROR', detail: `NETWORK: ${(e as Error).message}`.slice(0, 300) }, 502)
      }
    }
    try {
      const res = await fetch(`${base}/models`, {
        headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}), ...extraHeaders(base) },
        signal: AbortSignal.timeout(30_000),
      })
      const out = await res.json().catch(() => null)
      if (!res.ok) return json({ error: 'PROVIDER_ERROR', detail: `HTTP ${res.status}: ${String(out?.error?.message ?? out?.message ?? out?.errors?.[0]?.message ?? '').slice(0, 300)}` }, 502)
      const list = Array.isArray(out?.data) ? out.data : Array.isArray(out) ? out : []
      // deno-lint-ignore no-explicit-any
      const models = list.filter((m: any) => m && typeof m.id === 'string').slice(0, 2000).map((m: any) => {
        const outMods: string[] = Array.isArray(m.architecture?.output_modalities) ? m.architecture.output_modalities : Array.isArray(m.output_modalities) ? m.output_modalities : []
        const inMods: string[] = Array.isArray(m.architecture?.input_modalities) ? m.architecture.input_modalities : Array.isArray(m.input_modalities) ? m.input_modalities : []
        return {
          id: m.id,
          name: typeof m.name === 'string' ? m.name : m.id,
          context: Number(m.context_length) || null,
          input_per_m: perM(m.pricing?.prompt),
          output_per_m: perM(m.pricing?.completion),
          free: /:free$/.test(m.id) || (m.pricing?.prompt === '0' && m.pricing?.completion === '0'),
          outputs: outMods,
          vision: inMods.includes('image'),
        }
      })
      return json({ models, base })
    } catch (e) {
      return json({ error: 'PROVIDER_ERROR', detail: `NETWORK: ${(e as Error).message}`.slice(0, 300) }, 502)
    }
  }

  // pengguna web biasa hanya boleh lewat aplikasi desktop (berlisensi); admin boleh uji coba dari web
  if (!licenseId && !isAdmin) return json({ error: 'LICENSE_REQUIRED' }, 403)

  // ── AI pembaca halaman (aplikasi desktop: login Google Flow / membuat project) ──
  if (body.mode === 'page') return pageReader(admin, body, licenseId, userId, isAdmin)

  const messages = cleanMessages(body.messages)
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'EMPTY_MESSAGE' }, 400)
  if (body.image != null) {
    const img = String(body.image)
    if (img.length > MAX_IMAGE || !IMAGE_RE.test(img)) return json({ error: 'INVALID_IMAGE' }, 400)
    const last = messages[messages.length - 1]
    last.content = [{ type: 'text', text: String(last.content) }, { type: 'image_url', image_url: { url: img } }]
  }

  // ── 2) pengaturan & batas harian ──
  const { data: settings } = await admin.from('ai_settings').select('*').eq('id', 1).single()
  const limit = settings?.chat_daily_limit ?? 60
  if (!isAdmin) {
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const { count } = await admin
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('license_id', licenseId)
      .eq('category', 'chat')
      .gte('created_at', since.toISOString())
    if ((count ?? 0) >= limit) return json({ error: 'DAILY_LIMIT', limit }, 429)
  }

  // ── 3) model ──
  let q = admin
    .from('ai_models')
    .select('id, model_id, label, config, is_default, provider:ai_providers!inner(id, name, kind, base_url, enabled)')
    .eq('category', 'chat')
    .eq('enabled', true)
    .eq('provider.enabled', true)
  const wanted = typeof body.model === 'string' ? body.model : ''
  q = /^[0-9a-f-]{36}$/.test(wanted) ? q.eq('id', wanted) : q
  const { data: models, error: mErr } = await q.order('is_default', { ascending: false }).order('sort')
  if (mErr) return json({ error: 'CONFIG', detail: mErr.message }, 500)
  // deno-lint-ignore no-explicit-any
  const model: any = (models ?? [])[0]
  if (!model) return json({ error: 'NO_MODEL' }, 503)
  const provider = model.provider
  if (provider.kind !== 'openai_compat') return json({ error: 'UNSUPPORTED_PROVIDER' }, 501)

  const { data: secret } = await admin.rpc('ai_provider_secret', { p_provider: provider.id })
  if (!secret) return json({ error: 'NO_API_KEY' }, 503)

  // ── 4) panggil provider ──
  const system = String(body.mode === 'image' || body.mode === 'video'
    ? `${settings?.chat_system_prompt ?? ''}\n\nPengguna sedang membuat ${body.mode === 'image' ? 'GAMBAR' : 'VIDEO'}.`
    : settings?.chat_system_prompt ?? '').trim()
  const payload = {
    model: model.model_id,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
    max_tokens: settings?.chat_max_tokens ?? 1200,
    stream: false,
  }
  let ok = false
  let reply = ''
  let errText: string | null = null
  let usage: { prompt_tokens?: number; completion_tokens?: number } = {}
  let status = 502
  try {
    const base = apiBase(provider.base_url)
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...extraHeaders(base) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    })
    const out = await res.json().catch(() => null)
    if (res.ok && out?.choices?.[0]) {
      reply = String(out.choices[0].message?.content ?? '').trim()
      usage = out.usage ?? {}
      ok = !!reply
      if (!ok) errText = 'EMPTY_REPLY'
    } else {
      status = res.status === 401 || res.status === 403 ? 502 : res.status === 429 ? 429 : 502
      errText = `HTTP ${res.status}: ${String(out?.error?.message ?? out?.message ?? out?.errors?.[0]?.message ?? '').slice(0, 300)}`
    }
  } catch (e) {
    errText = `NETWORK: ${(e as Error).message}`.slice(0, 300)
  }

  const cfg = model.config ?? {}
  const inT = usage.prompt_tokens ?? null
  const outT = usage.completion_tokens ?? null
  const cost = inT != null && outT != null && (cfg.input_per_m != null || cfg.output_per_m != null)
    ? (inT * Number(cfg.input_per_m ?? 0) + outT * Number(cfg.output_per_m ?? 0)) / 1e6
    : null
  await admin.from('ai_usage').insert({
    license_id: licenseId, user_id: userId, provider_id: provider.id, model_id: model.model_id, category: 'chat',
    input_tokens: inT, output_tokens: outT, cost_usd: cost, ok, error: errText,
  })

  if (!ok) return json({ error: 'PROVIDER_ERROR', detail: isAdmin ? errText : undefined }, status)
  return json({ reply, model: { id: model.id, label: model.label }, usage: { input: inT, output: outT } })
})
