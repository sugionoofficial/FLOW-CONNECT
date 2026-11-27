import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  AlertTriangle, AudioLines, BarChart3, Bot, CloudDownload, Image as ImageIcon, KeyRound, Loader2, MessageSquareText, Pencil, Plus,
  Save, Search, Send, Server, ShieldCheck, ShieldOff, Star, Trash2, Video,
} from 'lucide-react'
import clsx from 'clsx'
import { AppHeader } from '../components/AppHeader'
import { AuroraBg } from '../components/AuroraBg'
import { Modal } from '../components/Modal'
import { Button, buttonClass } from '../components/Button'
import { Loader } from '../components/Loader'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'

type Category = 'chat' | 'image' | 'video' | 'audio'
type Provider = {
  id: string; name: string; kind: string; base_url: string; enabled: boolean; notes: string | null; key_hint: string | null
  key_secret_id: string | null
}
type Model = {
  id: string; provider_id: string; model_id: string; label: string; category: Category; enabled: boolean; is_default: boolean
  sort: number; price_note: string | null; config: Record<string, unknown>
}
type Settings = { chat_daily_limit: number; chat_max_tokens: number; chat_system_prompt: string }
type AdminLicense = {
  id: string; email: string | null; label: string; key_hint: string; max_devices: number; devices: number; expires_at: string | null
  revoked_at: string | null; last_used_at: string | null; created_at: string; chat_today: number
}
type Usage = { id: number; provider_id: string | null; model_id: string | null; category: string; input_tokens: number | null; output_tokens: number | null; cost_usd: number | null; ok: boolean; error: string | null; created_at: string }

const CATS: { id: Category; label: string; Icon: typeof Bot }[] = [
  { id: 'chat', label: 'Chat prompt', Icon: MessageSquareText },
  { id: 'image', label: 'Gambar', Icon: ImageIcon },
  { id: 'video', label: 'Video', Icon: Video },
  { id: 'audio', label: 'Audio', Icon: AudioLines },
]
const KINDS = [
  ['openai_compat', 'OpenAI-compatible (OpenCode, OpenRouter, Groq, dll.)'],
  ['anthropic', 'Anthropic'],
  ['google', 'Google AI'],
  ['fal', 'fal.ai'],
  ['replicate', 'Replicate'],
  ['elevenlabs', 'ElevenLabs'],
]
/** Base URL API: buang "/" di akhir dan endpoint yang sering ikut tertempel (…/v1/responses → …/v1). */
const apiBase = (raw: string) =>
  raw.trim().replace(/\/+$/, '').replace(/\/(chat\/completions|completions|responses|models|messages)$/i, '').replace(/\/+$/, '')
type RemoteModel = { id: string; name: string; context: number | null; input_per_m: number | null; output_per_m: number | null; free: boolean; outputs: string[] }
const priceNote = (m: RemoteModel) =>
  m.free ? 'Gratis' : m.input_per_m != null && m.output_per_m != null ? `$${m.input_per_m} / $${m.output_per_m} per 1 jt token` : ''
