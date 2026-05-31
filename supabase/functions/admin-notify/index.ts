// supabase/functions/admin-notify/index.ts
// Admin-only email notification proxy. Requires a valid Supabase JWT from
// a user with global_role 'admin' or 'manager'. Calls send-email internally
// with x-internal-secret so the secret never reaches the browser.
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
  const INTERNAL_SECRET  = Deno.env.get("INTERNAL_SECRET");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY || !INTERNAL_SECRET) {
    console.error("admin-notify: missing env vars");
    return json({ error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  // 1) Validate caller JWT
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  // 2) Validate role (admin or manager)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerProfile, error: callerErr } = await admin
    .from("profiles")
    .select("global_role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = callerProfile?.global_role;
  if (callerErr || (role !== "admin" && role !== "manager")) {
    return json({ error: "forbidden" }, 403);
  }

  // 3) Parse body
  let body: { to?: unknown; subject?: unknown; html?: unknown; sender_name?: unknown; sender_email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const { to, subject, html, sender_name, sender_email } = body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const toList = Array.isArray(to) ? to : (typeof to === "string" ? [to] : []);
  const toValid = toList.length > 0 && toList.every(r => typeof r === "string" && emailRegex.test(r));
  if (!toValid || typeof subject !== "string" || !subject.trim() || typeof html !== "string" || !html.trim()) {
    return json({ error: "Requisição inválida" }, 400);
  }

  // 4) Forward to send-email with the secret (server-side only)
  const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("ANON_KEY_JWT") ?? ""}`,
      "apikey": Deno.env.get("ANON_KEY_JWT") ?? "",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify({
      to,
      subject,
      html,
      ...(sender_name && { sender_name }),
      ...(sender_email && { sender_email }),
    }),
  });

  if (!sendRes.ok) {
    console.error("admin-notify: send-email failed", sendRes.status);
    await sendRes.body?.cancel().catch(() => {});
    return json({ error: "send_failed" }, 502);
  }

  await sendRes.body?.cancel().catch(() => {});
  return json({ ok: true });
});
