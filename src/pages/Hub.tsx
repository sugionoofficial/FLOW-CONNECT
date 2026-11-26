import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight, BadgeCheck, Clipboard, Download, ImageDown, KeyRound, Monitor, Smartphone, ExternalLink, Info, MoreVertical, Pencil, Plus, ShieldCheck, Star, Trash2, Wand2, X,
} from 'lucide-react'
import clsx from 'clsx'
import { AppHeader } from '../components/AppHeader'
import { AuroraBg } from '../components/AuroraBg'
import { Button, buttonClass } from '../components/Button'
import { Loader } from '../components/Loader'
import { Modal } from '../components/Modal'
import { AccountAvatar, accountTitle } from '../components/hub/AccountAvatar'
import { DESKTOP_PORTABLE_URL, DESKTOP_RELEASES_URL, DESKTOP_SETUP_URL } from '../lib/desktop'
import { AccountPicker } from '../components/hub/AccountPicker'
import { AddAccountModal } from '../components/hub/AddAccountModal'
import { GoogleG } from '../components/hub/GoogleG'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useGoogleAccounts } from '../hooks/useGoogleAccounts'
import { linkGoogleAccount, removeGoogleAccount, setDefaultGoogleAccount, updateGoogleAccountLabel } from '../lib/api'
import { isGoogleOAuthEnabled, requestGoogleAccessToken, revokeGoogleToken } from '../lib/google'
import { flowAppHref, isMobile } from '../lib/device'
import type { GoogleAccount } from '../lib/types'

const PROMPT_KEY = 'fc:pendingPrompt'

const timeAgo = (iso: string | null) => {
  if (!iso) return 'Belum pernah dipakai'
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'Dipakai baru saja'
  if (s < 3600) return `Dipakai ${Math.floor(s / 60)} menit lalu`
  if (s < 86400) return `Dipakai ${Math.floor(s / 3600)} jam lalu`
  return `Dipakai ${Math.floor(s / 86400)} hari lalu`
}

