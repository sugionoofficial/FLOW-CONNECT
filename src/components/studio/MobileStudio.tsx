import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, Check, Clipboard, Download, ExternalLink, Globe, ImagePlus, Loader2, Send, Smartphone, Type, X,
} from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../Button'
import { useToast } from '../../context/ToastContext'
import { AccountPicker } from '../hub/AccountPicker'
import { AddAccountModal } from '../hub/AddAccountModal'
import { useGoogleAccounts } from '../../hooks/useGoogleAccounts'
import {
  canShareFiles, flowAppHref, getPlatform, saveFile, shareFiles, storeUrl,
} from '../../lib/device'
import type { GoogleAccount } from '../../lib/types'

const PROMPT_KEY = 'fc:pendingPrompt'
const MAX_FILES = 10
const MAX_SIZE = 15 * 1024 * 1024

export function MobileStudio() {
  const toast = useToast()
  const platform = getPlatform()
  const { accounts, setAccounts, launch, defaultAccount } = useGoogleAccounts()
  const [account, setAccount] = useState<GoogleAccount | null>(null)
  const [adding, setAdding] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [prompt, setPrompt] = useState(() => sessionStorage.getItem(PROMPT_KEY) ?? '')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const gallery = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews])
  useEffect(() => {
    if (!account && defaultAccount) setAccount(defaultAccount)
  }, [defaultAccount, account])
  useEffect(() => {
    if (prompt) sessionStorage.setItem(PROMPT_KEY, prompt)
    else sessionStorage.removeItem(PROMPT_KEY)
  }, [prompt])

  const appHref = flowAppHref('/')
  const shareSupported = canShareFiles(files.length ? files : [new File([''], 'x.png', { type: 'image/png' })])

  const add = (list: FileList | null) => {
    const picked = [...(list ?? [])]
    const bad = picked.find((f) => !f.type.startsWith('image/') || f.size > MAX_SIZE)
    if (bad) toast(`${bad.name}: harus gambar & maks 15 MB`, 'error')
    const ok = picked.filter((f) => f.type.startsWith('image/') && f.size <= MAX_SIZE)
    setFiles((cur) => [...cur, ...ok].slice(0, MAX_FILES))
  }

  const copyPrompt = async (silent = false) => {
    if (!prompt.trim()) return false
    try {
      await navigator.clipboard.writeText(prompt.trim())
      if (!silent) toast('Prompt disalin', 'success')
      return true
    } catch {
      if (!silent) toast('Tidak bisa menyalin otomatis. Tekan lama teks untuk menyalin.', 'error')
      return false
    }
  }

  /** Alur utama: salin prompt → bagikan gambar ke Flow (atau buka aplikasi Flow). */
  const send = async () => {
    setBusy(true)
    try {
      const copied = await copyPrompt(true)
      if (files.length) {
        const res = await shareFiles(files, prompt.trim())
        if (res === 'cancelled') return
        if (res === 'unsupported') {
          files.forEach(saveFile)
          toast('Gambar disimpan ke HP. Pilih dari galeri di aplikasi Flow.', 'info')
          window.location.href = appHref
        } else {
          toast(copied ? 'Terkirim! Prompt juga sudah disalin — tempel di Flow.' : 'Terkirim ke menu Bagikan', 'success')
        }
      } else {
        toast(copied ? 'Prompt disalin — tempel di aplikasi Flow' : 'Membuka aplikasi Flow…', 'success')
        window.location.href = appHref
      }
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* aplikasi */}
      <section className="glow-border relative overflow-hidden rounded-3xl p-5 glass">
        <div className="absolute -right-12 -top-12 size-40 rounded-full bg-aurora-violet/30 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-aurora shadow-[0_0_30px_-6px_#7c3aed]"><Smartphone className="size-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold">Aplikasi Google Flow</h2>
            <p className="mt-0.5 text-sm text-white/60">
              Generate berjalan di aplikasi Google Flow resmi dengan akun Google-mu. FLOW CONNECT menyiapkan gambar & prompt lalu mengirimkannya ke sana.
            </p>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <a href={appHref} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-ink-950">
            Buka aplikasi <ExternalLink className="size-4" />
          </a>
          <a href={storeUrl(platform)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold glass">
            <Download className="size-4" /> {platform === 'ios' ? 'App Store' : 'Play Store'}
          </a>
        </div>
      </section>

      {/* akun */}
      <section className="rounded-3xl p-5 glass">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Akun Google yang dipakai</p>
        {accounts && accounts.length ? (
          <AccountPicker accounts={accounts} value={account} onChange={setAccount} onAdd={() => setAdding(true)} />
        ) : (
          <Button variant="glass" className="w-full" onClick={() => setAdding(true)}>Tambah akun Google</Button>
        )}
        <p className="mt-2 text-xs text-white/45">
          Pastikan aplikasi Flow login dengan akun ini (ketuk foto profil di aplikasi untuk berganti akun).
          {account && (
            <>
              {' '}Atau{' '}
              <button onClick={() => launch(account)} className="inline-flex items-center gap-1 text-aurora-cyan hover:underline">
                buka versi web <Globe className="size-3" />
              </button>
            </>
          )}
        </p>
      </section>

      {/* gambar */}
      <section className="rounded-3xl p-5 glass">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImagePlus className="size-4" /> Gambar referensi <span className="font-normal text-white/40">(opsional)</span></p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="glass" onClick={() => gallery.current?.click()}><ImagePlus className="size-4" /> Galeri</Button>
          <Button variant="glass" onClick={() => camera.current?.click()}><Camera className="size-4" /> Kamera</Button>
        </div>
        <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        {!!files.length && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative aspect-square overflow-hidden rounded-xl">
                <img src={src} alt="" className="size-full object-cover" />
                <button onClick={() => setFiles((f) => f.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/70 p-1" aria-label="Hapus gambar">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* prompt */}
      <section className="rounded-3xl p-5 glass">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Type className="size-4" /> Prompt</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={8000}
          placeholder="Contoh: Drone shot sawah terasering Bali saat matahari terbit, kabut tipis, sinematik"
          className="w-full resize-none rounded-2xl px-4 py-3 text-base glass placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-aurora-cyan/50"
        />
      </section>

      {/* kirim */}
      <div className="sticky bottom-3 z-20 flex flex-col gap-2 rounded-3xl p-3 glass-strong shadow-2xl">
        <Button size="lg" disabled={busy || (!files.length && !prompt.trim())} onClick={send}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />} Kirim ke aplikasi Flow
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="glass" size="sm" disabled={!prompt.trim()} onClick={() => copyPrompt()}><Clipboard className="size-4" /> Salin prompt</Button>
          <Button variant="glass" size="sm" disabled={!files.length} onClick={() => { files.forEach(saveFile); toast('Gambar disimpan ke HP', 'success') }}>
            <Download className="size-4" /> Simpan gambar
          </Button>
        </div>
        {!!files.length && !shareSupported && (
          <p className="px-1 text-center text-xs text-amber-200/80">Browser ini belum mendukung menu Bagikan untuk file — gambar akan disimpan ke HP lalu aplikasi Flow dibuka.</p>
        )}
      </div>

      {/* langkah */}
      <section className={clsx('rounded-3xl p-5 glass transition', sent && 'ring-1 ring-aurora-cyan/40')}>
        <p className="font-display font-bold">{sent ? 'Lanjutkan di aplikasi Flow' : 'Cara kerjanya'}</p>
        <ol className="mt-3 flex flex-col gap-2.5 text-sm text-white/70">
          {[
            files.length ? <>Di menu <b>Bagikan</b>, pilih <b>Google Flow</b>. Jika tidak ada, gambar tersimpan di galeri — unggah dari aplikasi Flow.</> : <>Aplikasi Google Flow terbuka otomatis.</>,
            <>Tekan lama kotak prompt → <b>Tempel</b> (prompt sudah disalin).</>,
            <>Pilih model, lalu tekan <b>Generate</b>.</>,
            <>Ketuk ikon <b>Unduh</b> di hasil Flow untuk menyimpan ke HP.</>,
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className={clsx('grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold', sent && i === 0 ? 'bg-emerald-500' : 'bg-aurora')}>
                {sent && i === 0 ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <AddAccountModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(a) => {
          setAccounts((l) => [...(l ?? []).filter((x) => x.id !== a.id), a])
          setAccount(a)
        }}
      />
    </div>
  )
}
