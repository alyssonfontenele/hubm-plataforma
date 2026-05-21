import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminProfilesQueryKey } from "./useAdminUsers";

export interface ReactivateUserParams {
  recovery_email: string;
  full_name: string;
  global_role: string;
}

export interface ReactivateUserResult {
  user_id: string;
}

export function useReactivateUser(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: ReactivateUserParams): Promise<ReactivateUserResult> => {
      const { data, error } = await supabase.functions.invoke(
        "admin-reactivate-user",
        { body: params },
      );
      if (error) throw error;
      const userId = (data as { user_id?: string } | null)?.user_id;
      if (!userId) {
        throw new Error("Não foi encontrado um cadastro removido para reativar.");
      }
      return { user_id: userId };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminProfilesQueryKey(companyId),
      });
    },
  });
}
