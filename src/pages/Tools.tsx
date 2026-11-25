import { useEffect, useState } from 'react'
import { ExternalLink, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { AppHeader } from '../components/AppHeader'
import { AuroraBg } from '../components/AuroraBg'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'
import { TOOL_GRADIENTS, TOOL_ICONS } from '../components/toolIcons'
import { AccountPicker } from '../components/hub/AccountPicker'
import { AddAccountModal } from '../components/hub/AddAccountModal'
import { useGoogleAccounts } from '../hooks/useGoogleAccounts'
import { TOOLS, type Tool } from '../lib/catalog'
import type { GoogleAccount } from '../lib/types'

export default function Tools() {
  const { accounts, setAccounts, launch, defaultAccount } = useGoogleAccounts()
  const [tool, setTool] = useState<Tool | null>(null)
  const [account, setAccount] = useState<GoogleAccount | null>(null)
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState<'semua' | 'google' | 'komunitas'>('semua')
  const list = TOOLS.filter((t) => tab === 'semua' || (tab === 'google' ? t.author === 'Google' : t.author !== 'Google'))

  useEffect(() => {
    if (!account && defaultAccount) setAccount(defaultAccount)
  }, [defaultAccount, account])

  return (
    <div className="relative isolate min-h-screen">
      <AuroraBg intensity={0.5} />
      <AppHeader />
      <main className="container-x py-10">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Tools Google Flow</h1>
        <p className="mt-1 text-white/55">Buka tools siap pakai langsung di Google Flow dengan akun Google pilihanmu.</p>
        <div className="mt-6 flex gap-1.5">
          {(['semua', 'google', 'komunitas'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx('rounded-full px-4 py-1.5 text-sm capitalize transition', tab === t ? 'bg-white font-semibold text-ink-950' : 'glass text-white/70')}>
              {t}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => {
            const Icon = TOOL_ICONS[t.icon] ?? Sparkles
            const i = TOOLS.indexOf(t)
            return (
              <button key={t.name} onClick={() => setTool(t)} className="group flex flex-col rounded-3xl p-6 text-left glass transition hover:-translate-y-1 hover:bg-white/[0.07]">
                <div className={clsx('grid size-12 place-items-center rounded-2xl bg-gradient-to-br', TOOL_GRADIENTS[i % TOOL_GRADIENTS.length])}>
                  <Icon className="size-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">{t.name}</h3>
                <p className="mt-1 flex-1 text-sm text-white/55">{t.desc}</p>
                <p className="mt-5 flex items-center justify-between text-xs text-white/40">
                  oleh {t.author}
                  <ExternalLink className="size-3.5 transition group-hover:text-aurora-cyan" />
                </p>
              </button>
            )
          })}
        </div>
      </main>

      <Modal open={!!tool} onClose={() => setTool(null)} title={tool?.name}>
        <p className="text-sm text-white/65">{tool?.desc}</p>
        <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-white/45">Buka dengan akun</p>
        {accounts && accounts.length > 0 ? (
          <AccountPicker accounts={accounts} value={account} onChange={setAccount} onAdd={() => setAdding(true)} />
        ) : (
          <Button variant="glass" className="w-full" onClick={() => setAdding(true)}>Tambah akun Google dulu</Button>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTool(null)}>Batal</Button>
          <Button
            disabled={!account}
            onClick={() => {
              if (tool && account) launch(account, tool.url)
              setTool(null)
            }}
          >
            Buka di Google Flow <ExternalLink className="size-4" />
          </Button>
        </div>
      </Modal>

      <AddAccountModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(a) => {
          setAccounts((l) => [...(l ?? []).filter((x) => x.id !== a.id), a])
          setAccount(a)
        }}
      />
    </div>
  )
}
