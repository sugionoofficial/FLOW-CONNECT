import { Clapperboard, Copy, Download, Film, Heart, RotateCcw, Trash2, Wand2, X } from 'lucide-react'
import clsx from 'clsx'
import { useEffect } from 'react'
import type { Generation } from '../../lib/types'
import { MODELS, modeById } from '../../lib/catalog'
import { MediaView } from '../MediaView'
import { buttonClass } from '../Button'

export function GenerationDetail({
  gen,
  onClose,
  onReuse,
  onAnimate,
  onUseAsIngredient,
  onAddScene,
  onDelete,
  onToggleFavorite,
  onSetCover,
}: {
  gen: Generation | null
  onClose: () => void
  onReuse: (g: Generation) => void
  onAnimate: (g: Generation) => void
  onUseAsIngredient: (g: Generation) => void
  onAddScene: (g: Generation) => void
  onDelete: (g: Generation) => void
  onToggleFavorite: (g: Generation) => void
  onSetCover: (g: Generation) => void
}) {
  useEffect(() => {
    if (!gen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gen, onClose])

  if (!gen || !gen.output_url) return null
  const isVideo = gen.mode !== 'text_to_image'
  const date = new Date(gen.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="fixed inset-0 z-50 flex bg-black/85 backdrop-blur-md" role="dialog" aria-modal>
      <div className="flex flex-1 items-center justify-center p-4 sm:p-10" onClick={onClose}>
        <div
          className={clsx(
            'relative max-h-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_80px_-20px_#7c3aed]',
            gen.aspect_ratio === '16:9' && 'aspect-video w-full max-w-5xl',
            gen.aspect_ratio === '9:16' && 'aspect-[9/16] h-full max-h-[85vh]',
            gen.aspect_ratio === '1:1' && 'aspect-square h-full max-h-[80vh]',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MediaView url={gen.output_url} kind={isVideo ? 'video' : 'image'} autoPlay controls duration={Number(gen.settings?.duration ?? 8)} />
        </div>
      </div>

      <aside className="hidden w-96 shrink-0 flex-col border-l border-white/10 bg-ink-900/90 p-6 md:flex">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs">{modeById(gen.mode).label}</span>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Tutup">
            <X className="size-5" />
          </button>
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-white/40">Prompt</p>
        <p className="mt-2 text-sm leading-relaxed text-white/85">{gen.prompt}</p>
        <button
          onClick={() => navigator.clipboard.writeText(gen.prompt)}
          className="mt-2 inline-flex w-fit items-center gap-1 text-xs text-white/45 hover:text-white"
        >
          <Copy className="size-3" /> Salin prompt
        </button>

        {gen.input_assets.length > 0 && (
          <>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-white/40">Input</p>
            <div className="mt-2 flex gap-2">
              {gen.input_assets.map((a) => (
                <img key={a.url} src={a.url} alt={a.role} className="size-14 rounded-lg border border-white/10 object-cover" />
              ))}
            </div>
          </>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-3 text-xs">
          <Meta label="Model" value={MODELS[gen.model]?.name ?? gen.model} />
          <Meta label="Rasio" value={gen.aspect_ratio} />
          <Meta label="Biaya" value={`${gen.cost} kredit`} />
          <Meta label="Dibuat" value={date} />
        </dl>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          {isVideo ? (
            <button onClick={() => onAddScene(gen)} className={buttonClass('primary', 'md')}>
              <Clapperboard className="size-4" /> Tambah ke Scenebuilder
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onAnimate(gen)} className={buttonClass('primary', 'md')}>
                <Film className="size-4" /> Animasikan
              </button>
              <button onClick={() => onUseAsIngredient(gen)} className={buttonClass('glass', 'md')}>
                <Wand2 className="size-4" /> Jadikan bahan
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onReuse(gen)} className={buttonClass('glass', 'md')}>
              <RotateCcw className="size-4" /> Pakai ulang
            </button>
            <a href={gen.output_url} download target="_blank" rel="noreferrer" className={buttonClass('glass', 'md')}>
              <Download className="size-4" /> Unduh
            </a>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => onToggleFavorite(gen)} className={buttonClass('ghost', 'sm')}>
              <Heart className={clsx('size-4', gen.is_favorite && 'fill-pink-500 text-pink-500')} /> Favorit
            </button>
            <button onClick={() => onSetCover(gen)} className={buttonClass('ghost', 'sm')}>
              Jadikan sampul
            </button>
            <button onClick={() => onDelete(gen)} className={buttonClass('ghost', 'sm', 'text-red-300 hover:text-red-200')}>
              <Trash2 className="size-4" /> Hapus
            </button>
          </div>
        </div>
      </aside>

      {/* mobile close */}
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/60 p-2 md:hidden" aria-label="Tutup">
        <X className="size-5" />
      </button>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-3">
      <dt className="text-white/40">{label}</dt>
      <dd className="mt-0.5 font-medium text-white/85">{value}</dd>
    </div>
  )
}
