import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verificar JWT do chamador
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se o chamador é admin
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('global_role, active')
      .eq('id', user.id)
      .single()

    if (callerProfile?.global_role !== 'admin' || !callerProfile?.active) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { user_id, new_password } = await req.json()

    // Validar força da senha no backend
    const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/
    if (!passwordRegex.test(new_password)) {
      return new Response(
        JSON.stringify({ error: 'Senha fraca. Mínimo 8 caracteres, 1 maiúscula e 1 número.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Atualizar senha
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password
    })

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Força troca de senha no próximo login
    await supabaseAdmin
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', user_id)

    // Invalida todas as sessões ativas do usuário
    await supabaseAdmin.auth.admin.signOut(user_id, 'others')

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})