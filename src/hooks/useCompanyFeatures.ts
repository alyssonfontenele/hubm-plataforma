import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Slugs canônicos de feature flags — evita strings mágicas espalhadas no código. */
export const FEATURE_SLUGS = {
  CONTRATOS: "moveria-contratos",
  TAREFAS: "tarefas",
} as const;

export function useCompanyFeatures(): string[] {
  const { company } = useAuth();
  const companyId = company?.id;

  const { data } = useQuery({
    queryKey: ["company-features", companyId ?? ""],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_features")
        .select("feature_slug")
        .eq("company_id", companyId!)
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? []).map((r) => (r as { feature_slug: string }).feature_slug);
    },
  });

  return data ?? [];
}

export function useHasFeature(slug: string): boolean {
  const features = useCompanyFeatures();
  return features.includes(slug);
}

// ---------------------------------------------------------------------------
// Tarefas: gating em dois níveis (empresa enabled + papel liberado)
// ---------------------------------------------------------------------------

export interface TarefasFeature {
  companyEnabled: boolean;
  papeis_liberados: string[];
  hasAccess: boolean;
  isLoading: boolean;
}

export function useTarefasFeature(): TarefasFeature {
  const { company, globalRole } = useAuth();
  const companyId = company?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["company-feature-tarefas", companyId ?? ""],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_features")
        .select("enabled, config")
        .eq("company_id", companyId!)
        .eq("feature_slug", FEATURE_SLUGS.TAREFAS)
        .maybeSingle();
      if (error) throw error;
      return data as { enabled: boolean; config: Record<string, unknown> } | null;
    },
  });

  const companyEnabled = data?.enabled ?? false;
  const rawPapeis = data?.config?.papeis_liberados;
  const papeis_liberados: string[] = Array.isArray(rawPapeis) ? rawPapeis : [];

  // fail-closed: papeis_liberados vazio = nenhum papel liberado
  const hasAccess =
    companyEnabled &&
    papeis_liberados.length > 0 &&
    globalRole != null &&
    papeis_liberados.includes(globalRole);

  return { companyEnabled, papeis_liberados, hasAccess, isLoading };
}
