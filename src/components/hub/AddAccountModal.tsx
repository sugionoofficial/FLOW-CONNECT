import { useState, type FormEvent } from 'react'
import { Info, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { Modal } from '../Modal'
import { Button } from '../Button'
import { GoogleG } from './GoogleG'
import { useToast } from '../../context/ToastContext'
import { addGoogleAccountByEmail, linkGoogleAccount } from '../../lib/api'
import { isGoogleOAuthEnabled, requestGoogleAccessToken, revokeGoogleToken } from '../../lib/google'
import type { GoogleAccount } from '../../lib/types'

export function AddAccountModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (a: GoogleAccount) => void }) {
  const toast = useToast()
  const oauth = isGoogleOAuthEnabled()
  const [tab, setTab] = useState<'google' | 'email'>(oauth ? 'google' : 'email')
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setEmail('')
    setLabel('')
    onClose()
  }
  const close = () => {
    if (!busy) reset()
  }

  const withGoogle = async () => {
    setBusy(true)
    try {
      const token = await requestGoogleAccessToken()
      const { account, updated } = await linkGoogleAccount(token)
      revokeGoogleToken(token) // token hanya dipakai sekali untuk verifikasi
      onAdded(account)
      toast(updated ? `${account.email} diperbarui & terverifikasi` : `${account.email} berhasil ditautkan`, 'success')
      reset()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const withEmail = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const account = await addGoogleAccountByEmail(email, label)
      onAdded(account)
      toast(`${account.email} ditambahkan`, 'success')
      reset()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Tambah akun Google">
      <div className="grid grid-cols-2 gap-1 rounded-xl p-1 glass">
        <button onClick={() => setTab('google')} className={`rounded-lg py-2 text-sm font-semibold transition ${tab === 'google' ? 'bg-white/10' : 'text-white/50'}`}>
          Masuk dengan Google
        </button>
        <button onClick={() => setTab('email')} className={`rounded-lg py-2 text-sm font-semibold transition ${tab === 'email' ? 'bg-white/10' : 'text-white/50'}`}>
          Pakai email
        </button>
      </div>

      {tab === 'google' ? (
        <div className="mt-5">
          <p className="text-sm text-white/60">
            Pop-up Google akan terbuka. Pilih akun yang sudah masuk atau tambah akun lain. Akun yang ditautkan dengan cara ini ditandai <b>terverifikasi</b>.
          </p>
          <button
            onClick={withGoogle}
            disabled={!oauth || busy}
            className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <GoogleG />}
            Masuk dengan Google
          </button>
          {!oauth && (
            <p className="mt-3 flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
              <Info className="mt-0.5 size-4 shrink-0" />
              Login Google belum diaktifkan oleh admin (Client ID belum di-set). Sementara gunakan tab “Pakai email”.
            </p>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs text-white/40">
            <ShieldCheck className="size-4" /> Hanya nama, email & foto yang dibaca. FLOW CONNECT tidak pernah melihat password Google kamu.
          </p>
        </div>
      ) : (
        <form onSubmit={withEmail} className="mt-5 flex flex-col gap-3">
          <p className="text-sm text-white/60">
            Masukkan alamat akun Google. Saat membuka Google Flow, Google akan meminta kamu masuk ke akun ini di halaman resmi Google.
          </p>
          <label className="flex items-center gap-3 rounded-xl px-4 py-3 glass">
            <Mail className="size-4 text-white/40" />
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@gmail.com"
              className="flex-1 bg-transparent text-sm placeholder:text-white/35 focus:outline-none"
            />
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder="Label (opsional), mis. Akun Kerja"
            className="rounded-xl px-4 py-3 text-sm glass placeholder:text-white/35 focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>Batal</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Tambah akun
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
