import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const rawOrigins = Deno.env.get('ALLOWED_ORIGINS') ?? '';
const ALLOWED_ORIGINS = rawOrigins.split(',').map(o => o.trim()).filter(Boolean);

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '*'),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
});

const RATE_LIMIT_MAX    = 5;
const RATE_LIMIT_WINDOW = 60; // minutes

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || ''

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  const internalSecret = req.headers.get('x-internal-secret')
  const expectedSecret = Deno.env.get('INTERNAL_SECRET')

  if (internalSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      }
    )
  }

  try {
    const { to, subject, html, sender_name, sender_email } = await req.json()
    const brevoKey = Deno.env.get('BREVO_API_KEY')

    const toFormatted: { email: string; name: string }[] =
      (Array.isArray(to) ? to : [to]).map((recipient: string | { email: string; name?: string }) =>
        typeof recipient === 'string'
          ? { email: recipient, name: recipient }
          : { email: recipient.email, name: recipient.name ?? recipient.email }
      )

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')!,
    )

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW * 60 * 1000).toISOString()

    for (const recipient of toFormatted) {
      const { count, error: countErr } = await supabase
        .from('email_rate_limits')
        .select('*', { count: 'exact', head: true })
        .eq('email', recipient.email)
        .gte('sent_at', windowStart)

      if (countErr) {
        return new Response(
          JSON.stringify({ error: 'rate_limit_check_failed', detail: countErr.message }),
          { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        )
      }

      if ((count ?? 0) >= RATE_LIMIT_MAX) {
        return new Response(
          JSON.stringify({ error: 'rate_limit_exceeded', email: recipient.email }),
          { status: 429, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
        )
      }
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: sender_name ?? 'HubM',
          email: sender_email ?? Deno.env.get('SITE_SENDER_EMAIL') ?? 'noreply@hubm.internal',
        },
        to: toFormatted,
        subject,
        htmlContent: html,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data }),
        { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Record sends only after confirmed delivery
    const records = toFormatted.map(r => ({ email: r.email }))
    await supabase.from('email_rate_limits').insert(records)

    return new Response(
      JSON.stringify({ success: true, messageId: data.messageId }),
      { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }
})
