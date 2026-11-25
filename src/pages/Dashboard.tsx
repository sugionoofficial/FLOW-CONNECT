import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Clapperboard, MoreVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { AuroraBg } from '../components/AuroraBg'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Loader } from '../components/Loader'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { createProject, deleteProject, listProjects, updateProject } from '../lib/api'
import type { Project } from '../lib/types'

const titleFromPrompt = (p: string) => {
  const words = p.split(/\s+/).slice(0, 6).join(' ')
  return words.length < p.length ? `${words}…` : words
}

const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`
  return `${Math.floor(s / 86400)} hari lalu`
}

export default function Dashboard() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState<Project | null>(null)
  const handledPrompt = useRef(false)

  useEffect(() => {
    listProjects().then(setProjects).catch((e) => toast(e.message, 'error'))
  }, [toast])

  // Datang dari prompt di landing page → langsung buat project baru.
  useEffect(() => {
    const prompt = params.get('prompt')
    if (!prompt || handledPrompt.current) return
    handledPrompt.current = true
    createProject(titleFromPrompt(prompt))
      .then((p) => navigate(`/app/project/${p.id}?prompt=${encodeURIComponent(prompt)}`, { replace: true }))
      .catch((e) => {
        toast(e.message, 'error')
        setParams({})
      })
  }, [params, navigate, toast, setParams])

  const newProject = async () => {
    try {
      const p = await createProject()
      navigate(`/app/project/${p.id}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const filtered = useMemo(
    () => (projects ?? []).filter((p) => p.title.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  )

  return (
    <div className="relative isolate min-h-screen">
      <AuroraBg intensity={0.5} />
      <AppHeader />
      <main className="container-x py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-white/50">Halo, {profile?.display_name ?? 'Kreator'} 👋</p>
            <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">Project kamu</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl px-3 py-2.5 glass">
              <Search className="size-4 text-white/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari project…" className="w-40 bg-transparent text-sm focus:outline-none sm:w-56" />
            </label>
            <Button onClick={newProject}><Plus className="size-4" /> Project baru</Button>
          </div>
        </div>

        {projects === null || params.get('prompt') ? (
          <Loader />
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <button
              onClick={newProject}
              className="group flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/15 text-white/50 transition hover:border-aurora-cyan/60 hover:bg-white/[0.03] hover:text-white"
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-aurora shadow-[0_0_30px_-6px_#7c3aed] transition group-hover:scale-110">
                <Plus className="size-6 text-white" />
              </span>
              <span className="text-sm font-semibold">Mulai project baru</span>
            </button>
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} onRename={() => setRenaming(p)} onDelete={() => setDeleting(p)} />
            ))}
          </div>
        )}
        {projects && projects.length > 0 && filtered.length === 0 && (
          <p className="mt-10 text-center text-white/50">Tidak ada project yang cocok dengan “{query}”.</p>
        )}
      </main>

      <RenameModal
        project={renaming}
        onClose={() => setRenaming(null)}
        onSaved={(title) => setProjects((ps) => ps?.map((x) => (x.id === renaming?.id ? { ...x, title } : x)) ?? null)}
      />
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Hapus project?">
        <p className="text-sm text-white/60">“{deleting?.title}” beserta semua hasil generate dan scene akan dihapus permanen.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleting(null)}>Batal</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!deleting) return
              try {
                await deleteProject(deleting.id)
                setProjects((ps) => ps?.filter((x) => x.id !== deleting.id) ?? null)
                toast('Project dihapus', 'success')
              } catch (e) {
                toast((e as Error).message, 'error')
              }
              setDeleting(null)
            }}
          >
            <Trash2 className="size-4" /> Hapus
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function ProjectCard({ project, onRename, onDelete }: { project: Project; onRename: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false)
  return (
    <div className="group relative overflow-hidden rounded-3xl glass transition hover:-translate-y-1 hover:shadow-[0_20px_60px_-20px_#7c3aed]">
      <Link to={`/app/project/${project.id}`} className="block">
        <div className="relative aspect-video overflow-hidden bg-ink-800">
          {project.cover_url ? (
            <img src={project.cover_url} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          ) : (
            <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_30%,#7c3aed40,transparent_60%),radial-gradient(circle_at_70%_70%,#06b6d430,transparent_60%)]">
              <Clapperboard className="size-10 text-white/30" />
            </div>
          )}
        </div>
        <div className="p-4">
          <p className="truncate font-semibold">{project.title}</p>
          <p className="mt-0.5 text-xs text-white/45">Diubah {timeAgo(project.updated_at)}</p>
        </div>
      </Link>
      <button
        onClick={() => setMenu((m) => !m)}
        className="absolute right-3 top-3 rounded-lg bg-black/50 p-1.5 opacity-0 backdrop-blur transition group-hover:opacity-100"
        aria-label="Opsi project"
      >
        <MoreVertical className="size-4" />
      </button>
      {menu && (
        <div className="absolute right-3 top-12 z-10 w-40 rounded-xl p-1 glass-strong" onMouseLeave={() => setMenu(false)}>
          <button onClick={() => { setMenu(false); onRename() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/5">
            <Pencil className="size-3.5" /> Ganti nama
          </button>
          <button onClick={() => { setMenu(false); onDelete() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10">
            <Trash2 className="size-3.5" /> Hapus
          </button>
        </div>
      )}
    </div>
  )
}

function RenameModal({ project, onClose, onSaved }: { project: Project | null; onClose: () => void; onSaved: (t: string) => void }) {
  const [title, setTitle] = useState('')
  const toast = useToast()
  useEffect(() => setTitle(project?.title ?? ''), [project])
  return (
    <Modal open={!!project} onClose={onClose} title="Ganti nama project">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!project || !title.trim()) return
          try {
            await updateProject(project.id, { title: title.trim() })
            onSaved(title.trim())
            onClose()
          } catch (err) {
            toast((err as Error).message, 'error')
          }
        }}
      >
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl px-4 py-3 text-sm glass focus:outline-none" />
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit">Simpan</Button>
        </div>
      </form>
    </Modal>
  )
}
