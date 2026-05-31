// supabase/functions/data-rights/index.ts
// LGPD — Direitos do titular de dados.
// Requer JWT válido. Atua SEMPRE sobre o usuário autenticado — nunca por parâmetro externo.
// action=export  : exporta todos os dados pessoais do usuário
// action=correct : corrige nome e email de recuperação
// action=delete  : anonimiza os dados (soft-delete LGPD)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL     = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return json({ error: "server_misconfigured" }, 500);
  }

  // 1. Validar JWT do chamador
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  const userId = userData.user.id; // sempre o usuário autenticado

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2. Parse body
  let body: { action?: unknown; name?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }

  const action = body.action;
  if (!action || typeof action !== "string") return json({ error: "invalid_body" }, 400);

  // ── action=export ────────────────────────────────────────────────────────────
  if (action === "export") {
    const [profileRes, adminLogsRes, auditLogsRes] = await Promise.all([
      admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      admin.from("admin_logs").select("*").eq("admin_id", userId).order("created_at", { ascending: false }).limit(500),
      admin.from("audit_log").select("*").eq("actor_id", userId).order("created_at", { ascending: false }).limit(500),
    ]);

    return json({
      exported_at: new Date().toISOString(),
      user_id:     userId,
      profile:     profileRes.data,
      admin_logs:  adminLogsRes.data ?? [],
      audit_log:   auditLogsRes.data ?? [],
    });
  }

  // ── action=correct ───────────────────────────────────────────────────────────
  if (action === "correct") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.name === "string" && body.name.trim()) {
      patch.full_name = body.name.trim();
    }
    if (typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      patch.recovery_email = body.email.trim().toLowerCase();
    }

    if (Object.keys(patch).length === 1) return json({ error: "no_valid_fields" }, 400);

    const { error } = await admin.from("profiles").update(patch).eq("id", userId);
    if (error) return json({ error: "update_failed" }, 500);

    await admin.from("audit_log").insert({
      actor_id: userId, event: "profile_corrected", resource_type: "profile",
      resource_id: userId, metadata: { fields: Object.keys(patch).filter(k => k !== "updated_at") },
    }).catch(() => {});

    return json({ ok: true });
  }

  // ── action=delete (anonimização LGPD) ────────────────────────────────────────
  if (action === "delete") {
    const anonEmail = `${crypto.randomUUID()}@deleted.hubm`;

    // Gerar hash aleatório para substituir cpf_hash
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    const anonCpfHash = Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");

    const { error } = await admin.from("profiles").update({
      full_name:      "Usuário removido",
      display_name:   null,
      recovery_email: anonEmail,
      cpf_hash:       anonCpfHash,
      cellphone:      null,
      avatar_url:     null,
      deactivated_at: new Date().toISOString(),
      active:         false,
      updated_at:     new Date().toISOString(),
    }).eq("id", userId);

    if (error) return json({ error: "anonymization_failed" }, 500);

    await admin.from("audit_log").insert({
      actor_id: userId, event: "profile_anonymized", resource_type: "profile",
      resource_id: userId, metadata: { reason: "lgpd_delete_request" },
    }).catch(() => {});

    return json({ ok: true });
  }

  return json({ error: "invalid_action" }, 400);
});
