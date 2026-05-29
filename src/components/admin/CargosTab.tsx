import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Check, Eye, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase, type ResourceType } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PermissionLevel = "view" | "edit" | "none";

interface Cargo {
  id: string;
  name: string;
  description: string | null;
  company_id: string;
  created_at: string;
}

interface SectorRow {
  id: string;
  name: string;
}

interface ResourceRow {
  id: string;
  name: string;
  type: ResourceType;
  icon: string | null;
  sector_id: string | null;
}

interface CargosTabProps {
  companyId: string;
}

// Stable empty fallbacks — avoid new references on every render
const EMPTY_PERMS: { resource_id: string; permission: string }[] = [];
const EMPTY_CARGO_SECTORS: { sector_id: string }[] = [];

// ─── Permission toggle ────────────────────────────────────────────────────────

const PERM_OPTIONS: { value: PermissionLevel; label: string; title: string }[] = [
  { value: "none", label: "—",      title: "Sem acesso" },
  { value: "view", label: "Ver",    title: "Visualizar" },
  { value: "edit", label: "Editar", title: "Editar"     },
];

function PermToggle({
  value,
  onChange,
  disabled,
}: {
  value: PermissionLevel;
  onChange: (p: PermissionLevel) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden shrink-0">
      {PERM_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`h-7 px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            value === opt.value
              ? opt.value === "none"
                ? "bg-text-primary/10 text-text-primary"
                : opt.value === "view"
                  ? "bg-blue-500 text-white"
                  : "bg-emerald-500 text-white"
              : "bg-background text-text-muted hover:bg-accent-light"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Create cargo modal ───────────────────────────────────────────────────────

function CreateCargoModal({
  open,
  onClose,
  sectors,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  sectors: SectorRow[];
  onCreate: (name: string, description: string, sectorIds: string[]) => Promise<void>;
}) {
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!open) { setName(""); setDescription(""); setSelected(new Set()); }
  }, [open]);

  const toggleSector = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate(name.trim(), description.trim(), Array.from(selected));
    } catch (err) {
      console.error("[CreateCargoModal] onCreate threw:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-surface border-border max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Novo cargo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-text-secondary">Nome *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Analista, Coordenador…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-text-secondary">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Opcional"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
            />
          </div>

          {sectors.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-text-secondary">
                Setores com acesso
              </label>
              <div className="space-y-1">
                {sectors.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent-light transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSector(s.id)}
                      className="h-4 w-4 rounded border-border accent-text-primary shrink-0"
                    />
                    <span className="text-sm text-text-primary">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
            className="flex-1 bg-text-primary text-background hover:bg-text-primary/90"
          >
            {saving ? "Criando…" : "Criar cargo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function CargosTab({ companyId }: CargosTabProps) {
  const queryClient = useQueryClient();

  const [selectedCargoId, setSelectedCargoId] = useState<string | null>(null);
  const [createOpen, setCreateOpen]           = useState(false);
  const [deleteTarget, setDeleteTarget]       = useState<Cargo | null>(null);
  const [isEditingMeta, setIsEditingMeta]     = useState(false);
  const [editName, setEditName]               = useState("");
  const [editDesc, setEditDesc]               = useState("");
  const [permMap, setPermMap]                 = useState<Map<string, PermissionLevel>>(new Map());
  const [savingPerms, setSavingPerms]         = useState<Set<string>>(new Set());
  const [togglingSectors, setTogglingSectors] = useState<Set<string>>(new Set());

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: cargos = [], isLoading: loadingCargos } = useQuery({
    queryKey: ["admin-cargos", companyId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargos")
        .select("id,name,description,company_id,created_at")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Cargo[];
    },
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ["admin-cargos-sectors", companyId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sectors")
        .select("id,name")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as SectorRow[];
    },
  });

  const sectorIds = useMemo(() => sectors.map((s) => s.id), [sectors]);

  const { data: resources = [] } = useQuery({
    queryKey: ["admin-cargos-resources", companyId, sectorIds] as const,
    queryFn: async () => {
      if (sectorIds.length === 0) return [];
      const { data, error } = await supabase
        .from("resources")
        .select("id,name,type,icon,sector_id")
        .in("sector_id", sectorIds)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ResourceRow[];
    },
    enabled: sectorIds.length > 0,
  });

  const { data: cargoPerms = EMPTY_PERMS } = useQuery({
    queryKey: ["admin-cargo-permissions", selectedCargoId] as const,
    queryFn: async () => {
      if (!selectedCargoId) return EMPTY_PERMS;
      const { data, error } = await supabase
        .from("cargo_permissions")
        .select("resource_id,permission")
        .eq("cargo_id", selectedCargoId);
      if (error) throw error;
      return (data ?? []) as { resource_id: string; permission: string }[];
    },
    enabled: !!selectedCargoId,
  });

  const { data: cargoSectors = EMPTY_CARGO_SECTORS } = useQuery({
    queryKey: ["admin-cargo-sectors", selectedCargoId] as const,
    queryFn: async () => {
      if (!selectedCargoId) return EMPTY_CARGO_SECTORS;
      const { data, error } = await supabase
        .from("cargo_sectors")
        .select("sector_id")
        .eq("cargo_id", selectedCargoId);
      if (error) throw error;
      return (data ?? []) as { sector_id: string }[];
    },
    enabled: !!selectedCargoId,
  });

  // ── Sync permMap when query data changes ───────────────────────────────────

  useEffect(() => {
    const map = new Map<string, PermissionLevel>();
    for (const p of cargoPerms) {
      map.set(p.resource_id, p.permission as PermissionLevel);
    }
    setPermMap(map);
  }, [cargoPerms]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedCargo = cargos.find((c) => c.id === selectedCargoId) ?? null;

  const cargoSectorIds = useMemo(
    () => new Set(cargoSectors.map((cs) => cs.sector_id)),
    [cargoSectors]
  );

  const resourcesBySector = useMemo(() => {
    const map = new Map<string, ResourceRow[]>();
    for (const r of resources) {
      if (!r.sector_id) continue;
      if (!map.has(r.sector_id)) map.set(r.sector_id, []);
      map.get(r.sector_id)!.push(r);
    }
    return map;
  }, [resources]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSelectCargo = (id: string) => {
    setSelectedCargoId(id);
    setIsEditingMeta(false);
  };

  const handleToggleSector = async (sectorId: string) => {
    if (!selectedCargoId) return;
    setTogglingSectors((prev) => new Set(prev).add(sectorId));
    try {
      if (cargoSectorIds.has(sectorId)) {
        const { error } = await supabase
          .from("cargo_sectors")
          .delete()
          .eq("cargo_id", selectedCargoId)
          .eq("sector_id", sectorId);
        if (error) { toast.error("Erro ao remover setor."); return; }
      } else {
        const { error } = await supabase
          .from("cargo_sectors")
          .insert({ cargo_id: selectedCargoId, sector_id: sectorId });
        if (error) { toast.error("Erro ao adicionar setor."); return; }
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-cargo-sectors", selectedCargoId] });
    } finally {
      setTogglingSectors((prev) => { const next = new Set(prev); next.delete(sectorId); return next; });
    }
  };

  const handlePermChange = async (resourceId: string, perm: PermissionLevel) => {
    if (!selectedCargoId) return;
    setPermMap((prev) => new Map(prev).set(resourceId, perm));
    setSavingPerms((prev) => new Set(prev).add(resourceId));
    try {
      if (perm === "none") {
        await supabase
          .from("cargo_permissions")
          .delete()
          .eq("cargo_id", selectedCargoId)
          .eq("resource_id", resourceId);
      } else {
        await supabase.from("cargo_permissions").upsert(
          { cargo_id: selectedCargoId, resource_id: resourceId, permission: perm },
          { onConflict: "cargo_id,resource_id" }
        );
      }
    } catch {
      toast.error("Erro ao salvar permissão.");
      await queryClient.invalidateQueries({ queryKey: ["admin-cargo-permissions", selectedCargoId] });
    } finally {
      setSavingPerms((prev) => { const next = new Set(prev); next.delete(resourceId); return next; });
    }
  };

  const handleCreate = async (name: string, description: string, newSectorIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from("cargos")
        .insert({ name, description: description || null, company_id: companyId })
        .select("id")
        .single();
      if (error) { toast.error("Erro ao criar cargo: " + error.message); return; }

      if (newSectorIds.length > 0) {
        const { error: secErr } = await supabase
          .from("cargo_sectors")
          .insert(newSectorIds.map((sid) => ({ cargo_id: data.id, sector_id: sid })));
        if (secErr) toast.error("Cargo criado, mas erro ao atribuir setores: " + secErr.message);
      }

      toast.success("Cargo criado.");
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-cargos", companyId] });
    } catch (err) {
      console.error("[handleCreate] unexpected throw:", err);
      toast.error("Erro inesperado ao criar cargo.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("cargos").delete().eq("id", deleteTarget.id);
    if (error) { toast.error("Erro ao excluir cargo."); return; }
    toast.success(`Cargo "${deleteTarget.name}" excluído.`);
    if (selectedCargoId === deleteTarget.id) setSelectedCargoId(null);
    setDeleteTarget(null);
    await queryClient.invalidateQueries({ queryKey: ["admin-cargos", companyId] });
  };

  const handleStartEditMeta = () => {
    if (!selectedCargo) return;
    setEditName(selectedCargo.name);
    setEditDesc(selectedCargo.description ?? "");
    setIsEditingMeta(true);
  };

  const handleSaveMeta = async () => {
    if (!selectedCargo || !editName.trim()) return;
    const { error } = await supabase
      .from("cargos")
      .update({ name: editName.trim(), description: editDesc.trim() || null })
      .eq("id", selectedCargo.id);
    if (error) { toast.error("Erro ao salvar."); return; }
    toast.success("Cargo atualizado.");
    setIsEditingMeta(false);
    await queryClient.invalidateQueries({ queryKey: ["admin-cargos", companyId] });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-text-muted" />
        <p className="text-sm font-medium text-text-primary">Cargos e permissões</p>
        <p className="text-xs text-text-muted">
          Defina templates de acesso a recursos por cargo.
        </p>
      </header>

      <div className="flex gap-6 min-h-96 items-start">
        {/* ── Left panel: cargo list ── */}
        <div className="w-60 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">Cargos</p>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="h-7 px-2 text-xs bg-text-primary text-background hover:bg-text-primary/90"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Novo
            </Button>
          </div>

          {loadingCargos ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-md bg-accent-light animate-pulse" />
              ))}
            </div>
          ) : cargos.length === 0 ? (
            <p className="text-xs text-text-muted py-6 text-center">Nenhum cargo criado.</p>
          ) : (
            <div className="space-y-1">
              {cargos.map((cargo) => (
                <button
                  key={cargo.id}
                  type="button"
                  onClick={() => handleSelectCargo(cargo.id)}
                  className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors group ${
                    selectedCargoId === cargo.id
                      ? "border-text-primary bg-text-primary/5"
                      : "border-border bg-surface hover:bg-accent-light"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{cargo.name}</p>
                      {cargo.description && (
                        <p className="text-xs text-text-muted truncate mt-0.5">{cargo.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void navigator.clipboard.writeText(
                            window.location.origin + "/request-access?cargo=" + cargo.id
                          );
                          toast.success("Link copiado!");
                        }}
                        className="text-text-muted hover:text-blue-500 transition-colors"
                        title="Copiar link de convite"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(cargo); }}
                        className="text-text-muted hover:text-red-500 transition-colors"
                        title="Excluir cargo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        {selectedCargo ? (
          <div className="flex-1 min-w-0 space-y-5">
            {/* Cargo name/description header */}
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-border">
              {isEditingMeta ? (
                <div className="flex-1 space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                  <input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Descrição (opcional)"
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-text-secondary focus:outline-none focus:ring-2 focus:ring-ring/30"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveMeta()}
                      disabled={!editName.trim()}
                      className="flex items-center gap-1 h-7 px-3 rounded-md bg-text-primary text-background text-xs font-medium disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" /> Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingMeta(false)}
                      className="flex items-center gap-1 h-7 px-3 rounded-md border border-border text-xs text-text-secondary hover:bg-accent-light"
                    >
                      <X className="w-3 h-3" /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-text-primary">{selectedCargo.name}</p>
                    {selectedCargo.description && (
                      <p className="text-xs text-text-muted mt-0.5">{selectedCargo.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleStartEditMeta}
                    className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
                    title="Editar cargo"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* Setores com acesso */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Setores com acesso
              </p>
              {sectors.length === 0 ? (
                <p className="text-xs text-text-muted">Nenhum setor ativo.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sectors.map((sector) => {
                    const active = cargoSectorIds.has(sector.id);
                    const toggling = togglingSectors.has(sector.id);
                    return (
                      <button
                        key={sector.id}
                        type="button"
                        disabled={toggling}
                        onClick={() => void handleToggleSector(sector.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                          active
                            ? "bg-text-primary text-background border-text-primary"
                            : "bg-background text-text-muted border-border hover:bg-accent-light"
                        }`}
                      >
                        {active && <Check className="w-3 h-3" />}
                        {sector.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Permission matrix */}
            {cargoSectorIds.size === 0 ? (
              <p className="text-sm text-text-muted text-center py-10">
                Nenhum setor atribuído a este cargo.
              </p>
            ) : (
              <>
                {/* Legend */}
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex h-5 px-2 rounded border border-border bg-background text-xs items-center">—</span>
                    Sem acesso
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex h-5 px-2 rounded bg-blue-500 text-white text-xs items-center">Ver</span>
                    Visualizar
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex h-5 px-2 rounded bg-emerald-500 text-white text-xs items-center">Editar</span>
                    Editar e visualizar
                  </span>
                </div>

                <div className="space-y-6">
                  {sectors.map((sector) => {
                    if (!cargoSectorIds.has(sector.id)) return null;
                    const sectorResources = resourcesBySector.get(sector.id) ?? [];
                    if (sectorResources.length === 0) {
                      return (
                        <div key={sector.id} className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted px-1">
                            {sector.name}
                          </p>
                          <p className="text-xs text-text-muted px-1">
                            Nenhum recurso neste setor.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div key={sector.id} className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted px-1">
                          {sector.name}
                        </p>
                        <div className="space-y-1">
                          {sectorResources.map((resource) => {
                            const perm = permMap.get(resource.id) ?? "none";
                            const saving = savingPerms.has(resource.id);
                            return (
                              <div
                                key={resource.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 bg-surface/50"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {perm === "none" && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40 shrink-0" />
                                  )}
                                  {perm === "view" && (
                                    <Eye className="w-3 h-3 text-blue-500 shrink-0" />
                                  )}
                                  {perm === "edit" && (
                                    <Pencil className="w-3 h-3 text-emerald-500 shrink-0" />
                                  )}
                                  <p className={`text-sm truncate ${perm === "none" ? "text-text-muted" : "text-text-primary"}`}>
                                    {resource.name}
                                  </p>
                                </div>
                                <PermToggle
                                  value={perm}
                                  onChange={(p) => void handlePermChange(resource.id, p)}
                                  disabled={saving}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center min-h-48">
            <p className="text-sm text-text-muted">
              Selecione um cargo para configurar permissões.
            </p>
          </div>
        )}
      </div>

      {/* Create modal */}
      <CreateCargoModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        sectors={sectors}
        onCreate={handleCreate}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-surface border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-text-primary">Excluir cargo</AlertDialogTitle>
            <AlertDialogDescription className="text-text-muted">
              Tem certeza que deseja excluir o cargo{" "}
              <span className="font-medium text-text-primary">"{deleteTarget?.name}"</span>?
              Todos os usuários com esse cargo perderão as permissões associadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-text-primary hover:bg-accent-light">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
