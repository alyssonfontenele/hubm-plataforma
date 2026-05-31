// supabase/functions/recover-cpf-password/index.ts
// Public endpoint — no auth required.
// Accepts { cpf } (formatted or digits-only), looks up the profile's
// recovery_email, generates a Supabase password-recovery link, and
// sends it via the internal send-email function.
// Always returns { ok: true } — never reveals whether the CPF exists.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const rawOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "";
const allowedOrigins = rawOrigins.split(",").map(o => o.trim()).filter(Boolean);

const RATE_LIMIT_MAX      = 5;
const RATE_LIMIT_LOCKOUT  = 15; // minutes

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
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

  const SUPABASE_URL      = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY  = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const INTERNAL_SECRET   = Deno.env.get("INTERNAL_SECRET");
  const SITE_URL          = Deno.env.get("SITE_URL") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !INTERNAL_SECRET || !SITE_URL) {
    console.error("recover-cpf-password: missing env vars");
    return json({ ok: true });
  }

  let body: { cpf?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: true });
  }

  const cpfDigits = String(body.cpf ?? "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(cpfDigits)) return json({ ok: true });
  if (/^(\d)\1{10}$/.test(cpfDigits)) return json({ ok: true });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Rate limiting ──────────────────────────────────────────────────────────
  // Use SHA-256 of cpfDigits as the key — never stores the raw CPF.
  const cpfKey = await sha256hex(cpfDigits);

  // 1. Check active lockout
  const { data: lockRow } = await admin
    .from("auth_rate_limits")
    .select("locked_until, attempts")
    .eq("cpf_hash", cpfKey)
    .maybeSingle();

  if (lockRow?.locked_until && new Date(lockRow.locked_until) > new Date()) {
    return json({ ok: true }); // silently blocked — never reveal lockout to caller
  }

  // 2. Increment attempt counter (upsert)
  const newAttempts = (lockRow?.attempts ?? 0) + 1;
  const newLockedUntil = newAttempts >= RATE_LIMIT_MAX
    ? new Date(Date.now() + RATE_LIMIT_LOCKOUT * 60 * 1000).toISOString()
    : null;

  await admin.from("auth_rate_limits").upsert(
    {
      cpf_hash:        cpfKey,
      attempts:        newAttempts,
      last_attempt_at: new Date().toISOString(),
      locked_until:    newLockedUntil,
    },
    { onConflict: "cpf_hash" }
  );
  // ──────────────────────────────────────────────────────────────────────────

  let emailSent = false;

  try {
    // 1. Look up profile by CPF (bcrypt comparison via RPC)
    const { data: profileData } = await admin
      .rpc("find_profile_by_cpf", { cpf_digits: cpfDigits })
      .maybeSingle();

    const profile = profileData as { full_name: string | null; recovery_email: string | null; company_id: string | null } | null;
    console.log("recover-cpf-password: profile lookup", JSON.stringify({ found: !!profile, hasEmail: !!profile?.recovery_email }));

    if (!profile?.recovery_email) return json({ ok: true });

    // 2. Fetch company sender info
    let senderName: string | undefined;
    let senderEmail: string | undefined;
    if (profile.company_id) {
      const { data: company } = await admin
        .from("companies")
        .select("name, email_sender")
        .eq("id", profile.company_id)
        .maybeSingle();
      senderName = company?.name ?? undefined;
      senderEmail = company?.email_sender ?? undefined;
    }

    // 3. Generate recovery link
    const authEmail = `${cpfDigits}@hubm.internal`;
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: authEmail,
      options: { redirectTo: `${SITE_URL}/auth/callback` },
    });

    console.log("recover-cpf-password: generateLink", JSON.stringify({ ok: !linkErr, error: linkErr?.message }));
    if (linkErr || !linkData?.properties?.action_link) return json({ ok: true });

    const recoveryUrl = linkData.properties.action_link;
    const firstName   = (profile.full_name ?? "").split(" ")[0] || null;
    const greeting    = firstName ? `Olá, ${firstName}!` : "Olá!";

    const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111111;">
  <h1 style="font-size:22px;font-weight:600;margin:0 0 16px;">Redefinição de senha — HubM</h1>
  <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
    ${greeting} Recebemos uma solicitação para redefinir a senha da sua conta no HubM.
  </p>
  <p style="font-size:14px;line-height:1.6;margin:0 0 24px;">
    Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.
  </p>
  <a href="${recoveryUrl}"
     style="display:inline-block;padding:12px 24px;background:#111111;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
    Redefinir senha
  </a>
  <p style="font-size:13px;line-height:1.6;margin:24px 0 0;color:#555555;">
    Se o botão não funcionar, copie e cole este link no seu navegador:<br/>
    <a href="${recoveryUrl}" style="color:#111111;word-break:break-all;">${recoveryUrl}</a>
  </p>
  <p style="font-size:12px;color:#888888;margin:24px 0 0;">
    Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha não será alterada.
  </p>
</div>`;

    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("ANON_KEY_JWT") ?? ""}`,
        "apikey": Deno.env.get("ANON_KEY_JWT") ?? "",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        to: profile.recovery_email,
        subject: "Redefinição de senha — HubM",
        html,
        ...(senderName && { sender_name: senderName }),
        ...(senderEmail && { sender_email: senderEmail }),
      }),
    });

    await sendRes.body?.cancel().catch(() => {});
    console.log("recover-cpf-password: send-email status", sendRes.status);
    emailSent = sendRes.ok;
  } catch (err) {
    console.error("recover-cpf-password: unexpected error", err);
  }

  // 4. Reset counter on success — prevents lockout for legitimate users
  if (emailSent) {
    await admin.from("auth_rate_limits").upsert(
      { cpf_hash: cpfKey, attempts: 0, last_attempt_at: new Date().toISOString(), locked_until: null },
      { onConflict: "cpf_hash" }
    );
  }

  return json({ ok: true });
});
