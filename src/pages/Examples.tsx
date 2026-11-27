import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, Clapperboard, Copy, Film, Image as ImageIcon, Layers, Play, Search, Sparkles, Wand2, Workflow } from 'lucide-react'
import clsx from 'clsx'
import { Navbar } from '../components/landing/Navbar'
import { Footer } from '../components/landing/Footer'
import { AuroraBg } from '../components/AuroraBg'
import { Modal } from '../components/Modal'
import { buttonClass } from '../components/Button'
import { useToast } from '../context/ToastContext'
import { EXAMPLES, EXAMPLE_KINDS, type Example, type ExampleKind } from '../lib/examples'

const KIND_META: Record<ExampleKind, { label: string; icon: typeof Film; color: string }> = {
  video: { label: 'Video', icon: Film, color: 'text-aurora-cyan' },
  foto: { label: 'Foto', icon: ImageIcon, color: 'text-fuchsia-300' },
  workflow: { label: 'Workflow', icon: Workflow, color: 'text-amber-300' },
  project: { label: 'Project', icon: Clapperboard, color: 'text-emerald-300' },
}

function useCopy() {
  const toast = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (text: string, id: string) =>
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(id)
        toast('Prompt disalin — tempel di Studio aplikasi PC atau di Google Flow', 'success')
        setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800)
      },
      () => toast('Gagal menyalin. Pilih teks lalu salin manual.', 'error'),
    )
  return { copied, copy }
}

function KindBadge({ kind, className }: { kind: ExampleKind; className?: string }) {
  const m = KIND_META[kind]
  const Icon = m.icon
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full bg-ink-950/70 px-2.5 py-1 text-[11px] font-semibold backdrop-blur', className)}>
      <Icon className={clsx('size-3.5', m.color)} /> {m.label}
    </span>
  )
}

function ExampleCard({ ex, onOpen }: { ex: Example; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="group flex flex-col overflow-hidden rounded-3xl text-left glass transition hover:-translate-y-1 hover:bg-white/[0.07]" data-example={ex.id}>
      <div className={clsx('relative overflow-hidden', ex.kind === 'foto' && ex.image.includes('batik') ? 'aspect-[4/5]' : 'aspect-video')}>
        <img src={ex.image} alt={ex.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-transparent" />
        <KindBadge kind={ex.kind} className="absolute left-3 top-3" />
        {ex.kind === 'video' && (
          <span className="absolute inset-0 m-auto grid size-12 place-items-center rounded-full bg-white/15 backdrop-blur transition group-hover:scale-110 group-hover:bg-white/25">
            <Play className="size-5 translate-x-0.5 fill-white" />
          </span>
        )}
        {ex.steps && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink-950/70 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur">
            <Layers className="size-3.5" /> {ex.steps.length} {ex.kind === 'project' ? 'adegan' : 'langkah'}
          </span>
        )}
        <p className="absolute bottom-3 left-3 right-3 truncate text-xs text-white/70">{ex.model}</p>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-lg font-semibold leading-snug">{ex.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-white/55">{ex.desc}</p>
        <p className="mt-3 line-clamp-2 rounded-xl bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/50">{ex.prompt}</p>
        <div className="mt-4 flex items-center justify-between text-xs text-white/40">
          <span>oleh {ex.author}</span>
          <span className="inline-flex items-center gap-1 text-white/60 transition group-hover:text-aurora-cyan">Detail <ArrowRight className="size-3.5" /></span>
        </div>
      </div>
    </button>
  )
}

