import { AlertTriangle, Heart, Image as ImageIcon, Plus, Video } from 'lucide-react'
import clsx from 'clsx'
import type { Generation } from '../../lib/types'
import { MODELS } from '../../lib/catalog'
import { MediaView, isVideoFile } from '../MediaView'

const ratioClass = { '16:9': 'aspect-video', '9:16': 'aspect-[9/16]', '1:1': 'aspect-square' } as const

export function GenerationCard({
  gen,
  onOpen,
  onAddScene,
  onToggleFavorite,
}: {
  gen: Generation
  onOpen: () => void
  onAddScene: () => void
  onToggleFavorite: () => void
}) {
  const isVideo = gen.mode !== 'text_to_image'
  const done = gen.status === 'done' && gen.output_url

  return (
    <div className={clsx('group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-ink-850', ratioClass[gen.aspect_ratio])}>
      {done ? (
        <button onClick={onOpen} className="block h-full w-full" aria-label="Buka detail">
          <HoverPreview gen={gen} isVideo={isVideo} />
        </button>
      ) : gen.status === 'failed' ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-red-300">
          <AlertTriangle className="size-6" />
          Gagal — kredit dikembalikan
        </div>
      ) : (
        <div className="shimmer flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-aurora-cyan" />
          <p className="text-xs text-white/60">{isVideo ? 'Membuat video…' : 'Membuat gambar…'}</p>
          <p className="line-clamp-2 max-w-[90%] text-[11px] text-white/35">{gen.prompt}</p>
        </div>
      )}

      {/* badges */}
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] backdrop-blur">
          {isVideo ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
          {MODELS[gen.model]?.name.replace('Aurora ', '') ?? gen.model}
        </span>
      </div>

      {done && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={onToggleFavorite}
            className={clsx('rounded-lg bg-black/60 p-1.5 backdrop-blur hover:bg-black/80', gen.is_favorite && 'opacity-100')}
            aria-label="Favorit"
          >
            <Heart className={clsx('size-3.5', gen.is_favorite && 'fill-pink-500 text-pink-500')} />
          </button>
          {isVideo && (
            <button onClick={onAddScene} className="rounded-lg bg-black/60 p-1.5 backdrop-blur hover:bg-black/80" aria-label="Tambah ke Scenebuilder" title="Tambah ke Scenebuilder">
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      )}
      {done && gen.is_favorite && (
        <Heart className="pointer-events-none absolute right-2 top-2 size-4 fill-pink-500 text-pink-500 group-hover:hidden" />
      )}

      {done && (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 text-left text-xs text-white/80 opacity-0 transition group-hover:opacity-100">
          {gen.prompt}
        </p>
      )}
    </div>
  )
}

function HoverPreview({ gen, isVideo }: { gen: Generation; isVideo: boolean }) {
  // Simple: animate (Ken Burns) on hover for mock videos
  return (
    <div className="h-full w-full overflow-hidden">
      {isVideo && isVideoFile(gen.output_url!) ? (
        <MediaView url={gen.output_url!} kind="video" autoPlay />
      ) : isVideo ? (
        <div className="h-full w-full transition-transform duration-[8000ms] ease-linear group-hover:scale-[1.18]">
          <MediaView url={gen.output_url!} kind="image" />
        </div>
      ) : (
        <MediaView url={gen.output_url!} kind="image" />
      )}
    </div>
  )
}