/** Pesan galat dari supabase.functions.invoke (isi JSON { error, detail } bila ada). */
async function fnError(error: { message: string; context?: unknown }) {
  const ctx = error.context as Response | undefined
  if (ctx && typeof ctx.json === 'function') {
    const b = await ctx.json().catch(() => null)
    if (b?.error) return b.error + (b.detail ? ` — ${b.detail}` : '')
  }
  return error.message
}
const fmt = (t: string | null) => (t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const usd = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toFixed(Number(n) < 1 ? 4 : 2)}`)
const input = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm focus:border-aurora-cyan/60 focus:outline-none'
const errMsg = (e: unknown) => {
  const m = (e as { message?: string })?.message || String(e)
  if (m.includes('NOT_ADMIN')) return 'Hanya admin yang boleh melakukan ini.'
  if (m.includes('duplicate key')) return 'Data dengan ID itu sudah ada.'
  if (m.includes('ai_providers_id_check')) return 'ID provider: huruf kecil, angka, - atau _ (2–40 karakter).'
  if (m.includes('ai_providers_base_url_check')) return 'Base URL harus diawali https://'
  return m
}

type Tab = 'providers' | 'chat' | 'licenses' | 'usage'

export default function Admin() {
  const { isAdmin, loading } = useAuth()
  const [checked, setChecked] = useState(false)
  const [tab, setTab] = useState<Tab>('providers')
  useEffect(() => { document.title = 'Admin — FLOW CONNECT' }, [])
  // AuthContext memuat status admin secara async — tunggu sebentar sebelum menolak
  useEffect(() => { const t = setTimeout(() => setChecked(true), 1500); return () => clearTimeout(t) }, [])
  if (loading || (!isAdmin && !checked)) return <Loader full />
  if (!isAdmin) return <Navigate to="/app/lisensi" replace />

  return (
    <div className="relative isolate min-h-screen">
      <AuroraBg intensity={0.4} />
      <AppHeader />
      <main className="container-x py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 font-display text-3xl font-bold sm:text-4xl"><ShieldCheck className="size-8 text-aurora-cyan" /> Admin</h1>
            <p className="mt-1 max-w-2xl text-white/55">Atur provider AI (chat prompt, gambar, video, audio), kunci API, batas pemakaian, dan lisensi pengguna.</p>
          </div>
        </div>
        <nav className="mt-8 flex flex-wrap gap-2" role="tablist">
          {([
            ['providers', 'Provider & Model', Server],
            ['chat', 'Chat Prompt', Bot],
            ['licenses', 'Lisensi', KeyRound],
            ['usage', 'Pemakaian', BarChart3],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={clsx('flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition', tab === id ? 'bg-aurora text-white' : 'glass text-white/65 hover:text-white')}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </nav>
        <div className="mt-6">
          {tab === 'providers' && <ProvidersTab />}
          {tab === 'chat' && <ChatTab />}
          {tab === 'licenses' && <LicensesTab />}
          {tab === 'usage' && <UsageTab />}
        </div>
      </main>
    </div>
  )
}

/* ───────────────────────── Provider & Model ───────────────────────── */
function ProvidersTab() {
  const toast = useToast()
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [models, setModels] = useState<Model[]>([])
  const [cat, setCat] = useState<Category>('chat')
  const [editProv, setEditProv] = useState<Partial<Provider> & { _new?: boolean } | null>(null)
  const [keyFor, setKeyFor] = useState<Provider | null>(null)
  const [keyVal, setKeyVal] = useState('')
  const [editModel, setEditModel] = useState<Partial<Model> & { _new?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [pickFor, setPickFor] = useState<Provider | null>(null)

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase.from('ai_providers').select('*').order('created_at'),
      supabase.from('ai_models').select('*').order('category').order('sort').order('label'),
    ])
    if (p.error) return toast(errMsg(p.error), 'error')
    setProviders(p.data as Provider[])
    setModels((m.data ?? []) as Model[])
  }, [toast])
  useEffect(() => { load() }, [load])

  const saveProvider = async () => {
    if (!editProv) return
    const row = { name: editProv.name?.trim(), kind: editProv.kind, base_url: apiBase(editProv.base_url ?? ''), notes: editProv.notes?.trim() || null, enabled: editProv.enabled ?? true }
    setBusy(true)
    const { error } = editProv._new
      ? await supabase.from('ai_providers').insert({ id: editProv.id?.trim().toLowerCase(), ...row })
      : await supabase.from('ai_providers').update(row).eq('id', editProv.id!)
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    const isNew = editProv._new
    setEditProv(null)
    await load()
    if (isNew) toast('Provider disimpan. Langkah berikutnya: atur Kunci API, lalu klik “Ambil model” agar modelnya muncul di aplikasi.', 'success')
  }
  const toggleProvider = async (p: Provider) => {
    const { error } = await supabase.from('ai_providers').update({ enabled: !p.enabled }).eq('id', p.id)
    if (error) return toast(errMsg(error), 'error')
    load()
  }
  const deleteProvider = async (p: Provider) => {
    if (!confirm(`Hapus provider ${p.name}? Semua modelnya dan kunci API-nya ikut dihapus.`)) return
    const { error } = await supabase.from('ai_providers').delete().eq('id', p.id)
    if (error) return toast(errMsg(error), 'error')
    load()
  }
  const saveKey = async (clear = false) => {
    if (!keyFor) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_provider_key', { p_provider: keyFor.id, p_key: clear ? '' : keyVal })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(clear ? 'Kunci API dihapus' : 'Kunci API disimpan (terenkripsi)', 'success')
    setKeyFor(null)
    setKeyVal('')
    load()
  }

  const saveModel = async () => {
    if (!editModel) return
    const cfg = { ...(editModel.config ?? {}) } as Record<string, unknown>
    for (const k of ['input_per_m', 'output_per_m']) {
      const v = cfg[k]
      if (v === '' || v == null) delete cfg[k]
      else cfg[k] = Number(v)
    }
    const row = {
      provider_id: editModel.provider_id, model_id: editModel.model_id?.trim(), label: editModel.label?.trim(), category: editModel.category,
      enabled: editModel.enabled ?? true, is_default: editModel.is_default ?? false, sort: Number(editModel.sort ?? 100),
      price_note: editModel.price_note?.trim() || null, config: cfg,
    }
    setBusy(true)
    const { error } = editModel._new
      ? await supabase.from('ai_models').insert(row)
      : await supabase.from('ai_models').update(row).eq('id', editModel.id!)
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    setEditModel(null)
    load()
  }
  const patchModel = async (m: Model, patch: Partial<Model>) => {
    const { error } = await supabase.from('ai_models').update(patch).eq('id', m.id)
    if (error) return toast(errMsg(error), 'error')
    load()
  }
  const deleteModel = async (m: Model) => {
    if (!confirm(`Hapus model ${m.label}?`)) return
    const { error } = await supabase.from('ai_models').delete().eq('id', m.id)
    if (error) return toast(errMsg(error), 'error')
    load()
  }

  const provName = useMemo(() => Object.fromEntries((providers ?? []).map((p) => [p.id, p.name])), [providers])
  const countFor = (id: string) => models.filter((m) => m.provider_id === id && m.enabled).length
  const shown = models.filter((m) => m.category === cat)
  if (!providers) return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-white/50" /></div>

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Provider</h2>
          <Button size="sm" onClick={() => setEditProv({ _new: true, kind: 'openai_compat', enabled: true, base_url: 'https://' })}><Plus className="size-4" /> Tambah provider</Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {providers.map((p) => (
            <article key={p.id} className={clsx('rounded-2xl p-5 glass', !p.enabled && 'opacity-60')} data-provider={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">{p.name} <span className="font-mono text-xs text-white/40">{p.id}</span></p>
                  <p className="truncate font-mono text-xs text-white/45">{p.base_url}</p>
                </div>
                <Toggle on={p.enabled} onClick={() => toggleProvider(p)} label="Aktif" />
              </div>
              {p.notes && <p className="mt-3 text-xs text-white/50">{p.notes}</p>}
              {p.enabled && !countFor(p.id) && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-2.5 text-xs text-amber-100/80">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Provider ini belum punya model aktif, jadi belum muncul di aplikasi. Klik “Ambil model” lalu pilih modelnya.
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold', p.key_hint ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200')}>
                  {p.key_hint ? `Kunci API ${p.key_hint}` : 'Kunci API belum diatur'}
                </span>
                <span data-models={countFor(p.id)} className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold', countFor(p.id) ? 'bg-white/10 text-white/70' : 'bg-amber-400/15 text-amber-200')}>
                  {countFor(p.id) ? `${countFor(p.id)} model aktif` : 'Belum ada model'}
                </span>
                <div className="flex-1" />
                <button className={buttonClass('glass', 'sm')} onClick={() => setPickFor(p)} disabled={p.kind !== 'openai_compat'} title="Ambil daftar model dari provider"><CloudDownload className="size-3.5" /> Ambil model</button>
                <button className={buttonClass('glass', 'sm')} onClick={() => { setKeyVal(''); setKeyFor(p) }}><KeyRound className="size-3.5" /> Kunci API</button>
                <button className={buttonClass('ghost', 'sm')} onClick={() => setEditProv({ ...p })}><Pencil className="size-3.5" /> Ubah</button>
                <button className={buttonClass('danger', 'sm')} onClick={() => deleteProvider(p)} aria-label="Hapus provider"><Trash2 className="size-3.5" /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Model</h2>
          <Button size="sm" disabled={!providers.length} onClick={() => setEditModel({ _new: true, category: cat, provider_id: providers[0]?.id, enabled: true, sort: 100, config: {} })}><Plus className="size-4" /> Tambah model</Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {CATS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setCat(id)} data-cat={id}
              className={clsx('flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold', cat === id ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/5')}>
              <Icon className="size-3.5" /> {label} <span className="text-white/40">{models.filter((m) => m.category === id).length}</span>
            </button>
          ))}
        </div>
        {cat !== 'chat' && (
          <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100/80">
            Generate {CATS.find((c) => c.id === cat)?.label.toLowerCase()} di aplikasi saat ini memakai Google Flow. Model provider lain di kategori ini sudah bisa dicatat di sini, dan akan dipakai aplikasi setelah integrasi providernya ditambahkan.
          </p>
        )}
        <div className="mt-4 overflow-x-auto rounded-2xl glass">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-white/40">
              <tr><th className="px-4 py-3">Model</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Harga</th><th className="px-4 py-3">Aktif</th><th className="px-4 py-3">Bawaan</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-white/45">Belum ada model di kategori ini.</td></tr>}
              {shown.map((m) => (
                <tr key={m.id} data-model={m.model_id}>
                  <td className="px-4 py-3"><p className="font-medium">{m.label}</p><p className="font-mono text-xs text-white/40">{m.model_id}</p></td>
                  <td className="px-4 py-3 text-white/65">{provName[m.provider_id] ?? m.provider_id}</td>
                  <td className="px-4 py-3 text-xs text-white/55">{m.price_note || '—'}</td>
                  <td className="px-4 py-3"><Toggle on={m.enabled} onClick={() => patchModel(m, { enabled: !m.enabled })} label="Aktif" /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => !m.is_default && patchModel(m, { is_default: true, enabled: true })} title="Jadikan bawaan" aria-label="Jadikan bawaan"
                      className={clsx('rounded-lg p-1.5', m.is_default ? 'text-amber-300' : 'text-white/30 hover:text-white/70')}>
                      <Star className={clsx('size-4', m.is_default && 'fill-current')} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className={buttonClass('ghost', 'sm')} onClick={() => setEditModel({ ...m })} aria-label="Ubah model"><Pencil className="size-3.5" /></button>
                    <button className={buttonClass('ghost', 'sm', 'hover:text-red-300')} onClick={() => deleteModel(m)} aria-label="Hapus model"><Trash2 className="size-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={!!editProv} onClose={() => setEditProv(null)} title={editProv?._new ? 'Tambah provider' : 'Ubah provider'}>
        {editProv && (
          <div className="flex flex-col gap-3 text-sm">
            <Field label="ID (huruf kecil, tanpa spasi)"><input className={input} value={editProv.id ?? ''} disabled={!editProv._new} onChange={(e) => setEditProv({ ...editProv, id: e.target.value })} placeholder="mis. openrouter" /></Field>
            <Field label="Nama"><input className={input} value={editProv.name ?? ''} onChange={(e) => setEditProv({ ...editProv, name: e.target.value })} placeholder="mis. OpenRouter" /></Field>
            <Field label="Jenis API">
              <select className={input} value={editProv.kind} onChange={(e) => setEditProv({ ...editProv, kind: e.target.value })}>
                {KINDS.map(([v, l]) => <option key={v} value={v} className="bg-ink-900">{l}</option>)}
              </select>
            </Field>
            <Field label="Base URL"><input className={input} value={editProv.base_url ?? ''} onChange={(e) => setEditProv({ ...editProv, base_url: e.target.value })} placeholder="https://…/v1 — mis. https://openrouter.ai/api/v1" /></Field>
            {editProv.base_url && apiBase(editProv.base_url) !== editProv.base_url.trim().replace(/\/+$/, '') && (
              <p className="text-xs text-amber-200/80">Akan disimpan sebagai <span className="font-mono">{apiBase(editProv.base_url)}</span> (cukup alamat dasar API, tanpa /chat/completions atau /responses).</p>
            )}
            <Field label="Catatan"><textarea className={input} rows={2} value={editProv.notes ?? ''} onChange={(e) => setEditProv({ ...editProv, notes: e.target.value })} /></Field>
            <p className="text-xs text-white/45">Chat prompt saat ini mendukung jenis <b>OpenAI-compatible</b> (endpoint <code>/chat/completions</code>).</p>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditProv(null)}>Batal</Button>
              <Button onClick={saveProvider} disabled={busy || !editProv.id || !editProv.name || !editProv.base_url}><Save className="size-4" /> Simpan</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!keyFor} onClose={() => setKeyFor(null)} title={`Kunci API — ${keyFor?.name ?? ''}`}>
        <p className="text-sm text-white/60">Kunci disimpan terenkripsi di Supabase Vault dan hanya dipakai server. Aplikasi PC dan browser tidak pernah menerima kunci ini.</p>
        {keyFor?.key_hint && <p className="mt-2 text-xs text-white/45">Kunci sekarang: <span className="font-mono">{keyFor.key_hint}</span></p>}
        <input type="password" autoComplete="off" className={clsx(input, 'mt-4 font-mono')} value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder={keyFor?.id === 'opencode' ? 'oc_sk_…' : 'sk-…'} aria-label="Kunci API" />
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          {keyFor?.key_hint ? <Button variant="danger" onClick={() => saveKey(true)} disabled={busy}><Trash2 className="size-4" /> Hapus kunci</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setKeyFor(null)}>Batal</Button>
            <Button onClick={() => saveKey(false)} disabled={busy || keyVal.trim().length < 8}><Save className="size-4" /> Simpan kunci</Button>
          </div>
        </div>
      </Modal>

      {pickFor && <ModelPicker key={pickFor.id} provider={pickFor} existing={models} onClose={() => setPickFor(null)} onAdded={() => { setPickFor(null); load() }} />}

      <Modal open={!!editModel} onClose={() => setEditModel(null)} title={editModel?._new ? 'Tambah model' : 'Ubah model'}>
        {editModel && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kategori">
                <select className={input} value={editModel.category} onChange={(e) => setEditModel({ ...editModel, category: e.target.value as Category })}>
                  {CATS.map((c) => <option key={c.id} value={c.id} className="bg-ink-900">{c.label}</option>)}
                </select>
              </Field>
              <Field label="Provider">
                <select className={input} value={editModel.provider_id} onChange={(e) => setEditModel({ ...editModel, provider_id: e.target.value })}>
                  {providers.map((p) => <option key={p.id} value={p.id} className="bg-ink-900">{p.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="ID model (persis seperti di dokumentasi provider)"><input className={clsx(input, 'font-mono')} value={editModel.model_id ?? ''} onChange={(e) => setEditModel({ ...editModel, model_id: e.target.value })} placeholder="mis. gpt-5-nano" /></Field>
            <Field label="Nama tampilan"><input className={input} value={editModel.label ?? ''} onChange={(e) => setEditModel({ ...editModel, label: e.target.value })} /></Field>
            <Field label="Catatan harga"><input className={input} value={editModel.price_note ?? ''} onChange={(e) => setEditModel({ ...editModel, price_note: e.target.value })} placeholder="mis. $0.05 / $0.40 per 1 juta token" /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="$ / 1 jt token masuk"><input className={input} inputMode="decimal" value={String(editModel.config?.input_per_m ?? '')} onChange={(e) => setEditModel({ ...editModel, config: { ...editModel.config, input_per_m: e.target.value } })} /></Field>
              <Field label="$ / 1 jt token keluar"><input className={input} inputMode="decimal" value={String(editModel.config?.output_per_m ?? '')} onChange={(e) => setEditModel({ ...editModel, config: { ...editModel.config, output_per_m: e.target.value } })} /></Field>
              <Field label="Urutan"><input className={input} inputMode="numeric" value={String(editModel.sort ?? 100)} onChange={(e) => setEditModel({ ...editModel, sort: Number(e.target.value) || 0 })} /></Field>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2"><input type="checkbox" checked={editModel.enabled ?? true} onChange={(e) => setEditModel({ ...editModel, enabled: e.target.checked })} /> Aktif</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={editModel.is_default ?? false} onChange={(e) => setEditModel({ ...editModel, is_default: e.target.checked })} /> Bawaan kategori ini</label>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditModel(null)}>Batal</Button>
              <Button onClick={saveModel} disabled={busy || !editModel.model_id || !editModel.label || !editModel.provider_id}><Save className="size-4" /> Simpan</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ───────────── Ambil model dari provider (GET /models lewat Edge Function) ───────────── */
function ModelPicker({ provider, existing, onClose, onAdded }: { provider: Provider; existing: Model[]; onClose: () => void; onAdded: () => void }) {
  const toast = useToast()
  const [list, setList] = useState<RemoteModel[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [freeOnly, setFreeOnly] = useState(false)
  const [cat, setCat] = useState<Category>('chat')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.functions.invoke('prompt-chat', { body: { action: 'list_models', provider: provider.id } }).then(async ({ data, error }) => {
      if (error) return setErr(await fnError(error))
      setList((data?.models ?? []) as RemoteModel[])
    })
  }, [provider])

  const have = useMemo(() => new Set(existing.filter((m) => m.provider_id === provider.id).map((m) => m.model_id)), [existing, provider])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (list ?? []).filter((m) => (!freeOnly || m.free) &&
      (cat !== 'chat' || !m.outputs.length || m.outputs.includes('text')) &&
      (!t || m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t)))
  }, [list, q, freeOnly, cat])

  const add = async () => {
    if (!list) return
    const rows = list.filter((m) => sel.has(m.id)).map((m, i) => {
      const config: Record<string, number> = {}
      if (m.input_per_m != null) config.input_per_m = m.input_per_m
      if (m.output_per_m != null) config.output_per_m = m.output_per_m
      return { provider_id: provider.id, model_id: m.id, label: m.name.slice(0, 80), category: cat, enabled: true, is_default: false, sort: 100 + i, price_note: priceNote(m) || null, config }
    })
    setBusy(true)
    const { error } = await supabase.from('ai_models').insert(rows)
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast(`${rows.length} model ditambahkan — langsung muncul di aplikasi (menu Asisten Prompt).`, 'success')
    onAdded()
  }

  return (
    <Modal open onClose={onClose} title={`Ambil model — ${provider.name}`} className="max-w-3xl!">
      {err ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-red-200/90">Gagal mengambil daftar model: {err}</p>
          <p className="text-xs text-white/50">Periksa Base URL (contoh OpenRouter: <span className="font-mono">https://openrouter.ai/api/v1</span>) dan Kunci API provider.</p>
        </div>
      ) : !list ? (
        <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-white/50" /></div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-56 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <Search className="size-4 text-white/40" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cari di ${list.length} model…`} className="min-w-0 flex-1 bg-transparent focus:outline-none" aria-label="Cari model" />
            </label>
            <select className={clsx(input, 'w-auto!')} value={cat} onChange={(e) => setCat(e.target.value as Category)} aria-label="Kategori">
              {CATS.map((c) => <option key={c.id} value={c.id} className="bg-ink-900">{c.label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Gratis saja</label>
          </div>
          <div className="max-h-[52vh] overflow-y-auto rounded-2xl border border-white/10">
            {shown.length === 0 && <p className="px-4 py-8 text-center text-white/45">Tidak ada model yang cocok.</p>}
            {shown.slice(0, 300).map((m) => {
              const added = have.has(m.id)
              return (
                <label key={m.id} data-remote={m.id} className={clsx('flex cursor-pointer items-center gap-3 border-b border-white/5 px-4 py-2.5 last:border-0 hover:bg-white/[0.04]', added && 'cursor-default opacity-50')}>
                  <input type="checkbox" disabled={added} checked={added || sel.has(m.id)} onChange={(e) => {
                    const next = new Set(sel)
                    if (e.target.checked) next.add(m.id); else next.delete(m.id)
                    setSel(next)
                  }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{m.name}</span>
                    <span className="block truncate font-mono text-xs text-white/40">{m.id}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-white/55">
                    {added ? 'Sudah ditambahkan' : priceNote(m) || '—'}
                    {m.context ? <span className="block text-white/35">{Math.round(m.context / 1000)}K konteks</span> : null}
                  </span>
                </label>
              )
            })}
          </div>
          {shown.length > 300 && <p className="text-xs text-white/45">Menampilkan 300 dari {shown.length} — persempit dengan pencarian.</p>}
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs text-white/50">{sel.size} dipilih</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Batal</Button>
              <Button onClick={add} disabled={busy || !sel.size}><Plus className="size-4" /> Tambah {sel.size || ''} model</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ───────────────────────── Chat Prompt ───────────────────────── */
function ChatTab() {
  const toast = useToast()
  const [s, setS] = useState<Settings | null>(null)
  const [models, setModels] = useState<{ id: string; label: string; is_default: boolean }[]>([])
  const [model, setModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    supabase.from('ai_settings').select('chat_daily_limit,chat_max_tokens,chat_system_prompt').eq('id', 1).single().then(({ data, error }) => {
      if (error) toast(errMsg(error), 'error')
      else setS(data as Settings)
    })
    supabase.from('ai_models').select('id,label,is_default').eq('category', 'chat').eq('enabled', true).order('sort').then(({ data }) => {
      setModels(data ?? [])
      setModel((data ?? []).find((m) => m.is_default)?.id ?? '')
    })
  }, [toast])

  const save = async () => {
    if (!s) return
    setBusy(true)
    const { error } = await supabase.from('ai_settings').update(s).eq('id', 1)
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Pengaturan chat disimpan', 'success')
  }
  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    const next = [...msgs, { role: 'user' as const, content: t }]
    setMsgs(next)
    setText('')
    setSending(true)
    const { data, error } = await supabase.functions.invoke('prompt-chat', { body: { messages: next, model: model || undefined } })
    setSending(false)
    if (error) {
      let msg = await fnError(error)
      if (msg.includes('NO_API_KEY')) msg = 'Kunci API provider belum diatur (tab Provider & Model → Kunci API).'
      setMsgs([...next, { role: 'assistant', content: `⚠️ ${msg}` }])
      return
    }
    setMsgs([...next, { role: 'assistant', content: data.reply }])
  }

  if (!s) return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-white/50" /></div>
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-3xl p-6 glass">
        <h2 className="font-display text-xl font-semibold">Pengaturan chat prompt</h2>
        <p className="mt-1 text-sm text-white/55">Dipakai fitur “Asisten Prompt” di aplikasi PC. Model dipilih dari tab Provider &amp; Model (kategori Chat prompt).</p>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Field label="Batas chat per lisensi / hari"><input className={input} inputMode="numeric" value={s.chat_daily_limit} onChange={(e) => setS({ ...s, chat_daily_limit: Number(e.target.value) || 0 })} /></Field>
          <Field label="Maks. token jawaban"><input className={input} inputMode="numeric" value={s.chat_max_tokens} onChange={(e) => setS({ ...s, chat_max_tokens: Number(e.target.value) || 0 })} /></Field>
        </div>
        <div className="mt-3 text-sm">
          <Field label="Instruksi sistem (system prompt)"><textarea className={clsx(input, 'min-h-56 font-mono text-xs leading-relaxed')} value={s.chat_system_prompt} onChange={(e) => setS({ ...s, chat_system_prompt: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={save} disabled={busy}><Save className="size-4" /> Simpan</Button></div>
      </section>

      <section className="flex flex-col rounded-3xl p-6 glass">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Uji coba</h2>
          <select className={clsx(input, 'w-auto')} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
            {models.map((m) => <option key={m.id} value={m.id} className="bg-ink-900">{m.label}{m.is_default ? ' (bawaan)' : ''}</option>)}
          </select>
        </div>
        <div className="mt-4 flex min-h-72 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl bg-black/25 p-4 text-sm">
          {msgs.length === 0 && <p className="m-auto text-white/40">Contoh: “Buatkan prompt video kucing oranye berlari di pantai saat senja”.</p>}
          {msgs.map((m, i) => (
            <div key={i} className={clsx('max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-2.5', m.role === 'user' ? 'self-end bg-violet-600/60' : 'self-start bg-white/10 text-white/85')}>{m.content}</div>
          ))}
          {sending && <Loader2 className="size-4 animate-spin self-start text-white/50" />}
        </div>
        <div className="mt-3 flex gap-2">
          <input className={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Tulis pesan…" aria-label="Pesan" />
          <Button onClick={send} disabled={sending || !text.trim()} aria-label="Kirim"><Send className="size-4" /></Button>
        </div>
      </section>
    </div>
  )
}

/* ───────────────────────── Lisensi ───────────────────────── */
function LicensesTab() {
  const toast = useToast()
  const [list, setList] = useState<AdminLicense[] | null>(null)
  const [q, setQ] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_licenses')
    if (error) return toast(errMsg(error), 'error')
    setList(data as AdminLicense[])
  }, [toast])
  useEffect(() => { load() }, [load])

  const update = async (l: AdminLicense, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc('admin_update_license', { p_id: l.id, ...args })
    if (error) return toast(errMsg(error), 'error')
    load()
  }
  const setExpiry = (l: AdminLicense) => {
    const v = prompt('Berlaku sampai (YYYY-MM-DD). Kosongkan untuk tanpa batas:', l.expires_at ? l.expires_at.slice(0, 10) : '')
    if (v === null) return
    if (!v.trim()) return update(l, { p_clear_expiry: true })
    const d = new Date(`${v.trim()}T23:59:59`)
    if (Number.isNaN(+d)) return toast('Format tanggal salah', 'error')
    update(l, { p_expires_at: d.toISOString() })
  }

  const shown = (list ?? []).filter((l) => !q || `${l.email} ${l.label} ${l.key_hint}`.toLowerCase().includes(q.toLowerCase()))
  if (!list) return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-white/50" /></div>
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">Semua lisensi <span className="text-white/40">({list.length})</span></h2>
        <input className={clsx(input, 'max-w-xs')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari email / nama…" aria-label="Cari lisensi" />
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl glass">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/40">
            <tr><th className="px-4 py-3">Pemilik</th><th className="px-4 py-3">Kunci</th><th className="px-4 py-3">PC</th><th className="px-4 py-3">Berlaku</th><th className="px-4 py-3">Chat hari ini</th><th className="px-4 py-3">Terakhir dipakai</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-white/45">Tidak ada lisensi.</td></tr>}
            {shown.map((l) => (
              <tr key={l.id} className={clsx(l.revoked_at && 'opacity-50')}>
                <td className="px-4 py-3"><p className="font-medium">{l.email ?? '—'}</p><p className="text-xs text-white/45">{l.label}</p></td>
                <td className="px-4 py-3 font-mono text-xs text-white/60">{l.key_hint}{l.revoked_at && <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 font-sans text-[11px] text-red-300">Dicabut</span>}</td>
                <td className="px-4 py-3">
                  <select className="rounded-lg border border-white/10 bg-white/5 px-2 py-1" value={l.max_devices} onChange={(e) => update(l, { p_max_devices: Number(e.target.value) })} aria-label="Maks. PC">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n} className="bg-ink-900">{l.devices} / {n}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3"><button className="text-left text-white/70 hover:text-white hover:underline" onClick={() => setExpiry(l)}>{l.expires_at ? fmt(l.expires_at) : 'Tanpa batas'}</button></td>
                <td className="px-4 py-3 text-white/70">{l.chat_today}</td>
                <td className="px-4 py-3 text-xs text-white/55">{fmt(l.last_used_at)}</td>
                <td className="px-4 py-3 text-right">
                  {l.revoked_at
                    ? <button className={buttonClass('glass', 'sm')} onClick={() => update(l, { p_revoked: false })}>Pulihkan</button>
                    : <button className={buttonClass('danger', 'sm')} onClick={() => confirm(`Cabut lisensi ${l.label} milik ${l.email}?`) && update(l, { p_revoked: true })}><ShieldOff className="size-3.5" /> Cabut</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ───────────────────────── Pemakaian ───────────────────────── */
function UsageTab() {
  const toast = useToast()
  const [days, setDays] = useState(7)
  const [sum, setSum] = useState<{ requests: number; failed: number; input_tokens: number; output_tokens: number; cost_usd: number; by_model: { provider_id: string; model_id: string; requests: number; cost_usd: number }[] } | null>(null)
  const [rows, setRows] = useState<Usage[]>([])
  useEffect(() => {
    supabase.rpc('admin_usage_summary', { p_days: days }).then(({ data, error }) => (error ? toast(errMsg(error), 'error') : setSum(data)))
    supabase.from('ai_usage').select('*').order('created_at', { ascending: false }).limit(50).then(({ data }) => setRows((data ?? []) as Usage[]))
  }, [days, toast])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {[1, 7, 30].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={clsx('rounded-full px-3.5 py-1.5 text-xs font-semibold', days === d ? 'bg-white/15' : 'text-white/55 hover:bg-white/5')}>{d === 1 ? 'Hari ini' : `${d} hari`}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Permintaan', sum?.requests ?? '—'],
          ['Gagal', sum?.failed ?? '—'],
          ['Token (masuk / keluar)', sum ? `${sum.input_tokens.toLocaleString('id-ID')} / ${sum.output_tokens.toLocaleString('id-ID')}` : '—'],
          ['Perkiraan biaya', usd(sum?.cost_usd)],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl p-5 glass"><p className="text-xs text-white/45">{k}</p><p className="mt-1 font-display text-2xl font-semibold">{v}</p></div>
        ))}
      </div>
      {sum && sum.by_model.length > 0 && (
        <div className="rounded-2xl p-5 glass">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Per model</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {sum.by_model.map((m) => <li key={`${m.provider_id}/${m.model_id}`} className="flex justify-between gap-3"><span className="font-mono text-white/70">{m.provider_id}/{m.model_id}</span><span className="text-white/55">{m.requests}× · {usd(m.cost_usd)}</span></li>)}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl glass">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-white/40">
            <tr><th className="px-4 py-3">Waktu</th><th className="px-4 py-3">Model</th><th className="px-4 py-3">Token</th><th className="px-4 py-3">Biaya</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-white/45">Belum ada pemakaian.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 text-xs text-white/55">{fmt(r.created_at)}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.provider_id}/{r.model_id}</td>
                <td className="px-4 py-2.5 text-xs text-white/60">{r.input_tokens ?? '—'} / {r.output_tokens ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-white/60">{usd(r.cost_usd)}</td>
                <td className="px-4 py-2.5 text-xs">{r.ok ? <span className="text-emerald-300">OK</span> : <span className="flex items-center gap-1 text-red-300" title={r.error ?? ''}><AlertTriangle className="size-3.5" /> {r.error?.slice(0, 60)}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ───────────────────────── kecil ───────────────────────── */
function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-emerald-500/80' : 'bg-white/15')}>
      <span className={clsx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-xs text-white/55">{label}</span>{children}</label>
}
