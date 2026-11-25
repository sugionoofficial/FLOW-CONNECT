import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import clsx from 'clsx'

export const isVideoFile = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url)

/**
 * Menampilkan output generate. File video asli diputar dengan <video>.
 * Output mock (gambar untuk mode video) ditampilkan sebagai "video" dengan
 * animasi Ken Burns + progress bar agar alurnya terasa nyata.
 */
export function MediaView({
  url,
  kind,
  autoPlay = false,
  controls = false,
  duration = 8,
  className,
  onEnded,
}: {
  url: string
  kind: 'video' | 'image'
  autoPlay?: boolean
  controls?: boolean
  duration?: number
  className?: string
  onEnded?: () => void
}) {
  const [playing, setPlaying] = useState(autoPlay)
  const [progress, setProgress] = useState(0)
  const raf = useRef<number | null>(null)
  const last = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const real = isVideoFile(url)

  useEffect(() => {
    setProgress(0)
    setPlaying(autoPlay)
  }, [url, autoPlay])

  // mock playback clock
  const progressRef = useRef(0)
  const endedRef = useRef(onEnded)
  endedRef.current = onEnded
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  useEffect(() => {
    if (real || kind !== 'video' || !playing) return
    const tick = (t: number) => {
      if (last.current != null) {
        let next = progressRef.current + (t - last.current) / 1000 / duration
        if (next >= 1) {
          if (endedRef.current) {
            progressRef.current = 1
            setProgress(1)
            endedRef.current()
            return
          }
          next = 0
        }
        progressRef.current = next
        setProgress(next)
      }
      last.current = t
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      last.current = null
    }
  }, [playing, real, kind, duration])

  if (kind === 'image') {
    return <img src={url} alt="" className={clsx('h-full w-full object-cover', className)} loading="lazy" />
  }

  if (real) {
    return (
      <video
        ref={videoRef}
        src={url}
        className={clsx('h-full w-full object-cover', className)}
        autoPlay={autoPlay}
        controls={controls}
        muted={!controls}
        loop={!onEnded}
        playsInline
        onEnded={onEnded}
      />
    )
  }

  return (
    <div className={clsx('relative h-full w-full overflow-hidden', className)}>
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        style={{
          transform: `scale(${1 + progress * 0.18}) translate(${-progress * 3}%, ${-progress * 2}%)`,
          transition: playing ? 'none' : 'transform .3s',
        }}
        loading="lazy"
      />
      {controls && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setPlaying((p) => !p)
            }}
            className="rounded-full bg-white/15 p-2 backdrop-blur hover:bg-white/25"
            aria-label={playing ? 'Jeda' : 'Putar'}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full bg-aurora" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="w-16 text-right font-mono text-xs text-white/70">
            0:{String(Math.floor(progress * duration)).padStart(2, '0')} / 0:{String(duration).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  )
}
