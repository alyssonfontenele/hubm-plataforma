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
  | "resend_access"
  | "approve_user"
  | "reject_user"
  | "delete_sector"
  | "delete_resource";

export const ADMIN_ACTION_LABEL: Record<AdminAction, string> = {
  create_user:         "Criação de usuário",
  edit_user:           "Edição de usuário",
  suspend_user:        "Suspensão de usuário",
  inactivate_user:     "Inativação de usuário",
  reactivate_user:     "Reativação de usuário",
  delete_user:         "Exclusão definitiva",
  force_password_reset:"Forçar troca de senha",
  reset_password:      "Redefinição de senha",
  resend_access:       "Reenvio de acesso",
  approve_user:        "Aprovação de acesso",
  reject_user:         "Rejeição de acesso",
  delete_sector:       "Exclusão de setor",
  delete_resource:     "Exclusão de recurso",
};

export const ADMIN_ACTION_COLOR: Partial<Record<AdminAction, string>> = {
  approve_user:    "border-success/30 bg-success-light text-success-text",
  reject_user:     "border-danger/30 bg-danger-light text-danger-text",
  delete_user:     "border-danger/30 bg-danger-light text-danger-text",
  suspend_user:    "border-amber-200 bg-amber-50 text-amber-800",
  inactivate_user: "border-amber-200 bg-amber-50 text-amber-800",
  reactivate_user: "border-success/30 bg-success-light text-success-text",
  create_user:     "border-info/30 bg-info-light text-info-text",
  delete_sector:   "border-danger/30 bg-danger-light text-danger-text",
  delete_resource: "border-danger/30 bg-danger-light text-danger-text",
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
  targetType?: string;
  details?: Record<string, unknown>;
}) {
  if (!params.adminId) return;
  try {
    await supabase.from("admin_logs").insert({
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType ?? "user",
      target_id: params.targetId,
      target_name: params.targetName,
      details: params.details ?? {},
    });
  } catch {
    // Logging must never block the primary action.
  }
}
