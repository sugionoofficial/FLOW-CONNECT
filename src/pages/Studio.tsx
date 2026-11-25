import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  AlertTriangle, CheckCircle2, Clipboard, Download, ExternalLink, FolderOpen, ImagePlus, Loader2, Play,
  Bookmark, Monitor, Puzzle, RefreshCw, Smartphone, Send, ShieldCheck, Type, Wand2, X, Zap,
} from 'lucide-react'
import clsx from 'clsx'
import { AppHeader } from '../components/AppHeader'
import { AuroraBg } from '../components/AuroraBg'
import { Button, buttonClass } from '../components/Button'
import { Modal } from '../components/Modal'
import { useToast } from '../context/ToastContext'
import { useGoogleAccounts } from '../hooks/useGoogleAccounts'
import {
  BRIDGE_EXTENSION_ID, BRIDGE_ZIP_URL, bridge, copyImageToClipboard, detectBridge, flowProjectUrl,
  type BridgeStatus, type FlowMedia,
} from '../lib/bridge'
import { bookmarkletConnector, extensionConnector, type Connector, type ConnectorKind } from '../lib/connector'
import { bookmarkletHref, flowLink, type LinkState } from '../lib/flowLink'
import { FLOW_APP_URL } from '../lib/google'
import { isMobile } from '../lib/device'
import { MobileStudio } from '../components/studio/MobileStudio'

const PROMPT_KEY = 'fc:pendingPrompt'

type Mode = 'komputer' | 'hp'
const MODE_KEY = 'fc:studioMode'
const METHOD_KEY = 'fc:studioMethod'
const viaBookmarklet = () => new URLSearchParams(window.location.search).get('via') === 'bookmarklet'

const ConnectorContext = createContext<Connector>(extensionConnector)
const useConnector = () => useContext(ConnectorContext)

export default function Studio() {
  const [mode, setMode] = useState<Mode>(() => {
    if (viaBookmarklet()) return 'komputer'
    const saved = localStorage.getItem(MODE_KEY)
    return saved === 'hp' || saved === 'komputer' ? saved : isMobile() ? 'hp' : 'komputer'
  })
  const change = (m: Mode) => {
    setMode(m)
    localStorage.setItem(MODE_KEY, m)
  }
  const modeSwitch = <ModeSwitch mode={mode} onChange={change} />
  if (mode === 'komputer') return <DesktopStudio modeSwitch={modeSwitch} />
  return (
    <div className="relative isolate min-h-screen">
      <AuroraBg intensity={0.5} />
      <AppHeader />
      <main className="container-x max-w-xl py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-bold">
            Studio <span className="text-aurora">Flow</span>
          </h1>
          {modeSwitch}
        </div>
        <p className="mt-1 text-sm text-white/55">Siapkan gambar & prompt di sini, lalu kirim ke aplikasi Google Flow di HP-mu.</p>
        <div className="mt-6">
          <MobileStudio onUseBookmarklet={() => { localStorage.setItem(METHOD_KEY, 'bookmarklet'); change('komputer') }} />
        </div>
      </main>
    </div>
  )
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const item = (m: Mode, label: string, Icon: typeof Monitor) => (
    <button
      onClick={() => onChange(m)}
      className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition', mode === m ? 'bg-white text-ink-950' : 'text-white/60 hover:text-white')}
      aria-pressed={mode === m}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  )
  return (
    <div className="flex gap-1 rounded-xl p-1 glass" role="group" aria-label="Mode studio">
      {item('komputer', 'Komputer', Monitor)}
      {item('hp', 'HP', Smartphone)}
    </div>
  )
}

