import { useState } from "react";
import { supabase, type Profile } from "@/integrations/supabase/client";

export type RescueStatus = "deleted" | "not_found";

export interface RescueResult {
  status: RescueStatus;
  profile: Profile | null;
}

/**
 * Looks up a profile by CPF for the "Resgatar usuário excluído" flow.
 *
 * Only soft-deleted profiles (deleted_at IS NOT NULL) are considered a
 * valid match — this flow is exclusively for reactivating removed users.
 */
export function useRescueByCPF() {
  const [loading, setLoading] = useState(false);

  const lookup = async (cpfDigits: string): Promise<RescueResult> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc("find_profile_by_cpf", { cpf_input: cpfDigits })
        .single();
      if (error && error.code !== "PGRST116") throw error;
      const profile = (data as Profile | null) ?? null;
      if (!profile || profile.deleted_at === null) {
        return { status: "not_found", profile: null };
      }
      return { status: "deleted", profile };
    } finally {
      setLoading(false);
    }
  };

  return { lookup, loading };
}
