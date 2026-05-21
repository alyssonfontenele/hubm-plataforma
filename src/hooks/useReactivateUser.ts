import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminProfilesQueryKey } from "./useAdminUsers";

export interface ReactivateUserParams {
  full_name: string;
  global_role: string;
}

export interface ReactivateUserResult {
  success: boolean;
  user_id?: string;
}

/**
 * Reactivates a soft-deleted user via the admin-reactivate-user Edge Function.
 *
 * - Always invalidates the admin profiles query (onSettled), regardless of
 *   success/error: the profile may have been reactivated even if the response
 *   was non-2xx.
 * - Returns `{ success: true }` only when the Edge Function explicitly returns
 *   `success: true` in its body. Any other case resolves to `{ success: false }`.
 */
export function useReactivateUser(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation<ReactivateUserResult, Error, ReactivateUserParams>({
    mutationFn: async (params) => {
      const { data, error } = await supabase.functions.invoke(
        "admin-reactivate-user",
        { body: params },
      );

      if (error) {
        return { success: false };
      }

      const body = (data ?? null) as { success?: boolean; user_id?: string } | null;
      return {
        success: body?.success === true,
        user_id: body?.user_id,
      };
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminProfilesQueryKey(companyId),
      });
    },
  });
}
