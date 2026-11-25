import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { AppHeader } from '../components/AppHeader'
import { AuroraBg } from '../components/AuroraBg'
import { Modal } from '../components/Modal'
import { Button } from '../components/Button'
import { TOOL_GRADIENTS, TOOL_ICONS } from '../components/toolIcons'
import { TOOLS } from '../lib/catalog'

export default function Tools() {
  const [selected, setSelected] = useState<(typeof TOOLS)[number] | null>(null)
  const [tab, setTab] = useState<'semua' | 'resmi' | 'komunitas'>('semua')
  const list = TOOLS.filter((t) => tab === 'semua' || (tab === 'resmi' ? t.author === 'FLOW CONNECT' : t.author !== 'FLOW CONNECT'))

  return (
    <div className="relative isolate min-h-screen">
      <AuroraBg intensity={0.5} />
      <AppHeader />
      <main className="container-x py-10">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Tools</h1>
        <p className="mt-1 text-white/55">Perluas studiomu dengan tools siap pakai dari tim kami dan komunitas.</p>
        <div className="mt-6 flex gap-1.5">
          {(['semua', 'resmi', 'komunitas'] as const).map((t) => (
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
              <button key={t.name} onClick={() => setSelected(t)} className="group flex flex-col rounded-3xl p-6 text-left glass transition hover:-translate-y-1 hover:bg-white/[0.07]">
                <div className={clsx('grid size-12 place-items-center rounded-2xl bg-gradient-to-br', TOOL_GRADIENTS[i % TOOL_GRADIENTS.length])}>
                  <Icon className="size-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">{t.name}</h3>
                <p className="mt-1 flex-1 text-sm text-white/55">{t.desc}</p>
                <p className="mt-5 text-xs text-white/40">oleh {t.author}</p>
              </button>
            )
          })}
        </div>
      </main>
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        <p className="text-sm text-white/65">{selected?.desc}</p>
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/50">
          🚧 Tool ini sedang disiapkan dan akan segera hadir.
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setSelected(null)}>Oke</Button>
        </div>
      </Modal>
    </div>
  )
}
