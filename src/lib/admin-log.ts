import { supabase } from "@/integrations/supabase/client";

export type AdminAction =
  | "create_user"
  | "edit_user"
  | "suspend_user"
  | "inactivate_user"
  | "reactivate_user"
  | "delete_user"
  | "force_password_reset"
  | "reset_password"
  | "resend_access";

export const ADMIN_ACTION_LABEL: Record<AdminAction, string> = {
  create_user: "Criação de usuário",
  edit_user: "Edição de usuário",
  suspend_user: "Suspensão de usuário",
  inactivate_user: "Inativação de usuário",
  reactivate_user: "Reativação de usuário",
  delete_user: "Exclusão definitiva",
  force_password_reset: "Forçar troca de senha",
  reset_password: "Redefinição de senha",
  resend_access: "Reenvio de acesso",
};

export interface AdminLogRow {
  id: string;
  created_at: string;
  admin_id: string | null;
  action: AdminAction;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  details: Record<string, unknown> | null;
}

export async function logAdminAction(params: {
  adminId: string | null | undefined;
  action: AdminAction;
  targetId: string;
  targetName: string;
  details?: Record<string, unknown>;
}) {
  if (!params.adminId) return;
  try {
    await supabase.from("admin_logs").insert({
      admin_id: params.adminId,
      action: params.action,
      target_type: "user",
      target_id: params.targetId,
      target_name: params.targetName,
      details: params.details ?? {},
    });
  } catch {
    // Logging must never block the primary action.
  }
}
