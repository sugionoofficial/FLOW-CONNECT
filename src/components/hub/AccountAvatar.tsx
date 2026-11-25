import { useState } from 'react'
import clsx from 'clsx'
import type { GoogleAccount } from '../../lib/types'

const COLORS = ['from-violet-600 to-cyan-500', 'from-fuchsia-600 to-violet-600', 'from-cyan-500 to-blue-600', 'from-indigo-600 to-teal-400', 'from-pink-500 to-orange-400']

export function AccountAvatar({ account, className = 'size-10' }: { account: Pick<GoogleAccount, 'email' | 'avatar_url' | 'display_name'>; className?: string }) {
  const [broken, setBroken] = useState(false)
  const initial = (account.display_name || account.email).slice(0, 1).toUpperCase()
  const color = COLORS[[...account.email].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length]
  if (account.avatar_url && !broken) {
    return <img src={account.avatar_url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={clsx('shrink-0 rounded-full object-cover', className)} />
  }
  return <span className={clsx('grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold', color, className)}>{initial}</span>
}

export const accountTitle = (a: GoogleAccount) => a.label || a.display_name || a.email.split('@')[0]
