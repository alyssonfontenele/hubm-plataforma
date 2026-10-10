// supabase/functions/revoke-sessions/index.ts
// Admin-only function to force-logout a user by invalidating every active
// session, without touching their profile. Used by the offboarding flow —
// deactivation stays reversible (deactivated_at); this only kills sessions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { revokeAllSessions } from '../_shared/revoke-sessions.ts'
import { authorizeAdminActionOnTarget } from '../_shared/authz.ts'

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

  const supabaseAdmin = createClient(
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

  // Checagem cross-tenant: só age sobre user_id da mesma empresa do
  // chamador (ou se o chamador for superadmin). Ver _shared/authz.ts.
  const authz = await authorizeAdminActionOnTarget(supabaseAdmin, req, user_id, 'revoke-sessions')
  if (!authz.ok) {
    return new Response(
      JSON.stringify(authz.body),
      { status: authz.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }

  const caller = authz.caller

  let sessionsRevoked = 0
  try {
    sessionsRevoked = await revokeAllSessions(user_id)
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Falha ao revogar sessões: ' + (err as Error).message }),
      { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }

  try {
    await supabaseAdmin.from('admin_logs').insert({
      admin_id:    caller.id,
      action:      'revoke_sessions',
      target_type: 'security_event',
      target_id:   user_id,
      event_type:  'sessions_revoked',
      metadata:    { sessions_revoked: sessionsRevoked },
    });
  } catch { /* silently ignore logging errors */ }

  return new Response(
    JSON.stringify({ success: true, sessions_revoked: sessionsRevoked }),
    { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
  )
})
