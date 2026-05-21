import { useState } from "react";
import { supabase, type Profile } from "@/integrations/supabase/client";

export type RescueStatus = "active" | "suspended" | "deleted" | "not_found";

export interface RescueResult {
  status: RescueStatus;
  profile: Profile | null;
}

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
      if (!profile) return { status: "not_found", profile: null };
      if (profile.deleted_at !== null) return { status: "deleted", profile: null };
      if (profile.active === false) return { status: "suspended", profile };
      return { status: "active", profile };
    } finally {
      setLoading(false);
    }
  };

  return { lookup, loading };
}
