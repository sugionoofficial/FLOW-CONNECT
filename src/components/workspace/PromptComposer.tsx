import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, ChevronDown, Coins, ImagePlus, Loader2, Settings2, Sparkles, X } from 'lucide-react'
import clsx from 'clsx'
import { ASPECT_RATIOS, MODELS, MODES, modeById } from '../../lib/catalog'
import { enhancePrompt } from '../../lib/engine'
import { uploadAsset } from '../../lib/api'
import type { AspectRatio, GenerationMode, InputAsset } from '../../lib/types'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'

export interface ComposerPreset {
  key: number
  prompt?: string
  mode?: GenerationMode
  assets?: InputAsset[]
}

export interface ComposerSubmit {
  mode: GenerationMode
  model: string
  prompt: string
  aspectRatio: AspectRatio
  count: number
  costEach: number
  inputAssets: InputAsset[]
}

export function PromptComposer({
  preset,
  onSubmit,
}: {
  preset?: ComposerPreset
  onSubmit: (input: ComposerSubmit) => Promise<boolean>
}) {
  const { user, profile } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState<GenerationMode>('text_to_video')
  const [model, setModel] = useState('motion-3-fast')
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState<AspectRatio>('16:9')
  const [count, setCount] = useState(2)
  const [assets, setAssets] = useState<InputAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<InputAsset['role'] | null>(null)
  const [menu, setMenu] = useState<'mode' | 'settings' | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingRole = useRef<InputAsset['role']>('first_frame')
  const rootRef = useRef<HTMLDivElement>(null)

  const modeDef = modeById(mode)
  const modelDef = MODELS[model]
  const total = modelDef.cost * count

  // apply presets from parent (reuse prompt, animate image, etc.)
  useEffect(() => {
    if (!preset) return
    if (preset.mode) changeMode(preset.mode)
    if (preset.prompt !== undefined) setPrompt(preset.prompt)
    if (preset.assets) setAssets(preset.assets)
    setTimeout(() => textRef.current?.focus(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.key])

  useEffect(() => {
    const onClick = (e: MouseEvent) => rootRef.current && !rootRef.current.contains(e.target as Node) && setMenu(null)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // auto-grow textarea
  useEffect(() => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [prompt])

  function changeMode(m: GenerationMode) {
    setMode(m)
    const def = modeById(m)
    setModel((cur) => (def.models.includes(cur) ? cur : def.models[0]))
    setAssets((a) =>
      a.filter((x) => (m === 'frames_to_video' ? x.role !== 'ingredient' : m === 'ingredients_to_video' ? x.role === 'ingredient' : false)),
    )
    setMenu(null)
  }

  const pickFile = (role: InputAsset['role']) => {
    pendingRole.current = role
    fileRef.current?.click()
  }

  const onFile = async (file: File | undefined) => {
    if (!file || !user) return
    if (!file.type.startsWith('image/')) return toast('Hanya file gambar yang didukung.', 'error')
    if (file.size > 10 * 1024 * 1024) return toast('Ukuran maksimal 10 MB.', 'error')
    const role = pendingRole.current
    setUploading(role)
    try {
      const { url, path } = await uploadAsset(user.id, file)
      setAssets((a) => (role === 'ingredient' ? [...a, { role, url, path }] : [...a.filter((x) => x.role !== role), { role, url, path }]))
    } catch (e) {
      toast(`Gagal mengunggah: ${(e as Error).message}`, 'error')
    } finally {
      setUploading(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const validate = (): string | null => {
    if (!prompt.trim() && mode !== 'frames_to_video') return 'Tulis prompt terlebih dahulu.'
    if (mode === 'frames_to_video' && !assets.some((a) => a.role === 'first_frame')) return 'Unggah frame awal dulu.'
    if (mode === 'ingredients_to_video' && !assets.some((a) => a.role === 'ingredient')) return 'Tambahkan minimal 1 gambar bahan.'
    if ((profile?.credits ?? 0) < total) return `Kredit tidak cukup (butuh ${total}).`
    return null
  }

  const submit = async () => {
    const err = validate()
    if (err) return toast(err, 'error')
    setBusy(true)
    const ok = await onSubmit({
      mode,
      model,
      prompt: prompt.trim() || 'Animasikan frame ini secara sinematik',
      aspectRatio: aspect,
      count,
      costEach: modelDef.cost,
      inputAssets: assets,
    })
    setBusy(false)
    if (ok) {
      setPrompt('')
      setAssets([])
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const slot = (role: InputAsset['role'], label: string, asset?: InputAsset, idx?: number) => (
    <div key={asset?.url ?? `${role}-${idx ?? 0}`} className="relative">
      {asset ? (
        <div className="group relative size-16 overflow-hidden rounded-xl border border-white/15">
          <img src={asset.url} alt={label} className="h-full w-full object-cover" />
          <button
            onClick={() => setAssets((a) => a.filter((x) => x !== asset))}
            className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 opacity-0 transition group-hover:opacity-100"
            aria-label="Hapus"
          >
            <X className="size-3" />
          </button>
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[9px] text-white/80">{label}</span>
        </div>
      ) : (
        <button
          onClick={() => pickFile(role)}
          disabled={!!uploading}
          className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-white/20 text-white/45 transition hover:border-aurora-cyan/60 hover:text-white"
        >
          {uploading === role ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          <span className="text-[9px]">{label}</span>
        </button>
      )}
    </div>
  )

  const ingredients = assets.filter((a) => a.role === 'ingredient')

  return (
    <div ref={rootRef} className="glow-border relative rounded-3xl glass-strong p-3 shadow-[0_20px_80px_-20px_#7c3aed80]">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {(mode === 'frames_to_video' || mode === 'ingredients_to_video') && (
        <div className="mb-2 flex items-center gap-2 px-1 pt-1">
          {mode === 'frames_to_video' && (
            <>
              {slot('first_frame', 'Awal', assets.find((a) => a.role === 'first_frame'))}
              <span className="text-white/30">→</span>
              {slot('last_frame', 'Akhir (ops.)', assets.find((a) => a.role === 'last_frame'))}
            </>
          )}
          {mode === 'ingredients_to_video' && (
            <>
              {ingredients.map((a, i) => slot('ingredient', `Bahan ${i + 1}`, a, i))}
              {ingredients.length < 3 && slot('ingredient', 'Tambah', undefined, ingredients.length)}
            </>
          )}
          <p className="ml-2 hidden max-w-xs text-xs text-white/40 sm:block">{modeDef.description}</p>
        </div>
      )}

      <textarea
        ref={textRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={onKey}
        rows={1}
        placeholder={
          mode === 'text_to_image' ? 'Deskripsikan gambar yang ingin kamu buat…' :
          mode === 'frames_to_video' ? 'Jelaskan gerakan/aksi antara frame (opsional)…' :
          'Deskripsikan adegan videomu…'
        }
        className="block w-full resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed placeholder:text-white/35 focus:outline-none"
      />

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {/* mode */}
        <div className="relative">
          <button onClick={() => setMenu(menu === 'mode' ? null : 'mode')} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold glass hover:bg-white/10">
            {modeDef.label} <ChevronDown className="size-3.5" />
          </button>
          {menu === 'mode' && (
            <div className="absolute bottom-12 left-0 z-20 w-72 animate-fade-up rounded-2xl p-1.5 glass-strong shadow-2xl">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => changeMode(m.id)}
                  className={clsx('w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5', m.id === mode && 'bg-white/[0.07]')}
                >
                  <p className="text-sm font-semibold">{m.label}</p>
                  <p className="text-xs text-white/50">{m.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* settings */}
        <div className="relative">
          <button onClick={() => setMenu(menu === 'settings' ? null : 'settings')} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-white/75 glass hover:bg-white/10">
            <Settings2 className="size-3.5" />
            <span className="hidden sm:inline">{modelDef.name.replace('Aurora ', '')}</span> · {aspect} · x{count}
          </button>
          {menu === 'settings' && (
            <div className="absolute bottom-12 left-0 z-20 w-80 animate-fade-up rounded-2xl p-4 glass-strong shadow-2xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Model</p>
              <div className="flex flex-col gap-1">
                {modeDef.models.map((id) => {
                  const m = MODELS[id]
                  return (
                    <button
                      key={id}
                      onClick={() => setModel(id)}
                      className={clsx('flex items-center justify-between rounded-xl border px-3 py-2 text-left transition', id === model ? 'border-aurora-cyan/50 bg-white/[0.06]' : 'border-transparent hover:bg-white/5')}
                    >
                      <span>
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          {m.name}
                          {m.badge && <span className="rounded bg-aurora px-1.5 py-px text-[9px]">{m.badge}</span>}
                        </span>
                        <span className="text-xs text-white/50">{m.tagline}</span>
                      </span>
                      <span className="shrink-0 text-xs text-amber-300">{m.cost} kr</span>
                    </button>
                  )
                })}
              </div>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-white/45">Rasio aspek</p>
              <div className="grid grid-cols-3 gap-1">
                {ASPECT_RATIOS.map((r) => (
                  <button key={r.id} onClick={() => setAspect(r.id)} className={clsx('rounded-lg py-2 text-xs transition', r.id === aspect ? 'bg-aurora font-semibold' : 'bg-white/5 hover:bg-white/10')}>
                    {r.id}
                  </button>
                ))}
              </div>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-white/45">Output per prompt</p>
              <div className="grid grid-cols-4 gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} onClick={() => setCount(n)} className={clsx('rounded-lg py-2 text-xs transition', n === count ? 'bg-aurora font-semibold' : 'bg-white/5 hover:bg-white/10')}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (!prompt.trim()) return toast('Tulis ide singkat dulu, agen akan menyempurnakannya.', 'info')
            setPrompt(enhancePrompt(prompt, modelDef.kind))
            toast('Prompt disempurnakan oleh agen ✨', 'success')
          }}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-aurora-purple glass hover:bg-white/10"
          title="Sempurnakan prompt dengan agen"
        >
          <Sparkles className="size-3.5" /> <span className="hidden sm:inline">Sempurnakan</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-white/50" title="Biaya kredit">
            <Coins className="size-3.5 text-amber-300" /> {total}
          </span>
          <button
            onClick={submit}
            disabled={busy}
            className="grid size-10 place-items-center rounded-full bg-aurora shadow-[0_0_24px_-4px_#7c3aed] transition hover:brightness-110 disabled:opacity-50"
            aria-label="Generate"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
