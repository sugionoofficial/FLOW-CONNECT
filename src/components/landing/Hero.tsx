import { Link } from 'react-router-dom'
import { ChevronDown, Images, MonitorDown, Play } from 'lucide-react'
import { AuroraBg } from '../AuroraBg'
import { SHOWCASE_MEDIA } from '../../lib/catalog'

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pb-20 pt-36 md:pt-44">
      <AuroraBg />
      <div className="container-x grid items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-white/80 glass">
            <span className="size-1.5 rounded-full bg-aurora-cyan shadow-[0_0_10px_#22d3ee]" />
            Aplikasi PC untuk Google Flow
          </span>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Wujudkan ide
            <br />
            jadi <span className="text-aurora">film AI</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/65">
            FLOW CONNECT Desktop membawa Google Flow ke PC-mu — banyak akun Google, Studio untuk video & gambar, Asisten Prompt AI,
            galeri, unduh otomatis, dan antrean prompt dalam satu aplikasi.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <Link to="/unduh" className="inline-flex items-center gap-2 rounded-xl bg-aurora px-5 py-3 text-sm font-semibold shadow-[0_0_30px_-6px_#7c3aed] transition hover:brightness-110">
              <MonitorDown className="size-4" /> Unduh aplikasi PC
            </Link>
            <Link to="/contoh" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold glass transition hover:bg-white/10">
              <Images className="size-4 text-aurora-cyan" /> Lihat contoh generate
            </Link>
          </div>
          <p className="mt-4 max-w-xl text-xs text-white/40">
            Proses generate berjalan di Google Flow dengan akun Google kamu sendiri. Fitur mengikuti langganan Google AI tiap akun. 18+.
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
