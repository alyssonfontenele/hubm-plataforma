// supabase/functions/admin-reactivate-user/index.ts
// Admin-only function to reactivate a profile that was merely inactivated
// (deleted_at/deactivated_at set), never one that was irreversibly deleted
// (anonymized_at set) — personal data for those is already gone for good.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, origin, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error("admin-reactivate-user: missing env vars");
    return json({ error: "server_misconfigured" }, origin, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autorizado" }, origin, 401);

  // 1) Validate caller
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Não autorizado" }, origin, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 2) Validate admin role
  const { data: callerProfile, error: callerErr } = await admin
    .from("profiles")
    .select("global_role, company_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerErr || callerProfile?.global_role !== "admin") {
    return json({ error: "Acesso negado" }, origin, 403);
  }

  // 3) Input
  let body: { user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requisição inválida" }, origin, 400);
  }
  const userId = body.user_id;
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: "Requisição inválida" }, origin, 400);
  }

  // 4) Find target profile (mesma empresa do admin)
  const { data: target, error: findErr } = await admin
    .from("profiles")
    .select("id, anonymized_at")
    .eq("id", userId)
    .eq("company_id", callerProfile.company_id)
    .maybeSingle();

  if (findErr) {
    console.error("admin-reactivate-user: find error", findErr);
    return json({ error: "Falha ao buscar usuário" }, origin, 500);
  }
  if (!target) return json({ error: "Usuário não encontrado" }, origin, 404);

  // 5) Exclusão é irreversível — só rejeita quando de fato anonimizado
  if (target.anonymized_at) {
    return json({ error: "Usuário excluído não pode ser reativado." }, origin, 400);
  }

  // 6) Reativa (dados pessoais nunca foram apagados nesse caso)
  const { error: updErr } = await admin
    .from("profiles")
    .update({ active: true, deleted_at: null, deactivated_at: null })
    .eq("id", target.id);

  if (updErr) {
    console.error("admin-reactivate-user: update error", updErr);
    return json({ error: "Falha ao reativar usuário" }, origin, 500);
  }

  // 7) Desbane no Auth (no-op seguro se nunca foi banido)
  try {
    await admin.auth.admin.updateUserById(target.id, { ban_duration: "none" });
  } catch (e) {
    console.error("admin-reactivate-user: unban failed", e);
  }

  return json({ success: true, user_id: target.id }, origin);
});
