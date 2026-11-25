import clsx from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'glass' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return clsx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-aurora-cyan',
    size === 'sm' && 'px-3 py-1.5 text-xs',
    size === 'md' && 'px-4 py-2.5 text-sm',
    size === 'lg' && 'px-6 py-3.5 text-base',
    variant === 'primary' && 'bg-aurora text-white shadow-[0_0_30px_-6px_#7c3aed] hover:shadow-[0_0_40px_-4px_#22d3ee] hover:brightness-110',
    variant === 'glass' && 'glass text-white hover:bg-white/10',
    variant === 'ghost' && 'text-white/70 hover:bg-white/5 hover:text-white',
    variant === 'danger' && 'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25',
    extra,
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />
}
