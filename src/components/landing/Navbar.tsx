import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from '../Logo'
import { buttonClass } from '../Button'
import { useAuth } from '../../context/AuthContext'

// href diawali '/#' = bagian di halaman utama; selain itu = halaman tersendiri
const LINKS = [
  { href: '/#model', label: 'Model' },
  { href: '/#alur', label: 'Alur Kerja' },
  { href: '/contoh', label: 'Contoh' },
  { href: '/unduh', label: 'Unduh Aplikasi' },
  { href: '/#faq', label: 'FAQ' },
]

function NavItem({ href, label, className, onClick }: { href: string; label: string; className: string; onClick?: () => void }) {
  if (href.startsWith('/#')) {
    return <a href={href} className={className} onClick={onClick}>{label}</a>
  }
  return (
    <NavLink to={href} onClick={onClick} className={({ isActive }) => clsx(className, isActive && 'text-white')}>
      {label}
    </NavLink>
  )
}

export function Navbar() {
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-4 pt-4">
      <nav
        className={clsx(
          'container-x flex items-center justify-between rounded-2xl py-3 transition-all',
          scrolled ? 'glass-strong shadow-2xl' : 'glass',
        )}
      >
        <Logo />
        <div className="hidden items-center gap-8 text-sm text-white/75 md:flex">
          {LINKS.map((l) => (
            <NavItem key={l.href} {...l} className="transition hover:text-white" />
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Link to="/app/lisensi" className={buttonClass('primary', 'md')}>
              Lisensi saya
            </Link>
          ) : (
            <>
              <Link to="/masuk" className={buttonClass('ghost', 'md')}>
                Masuk
              </Link>
              <Link to="/masuk?mode=daftar" className={buttonClass('glass', 'md', 'border-aurora-cyan/40')}>
                Daftar Gratis
              </Link>
            </>
          )}
        </div>
        <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      {open && (
        <div className="container-x mt-2 flex animate-fade-up flex-col gap-1 rounded-2xl p-3 glass-strong md:hidden">
          {LINKS.map((l) => (
            <NavItem key={l.href} {...l} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-white/80 hover:bg-white/5" />
          ))}
          <Link to={user ? '/app/lisensi' : '/masuk'} className={buttonClass('primary', 'md', 'mt-2')}>
            {user ? 'Lisensi saya' : 'Masuk / Daftar'}
          </Link>
        </div>
      )}
    </header>
  )
}
