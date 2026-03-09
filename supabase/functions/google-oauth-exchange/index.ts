import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code, redirect_uri } = await req.json()

    // Exchange auth code for tokens with Google
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        redirect_uri,
        grant_type: 'authorization_code',
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      }),
    })

    const data = await resp.json()

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: data.error_description || 'Token exchange failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Store tokens in Supabase using the user's JWT
    const authHeader = req.headers.get('authorization')
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { authorization: authHeader } } }
      )
      const { data: { user } } = await userClient.auth.getUser()

      if (user) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
        const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
        console.log(`[oauth-exchange] Saving tokens for user ${user.id}. refresh_token present: ${!!data.refresh_token}`)

        // Check if a row already exists so we can preserve the existing refresh_token if needed
        const { data: existing } = await supabase
          .from('google_tokens')
          .select('refresh_token')
          .eq('user_id', user.id)
          .maybeSingle()

        const refreshToken = data.refresh_token || existing?.refresh_token || null
        console.log(`[oauth-exchange] Using refresh_token from: ${data.refresh_token ? 'Google response' : existing?.refresh_token ? 'existing DB row' : 'none available'}`)

        const upsertPayload: Record<string, string | null> = {
          user_id: user.id,
          access_token: data.access_token,
          expires_at: expiresAt,
        }
        if (refreshToken) upsertPayload.refresh_token = refreshToken

        const { error: upsertError } = await supabase
          .from('google_tokens')
          .upsert(upsertPayload, { onConflict: 'user_id' })

        if (upsertError) {
          console.error('[oauth-exchange] Upsert error:', upsertError)
        } else {
          console.log('[oauth-exchange] Upsert succeeded')
        }
      }
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
