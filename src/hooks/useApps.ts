import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AppRow {
  id: string;
  name: string;
  slug: string;
  url: string;
  icon: string | null;
  sort_order: number;
}

/** Apps embutidos (iframe) ativos da empresa atual, para a sidebar e a rota /app/apps/$slug. */
export function useApps() {
  const { company } = useAuth();
  const companyId = company?.id;

  return useQuery({
    queryKey: ["apps", companyId ?? ""],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<AppRow[]> => {
      const { data, error } = await supabase
        .from("apps")
        .select("id,name,slug,url,icon,sort_order")
        .eq("company_id", companyId!)
        .eq("active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as AppRow[] | null) ?? [];
    },
  });
}
