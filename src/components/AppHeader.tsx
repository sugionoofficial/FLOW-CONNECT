import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Download, Images, KeyRound, LogOut } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from './Logo'
import { useAuth } from '../context/AuthContext'

export function UserMenu() {
  const { user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const name = profile?.display_name || user?.email?.split('@')[0] || 'Kreator'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-full bg-aurora text-sm font-bold uppercase" aria-label="Menu akun">
        {name.slice(0, 1)}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-60 animate-fade-up rounded-2xl p-2 glass-strong shadow-2xl">
          <div className="px-3 py-2">
            <p className="truncate font-semibold">{name}</p>
            <p className="truncate text-xs text-white/50">{user?.email}</p>
          </div>
          <div className="my-1 h-px bg-white/10" />
          {[
            { to: '/app/lisensi', label: 'Lisensi aplikasi PC', Icon: KeyRound },
            { to: '/unduh', label: 'Unduh aplikasi PC', Icon: Download },
            { to: '/contoh', label: 'Contoh generate', Icon: Images },
          ].map(({ to, label, Icon }) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/5 hover:text-white">
              <Icon className="size-4" /> {label}
            </Link>
          ))}
          <div className="my-1 h-px bg-white/10" />
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
            onClick={async () => { await signOut(); navigate('/') }}
          >
            <LogOut className="size-4" /> Keluar
          </button>
        </div>
      )}
    </div>
  )
}

export function AppHeader({ children }: { children?: ReactNode }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    clsx('rounded-lg px-3 py-1.5 text-sm transition', isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white')
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center gap-6">
        <Link to="/app" className="shrink-0"><Logo to="/app" /></Link>
        <nav className="hidden items-center gap-1 sm:flex">
          <NavLink to="/app" end className={link}>Akun Google</NavLink>
          <NavLink to="/app/studio" className={link}>Studio</NavLink>
          <NavLink to="/app/tools" className={link}>Tools</NavLink>
          <NavLink to="/app/lisensi" className={link}>Lisensi</NavLink>
          <NavLink to="/contoh" className={link}>Contoh</NavLink>
          <NavLink to="/unduh" className={link}>Unduh</NavLink>
        </nav>
        <div className="flex-1">{children}</div>
        <UserMenu />
      </div>
    </header>
  )
}
