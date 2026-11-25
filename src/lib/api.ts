import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { GoogleAccount, Profile } from './types'

const ERRORS: Record<string, string> = {
  account_limit: 'Maksimal 10 akun Google per pengguna.',
  google_accounts_user_id_email_key: 'Akun Google ini sudah ditambahkan.',
  duplicate: 'Akun Google ini sudah ditambahkan.',
  google_accounts_email_check: 'Format email tidak valid.',
  invalid_google_token: 'Login Google gagal diverifikasi. Coba lagi.',
  token_audience_mismatch: 'Token Google bukan untuk aplikasi ini.',
  email_not_verified: 'Email akun Google belum terverifikasi.',
  not_authenticated: 'Sesi berakhir, silakan masuk lagi.',
}

function friendly(message: string): Error {
  const key = Object.keys(ERRORS).find((k) => message.includes(k))
  return new Error(key ? ERRORS[key] : message)
}

const fail = (error: { message: string } | null) => {
  if (error) throw friendly(error.message)
}

/* ───────── profile ───────── */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  fail(error)
  return data as Profile | null
}

/* ───────── google accounts ───────── */
export async function listGoogleAccounts(): Promise<GoogleAccount[]> {
  const { data, error } = await supabase
    .from('google_accounts')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
  fail(error)
  return (data ?? []) as GoogleAccount[]
}

export async function addGoogleAccountByEmail(email: string, label?: string): Promise<GoogleAccount> {
  const { data, error } = await supabase
    .from('google_accounts')
    .insert({ email: email.trim().toLowerCase(), label: label?.trim() || null })
    .select()
    .single()
  fail(error)
  return data as GoogleAccount
}

/** Verifikasi token Google di server (Edge Function) lalu simpan sebagai akun terverifikasi. */
export async function linkGoogleAccount(accessToken: string): Promise<{ account: GoogleAccount; updated: boolean }> {
  const { data, error } = await supabase.functions.invoke('link-google-account', { body: { access_token: accessToken } })
  if (error) {
    let msg = error.message
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      if (body?.error) msg = body.error
    }
    throw friendly(msg)
  }
  return data as { account: GoogleAccount; updated: boolean }
}

export async function updateGoogleAccountLabel(id: string, label: string) {
  const { error } = await supabase.from('google_accounts').update({ label: label.trim() || null }).eq('id', id)
  fail(error)
}

export async function touchGoogleAccount(id: string) {
  await supabase.from('google_accounts').update({ last_used_at: new Date().toISOString() }).eq('id', id)
}

export async function setDefaultGoogleAccount(id: string) {
  const { error } = await supabase.rpc('set_default_google_account', { p_id: id })
  fail(error)
}

export async function removeGoogleAccount(id: string) {
  const { error } = await supabase.from('google_accounts').delete().eq('id', id)
  fail(error)
}
