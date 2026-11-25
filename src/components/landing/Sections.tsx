import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, MessageSquare, Play, Sparkles, Wand2 } from 'lucide-react'
import clsx from 'clsx'
import { FILMS, LANDING_MODELS, TOOLS } from '../../lib/catalog'
import { buttonClass } from '../Button'
import { TOOL_GRADIENTS, TOOL_ICONS } from '../toolIcons'

function SectionTitle({ eyebrow, title, desc }: { eyebrow: string; title: React.ReactNode; desc?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-cyan">{eyebrow}</p>
      <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h2>
      {desc && <p className="mt-4 text-white/60">{desc}</p>}
    </div>
  )
}

/* ─────────────── Models ─────────────── */
export function ModelsSection() {
  const [active, setActive] = useState(0)
  const m = LANDING_MODELS[active]
  return (
    <section id="model" className="relative py-24">
      <div className="container-x">
        <SectionTitle eyebrow="Model AI" title={<>Buka karya kreatif <span className="text-aurora">terbaikmu</span></>} />

        <div className="grid items-stretch gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="glow-border relative aspect-video overflow-hidden rounded-3xl">
            <img key={m.image} src={m.image} alt={m.name} className="h-full w-full animate-kenburns object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent" />
            <button className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full p-5 glass transition hover:scale-105" aria-label="Putar video fitur">
              <Play className="size-7 fill-white" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {LANDING_MODELS.map((model, i) => (
              <button
                key={model.name}
                onClick={() => setActive(i)}
                className={clsx(
                  'rounded-2xl p-6 text-left transition',
                  i === active ? 'glow-border bg-white/[0.06]' : 'glass opacity-70 hover:opacity-100',
                )}
              >
                <h3 className="font-display text-xl font-semibold">{model.name}</h3>
                <p className={clsx('mt-2 text-sm text-white/60', i !== active && 'line-clamp-1')}>{model.desc}</p>
                {i === active && (
                  <div className="mt-4 flex gap-2">
                    <Link to="/app" className={buttonClass('primary', 'sm')}>
                      Coba di Google Flow
                    </Link>
                    <span className={buttonClass('ghost', 'sm')}>Pelajari</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Plan / Create / Refine ─────────────── */
const STEPS = [
  {
    key: 'Rencanakan',
    title: 'Kenali agenmu',
    desc: 'Agen di FLOW CONNECT adalah partner kreatif yang cerdas. Ia memahami project-mu secara mendalam untuk membantu mengeluarkan karya terbaikmu, sementara kamu tetap fokus berkarya.',
    point: 'Jelajahi dan kembangkan ide bersama agenmu.',
    icon: MessageSquare,
    image: '/media/city.jpg',
  },
  {
    key: 'Buat',
    title: 'Berkreasi tanpa batas',
    desc: 'Ubah inspirasi jadi kenyataan. Padukan input teks, gambar, dan video atau bangun tools kustom — FLOW CONNECT memberimu kanvas adaptif untuk berimajinasi.',
    point: 'Hasilkan gambar & video berkualitas tinggi dengan model AI canggih.',
    icon: Wand2,
    image: '/media/ricefield.jpg',
  },
  {
    key: 'Sempurnakan',
    title: 'Edit dengan percaya diri',
    desc: 'Gunakan bahasa natural untuk edit yang kompleks dan berulang, atur aset dengan kontrol profesional, dan terapkan perubahan ke seluruh project dengan mudah.',
    point: 'Edit gambar dan videomu cukup dengan kata-kata.',
    icon: Sparkles,
    image: '/media/underwater.jpg',
  },
]

export function WorkflowSection() {
  const [i, setI] = useState(0)
  const s = STEPS[i]
  return (
    <section id="alur" className="relative py-24">
      <div className="container-x">
        <SectionTitle eyebrow="Alur Kerja" title={<>Rencanakan. Buat. <span className="text-aurora">Sempurnakan.</span></>} />

        <div className="mx-auto mb-10 flex w-fit gap-1 rounded-2xl p-1 glass">
          {STEPS.map((st, idx) => (
            <button
              key={st.key}
              onClick={() => setI(idx)}
              className={clsx('rounded-xl px-5 py-2.5 text-sm font-semibold transition', idx === i ? 'bg-aurora text-white' : 'text-white/60 hover:text-white')}
            >
              {st.key}
            </button>
          ))}
        </div>

        <div key={s.key} className="grid animate-fade-up items-center gap-10 lg:grid-cols-2">
          <div>
            <s.icon className="size-10 text-aurora-cyan" />
            <h3 className="mt-5 font-display text-3xl font-bold sm:text-4xl">{s.title}</h3>
            <div className="my-6 h-px w-20 bg-aurora" />
            <p className="text-lg text-white/65">{s.desc}</p>
            <p className="mt-6 flex items-center gap-3 text-sm text-white/80">
              <span className="grid size-6 place-items-center rounded-full bg-aurora-violet/30 text-aurora-purple">✓</span>
              {s.point}
            </p>
          </div>

          {/* mock UI */}
          <div className="relative overflow-hidden rounded-3xl p-3 glass">
            <div className="relative aspect-video overflow-hidden rounded-2xl">
              <img src={s.image} alt="" className="h-full w-full animate-kenburns object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            </div>
            <div className="absolute inset-x-6 bottom-6 flex items-center gap-2 rounded-xl p-2 glass-strong">
              <s.icon className="ml-2 size-4 text-aurora-purple" />
              <span className="flex-1 truncate text-xs text-white/70">
                {i === 0 && 'Agen: “Bagaimana kalau adegan pembuka dimulai dari hujan di jendela?”'}
                {i === 1 && 'Drone shot sawah terasering Bali saat matahari terbit, kabut tipis…'}
                {i === 2 && 'Ubah waktunya jadi malam hari dan tambahkan ubur-ubur bercahaya'}
              </span>
              <span className="rounded-lg bg-aurora px-3 py-1.5 text-xs font-semibold">{i === 0 ? 'Balas' : i === 1 ? 'Buat' : 'Edit'}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── Tools ─────────────── */
export function ToolsSection() {
  const scroller = useRef<HTMLDivElement>(null)
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * 340, behavior: 'smooth' })

  return (
    <section id="tools" className="relative py-24">
      <div className="container-x">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-cyan">Tools</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Tools kreatif, <span className="text-aurora">siap pakai</span>
            </h2>
            <p className="mt-3 max-w-xl text-white/60">Dibuat oleh Google dan komunitas kreator. Buka langsung di Google Flow dengan akun pilihanmu.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => scroll(-1)} className="rounded-full p-3 glass hover:bg-white/10" aria-label="Sebelumnya">
              <ChevronLeft className="size-5" />
            </button>
            <button onClick={() => scroll(1)} className="rounded-full p-3 glass hover:bg-white/10" aria-label="Berikutnya">
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <div ref={scroller} className="no-scrollbar flex snap-x gap-4 overflow-x-auto px-5 pb-4 sm:px-[max(2rem,calc((100vw-80rem)/2+2rem))]">
        {TOOLS.map((t, i) => {
          const Icon = TOOL_ICONS[t.icon] ?? Sparkles
          return (
            <Link
              to="/app/tools"
              key={t.name}
              className="group relative flex w-72 shrink-0 snap-start flex-col overflow-hidden rounded-3xl p-6 glass transition hover:-translate-y-1 hover:bg-white/[0.07]"
            >
              <div className={clsx('grid size-14 place-items-center rounded-2xl bg-gradient-to-br shadow-lg', TOOL_GRADIENTS[i % TOOL_GRADIENTS.length])}>
                <Icon className="size-7" />
              </div>
              <h3 className="mt-6 font-display text-lg font-semibold">{t.name}</h3>
              <p className="mt-1 flex-1 text-sm text-white/55">{t.desc}</p>
              <div className="mt-6 flex items-center justify-between text-xs text-white/45">
                <span>Dibuat oleh {t.author}</span>
                <ArrowRight className="size-4 transition group-hover:translate-x-1 group-hover:text-aurora-cyan" />
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* ─────────────── Films / Sessions ─────────────── */
export function FilmsSection() {
  const [i, setI] = useState(0)
  const f = FILMS[i]
  return (
    <section id="karya" className="relative py-24">
      <div className="container-x">
        <SectionTitle
          eyebrow="FLOW Sessions"
          title={<>Karya dari para <span className="text-aurora">kreator</span></>}
          desc="Karya para seniman visioner yang bereksperimen dengan Google Flow untuk mewujudkan project impian mereka."
        />
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div key={f.title} className="relative aspect-video animate-fade-up overflow-hidden rounded-3xl border border-white/10">
            <img src={f.image} alt={f.title} className="h-full w-full animate-kenburns object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
            <div className="absolute bottom-0 p-6 sm:p-8">
              <p className="text-xs uppercase tracking-widest text-aurora-cyan">
                {f.author} · {f.role}
              </p>
              <h3 className="mt-2 font-display text-3xl font-bold">{f.title}</h3>
              <p className="mt-2 max-w-lg text-sm text-white/70">{f.desc}</p>
              <button className={buttonClass('glass', 'sm', 'mt-4')}>
                <Play className="size-3.5 fill-white" /> Tonton
              </button>
            </div>
          </div>
          <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto pr-1">
            {FILMS.map((film, idx) => (
              <button
                key={film.title}
                onClick={() => setI(idx)}
                className={clsx('flex items-center gap-4 rounded-2xl p-3 text-left transition', idx === i ? 'glow-border bg-white/[0.06]' : 'glass hover:bg-white/[0.06]')}
              >
                <img src={film.image} alt="" className="aspect-video w-28 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{film.title}</p>
                  <p className="truncate text-xs text-white/50">
                    {film.author} · {film.role}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─────────────── FAQ + CTA ─────────────── */
const FAQ = [
  { q: 'Apa itu FLOW CONNECT?', a: 'Pintu masuk ke Google Flow. Kamu login di FLOW CONNECT, menautkan satu atau beberapa akun Google, lalu membuka Google Flow dengan akun mana pun dalam satu klik.' },
  { q: 'Apakah generate video terjadi di FLOW CONNECT?', a: 'Tidak. Semua proses generate berjalan di Google Flow memakai akun Google kamu sendiri, termasuk kuota dan langganan Google AI milik akun tersebut.' },
  { q: 'Bisakah menambah lebih dari satu akun Google?', a: 'Bisa, hingga 10 akun. Tautkan lewat “Masuk dengan Google” (terverifikasi) atau cukup dengan alamat email, lalu pilih akun default.' },
  { q: 'Bisakah upload & download lewat FLOW CONNECT?', a: 'Bisa. Di komputer pakai bookmarklet (tanpa instal) atau ekstensi gratis FLOW CONNECT Bridge: gambar & prompt dikirim ke project Google Flow-mu, hasilnya bisa dilihat dan diunduh dari Studio. Di HP, Studio mengirim gambar & prompt ke aplikasi Google Flow resmi (Android & iPhone). Tanpa API key.' },
  { q: 'Apakah password Google saya aman?', a: 'FLOW CONNECT tidak pernah melihat atau menyimpan password Google. Login selalu dilakukan di halaman resmi Google.' },
]

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="relative py-24">
      <div className="container-x grid gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aurora-cyan">FAQ</p>
          <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Pertanyaan umum</h2>
          <div className="glow-border relative mt-10 overflow-hidden rounded-3xl p-8">
            <div className="absolute -right-10 -top-10 size-48 rounded-full bg-aurora-violet/40 blur-3xl" />
            <h3 className="relative font-display text-2xl font-bold">Siap memulai?</h3>
            <p className="relative mt-2 text-white/60">Daftar gratis, tautkan akun Google, dan langsung buka Google Flow.</p>
            <Link to="/app" className={buttonClass('primary', 'lg', 'relative mt-6')}>
              Mulai Berkarya <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {FAQ.map((item, i) => (
            <div key={item.q} className="rounded-2xl glass">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 p-5 text-left font-semibold">
                {item.q}
                <ChevronRight className={clsx('size-4 shrink-0 transition', open === i && 'rotate-90 text-aurora-cyan')} />
              </button>
              {open === i && <p className="animate-fade-up px-5 pb-5 text-sm text-white/60">{item.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
