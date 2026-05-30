import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?? "https://xpoqiclaqkudznmshzal.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  ?? "sb_publishable_8Iw2RKwZ5pA5CTqXV3JMew_zrFk8gso";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

// Cliente do banco central hubm-core — usado para auth e dados do SuperAdmin.
// Fallback hardcoded garante inicialização mesmo sem env vars no build
// (mesmo padrão do cliente principal).
const CORE_URL = (import.meta.env.VITE_SUPABASE_CORE_URL as string | undefined)
  ?? "https://vtirfoafpmolffzgszhp.supabase.co";
const CORE_KEY = (import.meta.env.VITE_SUPABASE_CORE_ANON_KEY as string | undefined)
  ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0aXJmb2FmcG1vbGZmemdzemhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwODk5MDYsImV4cCI6MjA5NTY2NTkwNn0.P3d1N8YMX3UfM7QOllhZXW6hq1VzYLG5HZV1mrX1ODM";

export const supabaseCore = createClient(CORE_URL, CORE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

/**
 * Retorna o cliente Supabase correto para operações de autenticação.
 * - SuperAdmin (VITE_IS_SUPERADMIN=true): usa supabaseCore (hubm-core)
 * - Empresa (Mowig, Moveria): usa supabase
 */
export function getAuthClient() {
  if (import.meta.env.VITE_IS_SUPERADMIN === 'true') {
    return supabaseCore;
  }
  return supabase;
}

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
  allowed_domains: string[];
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

