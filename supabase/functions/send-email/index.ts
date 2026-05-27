import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://0b4d1d38-4694-42e7-a64f-93f49bb14bbe.lovableproject.com',
  'https://hubm.mowig.ind.br',
]

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
})

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
    const { to, subject, html } = await req.json()
    const brevoKey = Deno.env.get('BREVO_API_KEY')

    const toFormatted = (Array.isArray(to) ? to : [to]).map((recipient: string | { email: string; name?: string }) =>
      typeof recipient === 'string'
        ? { email: recipient, name: recipient }
        : recipient
    )

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'HubMowig', email: 'noreply@mowig.ind.br' },
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
