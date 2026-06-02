import type { SectorRole } from "@/integrations/supabase/client";

export const SECTOR_ROLES: SectorRole[] = ["admin", "manager", "member", "viewer"];

export const SECTOR_ROLE_LABEL: Record<SectorRole, string> = {
  admin:   "Administrador do Setor",
  manager: "Gerente",
  member:  "Membro",
  viewer:  "Visualizador",
};
