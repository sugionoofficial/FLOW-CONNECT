import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Clapperboard, GripVertical, Pause, Play, SkipBack, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { Generation, Scene } from '../../lib/types'
import { MediaView } from '../MediaView'

export function SceneBuilder({
  scenes,
  generations,
  onReorder,
  onRemove,
  onGoGallery,
}: {
  scenes: Scene[]
  generations: Generation[]
  onReorder: (next: Scene[]) => void
  onRemove: (s: Scene) => void
  onGoGallery: () => void
}) {
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const genById = new Map(generations.map((g) => [g.id, g]))
  const items = scenes.map((s) => ({ scene: s, gen: genById.get(s.generation_id) })).filter((x) => x.gen?.output_url)
  const active = items[current]
  const totalSec = items.reduce((acc, x) => acc + Number(x.gen?.settings?.duration ?? 8), 0)

  useEffect(() => {
    if (current >= items.length) setCurrent(Math.max(0, items.length - 1))
  }, [items.length, current])

  const next = useCallback(() => {
    setCurrent((c) => {
      if (c + 1 >= items.length) {
        setPlaying(false)
        return 0
      }
      return c + 1
    })
  }, [items.length])

  const move = (from: number, to: number) => {
    if (to < 0 || to >= scenes.length || from === to) return
    const arr = [...scenes]
    const [it] = arr.splice(from, 1)
    arr.splice(to, 0, it)
    onReorder(arr)
    setCurrent(to)
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-aurora/20 glass">
          <Clapperboard className="size-7 text-aurora-cyan" />
        </div>
        <h3 className="font-display text-2xl font-bold">Scenebuilder masih kosong</h3>
        <p className="max-w-md text-sm text-white/55">Tambahkan klip video dari galeri dengan tombol <b>+</b> untuk merangkai cerita. Atur urutannya, lalu putar semuanya sebagai satu film.</p>
        <button onClick={onGoGallery} className="mt-2 rounded-xl px-4 py-2.5 text-sm font-semibold glass hover:bg-white/10">Buka galeri</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto aspect-video w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_0_80px_-30px_#22d3ee]">
        {active?.gen && (
          <MediaView
            key={`${active.scene.id}-${playing}`}
            url={active.gen.output_url!}
            kind="video"
            autoPlay={playing}
            controls
            duration={Number(active.gen.settings?.duration ?? 8)}
            onEnded={playing ? next : undefined}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button onClick={() => { setCurrent(0); setPlaying(false) }} className="rounded-full p-2.5 glass hover:bg-white/10" aria-label="Ke awal">
          <SkipBack className="size-4" />
        </button>
        <button onClick={() => setPlaying((p) => !p)} className="inline-flex items-center gap-2 rounded-full bg-aurora px-5 py-2.5 text-sm font-semibold">
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />} {playing ? 'Jeda' : 'Putar semua'}
        </button>
        <span className="ml-2 text-xs text-white/50">
          Adegan {current + 1}/{items.length} · total ±{totalSec} detik
        </span>
      </div>

      {/* timeline */}
      <div className="rounded-3xl p-4 glass">
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
          {items.map(({ scene, gen }, i) => (
            <div
              key={scene.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null) move(dragIdx, i); setDragIdx(null) }}
              className={clsx(
                'group relative w-48 shrink-0 cursor-pointer overflow-hidden rounded-2xl border transition',
                i === current ? 'border-aurora-cyan shadow-[0_0_20px_-4px_#22d3ee]' : 'border-white/10 hover:border-white/30',
                dragIdx === i && 'opacity-40',
              )}
              onClick={() => { setCurrent(i); setPlaying(false) }}
            >
              <img src={gen!.output_url!} alt="" className="aspect-video w-full object-cover" />
              <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px]">
                <GripVertical className="size-3 text-white/50" /> {i + 1}
              </div>
              <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button onClick={(e) => { e.stopPropagation(); move(i, i - 1) }} className="rounded bg-black/70 p-1" aria-label="Geser kiri"><ChevronLeft className="size-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); move(i, i + 1) }} className="rounded bg-black/70 p-1" aria-label="Geser kanan"><ChevronRight className="size-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); onRemove(scene) }} className="rounded bg-black/70 p-1 text-red-300" aria-label="Hapus dari timeline"><Trash2 className="size-3" /></button>
              </div>
              <p className="truncate px-2 py-1.5 text-[11px] text-white/60">{gen!.prompt}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
