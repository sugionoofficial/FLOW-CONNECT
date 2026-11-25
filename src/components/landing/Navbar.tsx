import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from '../Logo'
import { buttonClass } from '../Button'
import { useAuth } from '../../context/AuthContext'

const LINKS = [
  { href: '#model', label: 'Model' },
  { href: '#alur', label: 'Alur Kerja' },
  { href: '#tools', label: 'Tools' },
  { href: '#karya', label: 'Karya' },
  { href: '#faq', label: 'FAQ' },
]

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
            <a key={l.href} href={l.href} className="transition hover:text-white">
              {l.label}
            </a>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Link to="/app" className={buttonClass('primary', 'md')}>
              Buka Studio
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
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-white/80 hover:bg-white/5">
              {l.label}
            </a>
          ))}
          <Link to={user ? '/app' : '/masuk'} className={buttonClass('primary', 'md', 'mt-2')}>
            {user ? 'Buka Studio' : 'Masuk / Daftar'}
          </Link>
        </div>
      )}
    </header>
  )
}
