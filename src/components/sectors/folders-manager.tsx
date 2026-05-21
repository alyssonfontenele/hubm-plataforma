import { useEffect, useMemo, useState } from "react";
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
import {
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { sanitize } from "@/lib/sanitize";

export interface FolderNode {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sector_id: string;
  parent_id: string | null;
  sort_order: number | null;
  is_page: boolean;
}

const EMOJI_QUICK = [
  "📁", "📂", "📋", "📝", "📊", "📈", "💼", "💰",
  "👥", "🛠️", "⚙️", "📌", "🎯", "🚀", "🔔", "🏢",
];

export function useFolders(sectorId: string | undefined) {
  return useQuery({
    queryKey: ["sector-folders", sectorId],
    enabled: !!sectorId,
    staleTime: 30_000,
    queryFn: async (): Promise<FolderNode[]> => {
      if (!sectorId) return [];
      const { data, error } = await supabase
        .from("folders")
        .select("id,name,description,icon,sector_id,parent_id,sort_order,is_page")
        .eq("sector_id", sectorId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as FolderNode[] | null) ?? []).map((f) => ({
        ...f,
        is_page: Boolean(f.is_page),
      }));
    },
  });
}

export function FoldersManager({
  sectorId,
  canManage,
}: {
  sectorId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["sector-folders", sectorId];
  const { data: folders = [], isLoading } = useFolders(sectorId);

  const pages = useMemo(
    () => folders.filter((f) => f.is_page && !f.parent_id),
    [folders],
  );
  const rootFolders = useMemo(
    () => folders.filter((f) => !f.is_page && !f.parent_id),
    [folders],
  );
  const childrenByPage = useMemo(() => {
    const map = new Map<string, FolderNode[]>();
    for (const f of folders) {
      if (f.parent_id) {
        const arr = map.get(f.parent_id) ?? [];
        arr.push(f);
        map.set(f.parent_id, arr);
      }
    }
    return map;
  }, [folders]);

  const [editing, setEditing] = useState<FolderNode | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formMode, setFormMode] = useState<{
    is_page: boolean;
    parent_id: string | null;
  }>({ is_page: false, parent_id: null });
  const [pendingDelete, setPendingDelete] = useState<FolderNode | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const openCreate = (opts: { is_page: boolean; parent_id?: string | null }) => {
    setEditing(null);
    setFormMode({ is_page: opts.is_page, parent_id: opts.parent_id ?? null });
    setSheetOpen(true);
  };

  const openEdit = (folder: FolderNode) => {
    setEditing(folder);
    setFormMode({ is_page: folder.is_page, parent_id: folder.parent_id });
    setSheetOpen(true);
  };

  const handleReorder = async (ids: string[]) => {
    const updates = ids.map((id, idx) =>
      supabase.from("folders").update({ sort_order: idx }).eq("id", id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      toast.error("Falha ao reordenar: " + failed.error.message);
    }
    refresh();
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase
      .from("folders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", pendingDelete.id);
    if (error) {
      toast.error("Falha ao excluir: " + error.message);
    } else {
      toast.success(
        pendingDelete.is_page ? "Página excluída." : "Pasta excluída.",
      );
    }
    setPendingDelete(null);
    refresh();
  };

  if (!canManage) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4 md:p-5 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Páginas e pastas
          </h2>
          <p className="text-xs text-text-muted">
            Organize o conteúdo deste setor. Arraste para reordenar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openCreate({ is_page: true })}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova página
          </Button>
          <Button
            size="sm"
            className="bg-text-primary text-background hover:bg-text-primary/90"
            onClick={() => openCreate({ is_page: false })}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova pasta
          </Button>
        </div>
      </header>

      {isLoading ? (
        <p className="text-xs text-text-muted">Carregando…</p>
      ) : pages.length === 0 && rootFolders.length === 0 ? (
        <p className="text-xs text-text-muted">
          Nenhuma página ou pasta cadastrada.
        </p>
      ) : (
        <div className="space-y-4">
          {pages.length > 0 && (
            <SortableList
              items={pages}
              onReorder={handleReorder}
              renderItem={(page) => (
                <PageRow
                  key={page.id}
                  page={page}
                  children={childrenByPage.get(page.id) ?? []}
                  onEdit={() => openEdit(page)}
                  onDelete={() => setPendingDelete(page)}
                  onAddChild={() =>
                    openCreate({ is_page: false, parent_id: page.id })
                  }
                  onEditChild={openEdit}
                  onDeleteChild={(c) => setPendingDelete(c)}
                  onReorderChildren={handleReorder}
                />
              )}
            />
          )}

          {rootFolders.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Pastas avulsas
              </p>
              <SortableList
                items={rootFolders}
                onReorder={handleReorder}
                renderItem={(folder) => (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    onEdit={() => openEdit(folder)}
                    onDelete={() => setPendingDelete(folder)}
                  />
                )}
              />
            </div>
          )}
        </div>
      )}

      <FolderFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        sectorId={sectorId}
        folder={editing}
        defaults={formMode}
        existingPages={pages}
        nextSortOrder={
          formMode.is_page
            ? pages.length
            : formMode.parent_id
              ? (childrenByPage.get(formMode.parent_id)?.length ?? 0)
              : rootFolders.length
        }
        onSaved={async () => {
          setSheetOpen(false);
          refresh();
        }}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {pendingDelete?.is_page ? "página" : "pasta"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.is_page
                ? "As pastas e recursos vinculados a esta página continuarão existindo, mas ela deixará de aparecer na barra lateral."
                : "Esta pasta deixará de aparecer e os recursos vinculados ficarão sem categoria."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  renderItem: (item: T) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(items, oldIdx, newIdx);
    onReorder(next.map((i) => i.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="space-y-1.5">{items.map((i) => renderItem(i))}</ul>
      </SortableContext>
    </DndContext>
  );
}

function PageRow({
  page,
  children,
  onEdit,
  onDelete,
  onAddChild,
  onEditChild,
  onDeleteChild,
  onReorderChildren,
}: {
  page: FolderNode;
  children: FolderNode[];
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  onEditChild: (folder: FolderNode) => void;
  onDeleteChild: (folder: FolderNode) => void;
  onReorderChildren: (ids: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id });
  const [open, setOpen] = useState(true);

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="rounded-md border border-border bg-background/40"
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          className="text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing touch-none p-1"
          aria-label="Reordenar"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Recolher página" : "Expandir página"}
          aria-expanded={open}
          className="p-1 text-text-muted hover:text-text-primary"
        >
          <ChevronRight
            className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
        <span className="text-lg w-6 text-center" aria-hidden>
          {page.icon || "📄"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">
            {page.name}
          </p>
          <p className="text-xs text-text-muted">
            Página · {children.length} {children.length === 1 ? "pasta" : "pastas"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={onAddChild}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Pasta
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onEdit}
            aria-label="Editar página"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            aria-label="Excluir página"
          >
            <Trash2 className="w-4 h-4 text-text-muted" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-2 py-2 pl-8">
          {children.length === 0 ? (
            <p className="text-xs text-text-muted py-1.5">
              Sem pastas nesta página.
            </p>
          ) : (
            <SortableList
              items={children}
              onReorder={onReorderChildren}
              renderItem={(child) => (
                <FolderRow
                  key={child.id}
                  folder={child}
                  onEdit={() => onEditChild(child)}
                  onDelete={() => onDeleteChild(child)}
                  compact
                />
              )}
            />
          )}
        </div>
      )}
    </li>
  );
}

