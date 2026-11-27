import { Link } from 'react-router-dom'
import { Logo } from '../Logo'

export function Footer() {
  return (
    <footer className="relative border-t border-white/10 py-12">
      <div className="container-x flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-white/45">Aplikasi PC untuk Google Flow — banyak akun Google dalam satu aplikasi.</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/55">
          <a href="/#model" className="hover:text-white">Model</a>
          <a href="/#tools" className="hover:text-white">Tools</a>
          <Link to="/contoh" className="hover:text-white">Contoh</Link>
          <Link to="/unduh" className="hover:text-white">Unduh Aplikasi PC</Link>
          <Link to="/app/lisensi" className="hover:text-white">Lisensi</Link>
          <a href="/#faq" className="hover:text-white">FAQ</a>
          <span>Privasi</span>
          <span>Syarat</span>
        </div>
      </div>
      <p className="container-x mt-10 text-xs text-white/30">© 2026 FLOW CONNECT. Dibuat di Indonesia. Tidak berafiliasi dengan Google. Google, Google Flow, Veo, Gemini, dan Nano Banana adalah merek dagang Google LLC.</p>
    </footer>
  )
}