export default function Hub() {
  const { profile } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const { accounts, setAccounts, reload, launch, defaultAccount } = useGoogleAccounts()
  const [selected, setSelected] = useState<GoogleAccount | null>(null)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<GoogleAccount | null>(null)
  const [removing, setRemoving] = useState<GoogleAccount | null>(null)
  const [prompt, setPrompt] = useState<string>(() => sessionStorage.getItem(PROMPT_KEY) ?? '')

  // prompt dari hero landing page
  useEffect(() => {
    const p = params.get('prompt')
    if (p) {
      setPrompt(p)
      sessionStorage.setItem(PROMPT_KEY, p)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  // pilihan akun mengikuti default
  useEffect(() => {
    if (!accounts) return
    setSelected((cur) => (cur && accounts.some((a) => a.id === cur.id) ? accounts.find((a) => a.id === cur.id)! : defaultAccount))
  }, [accounts, defaultAccount])

  const mobile = isMobile()
  const copyPromptQuiet = () => {
    if (prompt) navigator.clipboard.writeText(prompt).catch(() => {})
  }

  const clearPrompt = () => {
    setPrompt('')
    sessionStorage.removeItem(PROMPT_KEY)
  }

  const openWith = async (acc: GoogleAccount) => {
    if (prompt) {
      try {
        await navigator.clipboard.writeText(prompt)
        toast('Prompt disalin — tempel (Ctrl/⌘+V) di Google Flow', 'success')
      } catch {
        /* clipboard tidak tersedia */
      }
    }
    launch(acc)
  }

  const onAdded = (a: GoogleAccount) => {
    setAccounts((list) => {
      const rest = (list ?? []).filter((x) => x.id !== a.id)
      return [...rest, a].sort((x, y) => Number(y.is_default) - Number(x.is_default) || x.created_at.localeCompare(y.created_at))
    })
    setSelected(a)
  }

  const makeDefault = async (a: GoogleAccount) => {
    try {
      await setDefaultGoogleAccount(a.id)
      await reload()
      toast(`${a.email} jadi akun default`, 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const verify = async (a: GoogleAccount) => {
    try {
      const token = await requestGoogleAccessToken(a.email)
      const { account } = await linkGoogleAccount(token)
      revokeGoogleToken(token)
      await reload()
      toast(account.email === a.email ? `${a.email} terverifikasi` : `${account.email} ditautkan (akun berbeda dipilih)`, 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  if (!accounts) return <><AppHeader /><Loader full /></>

  const hasAccounts = accounts.length > 0

  return (
    <div className="relative isolate min-h-screen">
      <AuroraBg intensity={0.55} />
      <AppHeader />

      <main className="container-x py-10">
        <p className="text-sm text-white/50">Halo, {profile?.display_name ?? 'Kreator'} 👋</p>
        <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">
          Mulai berkarya di <span className="text-aurora">Google Flow</span>
        </h1>

        {/* ───── launcher ───── */}
        <section className="glow-border relative mt-8 overflow-hidden rounded-3xl p-6 glass sm:p-8">
          <div className="absolute -right-16 -top-16 size-64 rounded-full bg-aurora-violet/30 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <h2 className="font-display text-2xl font-bold">Buka Google Flow</h2>
              <p className="mt-2 max-w-lg text-sm text-white/60">
                Proses generate video & gambar berjalan di Google Flow memakai akun Google kamu sendiri — termasuk kuota & langganan Google AI milik akun itu.
              </p>
              {prompt && (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-aurora-cyan/30 bg-aurora-cyan/5 p-4">
                  <Wand2 className="mt-0.5 size-4 shrink-0 text-aurora-cyan" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-aurora-cyan">Prompt kamu</p>
                    <p className="mt-1 text-sm text-white/85">{prompt}</p>
                    <p className="mt-1 text-xs text-white/45">Otomatis disalin saat membuka Google Flow.</p>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(prompt).then(() => toast('Prompt disalin', 'success'))} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Salin prompt">
                    <Clipboard className="size-4" />
                  </button>
                  <button onClick={clearPrompt} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Hapus prompt">
                    <X className="size-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {hasAccounts ? (
                <>
                  <AccountPicker accounts={accounts} value={selected} onChange={setSelected} onAdd={() => setAdding(true)} />
                  {mobile ? (
                    <>
                      <a href={flowAppHref('/')} onClick={copyPromptQuiet} className={buttonClass('primary', 'lg')}>
                        <Smartphone className="size-4" /> Buka aplikasi Flow
                      </a>
                      <Button variant="glass" disabled={!selected} onClick={() => selected && openWith(selected)}>
                        Buka versi web <ExternalLink className="size-4" />
                      </Button>
                      <p className="text-center text-xs text-white/40">
                        Pastikan aplikasi Flow login dengan akun yang sama. Mau kirim gambar?{' '}
                        <Link to="/app/studio" className="text-aurora-cyan hover:underline">Buka Studio</Link>
                      </p>
                    </>
                  ) : (
                    <>
                      <Button size="lg" disabled={!selected} onClick={() => selected && openWith(selected)}>
                        Buka Google Flow <ExternalLink className="size-4" />
                      </Button>
                      <p className="text-center text-xs text-white/40">Terbuka di tab baru. Jika belum masuk, Google akan meminta login akun tersebut.</p>
                    </>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
                  <GoogleG className="mx-auto size-10" />
                  <p className="mt-3 font-semibold">Tambahkan akun Google dulu</p>
                  <p className="mt-1 text-sm text-white/55">Kamu bisa menambahkan beberapa akun dan berpindah dengan cepat.</p>
                  <Button className="mt-4" onClick={() => setAdding(true)}>
                    <Plus className="size-4" /> Tambah akun Google
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ───── studio ───── */}
        <Link to="/app/studio" className="group mt-6 flex flex-wrap items-center gap-5 rounded-3xl p-5 glass transition hover:bg-white/[0.07]">
          <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600"><ImageDown className="size-6" /></span>
          <div className="min-w-56 flex-1">
            <p className="font-display text-lg font-bold">Studio: kirim & unduh lewat FLOW CONNECT</p>
            <p className="text-sm text-white/55">Komputer: kirim gambar, galeri & unduh lewat ekstensi Bridge. HP: kirim gambar & prompt ke aplikasi Google Flow.</p>
          </div>
          <span className="flex items-center gap-1 text-sm font-semibold text-aurora-cyan">Buka Studio <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
        </Link>

        {/* ───── aplikasi PC ───── */}
        <section className="mt-4 flex flex-wrap items-center gap-5 rounded-3xl p-5 glass">
          <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-sky-600"><Monitor className="size-6" /></span>
          <div className="min-w-56 flex-1">
            <p className="font-display text-lg font-bold">FLOW CONNECT Desktop untuk Windows</p>
            <p className="text-sm text-white/55">
              Aplikasi PC yang menjalankan Google Flow di Chrome/Edge asli di balik layar: multi-akun, kirim gambar & prompt, galeri, unduh ke folder,
              plus Mode Otomatis (antrean prompt). Diaktifkan dengan kunci lisensi dan update otomatis. Butuh Google Chrome atau Microsoft Edge.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={DESKTOP_SETUP_URL} className={buttonClass('primary', 'sm')}><Download className="size-4" /> Unduh installer</a>
            <Link to="/app/lisensi" className={buttonClass('glass', 'sm')}><KeyRound className="size-4" /> Kunci lisensi</Link>
            <a href={DESKTOP_PORTABLE_URL} className="text-sm text-white/60 hover:text-white">Versi portable</a>
            <Link to="/unduh" className="text-sm text-white/60 hover:text-white">Info & panduan</Link>
            <a href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer" className="text-sm text-white/60 hover:text-white">Catatan rilis</a>
          </div>
        </section>

        {/* ───── daftar akun ───── */}
        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-bold">Akun Google kamu</h2>
              <p className="mt-1 text-sm text-white/50">{accounts.length}/10 akun · akun bertanda ★ dipakai secara default</p>
            </div>
            <Button variant="glass" onClick={() => setAdding(true)} disabled={accounts.length >= 10}>
              <Plus className="size-4" /> Tambah akun
            </Button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                onOpen={() => openWith(a)}
                onDefault={() => makeDefault(a)}
                onRename={() => setRenaming(a)}
                onRemove={() => setRemoving(a)}
                onVerify={isGoogleOAuthEnabled() && !a.verified ? () => verify(a) : undefined}
              />
            ))}
            {accounts.length < 10 && (
              <button
                onClick={() => setAdding(true)}
                className="group flex min-h-40 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/15 text-white/50 transition hover:border-aurora-cyan/60 hover:bg-white/[0.03] hover:text-white"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-aurora shadow-[0_0_30px_-6px_#7c3aed] transition group-hover:scale-110">
                  <Plus className="size-5 text-white" />
                </span>
                <span className="text-sm font-semibold">Tambah akun Google</span>
              </button>
            )}
          </div>
        </section>

        {/* ───── info ───── */}
        <section className="mt-12 grid gap-4 md:grid-cols-3">
          <InfoCard icon={ShieldCheck} title="Aman">
            Login dilakukan langsung di halaman resmi Google. FLOW CONNECT tidak pernah menyimpan password Google.
          </InfoCard>
          <InfoCard icon={BadgeCheck} title="Terverifikasi vs manual">
            Akun yang ditautkan lewat “Masuk dengan Google” terverifikasi pemiliknya. Akun via email hanya berupa pintasan.
          </InfoCard>
          <InfoCard icon={Info} title="Kuota & langganan">
            Fitur dan kuota mengikuti langganan Google AI tiap akun.{' '}
            <Link to="/app/tools" className="text-aurora-cyan hover:underline">Lihat tools</Link>
          </InfoCard>
        </section>
      </main>

      <AddAccountModal open={adding} onClose={() => setAdding(false)} onAdded={onAdded} />
      <RenameModal
        account={renaming}
        onClose={() => setRenaming(null)}
        onSaved={(label) => setAccounts((list) => list?.map((x) => (x.id === renaming?.id ? { ...x, label: label || null } : x)) ?? null)}
      />
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Hapus akun dari FLOW CONNECT?">
        <p className="text-sm text-white/60">
          <b>{removing?.email}</b> akan dihapus dari daftar. Akun Google-nya sendiri tidak terpengaruh.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>Batal</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!removing) return
              try {
                await removeGoogleAccount(removing.id)
                await reload()
                toast('Akun dihapus', 'success')
              } catch (e) {
                toast((e as Error).message, 'error')
              }
              setRemoving(null)
            }}
          >
            <Trash2 className="size-4" /> Hapus
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function AccountCard({
  account: a, onOpen, onDefault, onRename, onRemove, onVerify,
}: {
  account: GoogleAccount
  onOpen: () => void
  onDefault: () => void
  onRename: () => void
  onRemove: () => void
  onVerify?: () => void
}) {
  const [menu, setMenu] = useState(false)
  return (
    <div className={clsx('relative flex flex-col rounded-3xl p-5 glass transition hover:bg-white/[0.06]', a.is_default && 'glow-border')}>
      <div className="flex items-start gap-3">
        <AccountAvatar account={a} className="size-12 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-semibold">
            {accountTitle(a)}
            {a.is_default && <Star className="size-3.5 shrink-0 fill-amber-300 text-amber-300" />}
          </p>
          <p className="truncate text-sm text-white/55">{a.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {a.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300"><BadgeCheck className="size-3" /> Terverifikasi</span>
            ) : (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/60">Manual</span>
            )}
            {a.is_default && <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] text-amber-200">Default</span>}
          </div>
        </div>
        <button onClick={() => setMenu((m) => !m)} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Opsi akun">
          <MoreVertical className="size-4" />
        </button>
      </div>

      {menu && (
        <div className="absolute right-4 top-14 z-20 w-48 animate-fade-up rounded-xl p-1 glass-strong shadow-2xl" onMouseLeave={() => setMenu(false)}>
          {!a.is_default && (
            <MenuItem icon={Star} onClick={() => { setMenu(false); onDefault() }}>Jadikan default</MenuItem>
          )}
          {onVerify && (
            <MenuItem icon={BadgeCheck} onClick={() => { setMenu(false); onVerify() }}>Verifikasi dengan Google</MenuItem>
          )}
          <MenuItem icon={Pencil} onClick={() => { setMenu(false); onRename() }}>Ubah label</MenuItem>
          <MenuItem icon={Trash2} danger onClick={() => { setMenu(false); onRemove() }}>Hapus</MenuItem>
        </div>
      )}

      <p className="mt-4 text-xs text-white/40">{timeAgo(a.last_used_at)}</p>
      <button onClick={onOpen} className={buttonClass('glass', 'md', 'mt-3 w-full border-aurora-cyan/30 hover:border-aurora-cyan/60')}>
        Buka Google Flow <ExternalLink className="size-4" />
      </button>
    </div>
  )
}

function MenuItem({ icon: Icon, children, onClick, danger }: { icon: typeof Star; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={clsx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', danger ? 'text-red-300 hover:bg-red-500/10' : 'hover:bg-white/5')}>
      <Icon className="size-3.5" /> {children}
    </button>
  )
}

function InfoCard({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-5 glass">
      <Icon className="size-5 text-aurora-cyan" />
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-white/55">{children}</p>
    </div>
  )
}

function RenameModal({ account, onClose, onSaved }: { account: GoogleAccount | null; onClose: () => void; onSaved: (label: string) => void }) {
  const [label, setLabel] = useState('')
  const toast = useToast()
  useEffect(() => setLabel(account?.label ?? ''), [account])
  return (
    <Modal open={!!account} onClose={onClose} title="Ubah label akun">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!account) return
          try {
            await updateGoogleAccountLabel(account.id, label)
            onSaved(label.trim())
            onClose()
          } catch (err) {
            toast((err as Error).message, 'error')
          }
        }}
      >
        <p className="mb-3 text-sm text-white/55">{account?.email}</p>
        <input autoFocus value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="mis. Akun Kerja, Klien A" className="w-full rounded-xl px-4 py-3 text-sm glass focus:outline-none" />
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
          <Button type="submit">Simpan</Button>
        </div>
      </form>
    </Modal>
  )
}
