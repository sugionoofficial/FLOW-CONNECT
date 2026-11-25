/**
 * Integrasi Google:
 *  1) Membuka Google Flow dengan akun Google tertentu (login terjadi di halaman Google).
 *  2) "Masuk dengan Google" (Google Identity Services) untuk menautkan akun terverifikasi.
 */

export const FLOW_APP_URL = 'https://flow.google.com/'

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || ''
export const isGoogleOAuthEnabled = () => GOOGLE_CLIENT_ID.length > 0

/**
 * URL yang membuka `target` di Google dengan akun `email`.
 * Google menampilkan pemilih/login akun bila akun tsb belum masuk di browser.
 */
export function buildFlowUrl(email: string, target: string = FLOW_APP_URL): string {
  const dest = new URL(target)
  dest.searchParams.set('authuser', email)
  const chooser = new URL('https://accounts.google.com/AccountChooser')
  chooser.searchParams.set('Email', email)
  chooser.searchParams.set('continue', dest.toString())
  return chooser.toString()
}

export function openFlow(email: string, target?: string) {
  window.open(buildFlowUrl(email, target), '_blank', 'noopener,noreferrer')
}

/* ───────── Google Identity Services ───────── */

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string; hint?: string }) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string
            scope: string
            prompt?: string
            hint?: string
            callback: (resp: TokenResponse) => void
            error_callback?: (err: { type: string; message?: string }) => void
          }) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

let gisPromise: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      gisPromise = null
      reject(new Error('Gagal memuat layanan login Google.'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

/** Buka pop-up Google (pilih / tambah akun) dan kembalikan access token. */
export async function requestGoogleAccessToken(hintEmail?: string): Promise<string> {
  if (!isGoogleOAuthEnabled()) throw new Error('Login Google belum dikonfigurasi (VITE_GOOGLE_CLIENT_ID kosong).')
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      prompt: 'select_account',
      hint: hintEmail,
      callback: (resp) => {
        if (resp.access_token) resolve(resp.access_token)
        else reject(new Error(resp.error_description || resp.error || 'Login Google dibatalkan.'))
      },
      error_callback: (err) =>
        reject(new Error(err.type === 'popup_closed' ? 'Pop-up login Google ditutup.' : err.message || 'Login Google gagal.')),
    })
    client.requestAccessToken({ prompt: 'select_account', hint: hintEmail })
  })
}

export function revokeGoogleToken(token: string) {
  window.google?.accounts.oauth2.revoke(token)
}
