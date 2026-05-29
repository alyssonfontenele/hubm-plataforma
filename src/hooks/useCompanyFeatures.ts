import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
