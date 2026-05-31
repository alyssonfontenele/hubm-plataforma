import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const rawOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "";
const allowedOrigins = rawOrigins.split(",").map(o => o.trim()).filter(Boolean);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let body: { user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Requisição inválida" }), { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }

  const { user_id } = body;
  if (typeof user_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id)) {
    return new Response(JSON.stringify({ error: "Requisição inválida" }), { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }

  const { error } = await supabase.auth.admin.deleteUser(user_id)

  if (error) return new Response(
    JSON.stringify({ error: error.message }),
    { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
  )

  await supabase.from('admin_logs').insert({
    admin_id:    null,
    action:      'user_deleted',
    target_type: 'security_event',
    target_id:   user_id,
    event_type:  'user_deleted',
    metadata:    {},
  }).catch(() => {});

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
  )
})
