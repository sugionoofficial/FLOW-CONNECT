/**
 * Abstraksi koneksi Studio ↔ Google Flow. Dua implementasi:
 *  - extension   : ekstensi FLOW CONNECT Bridge (chrome.runtime)
 *  - bookmarklet : bookmarklet di tab Flow (window.postMessage)
 * Keduanya hanya membaca data & menaruh gambar/prompt di UI Flow — generate tetap ditekan di Flow.
 */
import { bridge, bridgeErrorMessage, fileToPayload, type BridgeStatus, type FlowMedia } from './bridge'
import { flowLink } from './flowLink'

export type ConnectorKind = 'extension' | 'bookmarklet'

export interface Connector {
  kind: ConnectorKind
  status(): Promise<BridgeStatus>
  listMedia(projectId: string): Promise<FlowMedia[]>
  getMedia(mediaId: string): Promise<{ image: string | null; video: string | null }>
  /** URL yang bisa dipakai <img>; jika URL langsung gagal tampil. */
  thumb(url: string): Promise<string>
  download(url: string, filename: string): Promise<void>
  sendImage(files: File[], projectId?: string): Promise<{ method: string; count: number }>
  sendPrompt(text: string, projectId?: string): Promise<void>
  openFlow(url?: string): Promise<void>
}

const wrap = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p
  } catch (e) {
    const msg = (e as Error).message
    throw new Error(msg.startsWith('Bridge:') || msg.includes(' ') ? msg : bridgeErrorMessage(msg))
  }
}

export const extensionConnector: Connector = {
  kind: 'extension',
  status: () => bridge.status(),
  listMedia: async (id) => (await bridge.listMedia(id)).items,
  getMedia: (id) => bridge.getMedia(id),
  thumb: async (url) => (await bridge.fetchThumb(url)).dataUrl,
  download: async (url, filename) => {
    await bridge.download(url, filename)
  },
  sendImage: async (files, projectId) => bridge.sendImage(await Promise.all(files.map(fileToPayload)), projectId),
  sendPrompt: async (text, projectId) => {
    await bridge.sendPrompt(text, projectId)
  },
  openFlow: async (url) => {
    await bridge.openFlow(url)
  },
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

const blobCache = new Map<string, string>()

export const bookmarkletConnector: Connector = {
  kind: 'bookmarklet',
  status: () => wrap(flowLink.call<BridgeStatus>('status')),
  listMedia: async (id) => (await wrap(flowLink.call<{ items: FlowMedia[] }>('listMedia', { projectId: id }, 60000))).items,
  getMedia: (id) => wrap(flowLink.call('getMedia', { mediaId: id })),
  thumb: async (url) => {
    const hit = blobCache.get(url)
    if (hit) return hit
    const { blob } = await wrap(flowLink.call<{ blob: Blob }>('fetchBlob', { url }, 60000))
    const obj = URL.createObjectURL(blob)
    blobCache.set(url, obj)
    return obj
  },
  download: async (url, filename) => {
    try {
      const { blob } = await flowLink.call<{ blob: Blob }>('fetchBlob', { url }, 120000)
      saveBlob(blob, filename)
    } catch {
      // halaman Flow tidak mengizinkan fetch → buka file di tab baru (tekan lama / klik kanan → simpan)
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  },
  sendImage: (files, projectId) => {
    void projectId
    flowLink.focusFlow()
    return wrap(flowLink.call('sendImage', { files }, 60000))
  },
  sendPrompt: async (text) => {
    flowLink.focusFlow()
    await wrap(flowLink.call('sendPrompt', { text }))
  },
  openFlow: async (url) => {
    if (!flowLink.openFlow(url)) window.open(url || 'https://flow.google.com/', '_blank')
  },
}
