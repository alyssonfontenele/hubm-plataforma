import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin-log";
import { adminProfilesQueryKey } from "./useAdminUsers";

export interface DeleteUserParams {
  userId: string;
  fullName: string;
  authType: string;
  adminId: string | null;
}

export function useDeleteUser(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: DeleteUserParams) => {
      const { error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
    },
    onSuccess: async (_data, vars) => {
      await logAdminAction({
        adminId: vars.adminId,
        action: "delete_user",
        targetId: vars.userId,
        targetName: vars.fullName,
        details: { auth_type: vars.authType },
      });
      await queryClient.invalidateQueries({
        queryKey: adminProfilesQueryKey(companyId),
      });
    },
  });
}
