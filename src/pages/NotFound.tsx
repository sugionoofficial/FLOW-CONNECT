import { Link } from 'react-router-dom'
import { AuroraBg } from '../components/AuroraBg'
import { buttonClass } from '../components/Button'

export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <AuroraBg />
      <p className="font-display text-8xl font-bold text-aurora">404</p>
      <p className="text-white/60">Halaman yang kamu cari tidak ditemukan.</p>
      <Link to="/" className={buttonClass('primary', 'md')}>Kembali ke beranda</Link>
    </div>
  )
}
