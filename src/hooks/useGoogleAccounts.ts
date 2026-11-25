import { useCallback, useEffect, useState } from 'react'
import { listGoogleAccounts, touchGoogleAccount } from '../lib/api'
import { openFlow } from '../lib/google'
import type { GoogleAccount } from '../lib/types'
import { useToast } from '../context/ToastContext'

export function useGoogleAccounts() {
  const toast = useToast()
  const [accounts, setAccounts] = useState<GoogleAccount[] | null>(null)

  const reload = useCallback(async () => {
    try {
      setAccounts(await listGoogleAccounts())
    } catch (e) {
      toast((e as Error).message, 'error')
      setAccounts((a) => a ?? [])
    }
  }, [toast])

  useEffect(() => {
    reload()
  }, [reload])

  /** Buka Google Flow (atau tool) dengan akun tertentu. */
  const launch = useCallback((acc: GoogleAccount, target?: string) => {
    openFlow(acc.email, target)
    const now = new Date().toISOString()
    setAccounts((list) => list?.map((a) => (a.id === acc.id ? { ...a, last_used_at: now } : a)) ?? null)
    touchGoogleAccount(acc.id)
  }, [])

  const defaultAccount = accounts?.find((a) => a.is_default) ?? accounts?.[0] ?? null
  return { accounts, setAccounts, reload, launch, defaultAccount }
}
