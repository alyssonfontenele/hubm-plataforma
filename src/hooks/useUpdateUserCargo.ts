import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAdminAction } from "@/lib/admin-log";
import { adminProfilesQueryKey } from "./useAdminUsers";

export interface UpdateUserCargoParams {
  profileId: string;
  fullName: string;
  adminId: string | null;
  previousCargo: { id: string; name: string } | null;
  newCargo: { id: string; name: string } | null;
}

/**
 * Atribui, troca ou remove o cargo de um colaborador.
 * - Troca/atribuição: upsert em profile_cargos (1 cargo por usuário) e
 *   adiciona os setores do novo cargo em sector_members (não remove setores existentes).
 * - Remoção: apaga a linha de profile_cargos (setores permanecem).
 */
export function useUpdateUserCargo(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, newCargo }: UpdateUserCargoParams) => {
      if (!newCargo) {
        const { error } = await supabase.from("profile_cargos").delete().eq("profile_id", profileId);
        if (error) throw error;
        return;
      }

      const { error: upsertErr } = await supabase
        .from("profile_cargos")
        .upsert(
          { profile_id: profileId, cargo_id: newCargo.id, sector_id: null },
          { onConflict: "profile_id" },
        );
      if (upsertErr) throw upsertErr;

      const { data: cs, error: csErr } = await supabase
        .from("cargo_sectors")
        .select("sector_id")
        .eq("cargo_id", newCargo.id);
      if (csErr) throw csErr;
      const sectorIds = (cs ?? []).map((r) => r.sector_id as string);
      if (sectorIds.length > 0) {
        const { error: smErr } = await supabase.from("sector_members").upsert(
          sectorIds.map((sid) => ({ profile_id: profileId, sector_id: sid, role: "member" as const })),
          { onConflict: "profile_id,sector_id", ignoreDuplicates: true },
        );
        if (smErr) throw smErr;
      }
    },
    onSuccess: async (_data, vars) => {
      await logAdminAction({
        adminId: vars.adminId,
        action: "update_cargo",
        targetId: vars.profileId,
        targetName: vars.fullName,
        details: {
          previous_cargo_id: vars.previousCargo?.id ?? null,
          previous_cargo: vars.previousCargo?.name ?? null,
          new_cargo_id: vars.newCargo?.id ?? null,
          new_cargo: vars.newCargo?.name ?? null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminProfilesQueryKey(companyId) }),
        queryClient.invalidateQueries({ queryKey: ["admin-profile-cargos-map", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["profile-cargo", vars.profileId] }),
      ]);
    },
  });
}
