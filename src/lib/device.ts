/**
 * Deteksi perangkat & integrasi dengan aplikasi Google Flow resmi di HP.
 *  - Android: com.google.android.apps.labs.whisk (Google Labs, Play Store)
 *  - iPhone : App Store id6751294549
 */

export const FLOW_ANDROID_PACKAGE = 'com.google.android.apps.labs.whisk'
export const FLOW_PLAY_URL = `https://play.google.com/store/apps/details?id=${FLOW_ANDROID_PACKAGE}`
export const FLOW_APPSTORE_URL = 'https://apps.apple.com/app/google-flow/id6751294549'
export const FLOW_WEB_URL = 'https://flow.google.com/'

export type Platform = 'android' | 'ios' | 'desktop'

export function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  return 'desktop'
}

export const isMobile = () => getPlatform() !== 'desktop'

export const storeUrl = (p: Platform = getPlatform()) => (p === 'ios' ? FLOW_APPSTORE_URL : FLOW_PLAY_URL)

/**
 * Link yang membuka aplikasi Google Flow.
 *  - Android: intent URL ke paket Flow; jika aplikasi tidak bisa dibuka → Play Store
 *    (yang menampilkan tombol "Buka" bila sudah terpasang).
 *  - iPhone: link https biasa — iOS membuka aplikasi lewat Universal Link bila tersedia,
 *    jika tidak, terbuka versi web.
 */
export function flowAppHref(path = '/', p: Platform = getPlatform()): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (p === 'android') {
    return (
      `intent://flow.google.com${clean}#Intent;scheme=https;package=${FLOW_ANDROID_PACKAGE};` +
      `S.browser_fallback_url=${encodeURIComponent(FLOW_PLAY_URL)};end`
    )
  }
  return `https://flow.google.com${clean}`
}

export function openFlowApp(path = '/') {
  window.location.href = flowAppHref(path)
}

/* ───────── share ───────── */

export function canShareFiles(files: File[]): boolean {
  try {
    return !!navigator.canShare && files.length > 0 && navigator.canShare({ files })
  } catch {
    return false
  }
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported'

/** Buka menu "Bagikan" bawaan HP berisi gambar (+ prompt). Pengguna memilih Google Flow. */
export async function shareFiles(files: File[], text?: string): Promise<ShareResult> {
  if (!canShareFiles(files)) return 'unsupported'
  try {
    await navigator.share({ files, text: text || undefined, title: 'FLOW CONNECT' })
    return 'shared'
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
    return 'unsupported'
  }
}

/** Simpan file ke perangkat (galeri / folder Download). */
export function saveFile(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
