import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xpoqiclaqkudznmshzal.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8Iw2RKwZ5pA5CTqXV3JMew_zrFk8gso";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type GlobalRole = "admin" | "manager" | "member" | "viewer" | "operational" | "superadmin";
export type SectorRole = "admin" | "manager" | "member" | "viewer";
export type ResourceType =
  | "link"
  | "spreadsheet"
  | "document"
  | "pdf"
  | "slides"
  | "system"
  | "file";
export type AuthType = "google" | "cpf";

export interface Profile {
  id: string;
  company_id: string;
  full_name: string;
  display_name: string | null;
  auth_type: AuthType;
  cpf_hash: string | null;
  recovery_email: string | null;
  cellphone: string | null;
  avatar_url: string | null;
  global_role: GlobalRole;
  active: boolean;
  must_change_password: boolean;
  deleted_at: string | null;
  last_login_at: string | null;
  consent_at: string | null;
}

export interface Company {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  email_sender: string | null;
  active: boolean;
}

export interface SectorMembership {
  sector_id: string;
  role: SectorRole;
  sector: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    group_name: string | null;
  };
}

