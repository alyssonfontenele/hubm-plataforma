import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://0b4d1d38-4694-42e7-a64f-93f49bb14bbe.lovableproject.com',
  'https://hubmowig.vercel.app',
  'https://hubm.mowig.ind.br',
]

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
})

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || ''

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('global_role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.global_role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Acesso negado' }),
        { status: 403, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    const { user_id } = await req.json()

    // Anonimiza o perfil (preserva linha para LGPD)
    // cpf_hash preservado para permitir resgate por CPF
    // recovery_email preservado para identificação
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: 'Usuário removido',
        auth_type: 'google',
        avatar_url: null,
        active: false,
        deleted_at: new Date().toISOString()
      })
      .eq('id', user_id)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Falha ao anonimizar perfil: ' + updateError.message }),
        { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Deleta fisicamente do Auth (foreign key faz set null nos logs automaticamente)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id)

    if (deleteError) {
      return new Response(
        JSON.stringify({ error: 'Falha ao deletar do Auth: ' + deleteError.message }),
        { status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }
})