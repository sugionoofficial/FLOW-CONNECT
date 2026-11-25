import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Play, Wand2 } from 'lucide-react'
import { AuroraBg } from '../AuroraBg'
import { PROMPT_IDEAS, SHOWCASE_MEDIA } from '../../lib/catalog'

export function Hero() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [ideaIdx, setIdeaIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setIdeaIdx((i) => (i + 1) % PROMPT_IDEAS.length), 3500)
    return () => clearInterval(t)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = prompt.trim() || PROMPT_IDEAS[ideaIdx]
    navigate(`/app?prompt=${encodeURIComponent(text)}`)
  }

  return (
    <section className="relative isolate overflow-hidden pb-20 pt-36 md:pt-44">
      <AuroraBg />
      <div className="container-x grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-white/80 glass">
            <span className="size-1.5 rounded-full bg-aurora-cyan shadow-[0_0_10px_#22d3ee]" />
            Studio kreatif AI generasi baru
          </span>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Wujudkan ide
            <br />
            jadi <span className="text-aurora">film AI</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/65">
            FLOW CONNECT adalah studio kreatif AI untuk membuat video, gambar, dan tools kustom. Rencanakan, buat, dan sempurnakan karyamu —
            semuanya dalam satu alur.
          </p>

          <form onSubmit={submit} className="glow-border mt-8 flex max-w-xl items-center gap-2 rounded-2xl p-2 glass">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={PROMPT_IDEAS[ideaIdx]}
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm placeholder:text-white/40 focus:outline-none"
              aria-label="Deskripsikan videomu"
            />
            <button type="submit" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-aurora px-5 py-3 text-sm font-semibold shadow-[0_0_30px_-6px_#7c3aed] transition hover:brightness-110">
              Buat <Wand2 className="size-4" />
            </button>
          </form>
          <p className="mt-4 max-w-xl text-xs text-white/40">
            Gratis 100 kredit untuk pengguna baru. Fitur dapat berbeda sesuai paket langganan. 18+.
          </p>
        </div>

        <div className="relative grid grid-cols-2 gap-3 sm:gap-4">
          {SHOWCASE_MEDIA.map((src, i) => (
            <div
              key={src}
              className="group relative aspect-video overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_40px_-12px_#7c3aed]"
              style={{ animation: `float 6s ease-in-out ${i * 0.4}s infinite` }}
            >
              <img src={src} alt="" className="h-full w-full animate-kenburns object-cover" style={{ animationDelay: `${-i * 1.3}s` }} />
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-aurora-purple/30 transition group-hover:ring-aurora-cyan/60" />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] backdrop-blur">
                <Play className="size-2.5 fill-white" /> 0:0{8 - (i % 3)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <a href="#model" className="mx-auto mt-16 flex w-fit flex-col items-center gap-1 text-xs text-white/40 hover:text-white/70">
        Jelajahi
        <ChevronDown className="size-4 animate-bounce" />
      </a>
    </section>
  )
}
