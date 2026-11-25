import { LogoMark } from './Logo'

export function Loader({ full }: { full?: boolean }) {
  return (
    <div className={full ? 'flex min-h-screen items-center justify-center' : 'flex items-center justify-center py-16'}>
      <LogoMark className="size-10 animate-pulse" />
    </div>
  )
}
