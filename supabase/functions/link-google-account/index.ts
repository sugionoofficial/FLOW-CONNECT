// Edge Function: link-google-account
// Memverifikasi access token Google (dari Google Identity Services di browser)
// langsung ke Google, lalu menyimpan akun sebagai "terverifikasi".
// Klien tidak bisa menandai akun terverifikasi sendiri (dicegah RLS + trigger).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1) user FLOW CONNECT yang sedang login
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'not_authenticated' }, 401)
    const userId = userData.user.id

    const { access_token } = await req.json().catch(() => ({}))
    if (!access_token || typeof access_token !== 'string') return json({ error: 'missing_token' }, 400)

    // 2) verifikasi token ke Google
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(access_token)}`)
    if (!infoRes.ok) return json({ error: 'invalid_google_token' }, 400)
    const info = await infoRes.json()
    const expectedAud = Deno.env.get('GOOGLE_CLIENT_ID')
    if (expectedAud && info.aud !== expectedAud && info.azp !== expectedAud) {
      return json({ error: 'token_audience_mismatch' }, 400)
    }
    if (!info.email || String(info.email_verified) !== 'true') return json({ error: 'email_not_verified' }, 400)

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const profile = profileRes.ok ? await profileRes.json() : {}
    const email = String(info.email).toLowerCase()

    // 3) simpan (service role melewati batasan "verified")
    const admin = createClient(url, serviceKey)
    const fields = {
      display_name: profile.name ?? null,
      avatar_url: profile.picture ?? null,
      verified: true,
    }
    const { data: existing } = await admin
      .from('google_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('email', email)
      .maybeSingle()

    const result = existing
      ? await admin.from('google_accounts').update(fields).eq('id', existing.id).select().single()
      : await admin.from('google_accounts').insert({ user_id: userId, email, ...fields }).select().single()

    if (result.error) {
      const msg = result.error.message.includes('account_limit') ? 'account_limit' : result.error.message
      return json({ error: msg }, 400)
    }
    return json({ account: result.data, updated: !!existing })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
