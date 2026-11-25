export function AuroraBg({ intensity = 1 }: { intensity?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden style={{ opacity: intensity }}>
      <div className="absolute -left-1/4 top-[-20%] h-[70vh] w-[90vw] animate-aurora rounded-full bg-[radial-gradient(closest-side,#7c3aed55,transparent)] blur-3xl" />
      <div
        className="absolute -right-1/4 top-[10%] h-[60vh] w-[70vw] animate-aurora rounded-full bg-[radial-gradient(closest-side,#06b6d445,transparent)] blur-3xl"
        style={{ animationDelay: '-6s' }}
      />
      <div
        className="absolute bottom-[-30%] left-1/4 h-[50vh] w-[60vw] animate-aurora rounded-full bg-[radial-gradient(closest-side,#4f46e540,transparent)] blur-3xl"
        style={{ animationDelay: '-12s' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
    </div>
  )
}
