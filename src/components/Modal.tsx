import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

export function Modal({
  open,
  onClose,
  children,
  className,
  title,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  title?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative w-full max-w-lg animate-fade-up rounded-2xl glass-strong p-6 shadow-2xl', className)}>
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h3 className="font-display text-lg font-semibold">{title}</h3>}
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Tutup">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
