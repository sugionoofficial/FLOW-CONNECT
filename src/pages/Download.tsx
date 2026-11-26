import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, BadgeCheck, Bot, CheckCircle2, Globe, Cpu, Download as DownloadIcon, FolderDown, KeyRound, Monitor, Package, RefreshCw, ShieldAlert, Users, Wifi,
} from 'lucide-react'
import { Navbar } from '../components/landing/Navbar'
import { Footer } from '../components/landing/Footer'
import { AuroraBg } from '../components/AuroraBg'
import { buttonClass } from '../components/Button'
import { useAuth } from '../context/AuthContext'
import { DESKTOP_PORTABLE_URL, DESKTOP_RELEASES_URL, DESKTOP_SETUP_URL, fetchDesktopRelease, formatSize, type DesktopRelease } from '../lib/desktop'

const FEATURES = [
  { icon: Users, title: 'Banyak akun Google', desc: 'Setiap akun punya profil browser sendiri. Ganti akun dalam satu klik.' },
  { icon: FolderDown, title: 'Kirim & unduh', desc: 'Kirim gambar & prompt ke Google Flow, lalu simpan hasilnya ke folder PC.' },
  { icon: Bot, title: 'Mode Otomatis', desc: 'Antrean banyak prompt dengan jeda acak & batas per sesi (opsional, ada peringatan risiko).' },
  { icon: RefreshCw, title: 'Update otomatis', desc: 'Saat ada versi baru muncul notifikasi — klik “Update sekarang”, tanpa instal ulang.' },
]

const REQUIREMENTS = [
  { icon: Monitor, text: 'Windows 10 / 11 (64-bit)' },
  { icon: Globe, text: 'Google Chrome atau Microsoft Edge terpasang' },
  { icon: Cpu, text: 'RAM 4 GB, ruang kosong ± 400 MB' },
  { icon: Wifi, text: 'Koneksi internet' },
  { icon: KeyRound, text: 'Kunci lisensi FLOW CONNECT (gratis dibuat di situs ini)' },
]

