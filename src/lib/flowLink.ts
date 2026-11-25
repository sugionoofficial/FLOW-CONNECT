/**
 * Sisi FLOW CONNECT untuk bookmarklet: koneksi postMessage ke tab Google Flow
 * yang menjalankan bookmarklet FLOW CONNECT.
 *
 * Dua arah koneksi didukung:
 *  1. FLOW CONNECT membuka tab Flow (window.open) → pengguna klik bookmarklet → bookmarklet menyapa window.opener
 *  2. Pengguna klik bookmarklet di tab Flow → tombol "Buka FLOW CONNECT" membuka Studio → bookmarklet menyapa jendela itu
 */
import rawSource from '../bookmarklet/flow-connect-bookmarklet.js?raw'
import type { BridgeStatus } from './bridge'

export const FLOW_ORIGIN = 'https://flow.google.com'

/** URL `javascript:` bookmarklet, terikat ke origin FLOW CONNECT yang sedang dibuka. */
export function bookmarkletHref(origin = window.location.origin): string {
  const code = rawSource
    .replace(/\/\*[\s\S]*?\*\//g, '') // komentar blok
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .join('\n')
    .replace('__FC_ORIGIN__', origin)
  return `javascript:${encodeURIComponent(code)}`
}

type Listener = (s: LinkState) => void
export interface LinkState {
  connected: boolean
  status: BridgeStatus | null
}

interface Reply {
  source: 'fc-bookmarklet'
  id?: string
  type?: string
  ok?: boolean
  data?: unknown
  error?: string
}

class FlowLink {
  private win: Window | null = null
  private flowTab: Window | null = null
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }>()
  private listeners = new Set<Listener>()
  private started = false
  private lastSeen = 0
  state: LinkState = { connected: false, status: null }

  start() {
    if (this.started) return
    this.started = true
    window.addEventListener('message', this.onMessage)
    // jika Studio dibuka dari tombol di bookmarklet, sapa tab Flow (opener)
    this.sayHello()
    window.setInterval(() => this.heartbeat(), 4000)
  }

  subscribe(fn: Listener) {
    this.start()
    this.listeners.add(fn)
    fn(this.state)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit(patch: Partial<LinkState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn(this.state))
  }

  private onMessage = (e: MessageEvent) => {
    if (e.origin !== FLOW_ORIGIN) return
    const m = e.data as Reply
    if (!m || m.source !== 'fc-bookmarklet') return
    this.win = e.source as Window
    this.lastSeen = Date.now()
    if (m.type === 'hello' || m.type === 'status') {
      this.emit({ connected: true, status: m.data as BridgeStatus })
      return
    }
    if (!m.id) return
    const p = this.pending.get(m.id)
    if (!p) return
    this.pending.delete(m.id)
    clearTimeout(p.timer)
    if (m.ok) p.resolve(m.data)
    else p.reject(new Error(m.error || 'UNKNOWN'))
  }

  private targets(): Window[] {
    const t: Window[] = []
    if (this.win) t.push(this.win)
    if (this.flowTab && this.flowTab !== this.win) t.push(this.flowTab)
    try {
      if (window.opener && !t.includes(window.opener)) t.push(window.opener)
    } catch { /* COOP */ }
    return t.filter((w) => {
      try {
        return !w.closed
      } catch {
        return false
      }
    })
  }

  sayHello() {
    for (const w of this.targets()) {
      try {
        w.postMessage({ source: 'flow-connect', type: 'hello' }, FLOW_ORIGIN)
      } catch { /* abaikan */ }
    }
  }

  private async heartbeat() {
    if (!this.state.connected) {
      this.sayHello()
      return
    }
    try {
      const s = await this.call<BridgeStatus>('status', undefined, 3500)
      this.emit({ connected: true, status: s })
    } catch {
      if (Date.now() - this.lastSeen > 9000) {
        this.win = null
        this.emit({ connected: false, status: null })
      }
    }
  }

  /** Buka tab Google Flow yang dikendalikan dari sini (agar bookmarklet bisa menyapa balik). */
  openFlow(url = `${FLOW_ORIGIN}/`) {
    this.start()
    const w = window.open(url, 'flow-connect-flow')
    if (w) this.flowTab = w
    return !!w
  }

  focusFlow() {
    try {
      this.win?.focus()
    } catch { /* abaikan */ }
  }

  call<T>(type: string, payload?: unknown, timeout = 30000): Promise<T> {
    const win = this.win
    if (!win || win.closed) return Promise.reject(new Error('NOT_CONNECTED'))
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('TIMEOUT'))
      }, timeout)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      try {
        win.postMessage({ source: 'flow-connect', id, type, payload }, FLOW_ORIGIN)
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(e as Error)
      }
    })
  }
}

export const flowLink = new FlowLink()
