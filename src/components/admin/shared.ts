import type { GlobalRole, SectorRole } from "@/integrations/supabase/client";

// SECTOR_ROLES e SECTOR_ROLE_LABEL vivem em @/lib/sector-roles para que
// componentes fora do módulo admin (ex: Home) possam importá-los sem
// cruzar a fronteira admin → lib.
export { SECTOR_ROLES, SECTOR_ROLE_LABEL } from "@/lib/sector-roles";

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

export function isValidInitialPassword(pw: string): boolean {
  return pw.length >= 8 && /\d/.test(pw) && /[A-Z]/.test(pw);
}
