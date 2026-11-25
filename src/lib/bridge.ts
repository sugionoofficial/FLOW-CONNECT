/**
 * Klien untuk ekstensi "FLOW CONNECT Bridge".
 * Website tidak pernah memanggil Google langsung — semua lewat ekstensi yang
 * bekerja di tab Google Flow milik pengguna (sesi & akun Google mereka sendiri).
 */

export const BRIDGE_EXTENSION_ID =
  (import.meta.env.VITE_BRIDGE_EXTENSION_ID as string | undefined)?.trim() || 'paedhhaejfnmdlgabmdjlncbjjpfdkfp'
export const BRIDGE_ZIP_URL = '/downloads/flow-connect-bridge.zip'
export const BRIDGE_MIN_VERSION = '1.0.0'

export interface FlowProject {
  id: string
  title: string
  tabId: number
}
export interface BridgeStatus {
  version: string
  flowOpen: boolean
  signedIn: boolean
  account: string | null
  projects: FlowProject[]
}
export interface FlowMedia {
  mediaId: string
  assetId: string | null
  title: string
  createdAt: number | null
  isVideo: boolean
  done: boolean
  image: string | null
  video: string | null
}
export interface ImagePayload {
  dataUrl: string
  name: string
  type: string
}

interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb: (res: unknown) => void) => void
  lastError?: { message?: string }
}
const runtime = (): ChromeRuntime | null =>
  (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime ?? null

const ERRORS: Record<string, string> = {
  NOT_INSTALLED: 'Ekstensi FLOW CONNECT Bridge belum terpasang atau tidak aktif.',
  NO_FLOW_TAB: 'Buka Google Flow di tab lain terlebih dahulu.',
  NOT_SIGNED_IN: 'Login ke Google Flow dengan akun Google-mu dulu.',
  PROMPT_BOX_NOT_FOUND: 'Kotak prompt Google Flow tidak ditemukan. Buka sebuah project di Flow.',
  INVALID_PROJECT_ID: 'Project tidak valid.',
  ORIGIN_NOT_ALLOWED: 'Domain ini tidak diizinkan oleh ekstensi.',
  TIMEOUT: 'Ekstensi tidak merespons. Coba muat ulang halaman.',
  RPC_ERROR: 'Google Flow menolak permintaan (format mungkin berubah).',
}
export function bridgeErrorMessage(code: string) {
  const key = Object.keys(ERRORS).find((k) => code.startsWith(k))
  return key ? ERRORS[key] : `Bridge: ${code}`
}

export function call<T>(type: string, payload?: unknown, timeout = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const rt = runtime()
    if (!rt?.sendMessage) return reject(new Error(bridgeErrorMessage('NOT_INSTALLED')))
    const timer = setTimeout(() => reject(new Error(bridgeErrorMessage('TIMEOUT'))), timeout)
    try {
      rt.sendMessage(BRIDGE_EXTENSION_ID, { type, payload }, (res) => {
        clearTimeout(timer)
        const r = res as { ok: boolean; data?: T; error?: string } | undefined
        if (rt.lastError || !r) return reject(new Error(bridgeErrorMessage('NOT_INSTALLED')))
        if (!r.ok) return reject(new Error(bridgeErrorMessage(r.error || 'UNKNOWN')))
        resolve(r.data as T)
      })
    } catch {
      clearTimeout(timer)
      reject(new Error(bridgeErrorMessage('NOT_INSTALLED')))
    }
  })
}

export async function detectBridge(): Promise<string | null> {
  try {
    const { version } = await call<{ version: string }>('ping', undefined, 2500)
    return version
  } catch {
    return null
  }
}

export const bridge = {
  status: () => call<BridgeStatus>('status'),
  openFlow: (url?: string) => call<{ tabId: number }>('openFlow', { url }),
  listMedia: (projectId: string) => call<{ items: FlowMedia[] }>('listMedia', { projectId }, 60000),
  getMedia: (mediaId: string) => call<{ image: string | null; video: string | null }>('getMedia', { mediaId }),
  fetchThumb: (url: string) => call<{ dataUrl: string }>('fetchThumb', { url }, 60000),
  download: (url: string, filename: string) => call<{ downloadId: number }>('download', { url, filename }),
  sendImage: (files: ImagePayload[], projectId?: string) => call<{ method: string; count: number }>('sendImage', { files, projectId }, 60000),
  sendPrompt: (text: string, projectId?: string) => call<{ ok: true }>('sendPrompt', { text, projectId }),
}

export const flowProjectUrl = (id: string) => `https://flow.google.com/project/${id}`

/** Baca File → data URL (maks 15 MB). */
export function fileToPayload(file: File): Promise<ImagePayload> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return reject(new Error(`${file.name}: format harus PNG/JPG/WEBP/GIF`))
    if (file.size > 15 * 1024 * 1024) return reject(new Error(`${file.name}: maksimal 15 MB`))
    const fr = new FileReader()
    fr.onload = () => resolve({ dataUrl: String(fr.result), name: file.name, type: file.type })
    fr.onerror = () => reject(new Error(`Gagal membaca ${file.name}`))
    fr.readAsDataURL(file)
  })
}

/** Salin gambar ke clipboard sebagai PNG (fallback tanpa ekstensi: tinggal Ctrl+V di Flow). */
export async function copyImageToClipboard(file: File) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Gagal konversi'))), 'image/png'))
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
