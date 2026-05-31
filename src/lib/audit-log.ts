import { supabase } from "@/integrations/supabase/client";

export type AuditEvent =
  | "resource_viewed"
  | "role_changed"
  | "permission_changed"
  | "admin_accessed"
  | "profile_exported"
  | "profile_corrected"
  | "profile_anonymized";

export async function logAuditEvent(
  event: AuditEvent,
  resource_type: string | null,
  resource_id: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    await supabase.from("audit_log").insert({
      company_id:    profile?.company_id ?? null,
      actor_id:      user.id,
      actor_name:    profile?.full_name ?? null,
      event,
      resource_type,
      resource_id:   resource_id ?? null,
      metadata,
    });
  } catch {
    // Logging nunca bloqueia o fluxo principal.
  }
}
