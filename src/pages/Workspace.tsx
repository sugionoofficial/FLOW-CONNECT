import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clapperboard, Heart, Image as ImageIcon, LayoutGrid, Sparkles, Video } from 'lucide-react'
import clsx from 'clsx'
import { CreditsBadge, UserMenu } from '../components/AppHeader'
import { AuroraBg } from '../components/AuroraBg'
import { Loader } from '../components/Loader'
import { PromptComposer, type ComposerPreset, type ComposerSubmit } from '../components/workspace/PromptComposer'
import { GenerationCard } from '../components/workspace/GenerationCard'
import { GenerationDetail } from '../components/workspace/GenerationDetail'
import { SceneBuilder } from '../components/workspace/SceneBuilder'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import {
  addScene, createGenerations, deleteGeneration, getProject, listGenerations, listScenes, removeScene, reorderScenes,
  updateGeneration, updateProject,
} from '../lib/api'
import { resumePending, runMockJob } from '../lib/engine'
import { PROMPT_IDEAS } from '../lib/catalog'
import type { Generation, Project, Scene } from '../lib/types'

type View = 'galeri' | 'scene'
type Filter = 'semua' | 'video' | 'gambar' | 'favorit'

export default function Workspace() {
  const { id } = useParams<{ id: string }>()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { refreshProfile } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [gens, setGens] = useState<Generation[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('galeri')
  const [filter, setFilter] = useState<Filter>('semua')
  const [openId, setOpenId] = useState<string | null>(null)
  const [preset, setPreset] = useState<ComposerPreset>()
  const [title, setTitle] = useState('')
  const projectRef = useRef<Project | null>(null)
  projectRef.current = project

  const upsertGen = useCallback((g: Generation) => {
    setGens((list) => list.map((x) => (x.id === g.id ? g : x)))
    // first finished output becomes the project cover
    const p = projectRef.current
    if (p && !p.cover_url && g.status === 'done' && g.output_url) {
      const cover = g.output_url
      updateProject(p.id, { cover_url: cover }).catch(() => {})
      setProject({ ...p, cover_url: cover })
    }
  }, [])

  useEffect(() => {
    if (!id) return
    let alive = true
    setLoading(true)
    Promise.all([getProject(id), listGenerations(id), listScenes(id)])
      .then(([p, g, s]) => {
        if (!alive) return
        if (!p) {
          toast('Project tidak ditemukan', 'error')
          navigate('/app', { replace: true })
          return
        }
        setProject(p)
        setTitle(p.title)
        setGens(g)
        setScenes(s)
        resumePending(g, upsertGen)
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [id, navigate, toast, upsertGen])

  // prompt dari landing page
  useEffect(() => {
    const p = params.get('prompt')
    if (p) {
      setPreset({ key: Date.now(), prompt: p, mode: 'text_to_video' })
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const handleSubmit = async (input: ComposerSubmit): Promise<boolean> => {
    if (!project) return false
    try {
      const created = await createGenerations({ projectId: project.id, ...input })
      setGens((list) => [...created, ...list])
      setView('galeri')
      setFilter('semua')
      refreshProfile()
      created.forEach((g) => runMockJob(g, upsertGen))
      return true
    } catch (e) {
      toast((e as Error).message, 'error')
      return false
    }
  }

  const handleAddScene = async (g: Generation) => {
    if (!project) return
    try {
      const s = await addScene(project.id, g.id, scenes.length)
      setScenes((list) => [...list, s])
      toast('Ditambahkan ke Scenebuilder', 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const handleToggleFav = async (g: Generation) => {
    const next = { ...g, is_favorite: !g.is_favorite }
    setGens((list) => list.map((x) => (x.id === g.id ? next : x)))
    try {
      await updateGeneration(g.id, { is_favorite: next.is_favorite })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const handleDelete = async (g: Generation) => {
    try {
      await deleteGeneration(g.id)
      setGens((list) => list.filter((x) => x.id !== g.id))
      setScenes((list) => list.filter((s) => s.generation_id !== g.id))
      setOpenId(null)
      toast('Hasil dihapus', 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const saveTitle = async () => {
    if (!project) return
    const t = title.trim() || 'Project tanpa judul'
    setTitle(t)
    if (t === project.title) return
    try {
      await updateProject(project.id, { title: t })
      setProject({ ...project, title: t })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const filtered = useMemo(
    () =>
      gens.filter((g) =>
        filter === 'semua' ? true :
        filter === 'video' ? g.mode !== 'text_to_image' :
        filter === 'gambar' ? g.mode === 'text_to_image' : g.is_favorite,
      ),
    [gens, filter],
  )
  const openGen = gens.find((g) => g.id === openId) ?? null

  if (loading) return <Loader full />

  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <AuroraBg intensity={0.35} />

      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <Link to="/app" className="rounded-lg p-2 text-white/60 hover:bg-white/5 hover:text-white" aria-label="Kembali ke project">
            <ArrowLeft className="size-5" />
          </Link>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="min-w-0 max-w-xs flex-1 truncate rounded-lg bg-transparent px-2 py-1 font-display text-lg font-semibold hover:bg-white/5 focus:bg-white/5 focus:outline-none"
            aria-label="Judul project"
          />
          <div className="mx-auto hidden gap-1 rounded-xl p-1 glass md:flex">
            <ViewTab active={view === 'galeri'} onClick={() => setView('galeri')} icon={LayoutGrid} label="Galeri" />
            <ViewTab active={view === 'scene'} onClick={() => setView('scene')} icon={Clapperboard} label={`Scenebuilder${scenes.length ? ` (${scenes.length})` : ''}`} />
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <CreditsBadge />
            <UserMenu />
          </div>
        </div>
        <div className="flex gap-1 px-4 pb-2 md:hidden">
          <ViewTab active={view === 'galeri'} onClick={() => setView('galeri')} icon={LayoutGrid} label="Galeri" />
          <ViewTab active={view === 'scene'} onClick={() => setView('scene')} icon={Clapperboard} label="Scenebuilder" />
        </div>
      </header>

      <main className="flex flex-1 flex-col px-4 pb-56 pt-6 sm:px-6">
        {view === 'galeri' ? (
          gens.length === 0 ? (
            <EmptyGallery onPick={(p) => setPreset({ key: Date.now(), prompt: p, mode: 'text_to_video' })} />
          ) : (
            <>
              <div className="mb-5 flex flex-wrap gap-1.5">
                {([
                  ['semua', 'Semua', LayoutGrid],
                  ['video', 'Video', Video],
                  ['gambar', 'Gambar', ImageIcon],
                  ['favorit', 'Favorit', Heart],
                ] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={clsx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition', filter === key ? 'bg-white text-ink-950 font-semibold' : 'glass text-white/70 hover:text-white')}
                  >
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
              {filtered.length === 0 ? (
                <p className="py-20 text-center text-sm text-white/45">Belum ada hasil di filter ini.</p>
              ) : (
                <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
                  {filtered.map((g) => (
                    <GenerationCard
                      key={g.id}
                      gen={g}
                      onOpen={() => setOpenId(g.id)}
                      onAddScene={() => handleAddScene(g)}
                      onToggleFavorite={() => handleToggleFav(g)}
                    />
                  ))}
                </div>
              )}
            </>
          )
        ) : (
          <SceneBuilder
            scenes={scenes}
            generations={gens}
            onGoGallery={() => setView('galeri')}
            onReorder={async (next) => {
              setScenes(next)
              try { await reorderScenes(next) } catch (e) { toast((e as Error).message, 'error') }
            }}
            onRemove={async (s) => {
              setScenes((list) => list.filter((x) => x.id !== s.id))
              try { await removeScene(s.id) } catch (e) { toast((e as Error).message, 'error') }
            }}
          />
        )}
      </main>

      {/* floating composer */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-ink-950 via-ink-950/80 to-transparent px-4 pb-5 pt-16">
        <div className="pointer-events-auto mx-auto max-w-3xl">
          <PromptComposer preset={preset} onSubmit={handleSubmit} />
        </div>
      </div>

      <GenerationDetail
        gen={openGen}
        onClose={() => setOpenId(null)}
        onReuse={(g) => { setOpenId(null); setPreset({ key: Date.now(), prompt: g.prompt, mode: g.mode, assets: g.input_assets }) }}
        onAnimate={(g) => {
          setOpenId(null)
          setPreset({ key: Date.now(), prompt: '', mode: 'frames_to_video', assets: [{ role: 'first_frame', url: g.output_url! }] })
        }}
        onUseAsIngredient={(g) => {
          setOpenId(null)
          setPreset({ key: Date.now(), mode: 'ingredients_to_video', assets: [{ role: 'ingredient', url: g.output_url! }] })
        }}
        onAddScene={(g) => handleAddScene(g)}
        onDelete={handleDelete}
        onToggleFavorite={handleToggleFav}
        onSetCover={async (g) => {
          if (!project) return
          await updateProject(project.id, { cover_url: g.output_url })
          setProject({ ...project, cover_url: g.output_url })
          toast('Sampul project diperbarui', 'success')
        }}
      />
    </div>
  )
}

function ViewTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof LayoutGrid; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition', active ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white')}
    >
      <Icon className="size-4" /> {label}
    </button>
  )
}

function EmptyGallery({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="grid size-16 animate-float place-items-center rounded-2xl glass">
        <Sparkles className="size-7 text-aurora-purple" />
      </div>
      <h2 className="font-display text-3xl font-bold">
        Apa yang ingin kamu <span className="text-aurora">buat</span> hari ini?
      </h2>
      <p className="max-w-md text-sm text-white/55">Tulis prompt di bawah, pilih mode (Teks/Frame/Bahan ke Video atau Gambar), lalu tekan Enter. Atau mulai dari salah satu ide ini:</p>
      <div className="mt-2 flex max-w-3xl flex-wrap justify-center gap-2">
        {PROMPT_IDEAS.map((p) => (
          <button key={p} onClick={() => onPick(p)} className="rounded-full px-4 py-2 text-xs text-white/75 glass transition hover:border-aurora-cyan/50 hover:text-white">
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
