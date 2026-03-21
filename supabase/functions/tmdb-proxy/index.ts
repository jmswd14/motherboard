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

    // Optional path override (default: 3/discover/movie)
    const path = url.searchParams.get('tmdb_path') ?? '3/discover/movie'

    // Forward all params except 'tmdb_path', add api_key server-side
    const params = new URLSearchParams(url.searchParams)
    params.delete('tmdb_path')
    params.set('api_key', Deno.env.get('TMDB_API_KEY') ?? '')

    const tmdbUrl = `https://api.themoviedb.org/${path}?${params.toString()}`
    const res = await fetch(tmdbUrl)
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