function FolderRow({
  folder,
  onEdit,
  onDelete,
  compact = false,
}: {
  folder: FolderNode;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={`flex items-center gap-2 rounded-md border border-border bg-background/40 ${
        compact ? "px-2 py-1.5" : "px-2 py-2"
      }`}
    >
      <button
        type="button"
        className="text-text-muted hover:text-text-primary cursor-grab active:cursor-grabbing touch-none p-1"
        aria-label="Reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-base w-5 text-center" aria-hidden>
        {folder.icon || (compact ? "📁" : <FolderIcon className="w-4 h-4 inline" />)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate">{folder.name}</p>
        {folder.description && (
          <p className="text-xs text-text-muted truncate">{folder.description}</p>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onEdit}
        aria-label="Editar pasta"
      >
        <Pencil className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={onDelete}
        aria-label="Excluir pasta"
      >
        <Trash2 className="w-4 h-4 text-text-muted" />
      </Button>
    </li>
  );
}

function FolderFormSheet({
  open,
  onOpenChange,
  sectorId,
  folder,
  defaults,
  existingPages,
  nextSortOrder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sectorId: string;
  folder: FolderNode | null;
  defaults: { is_page: boolean; parent_id: string | null };
  existingPages: FolderNode[];
  nextSortOrder: number;
  onSaved: () => void | Promise<void>;
}) {
  const editing = !!folder;
  const isPage = folder ? folder.is_page : defaults.is_page;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [parentId, setParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(folder?.name ?? "");
    setDescription(folder?.description ?? "");
    setIcon(folder?.icon ?? "");
    setSortOrder(folder?.sort_order ?? nextSortOrder);
    setParentId(folder?.parent_id ?? defaults.parent_id ?? null);
  }, [open, folder, defaults.parent_id, nextSortOrder]);

  const submit = async () => {
    const cleanName = sanitize(name).trim();
    if (!cleanName) {
      toast.error("Informe o nome.");
      return;
    }
    setSaving(true);
    const payload = {
      name: cleanName,
      description: sanitize(description).trim() || null,
      icon: icon.trim() || null,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      parent_id: isPage ? null : parentId,
      is_page: isPage,
    };

    if (editing && folder) {
      const { error } = await supabase
        .from("folders")
        .update(payload)
        .eq("id", folder.id);
      setSaving(false);
      if (error) {
        toast.error("Falha ao salvar: " + error.message);
        return;
      }
      toast.success(isPage ? "Página atualizada." : "Pasta atualizada.");
    } else {
      const { error } = await supabase.from("folders").insert({
        ...payload,
        sector_id: sectorId,
      });
      setSaving(false);
      if (error) {
        toast.error("Falha ao criar: " + error.message);
        return;
      }
      toast.success(isPage ? "Página criada." : "Pasta criada.");
    }
    await onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-surface border-border w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {editing
              ? isPage
                ? "Editar página"
                : "Editar pasta"
              : isPage
                ? "Nova página"
                : "Nova pasta"}
          </SheetTitle>
          <SheetDescription>
            {isPage
              ? "Páginas agrupam pastas relacionadas na barra lateral."
              : "Pastas armazenam recursos do setor."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">Nome *</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isPage ? "Ex.: Recursos Humanos" : "Ex.: Contratos"}
              maxLength={80}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="folder-description">Descrição</Label>
            <Textarea
              id="folder-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional."
              rows={3}
              maxLength={300}
            />
          </div>

          <div className="space-y-2">
            <Label>Ícone</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder={isPage ? "📄" : "📁"}
                maxLength={8}
                className="w-20 text-center text-lg"
              />
              <div className="flex flex-wrap gap-1">
                {EMOJI_QUICK.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setIcon(emoji)}
                    className={`text-lg p-1 rounded border ${
                      icon === emoji
                        ? "border-text-primary bg-background"
                        : "border-transparent hover:bg-background"
                    }`}
                    aria-label={`Selecionar ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!isPage && existingPages.length > 0 && (
            <div className="space-y-2">
              <Label>Página</Label>
              <Select
                value={parentId ?? "__none__"}
                onValueChange={(v) =>
                  setParentId(v === "__none__" ? null : v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem página (raiz)</SelectItem>
                  {existingPages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.icon ? `${p.icon} ` : ""}
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-text-muted">
                Pastas dentro de uma página aparecem aninhadas na barra lateral.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="folder-sort">Ordem</Label>
            <Input
              id="folder-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              min={0}
              className="w-32"
            />
            <p className="text-xs text-text-muted">
              Menor número aparece primeiro. Também é possível arrastar para
              reordenar.
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
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

// Re-export icon for potential reuse
export { FileText as PageIcon };
