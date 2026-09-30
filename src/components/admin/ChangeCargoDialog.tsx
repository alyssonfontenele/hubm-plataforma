import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, type Profile } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateUserCargo } from "@/hooks/useUpdateUserCargo";

type CargoOption = { id: string; name: string };

interface ChangeCargoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  companyId: string;
  adminId: string | null;
  onChanged: () => void | Promise<void>;
}

export function ChangeCargoDialog({
  open,
  onOpenChange,
  profile,
  companyId,
  adminId,
  onChanged,
}: ChangeCargoDialogProps) {
  const [selected, setSelected] = useState<string>("");
  const mutation = useUpdateUserCargo(companyId);

  const { data: cargos = [], isLoading: loadingCargos } = useQuery({
    queryKey: ["admin-cargos", companyId] as const,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargos")
        .select("id,name,description")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CargoOption[];
    },
  });

  const { data: current = null, isLoading: loadingCurrent } = useQuery({
    queryKey: ["profile-cargo", profile.id] as const,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_cargos")
        .select("cargo_id, cargos(id, name)")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (error) throw error;
      const c = (data as unknown as { cargos: CargoOption | null } | null)?.cargos;
      return c ?? null;
    },
  });

  useEffect(() => {
    if (open) setSelected(current?.id ?? "");
  }, [open, current]);

  const loading = loadingCargos || loadingCurrent;
  const unchanged = (current?.id ?? "") === selected;

  const handleSave = async () => {
    const newCargo = cargos.find((c) => c.id === selected) ?? null;
    try {
      await mutation.mutateAsync({
        profileId: profile.id,
        fullName: profile.full_name,
        adminId,
        previousCargo: current,
        newCargo,
      });
      toast.success(
        newCargo
          ? `Cargo de ${profile.full_name} alterado para ${newCargo.name}.`
          : `Cargo de ${profile.full_name} removido.`,
      );
      onOpenChange(false);
      await onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message;
      toast.error("Falha ao alterar cargo" + (msg ? `: ${msg}` : "."));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterar cargo</DialogTitle>
          <DialogDescription>{profile.full_name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-text-secondary">Cargo</label>
          <select
            value={selected}
            disabled={loading || mutation.isPending}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="">Sem cargo</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-muted">
            {selected
              ? "Os setores do novo cargo serão adicionados. Setores atuais são mantidos."
              : "O cargo será removido. Setores atuais são mantidos."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={loading || unchanged || mutation.isPending}
            className="bg-text-primary text-background hover:bg-text-primary/90"
          >
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
