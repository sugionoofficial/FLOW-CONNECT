import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Copy, Download, KeyRound, Laptop, Loader2, Pencil, Plus, ShieldOff, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { AppHeader } from '../components/AppHeader'
import { AuroraBg } from '../components/AuroraBg'
import { Modal } from '../components/Modal'
import { Button, buttonClass } from '../components/Button'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { DESKTOP_SETUP_URL } from '../lib/desktop'

type Device = { id: string; device_id: string; device_name: string; platform: string | null; app_version: string | null; first_seen_at: string; last_seen_at: string }
type License = {
  id: string; label: string; key_hint: string; max_devices: number; expires_at: string | null; revoked_at: string | null
  last_used_at: string | null; created_at: string; license_devices: Device[]
}

const fmt = (t: string | null) => (t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')
const ERRORS: Record<string, string> = {
  LICENSE_LIMIT: 'Maksimal 5 kunci aktif per akun. Cabut kunci yang tidak dipakai terlebih dahulu.',
  NOT_AUTHENTICATED: 'Sesi berakhir. Silakan masuk lagi.',
  NOT_FOUND: 'Data tidak ditemukan.',
}
const errMsg = (e: unknown) => {
  const m = (e as { message?: string })?.message || String(e)
  return ERRORS[Object.keys(ERRORS).find((k) => m.includes(k)) ?? ''] ?? m
}

export default function Licenses() {
  const toast = useToast()
  const [list, setList] = useState<License[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState<License | null>(null)
  const [revoking, setRevoking] = useState<License | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('licenses')
      .select('id,label,key_hint,max_devices,expires_at,revoked_at,last_used_at,created_at,license_devices(id,device_id,device_name,platform,app_version,first_seen_at,last_seen_at)')
      .order('created_at', { ascending: false })
    if (error) setError(errMsg(error))
    else { setError(null); setList(data as License[]) }
  }, [])

  useEffect(() => { document.title = 'Lisensi — FLOW CONNECT'; load() }, [load])

  const create = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('create_license', { p_label: label.trim() || null })
    setBusy(false)
    if (error) { toast(errMsg(error), 'error'); return }
    const row = Array.isArray(data) ? data[0] : data
    setCreating(false)
    setLabel('')
    setCopied(false)
    setNewKey(row.license_key)
    load()
  }
  const copyKey = () => newKey && navigator.clipboard.writeText(newKey).then(() => { setCopied(true); toast('Kunci disalin', 'success') })

  const rename = async () => {
    if (!renaming) return
    setBusy(true)
    const { error } = await supabase.rpc('rename_license', { p_id: renaming.id, p_label: label })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    setRenaming(null)
    load()
  }
  const revoke = async () => {
    if (!revoking) return
    setBusy(true)
    const { error } = await supabase.rpc('revoke_license', { p_id: revoking.id })
    setBusy(false)
    if (error) return toast(errMsg(error), 'error')
    toast('Kunci dicabut. PC yang memakainya akan terkunci saat verifikasi berikutnya.', 'success')
    setRevoking(null)
    load()
  }
  const removeDevice = async (d: Device) => {
    const { error } = await supabase.rpc('remove_license_device', { p_device: d.id })
    if (error) return toast(errMsg(error), 'error')
    toast(`${d.device_name || 'PC'} dilepas dari kunci ini`, 'success')
    load()
  }

  const active = (list ?? []).filter((l) => !l.revoked_at)
  const revoked = (list ?? []).filter((l) => l.revoked_at)

  return (
    <div className="relative isolate min-h-screen">
      <AuroraBg intensity={0.5} />
      <AppHeader />
      <main className="container-x py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">Lisensi aplikasi PC</h1>
            <p className="mt-1 max-w-2xl text-white/55">Buat kunci untuk mengaktifkan FLOW CONNECT Desktop. Kunci hanya ditampilkan sekali saat dibuat — simpan di tempat aman.</p>
          </div>
          <div className="flex gap-2">
            <a href={DESKTOP_SETUP_URL} className={buttonClass('glass', 'md')}><Download className="size-4" /> Unduh aplikasi</a>
            <Button onClick={() => { setLabel(''); setCreating(true) }} disabled={active.length >= 5}><Plus className="size-4" /> Buat kunci lisensi</Button>
          </div>
        </div>

        <ol className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ['Buat kunci', 'Klik “Buat kunci lisensi” dan beri nama (mis. “PC Kantor”).'],
            ['Salin', 'Kunci berbentuk FC-XXXXX-… hanya tampil sekali.'],
            ['Tempel di aplikasi', <>Buka FLOW CONNECT Desktop → tempel → Aktifkan. Belum punya? <Link to="/unduh" className="text-aurora-cyan hover:underline">Unduh di sini</Link>.</>],
          ].map(([t, d], i) => (
            <li key={i} className="flex gap-3 rounded-2xl p-4 glass">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-aurora text-xs font-bold">{i + 1}</span>
              <div><p className="font-semibold">{t}</p><p className="mt-0.5 text-white/55">{d}</p></div>
            </li>
          ))}
        </ol>

        {error && <p className="mt-8 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle className="size-4" /> {error}</p>}
        {!list && !error && <div className="mt-12 flex justify-center"><Loader2 className="size-6 animate-spin text-white/50" /></div>}

        {list && active.length === 0 && (
          <div className="mt-10 rounded-3xl p-10 text-center glass">
            <KeyRound className="mx-auto size-10 text-aurora-cyan" />
            <p className="mt-4 font-display text-xl font-semibold">Belum ada kunci lisensi</p>
            <p className="mt-1 text-sm text-white/55">Buat kunci pertamamu untuk mengaktifkan aplikasi PC.</p>
            <Button className="mt-6" onClick={() => { setLabel(''); setCreating(true) }}><Plus className="size-4" /> Buat kunci lisensi</Button>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4">
          {active.map((l) => (
            <section key={l.id} className="rounded-3xl p-6 glass" data-license={l.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-aurora"><KeyRound className="size-6" /></div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-display text-lg font-semibold">
                      {l.label}
                      <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">Aktif</span>
                    </p>
                    <p className="truncate font-mono text-sm text-white/55">{l.key_hint}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setLabel(l.label); setRenaming(l) }} className={buttonClass('ghost', 'sm')}><Pencil className="size-3.5" /> Ganti nama</button>
                  <button onClick={() => setRevoking(l)} className={buttonClass('danger', 'sm')}><ShieldOff className="size-3.5" /> Cabut</button>
                </div>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-white/40">PC terpakai</dt><dd className="font-semibold">{l.license_devices.length} / {l.max_devices}</dd></div>
                <div><dt className="text-xs text-white/40">Berlaku sampai</dt><dd className="font-semibold">{l.expires_at ? fmt(l.expires_at) : 'Tanpa batas'}</dd></div>
                <div><dt className="text-xs text-white/40">Terakhir dipakai</dt><dd className="font-semibold">{fmt(l.last_used_at)}</dd></div>
                <div><dt className="text-xs text-white/40">Dibuat</dt><dd className="font-semibold">{fmt(l.created_at)}</dd></div>
              </dl>
              <div className="mt-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Perangkat</p>
                {l.license_devices.length === 0 ? (
                  <p className="mt-2 text-sm text-white/45">Belum dipakai di PC mana pun.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-white/5 rounded-2xl bg-black/20">
                    {l.license_devices.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                        <Laptop className="size-4 shrink-0 text-white/50" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.device_name || 'PC tanpa nama'} <span className="font-mono text-xs text-white/35">{d.device_id.slice(0, 8)}</span></p>
                          <p className="text-xs text-white/45">{d.platform === 'win32' ? 'Windows' : d.platform || '—'}{d.app_version && ` · v${d.app_version}`} · terakhir aktif {fmt(d.last_seen_at)}</p>
                        </div>
                        <button onClick={() => removeDevice(d)} className="rounded-lg p-2 text-white/50 hover:bg-red-500/10 hover:text-red-300" title="Lepaskan PC ini" aria-label="Lepaskan PC ini"><Trash2 className="size-4" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>

        {revoked.length > 0 && (
          <details className="mt-8 rounded-2xl p-4 glass">
            <summary className="cursor-pointer text-sm text-white/60">Kunci yang sudah dicabut ({revoked.length})</summary>
            <ul className="mt-3 space-y-2 text-sm text-white/45">
              {revoked.map((l) => <li key={l.id} className="flex flex-wrap gap-x-3"><span className="font-medium text-white/60">{l.label}</span><span className="font-mono">{l.key_hint}</span><span>dicabut {fmt(l.revoked_at)}</span></li>)}
            </ul>
          </details>
        )}
      </main>

      <Modal open={creating} onClose={() => setCreating(false)} title="Buat kunci lisensi">
        <label className="text-sm text-white/65" htmlFor="lic-label">Nama kunci (opsional)</label>
        <input id="lic-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="mis. PC Kantor" autoFocus
          onKeyDown={(e) => e.key === 'Enter' && !busy && create()}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-aurora-cyan/60 focus:outline-none" />
        <p className="mt-3 text-xs text-white/45">Satu kunci bisa dipakai di maksimal 3 PC. PC lama bisa dilepas kapan saja dari halaman ini.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCreating(false)}>Batal</Button>
          <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Buat kunci</Button>
        </div>
      </Modal>

      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Kunci lisensi baru">
        <p className="text-sm text-white/65">Salin kunci ini dan tempel di FLOW CONNECT Desktop. <b className="text-amber-200">Kunci tidak akan ditampilkan lagi.</b></p>
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-aurora-cyan/40 bg-black/40 p-2 pl-4">
          <code className="min-w-0 flex-1 select-all break-all font-mono text-base tracking-wider text-white" data-new-key>{newKey}</code>
          <Button size="sm" onClick={copyKey}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Disalin' : 'Salin'}</Button>
        </div>
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <Link to="/unduh" className={buttonClass('glass', 'md')}><Download className="size-4" /> Unduh aplikasi</Link>
          <Button onClick={() => setNewKey(null)} className={clsx(!copied && 'opacity-80')}>Sudah saya simpan</Button>
        </div>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Ganti nama kunci">
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} autoFocus onKeyDown={(e) => e.key === 'Enter' && !busy && rename()}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-aurora-cyan/60 focus:outline-none" aria-label="Nama kunci" />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRenaming(null)}>Batal</Button>
          <Button onClick={rename} disabled={busy || !label.trim()}>Simpan</Button>
        </div>
      </Modal>

      <Modal open={!!revoking} onClose={() => setRevoking(null)} title="Cabut kunci lisensi?">
        <p className="text-sm text-white/65">Kunci <b>{revoking?.label}</b> ({revoking?.key_hint}) tidak bisa dipakai lagi. Semua PC yang memakainya ({revoking?.license_devices.length ?? 0}) akan terkunci saat verifikasi berikutnya. Tindakan ini tidak bisa dibatalkan.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRevoking(null)}>Batal</Button>
          <Button variant="danger" onClick={revoke} disabled={busy}><ShieldOff className="size-4" /> Cabut kunci</Button>
        </div>
      </Modal>
    </div>
  )
}
