import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
})

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || ''
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    // Verificar JWT do usuário
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
    }

    const { action, provider_token, payload } = await req.json()

    let result
    switch (action) {
      case 'list_events':
        const { timeMin, timeMax } = payload
        const eventsRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${provider_token}` } }
        )
        result = await eventsRes.json()
        break

      case 'create_event':
        const createRes = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${provider_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload.event)
          }
        )
        result = await createRes.json()
        break

      default:
        return new Response(JSON.stringify({ error: 'Action not supported' }),
          { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})