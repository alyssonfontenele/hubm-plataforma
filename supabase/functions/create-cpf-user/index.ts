import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { full_name, cpf, recovery_email, cellphone, company_id, global_role, initial_password } = await req.json()

    const cpf_digits = cpf.replace(/\D/g, '')
    const email = `${cpf_digits}@hubm.internal`
    const temp_password = initial_password || (Math.random().toString(36).slice(-8) + 'A1b2')

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, cpf_hash, deleted_at')
      .eq('auth_type', 'cpf')

    let existingProfile = null
    for (const profile of profiles || []) {
      const { data: isMatch } = await supabase
        .rpc('verify_cpf', { cpf_input: cpf_digits, cpf_hash: profile.cpf_hash || '' })
      if (isMatch) { existingProfile = profile; break }
    }

    if (existingProfile && !existingProfile.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'already registered' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (existingProfile && existingProfile.deleted_at) {
      return new Response(
        JSON.stringify({ error: 'user inactive', user_id: existingProfile.id }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const cellphone_digits = cellphone ? cellphone.replace(/\D/g, '') : null

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: temp_password,
      email_confirm: true
    })

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: cpf_hashed } = await supabase.rpc('hash_cpf', { cpf_input: cpf_digits })

    console.log("[create-cpf-user] inserting profile:", JSON.stringify({ id: authUser.user.id, company_id, global_role, cpf_hashed_is_null: cpf_hashed === null || cpf_hashed === undefined }));

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authUser.user.id,
      company_id,
      full_name,
      auth_type: 'cpf',
      cpf_hash: cpf_hashed,
      recovery_email,
      cellphone: cellphone_digits,
      global_role: global_role || 'member',
      active: true,
      must_change_password: true
    })

    if (profileError) {
      console.error("[create-cpf-user] profile insert failed:", profileError.message, profileError.details, profileError.hint, profileError.code);
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return new Response(
        JSON.stringify({ error: profileError.message, details: profileError.details, hint: profileError.hint, code: profileError.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const internalSecret = Deno.env.get('INTERNAL_SECRET')!

    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('ANON_KEY_JWT') ?? ''}`,
        'apikey': Deno.env.get('ANON_KEY_JWT') ?? '',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({
        to: recovery_email,
        subject: 'Seu acesso ao HubM está pronto',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="font-size: 20px; font-weight: 600; color: #111;">Olá, ${full_name}!</h2>
            <p style="color: #444; line-height: 1.6;">
              Seu acesso ao <strong>HubM</strong> foi criado. Use as informações abaixo para entrar:
            </p>
            <div style="background: #f7f7f7; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; color: #111;"><strong>CPF:</strong> ${cpf}</p>
              <p style="margin: 0; color: #111;"><strong>Senha inicial:</strong> ${temp_password}</p>
            </div>
            <p style="color: #444; line-height: 1.6;">
              No primeiro acesso você será solicitado a definir uma nova senha pessoal.
            </p>
            <a href="${Deno.env.get('SITE_URL') ?? 'https://hubm.mowig.ind.br'}/login"
               style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #111; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 500;">
              Acessar o HubM
            </a>
            <p style="margin-top: 32px; font-size: 12px; color: #999;">
              Se você não solicitou este acesso, ignore este e-mail.
            </p>
          </div>
        `
      }),
    })

    return new Response(
      JSON.stringify({ success: true, user_id: authUser.user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
