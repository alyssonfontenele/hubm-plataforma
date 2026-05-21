import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Folders, GripVertical, Pencil, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { sanitize } from "@/lib/sanitize";

type LayoutKind = "grid" | "list" | "kanban" | "dashboard";

interface SectorRow {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  active: boolean;
  sort_order: number | null;
  group_name: string | null;
  config: { layout?: LayoutKind } | null;
}

const LAYOUT_OPTIONS: { value: LayoutKind; label: string }[] = [
  { value: "grid", label: "Grid de cards" },
  { value: "list", label: "Lista" },
  { value: "kanban", label: "Kanban" },
  { value: "dashboard", label: "Dashboard" },
];


function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

export function SectorsTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["admin-sectors-manage", companyId] as const;

  const { data: sectors = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sectors")
        .select("id,company_id,name,slug,icon,description,active,sort_order,group_name,config")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as SectorRow[] | null) ?? [];
    },
  });

  const [editing, setEditing] = useState<SectorRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [localOrder, setLocalOrder] = useState<SectorRow[] | null>(null);

  const list = localOrder ?? sectors;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (s: SectorRow) => {
    setEditing(s);
    setSheetOpen(true);
  };

  const toggleActive = async (s: SectorRow) => {
    const { error } = await supabase
      .from("sectors")
      .update({ active: !s.active })
      .eq("id", s.id);
    if (error) {
      toast.error("Falha ao atualizar status: " + error.message);
      return;
    }
    toast.success(`${s.name} ${!s.active ? "ativado" : "desativado"}.`);
    await queryClient.invalidateQueries({ queryKey });
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((s) => s.id === active.id);
    const newIndex = list.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(list, oldIndex, newIndex);
    setLocalOrder(reordered);

    const updates = reordered.map((s, idx) =>
      supabase.from("sectors").update({ sort_order: idx }).eq("id", s.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error("Falha ao reordenar setores: " + failed.error.message);
      setLocalOrder(null);
      await queryClient.invalidateQueries({ queryKey });
      return;
    }
    await queryClient.invalidateQueries({ queryKey });
    setLocalOrder(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Folders className="w-4 h-4" /> Setores da empresa
          </p>
          <p className="text-xs text-text-muted">
            Estrutura de setores. Pastas e recursos são gerenciados dentro de cada setor.
          </p>
        </div>
        <Button
          onClick={openNew}
          className="bg-text-primary text-background hover:bg-text-primary/90"
        >
          <Plus className="w-4 h-4 mr-2" /> Novo setor
        </Button>
      </header>

      <div className="border border-border rounded-lg bg-surface">
        {isLoading ? (
          <div className="text-center text-text-muted py-8 text-sm">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="text-center text-text-muted py-8 text-sm">
            Nenhum setor cadastrado.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-border">
                {list.map((s) => (
                  <SortableRow
                    key={s.id}
                    sector={s}
                    onEdit={() => openEdit(s)}
                    onToggle={() => void toggleActive(s)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <SectorFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        companyId={companyId}
        sector={editing}
        existingSlugs={sectors.map((s) => s.slug)}
        existingGroups={sectors.map((s) => s.group_name)}
        nextSortOrder={sectors.length}
        onSaved={async () => {
          setSheetOpen(false);
          await queryClient.invalidateQueries({ queryKey });
        }}
      />
    </div>
  );
}

function SortableRow({
  sector,
  onEdit,
  onToggle,
}: {
  sector: SectorRow;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sector.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-3 hover:bg-background/40"
    >
      <button
        type="button"
        className="text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing touch-none"
        aria-label="Reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-xl w-7 text-center" aria-hidden>
        {sector.icon || "📁"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text-primary truncate">{sector.name}</p>
          {!sector.active && (
            <Badge variant="outline" className="border-border text-text-muted">
              Inativo
            </Badge>
          )}
        </div>
        <p className="text-xs text-text-muted truncate">/{sector.slug}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Switch checked={sector.active} onCheckedChange={onToggle} aria-label="Ativo" />
          <span className="text-xs text-text-muted w-12">
            {sector.active ? "Ativo" : "Inativo"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={`Editar ${sector.name}`}
        >
          <Pencil className="w-4 h-4" />
        </Button>
      </div>
    </li>
  );
}

function SectorFormSheet({
  open,
  onOpenChange,
  companyId,
  sector,
  existingSlugs,
  existingGroups,
  nextSortOrder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  sector: SectorRow | null;
  existingSlugs: string[];
  existingGroups: (string | null)[];
  nextSortOrder: number;
  onSaved: () => void | Promise<void>;
}) {
  const editing = !!sector;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [groupName, setGroupName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(sector?.name ?? "");
    setIcon(sector?.icon ?? "");
    setDescription(sector?.description ?? "");
    setSlug(sector?.slug ?? "");
    setGroupName(sector?.group_name ?? "");
    setSlugTouched(!!sector);
  }, [open, sector]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  const submit = async () => {
    const cleanName = sanitize(name).trim();
    const cleanSlug = slugify(slug);
    if (!cleanName) {
      toast.error("Informe o nome do setor.");
      return;
    }
    if (!cleanSlug) {
      toast.error("Slug inválido.");
      return;
    }
    const duplicate = existingSlugs.some(
      (s) => s === cleanSlug && s !== sector?.slug,
    );
    if (duplicate) {
      toast.error("Já existe um setor com esse slug.");
      return;
    }

    setSaving(true);
    const payload = {
      name: cleanName,
      slug: cleanSlug,
      icon: icon.trim() || null,
      description: sanitize(description).trim() || null,
      group_name: sanitize(groupName).trim() || null,
    };


    if (editing && sector) {
      const { error } = await supabase.from("sectors").update(payload).eq("id", sector.id);
      setSaving(false);
      if (error) {
        toast.error("Falha ao salvar: " + error.message);
        return;
      }
      toast.success("Setor atualizado.");
    } else {
      const { error } = await supabase.from("sectors").insert({
        ...payload,
        company_id: companyId,
        active: true,
        sort_order: nextSortOrder,
      });
      setSaving(false);
      if (error) {
        toast.error("Falha ao criar setor: " + error.message);
        return;
      }
      toast.success("Setor criado.");
    }
    await onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-surface border-border w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{editing ? "Editar setor" : "Novo setor"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Atualize as informações do setor."
              : "Crie um novo setor para sua empresa."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sector-name">Nome *</Label>
            <Input
              id="sector-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Operações"
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label>Ícone do setor</Label>
            <EmojiPicker value={icon} onChange={setIcon} sectorName={name} />
          </div>


          <div className="space-y-2">
            <Label htmlFor="sector-description">Descrição</Label>
            <Textarea
              id="sector-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional do setor."
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sector-group">Grupo</Label>
            <Input
              id="sector-group"
              list="sector-group-suggestions"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ex.: Operações"
              maxLength={60}
            />
            <datalist id="sector-group-suggestions">
              {Array.from(
                new Set(
                  existingGroups.filter(
                    (g): g is string => !!g && g.trim().length > 0,
                  ),
                ),
              )
                .sort((a, b) => a.localeCompare(b, "pt-BR"))
                .map((g) => (
                  <option key={g} value={g} />
                ))}
            </datalist>
            <p className="text-xs text-text-muted">
              Opcional. Setores com o mesmo grupo aparecem juntos na barra lateral.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sector-slug">Slug</Label>
            <Input
              id="sector-slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="operacoes"
              maxLength={60}
            />
            <p className="text-xs text-text-muted">
              Usado na URL: /sectors/{slug || "—"}
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving || !name.trim()}
            className="bg-text-primary text-background hover:bg-text-primary/90"
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Trabalho",
    emojis: ["💼", "📋", "📊", "📈", "📉", "🗂️", "📁", "📂", "🗃️", "🗄️", "📝", "✏️"],
  },
  {
    label: "Financeiro",
    emojis: ["💰", "💵", "💳", "🏦", "📈", "🧾", "💹", "🪙"],
  },
  {
    label: "Pessoas",
    emojis: ["👥", "👤", "🧑‍💼", "🧑‍💻", "🧑‍🏫", "🧑‍⚕️", "🤝", "👨‍👩‍👧"],
  },
  {
    label: "Logística",
    emojis: ["🚚", "📦", "🏭", "🏗️", "🛠️", "🔧", "⛽", "🗺️"],
  },
  {
    label: "Tecnologia",
    emojis: ["💻", "🖥️", "📱", "⚙️", "🧠", "🤖", "🛰️", "🔌"],
  },
  {
    label: "Geral",
    emojis: ["🏢", "🏠", "⭐", "🎯", "🚀", "🔔", "📌", "🌐", "🎨", "🎓", "🛡️", "❤️"],
  },
];

function EmojiPicker({
  value,
  onChange,
  sectorName,
}: {
  value: string;
  onChange: (v: string) => void;
  sectorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const handlePick = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full px-3 py-2 border border-border rounded-md bg-background hover:bg-background/60 text-left"
        aria-expanded={open}
      >
        <span className="text-2xl w-8 text-center" aria-hidden>
          {value || "📁"}
        </span>
        <span className="text-sm text-text-primary truncate">
          {sectorName.trim() || "Selecionar ícone"}
        </span>
        <span className="ml-auto text-xs text-text-muted">
          {open ? "Fechar" : "Escolher"}
        </span>
      </button>

      {open && (
        <div className="border border-border rounded-md bg-surface p-3 space-y-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Digite ou cole um emoji…"
            maxLength={8}
            className="text-center text-lg"
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim()) {
                e.preventDefault();
                handlePick(search.trim());
                setSearch("");
              }
            }}
          />
          <p className="text-xs text-text-muted">
            Pressione Enter para usar o emoji digitado.
          </p>
          <div className="max-h-64 overflow-y-auto space-y-3 pr-1">
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <p className="text-xs font-medium text-text-muted mb-1">{cat.label}</p>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handlePick(emoji)}
                      className={`text-xl p-1 rounded hover:bg-background ${
                        value === emoji ? "bg-background ring-1 ring-text-primary" : ""
                      }`}
                      aria-label={`Selecionar ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

