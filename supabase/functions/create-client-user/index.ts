import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function isValidCpf(digits: string): boolean {
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const d = digits.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * (10 - i);
  const r1 = sum % 11;
  const v1 = r1 < 2 ? 0 : 11 - r1;
  if (d[9] !== v1) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += d[i] * (11 - i);
  const r2 = sum % 11;
  const v2 = r2 < 2 ? 0 : 11 - r2;
  return d[10] === v2;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const { full_name, cpf, email, recovery_email, company_id, initial_password } = body

    // CAMADA 2 — Segurança: global_role é SEMPRE 'cliente', nunca aceita override do caller
    const FORCED_ROLE = 'cliente'

    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return new Response(JSON.stringify({ error: "Nome completo é obrigatório" }), {
        status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    // Exatamente um identificador deve ser fornecido
    const hasCpf  = typeof cpf   === 'string' && cpf.trim().length > 0
    const hasEmail = typeof email === 'string' && email.trim().length > 0

    if (!hasCpf && !hasEmail) {
      return new Response(JSON.stringify({ error: "Informe CPF ou e-mail para criar o cliente" }), {
        status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    let authEmail: string
    let authType: 'cpf' | 'email'
    let cpfHash: string | null = null
    let clientRecoveryEmail: string | null = null

    if (hasCpf) {
      // Modo CPF → e-mail fictício <digits>@hubm.internal
      const cpf_digits = cpf.replace(/\D/g, '')
      if (!/^\d{11}$/.test(cpf_digits)) {
        return new Response(JSON.stringify({ error: "CPF inválido" }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }
      if (!isValidCpf(cpf_digits)) {
        return new Response(JSON.stringify({ error: "CPF inválido" }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      // Verificar CPF duplicado
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, cpf_hash, deleted_at')
        .eq('auth_type', 'cpf')
      let existing = null
      for (const p of profiles || []) {
        const { data: isMatch } = await supabase
          .rpc('verify_cpf', { cpf_input: cpf_digits, cpf_hash: p.cpf_hash || '' })
        if (isMatch) { existing = p; break }
      }
      if (existing && !existing.deleted_at) {
        return new Response(JSON.stringify({ error: 'already registered' }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }
      if (existing && existing.deleted_at) {
        return new Response(JSON.stringify({ error: 'user inactive', user_id: existing.id }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      const { data: hashed } = await supabase.rpc('hash_cpf', { cpf_input: cpf_digits })
      cpfHash = hashed
      authEmail = `${cpf_digits}@hubm.internal`
      authType = 'cpf'
      clientRecoveryEmail = typeof recovery_email === 'string' && recovery_email.trim() ? recovery_email.trim().toLowerCase() : null

      if (!clientRecoveryEmail) {
        return new Response(JSON.stringify({ error: "E-mail de recuperação é obrigatório para clientes CPF" }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }
    } else {
      // Modo e-mail real
      const emailClean = email.trim().toLowerCase()
      if (!isValidEmail(emailClean)) {
        return new Response(JSON.stringify({ error: "E-mail inválido" }), {
          status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        })
      }

      // Verificar e-mail duplicado
      const { data: existingByEmail } = await supabase
        .from('profiles')
        .select('id, deleted_at')
        .eq('company_id', company_id)

      // Verificar no auth.users se o email já existe
      const { data: authUser } = await supabase.auth.admin.getUserByEmail(emailClean)
      if (authUser?.user) {
        const existingProfile = (existingByEmail ?? []).find(p => p.id === authUser.user.id)
        if (existingProfile && !existingProfile.deleted_at) {
          return new Response(JSON.stringify({ error: 'already registered' }), {
            status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
          })
        }
        if (existingProfile && existingProfile.deleted_at) {
          return new Response(JSON.stringify({ error: 'user inactive', user_id: existingProfile.id }), {
            status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
          })
        }
      }

      authEmail = emailClean
      authType = 'email'
      clientRecoveryEmail = emailClean
      cpfHash = null
    }

    // Gerar senha temporária
    const _pwBuf = new Uint8Array(6)
    crypto.getRandomValues(_pwBuf)
    const temp_password = initial_password ||
      (Array.from(_pwBuf).map(b => b.toString(36)).join('').slice(0, 8) + 'A1b2')

    // Criar usuário no auth
    const { data: newAuthUser, error: authError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: temp_password,
      email_confirm: true
    })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    // Inserir perfil — global_role é SEMPRE 'cliente', nunca aceita override
    const profilePayload: Record<string, unknown> = {
      id:                   newAuthUser.user.id,
      company_id,
      full_name:            full_name.trim(),
      auth_type:            authType,
      global_role:          FORCED_ROLE,
      active:               true,
      must_change_password: true,
      recovery_email:       clientRecoveryEmail,
    }
    if (cpfHash !== null) {
      profilePayload.cpf_hash = cpfHash
    }

    const { error: profileError } = await supabase.from('profiles').insert(profilePayload)

    if (profileError) {
      console.error("[create-client-user] profile insert failed:", profileError.message, profileError.details, profileError.hint, profileError.code)
      await supabase.auth.admin.deleteUser(newAuthUser.user.id)
      return new Response(JSON.stringify({ error: profileError.message, details: profileError.details, hint: profileError.hint, code: profileError.code }), {
        status: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }

    // Enviar e-mail de boas-vindas (se houver recovery_email)
    if (clientRecoveryEmail) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const internalSecret = Deno.env.get('INTERNAL_SECRET')!
      const identifier = hasCpf ? `CPF: ${cpf}` : `E-mail: ${authEmail}`

      await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('ANON_KEY_JWT') ?? ''}`,
          'apikey': Deno.env.get('ANON_KEY_JWT') ?? '',
          'x-internal-secret': internalSecret,
        },
        body: JSON.stringify({
          to: clientRecoveryEmail,
          subject: 'Seu acesso ao portal do cliente está pronto',
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
              <h2 style="font-size: 20px; font-weight: 600; color: #111;">Olá, ${full_name.trim()}!</h2>
              <p style="color: #444; line-height: 1.6;">
                Seu acesso ao portal do cliente foi criado. Use as informações abaixo para entrar:
              </p>
              <div style="background: #f7f7f7; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <p style="margin: 0 0 8px; color: #111;"><strong>${identifier}</strong></p>
                <p style="margin: 0; color: #111;"><strong>Senha inicial:</strong> ${temp_password}</p>
              </div>
              <p style="color: #444; line-height: 1.6;">
                No primeiro acesso você será solicitado a definir uma nova senha pessoal.
              </p>
              <a href="${Deno.env.get('SITE_URL') ?? 'https://hubm.mowig.ind.br'}/login"
                 style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #111; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 500;">
                Acessar o portal
              </a>
              <p style="margin-top: 32px; font-size: 12px; color: #999;">
                Se você não solicitou este acesso, ignore este e-mail.
              </p>
            </div>
          `
        }),
      }).catch(() => undefined) // Email failure never blocks the main flow
    }

    try {
      await supabase.from('admin_logs').insert({
        admin_id:    null,
        action:      'user_created',
        target_type: 'client',
        target_id:   newAuthUser.user.id,
        target_name: full_name.trim() ?? null,
        details:     { company_id, global_role: FORCED_ROLE, auth_type: authType },
      })
    } catch { /* silently ignore logging errors */ }

    return new Response(
      JSON.stringify({ success: true, user_id: newAuthUser.user.id }),
      { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } }
    )
  }
})
