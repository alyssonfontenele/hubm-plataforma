// supabase/functions/admin-reactivate-user/index.ts
// Admin-only function to reactivate a soft-deleted user profile.
// Bypasses RLS via service role to locate the deleted profile.
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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    console.error("admin-reactivate-user: missing env vars");
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
    .select("global_role, company_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerErr || callerProfile?.global_role !== "admin") {
    return json({ error: "forbidden" }, 403);
  }

  // 3) Input
  let body: {
    recovery_email?: string;
    full_name?: string;
    global_role?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const fullName = (body.full_name ?? "").trim();
  const globalRole = (body.global_role ?? "").trim();
  if (!fullName || !globalRole) {
    return json({ error: "invalid_body" }, 400);
  }

  // 4) Find deleted profile (bypasses RLS via service role)
  const { data: deleted, error: findErr } = await admin
    .from("profiles")
    .select("id")
    .eq("company_id", callerProfile.company_id)
    .not("deleted_at", "is", null)
    .eq("full_name", "Usuário removido")
    .order("deleted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.error("admin-reactivate-user: find error", findErr);
    return json({ error: "lookup_failed" }, 500);
  }
  if (!deleted) return json({ error: "not_found" }, 404);

  // 5) Update profile
  const { error: updErr } = await admin
    .from("profiles")
    .update({
      deleted_at: null,
      active: true,
      full_name: fullName,
      global_role: globalRole,
    })
    .eq("id", deleted.id);

  if (updErr) {
    console.error("admin-reactivate-user: update error", updErr);
    return json({ error: "update_failed" }, 500);
  }

  // 6) Unban in Auth
  try {
    await admin.auth.admin.updateUserById(deleted.id, { ban_duration: "none" });
  } catch (e) {
    console.error("admin-reactivate-user: unban failed", e);
  }

  return json({ success: true, user_id: deleted.id });
});
