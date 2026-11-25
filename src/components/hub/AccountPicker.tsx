import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import clsx from 'clsx'
import type { GoogleAccount } from '../../lib/types'
import { AccountAvatar, accountTitle } from './AccountAvatar'

export function AccountPicker({
  accounts,
  value,
  onChange,
  onAdd,
}: {
  accounts: GoogleAccount[]
  value: GoogleAccount | null
  onChange: (a: GoogleAccount) => void
  onAdd: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left glass hover:bg-white/10">
        {value ? (
          <>
            <AccountAvatar account={value} className="size-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{accountTitle(value)}</span>
              <span className="block truncate text-xs text-white/50">{value.email}</span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-white/60">Pilih akun Google…</span>
        )}
        <ChevronDown className={clsx('size-4 shrink-0 text-white/50 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 animate-fade-up overflow-y-auto rounded-2xl p-1.5 glass-strong shadow-2xl">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => { onChange(a); setOpen(false) }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5"
            >
              <AccountAvatar account={a} className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{accountTitle(a)}</span>
                <span className="block truncate text-xs text-white/45">{a.email}</span>
              </span>
              {value?.id === a.id && <Check className="size-4 text-aurora-cyan" />}
            </button>
          ))}
          <div className="my-1 h-px bg-white/10" />
          <button onClick={() => { setOpen(false); onAdd() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-aurora-cyan hover:bg-white/5">
            <span className="grid size-8 place-items-center rounded-full border border-dashed border-aurora-cyan/50"><Plus className="size-4" /></span>
            Tambah akun Google lain
          </button>
        </div>
      )}
    </div>
  )
}
