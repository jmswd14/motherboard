import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

console.log('[send-notification] SUPABASE_URL:', SUPABASE_URL ? SUPABASE_URL.slice(0, 10) + '...' : 'MISSING')
console.log('[send-notification] SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY.slice(0, 10) + '...' : 'MISSING')
console.log('[send-notification] RESEND_API_KEY:', RESEND_API_KEY ? RESEND_API_KEY.slice(0, 10) + '...' : 'MISSING')

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildEmailHtml(display_name: string | null, body: string, items: string[] | null): string {
  let html = `<div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;color:#e0e0e0;background:#1a1a1a;padding:32px;border-radius:8px;">`
  if (display_name) {
    html += `<p style="margin:0 0 16px;font-size:15px;">Hi ${escapeHtml(display_name)},</p>`
  }
  html += `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">${body}</p>`
  if (items && items.length > 0) {
    html += `<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.8;">`
    for (const item of items) {
      html += `<li>${escapeHtml(item)}</li>`
    }
    html += `</ul>`
  }
  html += `<p style="margin:24px 0 0;font-size:12px;color:#666;border-top:1px solid #333;padding-top:16px;">Sent by <a href="https://jameswood.github.io/vanguard" style="color:#E8D5B0;text-decoration:none;">Vanguard</a></p>`
  html += `</div>`
  return html
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { to, subject, body, user_id, type, link, items, display_name } = await req.json()

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, subject, body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const emailHtml = buildEmailHtml(display_name ?? null, body, items ?? null)

    // ── Send email via Resend ────────────────────────────────────────────────
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Vanguard <notifications@resend.dev>',
        to: [to],
        subject,
        html: emailHtml,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[send-notification] Resend error:', JSON.stringify(data))
      return new Response(JSON.stringify({ error: data }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('[send-notification] Email sent, id:', data.id)

    // ── Write in-app notification row ────────────────────────────────────────
    let dbError: string | null = null

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      dbError = 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var is missing — skipping DB insert'
      console.error('[send-notification]', dbError)
    } else if (!user_id) {
      console.log('[send-notification] No user_id provided — skipping DB insert')
    } else {
      // Build a plain-text message from items if available, otherwise strip HTML from body
      const message = items && items.length > 0
        ? items.join(', ')
        : htmlToPlainText(body)

      const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          user_id,
          type:    type || 'system',
          title:   subject,
          message,
          read:    false,
          link:    link || null,
        }),
      })

      if (!dbRes.ok) {
        const dbBody = await dbRes.text()
        dbError = `DB insert failed (${dbRes.status}): ${dbBody}`
        console.error('[send-notification]', dbError)
      } else {
        console.log('[send-notification] In-app notification written for user_id:', user_id)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      email_id: data.id,
      ...(dbError ? { db_error: dbError } : {}),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[send-notification] Unhandled error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
