// supabase/functions/_shared/anonymize-auth-user.ts
// Anonimiza e bane permanentemente um usuário no Auth, sem apagar a linha de
// auth.users: apagar fisicamente cascatearia para profiles -> SET NULL em
// admin_logs/access_logs, o que é bloqueado pelo trigger de imutabilidade dos
// logs (prevent_log_modification). O e-mail pode conter dado pessoal (ex.:
// CPF em <cpf>@hubm.internal) e por isso também é substituído.

// deno-lint-ignore no-explicit-any
type AdminClient = any

const PERMANENT_BAN_DURATION = "876000h";

export async function anonymizeAndBanAuthUser(admin: AdminClient, userId: string) {
  const anonymizedEmail = `deleted-${userId}@invalid.local`
  return admin.auth.admin.updateUserById(userId, {
    email: anonymizedEmail,
    ban_duration: PERMANENT_BAN_DURATION,
  })
}
