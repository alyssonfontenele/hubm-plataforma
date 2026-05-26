// supabase/functions/recover-cpf-password/index.ts
// Public endpoint — no auth required.
// Accepts { cpf } (formatted or digits-only), looks up the profile's
// recovery_email, generates a Supabase password-recovery link, and
// sends it via the internal send-email function.
// Always returns { ok: true } — never reveals whether the CPF exists.
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

  const SUPABASE_URL      = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const INTERNAL_SECRET   = Deno.env.get("INTERNAL_SECRET");
  // SITE_URL must be set in Supabase project Edge Function env vars
  // e.g. https://hubm.mowig.com.br
  const SITE_URL          = Deno.env.get("SITE_URL") ?? "";

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !INTERNAL_SECRET || !SITE_URL) {
    console.error("recover-cpf-password: missing env vars");
    return json({ ok: true }); // never expose server errors to caller
  }

  let body: { cpf?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: true });
  }

  // Normalise: strip all non-digits
  const cpfDigits = String(body.cpf ?? "").replace(/\D/g, "");
  if (cpfDigits.length !== 11) return json({ ok: true });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Look up profile by CPF (cpf_hash stores plain digits)
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, recovery_email")
      .eq("cpf_hash", cpfDigits)
      .eq("auth_type", "cpf")
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();

    // Silent success if CPF not found or no recovery email registered
    if (!profile?.recovery_email) return json({ ok: true });

    // 2. Generate a password-recovery link for the CPF auth email
    const authEmail = `${cpfDigits}@hubm.internal`;
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: authEmail,
      options: { redirectTo: `${SITE_URL}/auth/callback` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error("recover-cpf-password: generateLink failed", linkErr);
      return json({ ok: true });
    }

    const recoveryUrl = linkData.properties.action_link;
    const firstName   = (profile.full_name ?? "").split(" ")[0] || null;
    const greeting    = firstName ? `Olá, ${firstName}!` : "Olá!";

    // 3. Send the link to the recovery email
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
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        to: profile.recovery_email,
        subject: "Redefinição de senha — HubM",
        html,
      }),
    });

    if (!sendRes.ok) {
      const text = await sendRes.text().catch(() => "");
      console.error("recover-cpf-password: send-email failed", sendRes.status, text);
    }
  } catch (err) {
    console.error("recover-cpf-password: unexpected error", err);
  }

  // Always return ok — never reveal outcome to caller
  return json({ ok: true });
});