function DesktopStudio({ modeSwitch }: { modeSwitch: ReactNode }) {
  const { launch, defaultAccount } = useGoogleAccounts()
  const [method, setMethod] = useState<ConnectorKind>(() => {
    if (viaBookmarklet()) return 'bookmarklet'
    const saved = localStorage.getItem(METHOD_KEY)
    return saved === 'extension' || saved === 'bookmarklet' ? saved : 'bookmarklet'
  })
  const [extVersion, setExtVersion] = useState<string | null | undefined>(undefined) // undefined = memeriksa
  const [extStatus, setExtStatus] = useState<BridgeStatus | null>(null)
  const [link, setLink] = useState<LinkState>(flowLink.state)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)
  const connector = method === 'extension' ? extensionConnector : bookmarkletConnector

  const changeMethod = (m: ConnectorKind) => {
    setMethod(m)
    localStorage.setItem(METHOD_KEY, m)
  }

  const refresh = useCallback(async () => {
    if (method === 'bookmarklet') {
      flowLink.sayHello()
      return
    }
    const v = await detectBridge()
    setExtVersion(v)
    if (!v) return setExtStatus(null)
    try {
      setExtStatus(await bridge.status())
    } catch {
      setExtStatus(null)
    }
  }, [method])

  useEffect(() => flowLink.subscribe(setLink), [])

  useEffect(() => {
    refresh()
    if (method !== 'extension') return
    const t = setInterval(refresh, 6000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh, method])

  /** string = terhubung (versi), null = tidak, undefined = memeriksa */
  const version: string | null | undefined = method === 'extension' ? extVersion : link.connected ? 'bookmarklet' : null
  const status = method === 'extension' ? extStatus : link.status

  useEffect(() => {
    setProjectId((cur) => (status && cur && status.projects.some((p) => p.id === cur) ? cur : status?.projects[0]?.id ?? null))
  }, [status])

  const openFlow = async (url?: string) => {
    if (method === 'bookmarklet') {
      await bookmarkletConnector.openFlow(url)
      return
    }
    if (version && url) {
      try {
        await bridge.openFlow(url)
        return
      } catch { /* fallback */ }
    }
    if (defaultAccount) launch(defaultAccount, url)
    else window.open(url || FLOW_APP_URL, '_blank', 'noopener,noreferrer')
  }

  const ready = !!version && !!status?.signedIn && !!projectId

  return (
    <div className="relative isolate min-h-screen">
      <AuroraBg intensity={0.5} />
      <AppHeader />
      <main className="container-x py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              Studio <span className="text-aurora">Google Flow</span>
            </h1>
            <p className="mt-1 max-w-2xl text-white/55">
              Kirim gambar & prompt ke Google Flow, lalu lihat dan unduh hasilnya dari sini. Generate tetap berjalan di Google Flow asli
              dengan akun Google kamu — tanpa API key.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {modeSwitch}
            <Button variant="glass" onClick={refresh}><RefreshCw className="size-4" /> Segarkan</Button>
          </div>
        </div>

        <MethodSwitch method={method} onChange={changeMethod} />

        {/* ───── status ───── */}
        <section className="mt-4 grid gap-3 md:grid-cols-3">
          <StatusPill
            ok={!!version}
            loading={version === undefined}
            title={method === 'extension' ? 'Ekstensi Bridge' : 'Bookmarklet'}
            text={
              method === 'extension'
                ? version ? `Terpasang · v${version}` : 'Belum terpasang'
                : version ? 'Terhubung ke tab Flow' : 'Belum terhubung'
            }
            action={!version && version !== undefined ? <button onClick={() => setGuide(true)} className="text-aurora-cyan hover:underline">{method === 'extension' ? 'Pasang' : 'Cara pakai'}</button> : null}
          />
          <StatusPill
            ok={!!status?.signedIn}
            warn={!!status?.flowOpen && !status?.signedIn}
            title="Google Flow"
            text={
              !version ? (method === 'extension' ? 'Butuh ekstensi' : 'Klik bookmarklet di tab Flow') :
              !status?.flowOpen ? 'Tab Flow belum dibuka' :
              status.signedIn ? (status.account ? `Login · ${status.account}` : 'Login') : 'Belum login di Flow'
            }
            action={(method === 'bookmarklet' && !version) || (version && !status?.flowOpen) ? <button onClick={() => openFlow()} className="text-aurora-cyan hover:underline">Buka</button> : null}
          />
          <StatusPill
            ok={!!status?.projects.length}
            title="Project"
            text={
              status?.projects.length
                ? method === 'bookmarklet' ? status.projects[0].title : `${status.projects.length} project terbuka di Flow`
                : 'Buka / buat project di Flow'
            }
          />
        </section>

        {!version && version !== undefined && (method === 'extension'
          ? <InstallCard onGuide={() => setGuide(true)} />
          : <BookmarkletCard onOpenFlow={() => openFlow()} onGuide={() => setGuide(true)} />)}

        {version && status?.flowOpen && !status.projects.length && (
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-3xl border border-amber-400/25 bg-amber-400/5 p-5">
            <FolderOpen className="size-6 text-amber-300" />
            <p className="flex-1 text-sm text-white/75">
              Buka atau buat sebuah <b>project</b> di tab Google Flow. Project yang terbuka akan muncul otomatis di sini.
            </p>
            <Button variant="glass" onClick={() => openFlow()}>Ke Google Flow <ExternalLink className="size-4" /></Button>
          </div>
        )}

        {/* ───── pilih project ───── */}
        {!!status?.projects.length && (
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-white/50">Project:</span>
            {status.projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setProjectId(p.id)}
                className={clsx('max-w-64 truncate rounded-full px-4 py-1.5 text-sm transition', projectId === p.id ? 'bg-white font-semibold text-ink-950' : 'glass text-white/70 hover:text-white')}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        <ConnectorContext.Provider value={connector}>
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
            <SendPanel ready={ready} bridgeOn={!!version} projectId={projectId} onOpenFlow={openFlow} />
            <Gallery ready={ready} projectId={projectId} onOpen={(id) => openFlow(flowProjectUrl(id))} />
          </div>
        </ConnectorContext.Provider>

        <p className="mt-10 flex items-start gap-2 text-xs text-white/40">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          FLOW CONNECT tidak menyimpan password, cookie, atau token Google. Ekstensi & bookmarklet hanya bekerja di tab Google Flow milikmu dan tidak pernah
          menekan tombol Generate atas namamu. Tidak berafiliasi dengan Google.
        </p>
      </main>

      {method === 'extension'
        ? <InstallModal open={guide} onClose={() => { setGuide(false); refresh() }} />
        : <BookmarkletModal open={guide} onClose={() => { setGuide(false); refresh() }} />}
    </div>
  )
}

function StatusPill({ ok, warn, loading, title, text, action }: { ok: boolean; warn?: boolean; loading?: boolean; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 glass">
      {loading ? <Loader2 className="size-5 animate-spin text-white/50" /> :
        ok ? <CheckCircle2 className="size-5 text-emerald-400" /> :
        <AlertTriangle className={clsx('size-5', warn ? 'text-amber-300' : 'text-white/35')} />}
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wider text-white/45">{title}</p>
        <p className="truncate text-sm font-medium">{text}</p>
      </div>
      {action && <span className="text-sm font-semibold">{action}</span>}
    </div>
  )
}

function SendPanel({ ready, bridgeOn, projectId, onOpenFlow }: { ready: boolean; bridgeOn: boolean; projectId: string | null; onOpenFlow: (url?: string) => void }) {
  const toast = useToast()
  const connector = useConnector()
  const [files, setFiles] = useState<File[]>([])
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem(PROMPT_KEY) ?? '')
  const [busy, setBusy] = useState<'img' | 'prompt' | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews])

  const add = (list: FileList | null) => {
    const imgs = [...(list ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    setFiles((cur) => [...cur, ...imgs].slice(0, 10))
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    add(e.dataTransfer.files)
  }

  const sendImages = async () => {
    setBusy('img')
    try {
      const res = await connector.sendImage(files, projectId ?? undefined)
      toast(`${res.count} gambar dikirim ke Google Flow — cek tab Flow`, 'success')
      setFiles([])
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }
  const copyFirst = async () => {
    try {
      await copyImageToClipboard(files[0])
      toast('Gambar disalin — tempel (Ctrl/⌘+V) di Google Flow', 'success')
      onOpenFlow(projectId ? flowProjectUrl(projectId) : undefined)
    } catch {
      toast('Browser tidak mengizinkan salin gambar. Hubungkan ekstensi atau bookmarklet.', 'error')
    }
  }
  const sendPrompt = async () => {
    setBusy('prompt')
    try {
      await connector.sendPrompt(prompt, projectId ?? undefined)
      sessionStorage.removeItem(PROMPT_KEY)
      toast('Prompt dituliskan di Google Flow — tekan Generate di sana', 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-3xl p-6 glass">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Send className="size-5 text-aurora-cyan" /> Kirim ke Google Flow</h2>
        <p className="mt-1 text-sm text-white/50">Gambar & prompt dimasukkan ke project Flow yang terbuka. Upload dan generate dilakukan oleh Google Flow.</p>
      </div>

      {/* gambar */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ImagePlus className="size-4" /> Gambar referensi</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => input.current?.click()}
          className={clsx('cursor-pointer rounded-2xl border border-dashed p-5 text-center transition', drag ? 'border-aurora-cyan bg-aurora-cyan/10' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.03]')}
        >
          <ImagePlus className="mx-auto size-7 text-white/40" />
          <p className="mt-2 text-sm text-white/65">Seret gambar ke sini atau <span className="text-aurora-cyan">pilih file</span></p>
          <p className="text-xs text-white/35">PNG · JPG · WEBP · maks 15 MB · hingga 10 gambar</p>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </div>
        {!!files.length && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {previews.map((src, i) => (
              <div key={src} className="group relative aspect-square overflow-hidden rounded-xl">
                <img src={src} alt="" className="size-full object-cover" />
                <button onClick={() => setFiles((f) => f.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 opacity-0 transition group-hover:opacity-100" aria-label="Hapus">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" disabled={!files.length || !ready || busy !== null} onClick={sendImages}>
            {busy === 'img' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Kirim gambar
          </Button>
          {!bridgeOn && (
            <Button variant="glass" disabled={!files.length} onClick={copyFirst} title="Belum terhubung: salin lalu tempel di Flow">
              <Clipboard className="size-4" /> Salin
            </Button>
          )}
        </div>
      </div>

      <div className="h-px bg-white/10" />

      {/* prompt */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Type className="size-4" /> Prompt</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={8000}
          placeholder="Contoh: Drone shot sawah terasering Bali saat matahari terbit, kabut tipis, sinematik"
          className="w-full resize-none rounded-2xl px-4 py-3 text-sm glass placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-aurora-cyan/50"
        />
        <div className="mt-2 flex gap-2">
          <Button className="flex-1" disabled={!prompt.trim() || !ready || busy !== null} onClick={sendPrompt}>
            {busy === 'prompt' ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Tulis di Flow
          </Button>
          <Button
            variant="glass"
            disabled={!prompt.trim()}
            onClick={() => navigator.clipboard.writeText(prompt).then(() => toast('Prompt disalin', 'success'))}
          >
            <Clipboard className="size-4" /> Salin
          </Button>
        </div>
        <p className="mt-2 text-xs text-white/40">Setelah itu pilih model & tekan <b>Generate</b> di Google Flow. Hasilnya muncul di galeri.</p>
      </div>
    </section>
  )
}

function Gallery({ ready, projectId, onOpen }: { ready: boolean; projectId: string | null; onOpen: (id: string) => void }) {
  const connector = useConnector()
  const [items, setItems] = useState<FlowMedia[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'semua' | 'gambar' | 'video'>('semua')
  const [preview, setPreview] = useState<FlowMedia | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      setItems(await connector.listMedia(projectId))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [projectId, connector])

  useEffect(() => {
    setItems(null)
    if (ready) load()
  }, [ready, load])

  const shown = (items ?? []).filter((m) => filter === 'semua' || (filter === 'video' ? m.isVideo : !m.isVideo))

  return (
    <section className="min-w-0 rounded-3xl p-6 glass">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Download className="size-5 text-aurora-cyan" /> Galeri Google Flow</h2>
        <div className="flex items-center gap-1.5">
          {(['semua', 'gambar', 'video'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={clsx('rounded-full px-3 py-1 text-xs capitalize', filter === f ? 'bg-white/15 font-semibold' : 'text-white/55 hover:text-white')}>
              {f}
            </button>
          ))}
          <button onClick={load} disabled={!ready || loading} className="ml-1 rounded-lg p-1.5 text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Muat ulang galeri">
            <RefreshCw className={clsx('size-4', loading && 'animate-spin')} />
          </button>
          {projectId && (
            <button onClick={() => onOpen(projectId)} className="rounded-lg p-1.5 text-white/55 hover:bg-white/10 hover:text-white" aria-label="Buka project di Flow">
              <ExternalLink className="size-4" />
            </button>
          )}
        </div>
      </div>

      {!ready ? (
        <Empty text="Hubungkan ekstensi atau bookmarklet, login di Google Flow, dan buka sebuah project untuk melihat hasilnya di sini." />
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-red-400/25 bg-red-400/5 p-4 text-sm text-red-200">{error}</div>
      ) : items === null ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-2xl bg-white/5" />)}
        </div>
      ) : !shown.length ? (
        <Empty text="Belum ada media di project ini. Generate sesuatu di Google Flow lalu klik muat ulang." />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {shown.map((m) => <MediaTile key={m.mediaId} media={m} onPreview={() => setPreview(m)} />)}
        </div>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title || 'Media'} className="max-w-3xl">
        {preview && <MediaPreview media={preview} />}
      </Modal>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/45">{text}</div>
}

/* ───────── media ───────── */

function useMediaUrls(media: FlowMedia) {
  const connector = useConnector()
  const [urls, setUrls] = useState({ image: media.image, video: media.video })
  const [thumb, setThumb] = useState<string | null>(media.image)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (urls.image || urls.video || !media.done) return
    let alive = true
    connector.getMedia(media.mediaId).then((u) => alive && (setUrls(u), setThumb(u.image))).catch(() => alive && setFailed(true))
    return () => { alive = false }
  }, [media, urls.image, urls.video, connector])

  /** Jika URL butuh cookie Google (tidak tampil langsung), ambil lewat ekstensi / bookmarklet. */
  const onThumbError = useCallback(() => {
    if (!urls.image || thumb?.startsWith('data:') || thumb?.startsWith('blob:')) return setFailed(true)
    connector.thumb(urls.image).then(setThumb).catch(() => setFailed(true))
  }, [urls.image, thumb, connector])

  return { urls, thumb, failed, onThumbError }
}

const fileName = (m: FlowMedia) =>
  `${(m.title || 'flow').replace(/\s+/g, '-').slice(0, 60)}-${m.mediaId.slice(0, 8)}.${m.isVideo ? 'mp4' : 'jpg'}`

function MediaTile({ media, onPreview }: { media: FlowMedia; onPreview: () => void }) {
  const toast = useToast()
  const connector = useConnector()
  const { urls, thumb, failed, onThumbError } = useMediaUrls(media)
  const [busy, setBusy] = useState(false)
  const src = media.isVideo ? urls.video : urls.image

  const download = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!src) return
    setBusy(true)
    try {
      await connector.download(src, fileName(media))
      toast('Unduhan dimulai', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={onPreview} className="group relative aspect-square cursor-pointer overflow-hidden rounded-2xl bg-white/5">
      {!media.done ? (
        <div className="grid size-full place-items-center text-xs text-white/50"><Loader2 className="mb-1 size-5 animate-spin" />Diproses…</div>
      ) : thumb && !failed ? (
        <img src={thumb} alt={media.title} loading="lazy" referrerPolicy="no-referrer" onError={onThumbError} className="size-full object-cover transition duration-500 group-hover:scale-105" />
      ) : media.isVideo && urls.video ? (
        <video src={urls.video} muted preload="metadata" className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-xs text-white/40">{failed ? 'Pratinjau tidak tersedia' : <Loader2 className="size-5 animate-spin" />}</div>
      )}
      {media.isVideo && <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-black/60"><Play className="size-3.5 fill-white" /></span>}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-8 opacity-0 transition group-hover:opacity-100">
        <p className="line-clamp-2 text-xs text-white/85">{media.title || 'Tanpa judul'}</p>
        <button onClick={download} disabled={!src || busy} className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-ink-950 disabled:opacity-50" aria-label="Unduh">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        </button>
      </div>
    </div>
  )
}

function MediaPreview({ media }: { media: FlowMedia }) {
  const toast = useToast()
  const connector = useConnector()
  const { urls, thumb } = useMediaUrls(media)
  const src = media.isVideo ? urls.video : urls.image
  return (
    <div>
      <div className="overflow-hidden rounded-2xl bg-black">
        {media.isVideo && urls.video ? (
          <video src={urls.video} controls autoPlay className="max-h-[65vh] w-full" />
        ) : thumb ? (
          <img src={thumb} alt={media.title} referrerPolicy="no-referrer" className="max-h-[65vh] w-full object-contain" />
        ) : (
          <div className="grid h-64 place-items-center text-white/40"><Loader2 className="size-6 animate-spin" /></div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/55">{media.createdAt ? new Date(media.createdAt).toLocaleString('id-ID') : ''}</p>
        <Button
          disabled={!src}
          onClick={() => src && connector.download(src, fileName(media)).then(() => toast('Unduhan dimulai', 'success')).catch((e) => toast((e as Error).message, 'error'))}
        >
          <Download className="size-4" /> Unduh {media.isVideo ? 'video' : 'gambar'}
        </Button>
      </div>
    </div>
  )
}

/* ───────── install ───────── */

function InstallCard({ onGuide }: { onGuide: () => void }) {
  return (
    <section className="glow-border relative mt-6 overflow-hidden rounded-3xl p-6 glass sm:p-8">
      <div className="absolute -right-16 -top-16 size-56 rounded-full bg-aurora-violet/30 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-6">
        <span className="grid size-14 place-items-center rounded-2xl bg-aurora shadow-[0_0_30px_-6px_#7c3aed]"><Puzzle className="size-7" /></span>
        <div className="min-w-60 flex-1">
          <h2 className="font-display text-xl font-bold">Pasang ekstensi FLOW CONNECT Bridge</h2>
          <p className="mt-1 text-sm text-white/60">
            Ekstensi kecil untuk Chrome / Edge / Brave yang menghubungkan FLOW CONNECT dengan tab Google Flow-mu. Tanpa ini, galeri & kirim gambar
            tidak bisa bekerja (keamanan browser tidak mengizinkan website lain mengakses Google Flow).
          </p>
        </div>
        <div className="flex gap-2">
          <a href={BRIDGE_ZIP_URL} download className={buttonClass('primary', 'md')}><Download className="size-4" /> Unduh ekstensi</a>
          <Button variant="glass" onClick={onGuide}>Cara pasang</Button>
        </div>
      </div>
    </section>
  )
}

function InstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps = [
    <>Unduh <a href={BRIDGE_ZIP_URL} download className="text-aurora-cyan hover:underline">flow-connect-bridge.zip</a>, lalu ekstrak (klik kanan → Extract).</>,
    <>Buka <code className="rounded bg-white/10 px-1.5 py-0.5">chrome://extensions</code> (Edge: <code className="rounded bg-white/10 px-1.5 py-0.5">edge://extensions</code>).</>,
    <>Aktifkan <b>Developer mode</b> di pojok kanan atas.</>,
    <>Klik <b>Load unpacked</b> dan pilih folder <code className="rounded bg-white/10 px-1.5 py-0.5">flow-connect-bridge</code>.</>,
    <>Muat ulang halaman ini. Status “Ekstensi Bridge” akan berubah hijau.</>,
  ]
  return (
    <Modal open={open} onClose={onClose} title="Cara memasang ekstensi">
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm text-white/75">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-aurora text-xs font-bold">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 rounded-xl bg-white/5 p-3 text-xs text-white/45">
        ID ekstensi: <code>{BRIDGE_EXTENSION_ID}</code>. Ekstensi hanya meminta akses ke flow.google.com & flow-content.google, dan hanya
        menerima perintah dari situs FLOW CONNECT.
      </p>
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Selesai</Button>
      </div>
    </Modal>
  )
}

/* ───────── metode koneksi ───────── */

function MethodSwitch({ method, onChange }: { method: ConnectorKind; onChange: (m: ConnectorKind) => void }) {
  const opts: { id: ConnectorKind; label: string; desc: string; Icon: typeof Bookmark }[] = [
    { id: 'bookmarklet', label: 'Bookmarklet', desc: 'Tanpa instal — cukup 1 bookmark', Icon: Bookmark },
    { id: 'extension', label: 'Ekstensi', desc: 'Paling stabil — Chrome / Edge', Icon: Puzzle },
  ]
  return (
    <div className="mt-8 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Metode koneksi ke Google Flow">
      {opts.map(({ id, label, desc, Icon }) => (
        <button
          key={id}
          role="radio"
          aria-checked={method === id}
          onClick={() => onChange(id)}
          className={clsx('flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition', method === id ? 'glow-border bg-white/[0.08]' : 'glass opacity-70 hover:opacity-100')}
        >
          <Icon className={clsx('size-5', method === id ? 'text-aurora-cyan' : 'text-white/50')} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{label}</span>
            <span className="block truncate text-xs text-white/50">{desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** Tombol bookmarklet yang bisa diseret ke bookmark bar. href diset lewat DOM (React memblokir URL javascript:). */
function BookmarkletButton({ className }: { className?: string }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const toast = useToast()
  useEffect(() => {
    ref.current?.setAttribute('href', bookmarkletHref())
  }, [])
  return (
    <a
      ref={ref}
      draggable
      onClick={(e) => {
        e.preventDefault()
        toast('Seret tombol ini ke bookmark bar — lalu klik di tab Google Flow', 'info')
      }}
      className={clsx('inline-flex cursor-grab items-center gap-2 rounded-xl bg-aurora px-4 py-2.5 text-sm font-bold shadow-[0_0_30px_-6px_#7c3aed] active:cursor-grabbing', className)}
      title="Seret ke bookmark bar"
    >
      <Zap className="size-4" /> FLOW CONNECT
    </a>
  )
}

function useCopyBookmarklet() {
  const toast = useToast()
  return () =>
    navigator.clipboard
      .writeText(bookmarkletHref())
      .then(() => toast('Kode bookmarklet disalin', 'success'))
      .catch(() => toast('Gagal menyalin kode', 'error'))
}

function BookmarkletCard({ onOpenFlow, onGuide }: { onOpenFlow: () => void; onGuide: () => void }) {
  const copy = useCopyBookmarklet()
  return (
    <section className="glow-border relative mt-6 overflow-hidden rounded-3xl p-6 glass sm:p-8">
      <div className="absolute -right-16 -top-16 size-56 rounded-full bg-aurora-violet/30 blur-3xl" />
      <div className="relative">
        <h2 className="font-display text-xl font-bold">Hubungkan dengan bookmarklet</h2>
        <p className="mt-1 max-w-2xl text-sm text-white/60">Tanpa instal apa pun. Bookmarklet berjalan di tab Google Flow milikmu dan menghubungkannya dengan FLOW CONNECT.</p>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          <Step n={1} title="Simpan bookmark">
            <p>Seret tombol ini ke bookmark bar <span className="text-white/40">(Ctrl+Shift+B untuk menampilkannya)</span>:</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <BookmarkletButton />
              <button onClick={copy} className="text-xs text-aurora-cyan hover:underline">atau salin kode</button>
            </div>
          </Step>
          <Step n={2} title="Buka Google Flow">
            <p>Login dengan akun Google-mu dan buka sebuah project.</p>
            <Button variant="glass" size="sm" className="mt-3" onClick={onOpenFlow}>Buka Google Flow <ExternalLink className="size-3.5" /></Button>
          </Step>
          <Step n={3} title="Klik bookmark">
            <p>Di tab Google Flow, klik bookmark <b>FLOW CONNECT</b>. Panel kecil muncul dan status di sini berubah hijau.</p>
            <button onClick={onGuide} className="mt-3 text-xs text-aurora-cyan hover:underline">Panduan lengkap (termasuk HP)</button>
          </Step>
        </ol>
      </div>
    </section>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl bg-white/[0.03] p-4 text-sm text-white/65">
      <p className="mb-2 flex items-center gap-2 font-semibold text-white">
        <span className="grid size-6 place-items-center rounded-full bg-aurora text-xs font-bold">{n}</span> {title}
      </p>
      {children}
    </li>
  )
}

function BookmarkletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const copy = useCopyBookmarklet()
  return (
    <Modal open={open} onClose={onClose} title="Cara memakai bookmarklet">
      <div className="flex flex-col gap-5 text-sm text-white/70">
        <div>
          <p className="mb-2 font-semibold text-white">💻 Komputer (Chrome, Edge, Firefox, Safari)</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Tampilkan bookmark bar (Ctrl+Shift+B / ⌘+Shift+B).</li>
            <li>Seret tombol <BookmarkletButton className="mx-1 px-2.5 py-1 text-xs" /> ke bookmark bar.</li>
            <li>Buka <b>flow.google.com</b>, login, buka sebuah project.</li>
            <li>Klik bookmark <b>FLOW CONNECT</b>. Jika Studio belum terbuka, tekan “Buka FLOW CONNECT” di panel.</li>
          </ol>
        </div>
        <div>
          <p className="mb-2 font-semibold text-white">📱 HP (Chrome Android / Safari iPhone)</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li><button onClick={copy} className="text-aurora-cyan hover:underline">Salin kode bookmarklet</button>.</li>
            <li>Bookmark halaman apa saja, lalu edit bookmark itu: nama <b>FLOW CONNECT</b>, URL/alamat diganti dengan kode yang disalin.</li>
            <li>Buka flow.google.com di browser (bukan aplikasi). Chrome: ketik “FLOW CONNECT” di address bar lalu pilih bookmark-nya. Safari: buka dari daftar Bookmark.</li>
          </ol>
        </div>
        <p className="rounded-xl bg-white/5 p-3 text-xs text-white/45">
          Bookmarklet perlu diklik lagi setiap kali tab Google Flow dimuat ulang. Ia hanya menerima perintah dari {window.location.origin} dan tidak pernah
          menekan Generate atas namamu.
        </p>
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={onClose}>Selesai</Button>
      </div>
    </Modal>
  )
}
