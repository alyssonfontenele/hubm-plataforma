// supabase/functions/resend-access/index.ts
// Admin-only function to resend access email to a CPF user.
// Requires JWT auth + global_role='admin'. Calls send-email internally
// with x-internal-secret so the public send-email function stays locked down.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const INTERNAL_SECRET = Deno.env.get("INTERNAL_SECRET");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY || !INTERNAL_SECRET) {
    console.error("resend-access: missing env vars");
    return json({ error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  // 1) Validate caller
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 2) Validate admin role
  const { data: callerProfile, error: callerErr } = await admin
    .from("profiles")
    .select("global_role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerErr || callerProfile?.global_role !== "admin") {
    return json({ error: "forbidden" }, 403);
  }

  // 3) Input
  let body: { profile_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const profileId = body.profile_id;
  if (!profileId || typeof profileId !== "string") {
    return json({ error: "invalid_body" }, 400);
  }

  // 4) Fetch target profile
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("full_name, recovery_email, cpf_hash")
    .eq("id", profileId)
    .maybeSingle();
  if (profErr || !profile) return json({ error: "not_found" }, 404);

  // 5) Recovery email required
  if (!profile.recovery_email) return json({ error: "no_recovery_email" }, 400);

  // 6) Build email and call send-email internally
  const cpfDisplay = profile.cpf_hash ?? "—";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111111;">
      <h1 style="font-size: 22px; font-weight: 600; margin: 0 0 16px;">Olá, ${profile.full_name}</h1>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Seu acesso ao HubM está disponível. Use as informações abaixo para entrar.
      </p>
      <div style="border: 1px solid #e5e5e5; padding: 16px; margin: 16px 0;">
        <p style="font-size: 13px; margin: 0 0 8px; color: #555555;">CPF de acesso</p>
        <p style="font-size: 16px; font-weight: 600; margin: 0; letter-spacing: 0.5px;">${cpfDisplay}</p>
      </div>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Entre com seu CPF e a senha atual. Caso não lembre da senha, utilize a opção
        "Esqueci minha senha" na tela de login para redefini-la.
      </p>
      <p style="font-size: 12px; color: #888888; margin: 24px 0 0;">
        Este é um e-mail automático. Se você não solicitou este acesso, ignore esta mensagem.
      </p>
    </div>
  `;

  const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify({
      to: profile.recovery_email,
      subject: "Seu acesso ao HubM",
      html,
    }),
  });

  if (!sendRes.ok) {
    const text = await sendRes.text().catch(() => "");
    console.error("resend-access: send-email failed", sendRes.status, text);
    return json({ error: "send_failed" }, 502);
  }

  return json({ ok: true });
});
