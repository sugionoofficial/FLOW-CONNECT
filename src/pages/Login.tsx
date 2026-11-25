import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Lock, Mail, User } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AuroraBg } from '../components/AuroraBg'
import { Logo } from '../components/Logo'
import { Button } from '../components/Button'
import { SHOWCASE_MEDIA } from '../lib/catalog'

export default function Login() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'masuk' | 'daftar'>(params.get('mode') === 'daftar' ? 'daftar' : 'masuk')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'

  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user, from, navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'daftar') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name || undefined } } })
        if (error) throw error
        if (!data.session) setError('Cek email kamu untuk konfirmasi akun.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(
        msg.includes('Invalid login') ? 'Email atau kata sandi salah.' :
        msg.includes('already registered') ? 'Email sudah terdaftar, silakan masuk.' :
        msg.includes('at least 6') ? 'Kata sandi minimal 6 karakter.' : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative isolate grid min-h-screen lg:grid-cols-2">
      <AuroraBg />
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-3xl font-bold">{mode === 'masuk' ? 'Selamat datang kembali' : 'Buat akun gratis'}</h1>
          <p className="mt-2 text-sm text-white/55">
            {mode === 'masuk' ? 'Masuk untuk melanjutkan project-mu.' : 'Dapatkan 100 kredit gratis untuk mulai berkarya.'}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-1 rounded-xl p-1 glass">
            {(['masuk', 'daftar'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null) }}
                className={clsx('rounded-lg py-2 text-sm font-semibold capitalize transition', mode === m ? 'bg-white/10 text-white' : 'text-white/50')}
              >
                {m}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            {mode === 'daftar' && (
              <Field icon={User} type="text" placeholder="Nama tampilan" value={name} onChange={setName} autoComplete="name" />
            )}
            <Field icon={Mail} type="email" placeholder="Email" value={email} onChange={setEmail} required autoComplete="email" />
            <Field icon={Lock} type="password" placeholder="Kata sandi (min. 6 karakter)" value={password} onChange={setPassword} required autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'} />
            {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
            <Button type="submit" size="lg" disabled={busy} className="mt-2">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === 'masuk' ? 'Masuk' : 'Daftar & Mulai'}
            </Button>
          </form>
          <Link to="/" className="mt-8 text-center text-sm text-white/45 hover:text-white">← Kembali ke beranda</Link>
        </div>
      </div>

      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-6 grid grid-cols-2 gap-4">
          {SHOWCASE_MEDIA.slice(0, 4).map((src, i) => (
            <div key={src} className="overflow-hidden rounded-3xl border border-white/10">
              <img src={src} alt="" className="h-full w-full animate-kenburns object-cover" style={{ animationDelay: `${-i * 2}s` }} />
            </div>
          ))}
        </div>
        <div className="absolute inset-6 rounded-3xl bg-gradient-to-t from-ink-950/90 via-transparent to-transparent" />
        <p className="absolute bottom-14 left-14 right-14 font-display text-3xl font-bold">
          “Dari satu kalimat jadi <span className="text-aurora">satu adegan</span>.”
        </p>
      </div>
    </div>
  )
}

function Field({
  icon: Icon, value, onChange, ...rest
}: { icon: typeof Mail; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <label className="flex items-center gap-3 rounded-xl px-4 py-3 glass focus-within:border-aurora-cyan/50">
      <Icon className="size-4 text-white/40" />
      <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-transparent text-sm placeholder:text-white/35 focus:outline-none" {...rest} />
    </label>
  )
}
