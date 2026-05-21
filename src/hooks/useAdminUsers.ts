import { useQuery } from "@tanstack/react-query";
import { supabase, type Profile } from "@/integrations/supabase/client";

export const adminProfilesQueryKey = (companyId: string) =>
  ["admin-profiles", companyId] as const;

export function useAdminUsers(companyId: string) {
  return useQuery({
    queryKey: adminProfilesQueryKey(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data as Profile[] | null) ?? [];
    },
  });
}
