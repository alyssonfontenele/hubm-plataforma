import { useQuery } from "@tanstack/react-query";
import { supabase, type Profile } from "@/integrations/supabase/client";

// Prefixo estável: invalidateQueries({ queryKey: adminProfilesQueryKey(companyId) })
// casa com qualquer variante de showDeleted (match por prefixo do TanStack Query).
export const adminProfilesQueryKey = (companyId: string) =>
  ["admin-profiles", companyId] as const;

export function useAdminUsers(companyId: string, showDeleted = false) {
  return useQuery({
    queryKey: [...adminProfilesQueryKey(companyId), showDeleted] as const,
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .neq("global_role", "cliente")
        .is("deleted_at", null);

      if (!showDeleted) {
        query = query.is("anonymized_at", null);
      }

      const { data, error } = await query.order("full_name", { ascending: true });
      if (error) throw error;
      return (data as Profile[] | null) ?? [];
    },
  });
}
