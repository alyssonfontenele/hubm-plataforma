// supabase/functions/_shared/authz.ts
// Checagem compartilhada de autorização para Edge Functions administrativas
// que agem sobre um user_id alvo (admin-update-password, delete-user,
// revoke-sessions). Corrige achado de auditoria: essas funções validavam
// apenas "chamador é admin", sem comparar o company_id do chamador com o do
// alvo — permitindo IDOR cross-tenant (um admin da empresa X agindo sobre
// usuário da empresa Y). Ver auditoria/2026-10-10-seguranca-hubm.md, itens 1/3/4.
//
// Regras (nessa ordem):
//   1. Token do chamador válido (401 se ausente/inválido).
//   2. Chamador é superadmin (app_metadata.global_role no JWT — fonte que o
//      próprio usuário não pode editar, igual a auth_is_superadmin() em SQL —
//      ou profiles.global_role, caso o JWT ainda não tenha sido reemitido
//      após uma promoção) OU admin ativo da própria empresa (403 caso
//      contrário).
//   3. Alvo existe. Se não existir: 404 para superadmin (não há tenant a
//      esconder), 403 genérico para admin de empresa (não revela se o alvo
//      existe em outra empresa).
//   4. Alvo é superadmin e chamador não é -> 403 genérico (ninguém além de
//      outro superadmin age sobre um superadmin).
//   5. Alvo pertence a empresa diferente da do chamador (quando chamador não
//      é superadmin) -> 403 genérico.
//
// Toda negação é logada (console.warn, JSON estruturado) com função, id do
// chamador, id do alvo e motivo — nunca com texto exposto na resposta HTTP.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

const GENERIC_FORBIDDEN = "Acesso negado";

interface CallerProfile {
  id: string;
  company_id: string | null;
  global_role: string | null;
  active: boolean | null;
}

interface TargetProfile {
  id: string;
  company_id: string | null;
  global_role: string | null;
}

export interface AuthzOk {
  ok: true;
  caller: CallerProfile & { isSuperadmin: boolean };
  target: TargetProfile;
}

export interface AuthzDenied {
  ok: false;
  status: 401 | 403 | 404;
  body: { error: string };
}

function logDenial(fn: string, reason: string, callerId: string | null, targetId: string | null) {
  console.warn(JSON.stringify({
    event: "authz_denied",
    function: fn,
    caller_id: callerId,
    target_id: targetId,
    reason,
  }));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Valida o chamador (JWT) e exige que ele possa agir sobre `targetUserId`:
 * superadmin, ou admin ativo da mesma empresa do alvo. `admin` deve ser um
 * client criado com a service_role key (necessário para ler profiles sem
 * depender da RLS do chamador).
 */
export async function authorizeAdminActionOnTarget(
  admin: AdminClient,
  req: Request,
  targetUserId: unknown,
  fnName: string,
): Promise<AuthzOk | AuthzDenied> {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    logDenial(fnName, "missing_token", null, isUuid(targetUserId) ? targetUserId : null);
    return { ok: false, status: 401, body: { error: "Não autorizado" } };
  }

  const { data: userData, error: authError } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (authError || !caller) {
    logDenial(fnName, "invalid_token", null, isUuid(targetUserId) ? targetUserId : null);
    return { ok: false, status: 401, body: { error: "Não autorizado" } };
  }

  if (!isUuid(targetUserId)) {
    logDenial(fnName, "invalid_target_id", caller.id, null);
    return { ok: false, status: 403, body: { error: GENERIC_FORBIDDEN } };
  }

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("id, company_id, global_role, active")
    .eq("id", caller.id)
    .maybeSingle<CallerProfile>();

  const isSuperadmin =
    caller.app_metadata?.global_role === "superadmin" ||
    callerProfile?.global_role === "superadmin";

  const isActiveCompanyAdmin =
    callerProfile?.global_role === "admin" && callerProfile?.active === true;

  if (!isSuperadmin && !isActiveCompanyAdmin) {
    logDenial(fnName, "caller_not_admin", caller.id, targetUserId);
    return { ok: false, status: 403, body: { error: GENERIC_FORBIDDEN } };
  }

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("id, company_id, global_role")
    .eq("id", targetUserId)
    .maybeSingle<TargetProfile>();

  if (!targetProfile) {
    if (isSuperadmin) {
      return { ok: false, status: 404, body: { error: "Usuário não encontrado" } };
    }
    logDenial(fnName, "target_not_found", caller.id, targetUserId);
    return { ok: false, status: 403, body: { error: GENERIC_FORBIDDEN } };
  }

  if (targetProfile.global_role === "superadmin" && !isSuperadmin) {
    logDenial(fnName, "target_is_superadmin", caller.id, targetUserId);
    return { ok: false, status: 403, body: { error: GENERIC_FORBIDDEN } };
  }

  if (!isSuperadmin && targetProfile.company_id !== callerProfile?.company_id) {
    logDenial(fnName, "cross_tenant", caller.id, targetUserId);
    return { ok: false, status: 403, body: { error: GENERIC_FORBIDDEN } };
  }

  return {
    ok: true,
    caller: {
      id: caller.id,
      company_id: callerProfile?.company_id ?? null,
      global_role: callerProfile?.global_role ?? null,
      active: callerProfile?.active ?? null,
      isSuperadmin,
    },
    target: targetProfile,
  };
}
