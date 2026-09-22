import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeFunctionErrorMessage } from "@/lib/errors";

export interface RevokeSessionsParams {
  userId: string;
}

export function useRevokeSessions() {
  return useMutation({
    mutationFn: async ({ userId }: RevokeSessionsParams) => {
      const { error } = await supabase.functions.invoke("revoke-sessions", {
        body: { user_id: userId },
      });
      if (error) {
        throw new Error(await extractEdgeFunctionErrorMessage(error, "Falha ao revogar sessões."));
      }
    },
  });
}