export default function DownloadPage() {
  const { user } = useAuth()
  const [rel, setRel] = useState<DesktopRelease | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    document.title = 'Unduh FLOW CONNECT Desktop untuk Windows'
    fetchDesktopRelease().then((r) => { setRel(r); setLoaded(true) })
  }, [])

  const asset = (n: string) => rel?.assets.find((a) => a.name === n)
  const setup = asset('FLOW-CONNECT-Desktop-Setup.exe')
  const portable = asset('FLOW-CONNECT-Desktop-Portable.exe')
  const date = rel?.publishedAt ? new Date(rel.publishedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Navbar />
      <main id="main-content" className="relative isolate pb-24 pt-32 md:pt-40">
        <AuroraBg intensity={0.7} />
        <div className="container-x">
          {/* Hero */}
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-white/80 glass">
                <Monitor className="size-3.5 text-aurora-cyan" /> Aplikasi PC · Windows
              </span>
              <h1 className="mt-5 font-display text-4xl font-bold tracking-tight sm:text-6xl">
                FLOW CONNECT <span className="text-aurora">Desktop</span>
              </h1>
              <p className="mt-4 max-w-xl text-lg text-white/60">
                Kendalikan Google Flow dari satu aplikasi Windows. Generate tetap berjalan di Google Flow dengan akun Google-mu sendiri — aplikasi hanya jembatan.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href={DESKTOP_SETUP_URL} className={buttonClass('primary', 'lg')} data-download="setup">
                  <DownloadIcon className="size-5" /> Unduh untuk Windows
                </a>
                <a href={DESKTOP_PORTABLE_URL} className={buttonClass('glass', 'lg')} data-download="portable">Versi portable</a>
              </div>
              <p className="mt-4 text-sm text-white/45" aria-live="polite">
                {rel ? <>Versi <b className="text-white/80">{rel.version}</b>{date && <> · dirilis {date}</>}{setup && <> · installer {formatSize(setup.size)}</>}</>
                  : loaded ? 'Versi terbaru dari GitHub Releases' : 'Memuat info versi…'}
                {' · '}<a href={DESKTOP_RELEASES_URL} target="_blank" rel="noreferrer" className="underline decoration-white/20 hover:text-white">catatan rilis</a>
              </p>
            </div>
            <div className="relative">
              <div className="absolute -inset-6 rounded-[2rem] bg-aurora opacity-20 blur-3xl" />
              <img src="/media/desktop-app.png" alt="Tampilan FLOW CONNECT Desktop" width={1280} height={800} className="relative w-full rounded-2xl border border-white/10 shadow-2xl" />
            </div>
          </div>

          {/* Fitur */}
          <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-3xl p-6 glass">
                <f.icon className="size-6 text-aurora-cyan" />
                <h3 className="mt-4 font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-white/55">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Pilihan unduhan */}
          <h2 className="mt-20 font-display text-3xl font-bold">Pilih versi</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="glow-border relative rounded-3xl p-7">
              <div className="flex items-center gap-3">
                <Package className="size-7 text-aurora-cyan" />
                <div>
                  <p className="font-display text-xl font-bold">Installer <span className="ml-1 rounded-full bg-aurora px-2 py-0.5 align-middle text-[11px] font-semibold">Disarankan</span></p>
                  <p className="text-sm text-white/50">FLOW-CONNECT-Desktop-Setup.exe{setup && ` · ${formatSize(setup.size)}`}</p>
                </div>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-white/70">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> Update otomatis — klik “Update sekarang”, tanpa instal ulang</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> Shortcut di Start Menu & desktop</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> Tanpa hak admin (dipasang untuk pengguna saat ini)</li>
              </ul>
              <a href={DESKTOP_SETUP_URL} className={buttonClass('primary', 'md', 'mt-6 w-full')}><DownloadIcon className="size-4" /> Unduh installer</a>
            </div>
            <div className="rounded-3xl p-7 glass">
              <div className="flex items-center gap-3">
                <FolderDown className="size-7 text-white/70" />
                <div>
                  <p className="font-display text-xl font-bold">Portable</p>
                  <p className="text-sm text-white/50">FLOW-CONNECT-Desktop-Portable.exe{portable && ` · ${formatSize(portable.size)}`}</p>
                </div>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-white/70">
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> Langsung jalan tanpa instal (cocok untuk flashdisk)</li>
                <li className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" /> Notifikasi saat ada versi baru</li>
                <li className="flex gap-2 text-white/45"><ShieldAlert className="mt-0.5 size-4 shrink-0" /> Update manual: unduh file baru lalu ganti file lama</li>
              </ul>
              <a href={DESKTOP_PORTABLE_URL} className={buttonClass('glass', 'md', 'mt-6 w-full')}><DownloadIcon className="size-4" /> Unduh portable</a>
            </div>
          </div>

          {/* Langkah */}
          <div className="mt-20 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <h2 className="font-display text-3xl font-bold">Cara memasang</h2>
              <ol className="mt-6 space-y-4">
                {[
                  { t: 'Unduh installer', d: 'Klik tombol unduh di atas. File diunduh dari GitHub Releases resmi FLOW CONNECT.' },
                  { t: 'Lewati peringatan SmartScreen', d: 'Aplikasi belum ditandatangani sertifikat berbayar, jadi Windows bisa menampilkan “Windows melindungi PC Anda”. Klik Info selengkapnya → Tetap jalankan.' },
                  { t: 'Pasang & buka', d: 'Ikuti wizard instalasi. FLOW CONNECT Desktop terbuka otomatis setelah selesai.' },
                  { t: 'Aktifkan dengan kunci lisensi', d: 'Buat kunci di halaman Lisensi situs ini, salin, lalu tempel di layar aktivasi aplikasi.' },
                  { t: 'Tambah akun Google & mulai', d: 'Masuk ke Google sekali di browser yang terbuka, klik Hubungkan, lalu kirim prompt dari Studio aplikasi.' },
                ].map((s, i) => (
                  <li key={s.t} className="flex gap-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-aurora font-bold">{i + 1}</span>
                    <div>
                      <p className="font-semibold">{s.t}</p>
                      <p className="mt-0.5 text-sm text-white/55">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-5">
              <div className="rounded-3xl p-7 glass">
                <h3 className="font-display text-xl font-bold">Persyaratan</h3>
                <ul className="mt-4 space-y-3 text-sm text-white/70">
                  {REQUIREMENTS.map((r) => (
                    <li key={r.text} className="flex items-center gap-3"><r.icon className="size-4 shrink-0 text-aurora-cyan" /> {r.text}</li>
                  ))}
                </ul>
              </div>
              <div className="glow-border relative overflow-hidden rounded-3xl p-7">
                <div className="absolute -right-8 -top-8 size-40 rounded-full bg-aurora-violet/40 blur-3xl" />
                <KeyRound className="relative size-7 text-aurora-cyan" />
                <h3 className="relative mt-3 font-display text-xl font-bold">Kunci lisensi</h3>
                <p className="relative mt-1 text-sm text-white/60">Aplikasi PC diaktifkan dengan kunci yang kamu buat sendiri. Satu kunci bisa dipakai di beberapa PC.</p>
                <Link to={user ? '/app/lisensi' : '/masuk?mode=daftar'} state={user ? undefined : { from: '/app/lisensi' }} className={buttonClass('primary', 'md', 'relative mt-5')}>
                  {user ? 'Buat kunci lisensi' : 'Daftar & buat kunci'} <ArrowRight className="size-4" />
                </Link>
              </div>
              <p className="flex items-start gap-2 text-xs text-white/40">
                <BadgeCheck className="mt-0.5 size-4 shrink-0" /> Kode sumber terbuka di GitHub. Aplikasi tidak menyimpan password Google; login dilakukan di halaman resmi Google pada browser milikmu.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
