import { supabase, supabaseCore } from "@/integrations/supabase/client";

function detectCompanySlug(): string | undefined {
  if (typeof window === 'undefined') return import.meta.env.VITE_COMPANY_SLUG as string | undefined;
  if (import.meta.env.VITE_IS_SUPERADMIN === 'true') return 'system';
  return import.meta.env.VITE_COMPANY_SLUG as string | undefined;
}

export const COMPANY_SLUG = detectCompanySlug();

// Cliente de companies/company_features: hubm-core no SuperAdmin, banco da empresa nos demais.
export const companyClient =
  import.meta.env.VITE_IS_SUPERADMIN === 'true'
    ? supabaseCore
    : supabase;
