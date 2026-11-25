import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import clsx from 'clsx'

type Kind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: Kind; message: string }

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info
          return (
            <div
              key={t.id}
              className={clsx(
                'pointer-events-auto flex animate-fade-up items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-2xl glass-strong',
                t.kind === 'error' && 'border-red-500/40',
                t.kind === 'success' && 'border-emerald-400/40',
              )}
            >
              <Icon className={clsx('size-4', t.kind === 'error' ? 'text-red-400' : t.kind === 'success' ? 'text-emerald-400' : 'text-aurora-cyan')} />
              <span>{t.message}</span>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-white/40 hover:text-white">
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
