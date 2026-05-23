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

export const GLOBAL_ROLES: GlobalRole[] = ["admin", "manager", "member", "viewer", "operational"];
export const SECTOR_ROLES: SectorRole[] = ["manager", "member", "viewer"];

export function isValidInitialPassword(pw: string): boolean {
  return pw.length >= 8 && /\d/.test(pw) && /[A-Z]/.test(pw);
}
