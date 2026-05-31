import { supabase } from "@/integrations/supabase/client";

export type SecurityEventType =
  | "login_success"
  | "login_failure"
  | "lockout_triggered"
  | "user_created"
  | "user_deleted";

export async function logSecurityEvent(
  event_type: SecurityEventType,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("admin_logs").insert({
      admin_id:    user?.id ?? null,
      action:      event_type,
      target_type: "security_event",
      event_type,
      metadata,
    });
  } catch {
    // Logging must never block the primary action.
  }
}
