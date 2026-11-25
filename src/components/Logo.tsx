import { Link } from 'react-router-dom'

export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="fc-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M18 46V22c0-3 2-5 5-5h23" stroke="url(#fc-g)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M18 33h18" stroke="url(#fc-g)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="45" cy="44" r="5" fill="#22d3ee" />
    </svg>
  )
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[15px] font-bold leading-[1.05] tracking-wide">
        FLOW
        <br />
        CONNECT
      </span>
    </Link>
  )
}
