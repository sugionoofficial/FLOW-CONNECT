// FLOW CONNECT Desktop (aplikasi Windows) — file dirilis otomatis oleh .github/workflows/desktop.yml
const REPO = 'https://github.com/sugionoofficial/FLOW-CONNECT'
export const DESKTOP_SETUP_URL = `${REPO}/releases/latest/download/FLOW-CONNECT-Desktop-Setup.exe`
export const DESKTOP_PORTABLE_URL = `${REPO}/releases/latest/download/FLOW-CONNECT-Desktop-Portable.exe`
export const DESKTOP_RELEASES_URL = `${REPO}/releases/latest`
export const DESKTOP_RELEASE_API = 'https://api.github.com/repos/sugionoofficial/FLOW-CONNECT/releases/latest'

export type DesktopRelease = {
  version: string
  name: string
  publishedAt: string
  notes: string
  url: string
  assets: { name: string; size: number; downloads: number }[]
}

/** Info rilis terbaru dari GitHub (publik, tanpa token). Disimpan sementara di sessionStorage. */
export async function fetchDesktopRelease(): Promise<DesktopRelease | null> {
  const KEY = 'fc:desktopRelease'
  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data
  } catch { /* abaikan */ }
  try {
    const r = await fetch(DESKTOP_RELEASE_API, { headers: { accept: 'application/vnd.github+json' } })
    if (!r.ok) return null
    const j = await r.json()
    const data: DesktopRelease = {
      version: String(j.tag_name || '').replace(/^desktop-v/, ''),
      name: j.name || j.tag_name,
      publishedAt: j.published_at,
      notes: j.body || '',
      url: j.html_url,
      assets: (j.assets || []).map((a: { name: string; size: number; download_count: number }) => ({ name: a.name, size: a.size, downloads: a.download_count })),
    }
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data }))
    return data
  } catch {
    return null
  }
}

export const formatSize = (b?: number) => (b ? `${Math.round(b / 1024 / 1024)} MB` : '')
