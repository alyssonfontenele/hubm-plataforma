import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { revokeAllSessions } from '../_shared/revoke-sessions.ts'
import { authorizeAdminActionOnTarget } from '../_shared/authz.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { user_id, new_password } = await req.json()

    // Checagem cross-tenant: só age sobre user_id da mesma empresa do
    // chamador (ou se o chamador for superadmin). Ver _shared/authz.ts.
    const authz = await authorizeAdminActionOnTarget(supabaseAdmin, req, user_id, 'admin-update-password')
    if (!authz.ok) {
      return new Response(
        JSON.stringify(authz.body),
        { status: authz.status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Validar força da senha no backend
    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/
    if (!passwordRegex.test(new_password)) {
      return new Response(
        JSON.stringify({ error: 'Senha fraca. Mínimo 8 caracteres, 1 maiúscula e 1 número.' }),
        { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Atualizar senha
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password
    })

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Força troca de senha no próximo login
    await supabaseAdmin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', user_id)

    // Invalida todas as sessões ativas do usuário (signOut(user_id, ...) do SDK
    // espera um JWT, não um user_id — nunca revogava nada de fato)
    let sessionsRevoked = 0
    try {
      sessionsRevoked = await revokeAllSessions(user_id)
    } catch (err) {
      console.error('admin-update-password: revoke sessions failed', err)
    }

    return new Response(
      JSON.stringify({ success: true, sessions_revoked: sessionsRevoked }),
      { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }
})