function PromptBox({ text, id, label = 'Prompt', model }: { text: string; id: string; label?: string; model?: string }) {
  const { copied, copy } = useCopy()
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
          {label}
          {model && <span className="ml-2 normal-case tracking-normal text-aurora-cyan">{model}</span>}
        </span>
        <button onClick={() => copy(text, id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white">
          {copied === id ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />} {copied === id ? 'Disalin' : 'Salin'}
        </button>
      </div>
      <p className="select-all whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-white/80">{text}</p>
    </div>
  )
}

function ExampleDetail({ ex }: { ex: Example }) {
  return (
    <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="relative overflow-hidden rounded-2xl border border-white/10">
          <img src={ex.image} alt={ex.title} className={clsx('w-full object-cover', ex.kind === 'video' && 'animate-kenburns')} />
          <KindBadge kind={ex.kind} className="absolute left-3 top-3" />
          {ex.kind === 'video' && <span className="absolute bottom-3 right-3 rounded-full bg-ink-950/70 px-2.5 py-1 text-[11px] backdrop-blur">Pratinjau · {ex.settings.Durasi}</span>}
        </div>
        <p className="mt-4 text-sm text-white/65">{ex.desc}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-white/5 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wider text-white/40">Model</dt>
            <dd className="font-semibold">{ex.model}</dd>
          </div>
          {Object.entries(ex.settings).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/5 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wider text-white/40">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ex.tags.map((t) => <span key={t} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/55">#{t}</span>)}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {ex.steps ? (
          <>
            <p className="text-sm text-white/55">{ex.kind === 'project' ? 'Adegan dalam project ini — buat satu per satu, lalu susun di Scenebuilder Google Flow:' : 'Ikuti langkah berikut secara berurutan di Google Flow:'}</p>
            <ol className="flex flex-col gap-3">
              {ex.steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-aurora text-xs font-bold">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1.5 font-semibold">{s.title}</p>
                    <PromptBox text={s.prompt} id={`${ex.id}-${i}`} label="Prompt" model={s.model} />
                    {s.note && <p className="mt-1.5 text-xs text-white/45">{s.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <PromptBox text={ex.prompt} id={ex.id} model={ex.model} />
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Link to="/unduh" className={buttonClass('primary', 'md')}><Wand2 className="size-4" /> Coba di aplikasi PC</Link>
        </div>
        <p className="text-xs text-white/35">Hasil generate dibuat di Google Flow dengan akun Google-mu sendiri; hasil bisa berbeda setiap kali.</p>
      </div>
    </div>
  )
}

export default function Examples() {
  const [params, setParams] = useSearchParams()
  const kind = (params.get('jenis') as ExampleKind | null) ?? 'semua'
  const openId = params.get('id')
  const [q, setQ] = useState('')

  useEffect(() => { document.title = 'Contoh Generate — FLOW CONNECT' }, [])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return EXAMPLES.filter((e) => (kind === 'semua' || e.kind === kind) &&
      (!term || [e.title, e.desc, e.prompt, e.model, e.author, ...e.tags].join(' ').toLowerCase().includes(term)))
  }, [kind, q])
  const open = EXAMPLES.find((e) => e.id === openId) ?? null

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: k === 'id' && !v })
  }
  const counts = useMemo(() => Object.fromEntries(EXAMPLE_KINDS.map((k) => [k.id, k.id === 'semua' ? EXAMPLES.length : EXAMPLES.filter((e) => e.kind === k.id).length])), [])

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Navbar />
      <main id="main-content" className="relative isolate pb-24 pt-32 md:pt-40">
        <AuroraBg intensity={0.6} />
        <div className="container-x">
          <div className="max-w-3xl animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-white/80 glass">
              <Sparkles className="size-3.5 text-aurora-cyan" /> Galeri inspirasi
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold tracking-tight sm:text-6xl">
              Contoh <span className="text-aurora">generate</span> siap pakai
            </h1>
            <p className="mt-4 text-lg text-white/60">
              Video, foto, workflow, dan project lengkap — beserta prompt, model, dan pengaturannya. Salin, lalu coba sendiri di aplikasi PC FLOW CONNECT.
            </p>
          </div>

          <div className="mt-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Jenis contoh">
              {EXAMPLE_KINDS.map((k) => (
                <button
                  key={k.id}
                  role="tab"
                  aria-selected={kind === k.id}
                  onClick={() => setParam('jenis', k.id === 'semua' ? null : k.id)}
                  className={clsx('rounded-full px-4 py-1.5 text-sm transition', kind === k.id ? 'bg-white font-semibold text-ink-950' : 'glass text-white/70 hover:text-white')}
                >
                  {k.label} <span className={clsx('ml-1 text-xs', kind === k.id ? 'text-ink-950/60' : 'text-white/40')}>{counts[k.id]}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 rounded-xl px-3 py-2 glass md:w-80">
              <Search className="size-4 text-white/40" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari prompt, model, tema…" className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-white/35 focus:outline-none" aria-label="Cari contoh" />
            </label>
          </div>

          {list.length ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((ex) => <ExampleCard key={ex.id} ex={ex} onOpen={() => setParam('id', ex.id)} />)}
            </div>
          ) : (
            <div className="mt-12 rounded-3xl p-10 text-center text-white/55 glass">Tidak ada contoh yang cocok dengan “{q}”.</div>
          )}

          <div className="glow-border relative mt-16 overflow-hidden rounded-3xl p-8 sm:p-10">
            <div className="absolute -right-10 -top-10 size-48 rounded-full bg-aurora-violet/40 blur-3xl" />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold sm:text-3xl">Siap membuat versimu sendiri?</h2>
                <p className="mt-2 max-w-xl text-white/60">Tempel prompt di Studio aplikasi PC, minta Asisten Prompt menyesuaikannya, atau jalankan antrean prompt sekaligus.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/unduh" className={buttonClass('primary', 'lg')}>Unduh aplikasi PC <ArrowRight className="size-4" /></Link>
                <Link to="/app/lisensi" className={buttonClass('glass', 'lg')}>Buat kunci lisensi</Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      <Modal open={!!open} onClose={() => setParam('id', null)} title={open?.title} className="max-h-[92vh] max-w-5xl! overflow-y-auto">
        {open && <ExampleDetail ex={open} />}
      </Modal>
    </div>
  )
}
