import type { GlobalRole, SectorRole } from "@/integrations/supabase/client";

export interface Sector {
  id: string;
  name: string;
  slug: string;
}

export interface SectorAssignment {
  sector_id: string;
  role: SectorRole;
}

/** Roles disponíveis para colaboradores — 'superadmin' e 'cliente' são gerenciados separadamente */
export const GLOBAL_ROLES: GlobalRole[] = ["admin", "manager", "member", "viewer", "operational"];

export const ROLE_LABEL: Record<GlobalRole, string> = {
  admin:       "Administrador",
  manager:     "Gerente",
  member:      "Membro",
  viewer:      "Visualizador",
  operational: "Operacional",
  superadmin:  "SuperAdmin",
  cliente:     "Cliente",
};
export const SECTOR_ROLES: SectorRole[] = ["admin", "manager", "member", "viewer"];

export const SECTOR_ROLE_LABEL: Record<SectorRole, string> = {
  admin:   "Administrador do Setor",
  manager: "Gerente",
  member:  "Membro",
  viewer:  "Visualizador",
};

export function isValidInitialPassword(pw: string): boolean {
  return pw.length >= 8 && /\d/.test(pw) && /[A-Z]/.test(pw);
}
