import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const endpoint = url.searchParams.get('endpoint')

    if (!endpoint) {
      return new Response(JSON.stringify({ error: 'Missing endpoint param' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build Finnhub URL — forward all params except 'endpoint', add token server-side
    const params = new URLSearchParams(url.searchParams)
    params.delete('endpoint')
    params.set('token', Deno.env.get('FINNHUB_KEY') ?? '')

    const finnhubUrl = `https://finnhub.io/api/v1/${endpoint}?${params.toString()}`
    const res = await fetch(finnhubUrl)
    const data = await res.json()

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
