import { Logo } from '../Logo'

export function Footer() {
  return (
    <footer className="relative border-t border-white/10 py-12">
      <div className="container-x flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-white/45">Studio kreatif AI untuk video, gambar, dan tools kustom.</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/55">
          <a href="#model" className="hover:text-white">Model</a>
          <a href="#tools" className="hover:text-white">Tools</a>
          <a href="#karya" className="hover:text-white">Karya</a>
          <a href="#faq" className="hover:text-white">FAQ</a>
          <span>Privasi</span>
          <span>Syarat</span>
        </div>
      </div>
      <p className="container-x mt-10 text-xs text-white/30">© {new Date().getFullYear()} FLOW CONNECT. Dibuat di Indonesia.</p>
    </footer>
  )
}
