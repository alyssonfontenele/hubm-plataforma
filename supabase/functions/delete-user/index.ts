import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { anonymizeAndBanAuthUser } from '../_shared/anonymize-auth-user.ts'

const rawOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "";
const allowedOrigins = rawOrigins.split(",").map(o => o.trim()).filter(Boolean);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Placeholder usado para marcar um perfil como excluído. admin-reactivate-user
// e a UI usam esse mesmo valor para identificar perfis irreversivelmente excluídos.
const DELETED_USER_PLACEHOLDER_NAME = "Usuário excluído";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Valida o chamador (JWT) e exige perfil admin
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)

  if (authError || !caller) {
    return new Response(
      JSON.stringify({ error: 'Não autorizado' }),
      { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('global_role')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.global_role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Acesso negado' }),
      { status: 403, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }

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

  // Anonimização total e irreversível: apaga todo dado pessoal do perfil e
  // preserva apenas a linha (referenciada por admin_logs/access_logs, que são
  // imutáveis). anonymized_at (não deleted_at) marca essa irreversibilidade —
  // deleted_at é só inativação reversível. Não há caminho de volta —
  // admin-reactivate-user rejeita perfis com anonymized_at preenchido.
  const { data: updatedProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      full_name: DELETED_USER_PLACEHOLDER_NAME,
      display_name: null,
      avatar_url: null,
      cpf_hash: null,
      recovery_email: null,
      cellphone: null,
      active: false,
      anonymized_at: new Date().toISOString(),
    })
    .eq('id', user_id)
    .select('id')
    .maybeSingle()

  if (profileError) {
    return new Response(
      JSON.stringify({ error: 'Falha ao anonimizar perfil: ' + profileError.message }),
      { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }

  if (!updatedProfile) {
    return new Response(
      JSON.stringify({ error: 'Usuário não encontrado' }),
      { status: 404, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }

  // Anonimiza o e-mail no Auth (pode conter o CPF, ex.: 39053344705@hubm.internal)
  // e bane permanentemente, em vez de apagar a linha.
  const { error: authUpdateError } = await anonymizeAndBanAuthUser(supabaseAdmin, user_id)

  if (authUpdateError) {
    return new Response(
      JSON.stringify({ error: 'Falha ao revogar acesso: ' + authUpdateError.message }),
      { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }

  try {
    await supabaseAdmin.from('admin_logs').insert({
      admin_id:    caller.id,
      action:      'user_deleted',
      target_type: 'security_event',
      target_id:   user_id,
      event_type:  'user_deleted',
      metadata:    {},
    });
  } catch { /* silently ignore logging errors */ }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
  )
})
