import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid,
  Layers,
  Kanban,
  Factory,
  Package,
  PackageCheck,
  Boxes,
  Truck,
  Warehouse,
  ClipboardList,
  ChartBar,
  ChartLine,
  FileText,
  Receipt,
  Users,
  Wrench,
  Hammer,
  Ruler,
  Scissors,
  Calendar,
  Clock,
  Gauge,
  Settings,
  Shield,
  Store,
  ShoppingCart,
  Tags,
  ScanBarcode,
  Printer,
  ListChecks,
  Plus,
  Pencil,
  ExternalLink,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AppsTabProps {
  companyId: string;
}

interface AppRow {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  url: string;
  icon: string | null;
  sort_order: number;
  active: boolean;
}

/** Lista curada de ícones lucide pertinentes a indústria/gestão para os apps da sidebar. */
const ICON_OPTIONS: { value: string; label: string; Icon: LucideIcon }[] = [
  { value: "layers", label: "Camadas", Icon: Layers },
  { value: "layout-grid", label: "Grade", Icon: LayoutGrid },
  { value: "kanban", label: "Kanban", Icon: Kanban },
  { value: "factory", label: "Fábrica", Icon: Factory },
  { value: "package", label: "Pacote", Icon: Package },
  { value: "package-check", label: "Pacote OK", Icon: PackageCheck },
  { value: "boxes", label: "Caixas", Icon: Boxes },
  { value: "truck", label: "Caminhão", Icon: Truck },
  { value: "warehouse", label: "Armazém", Icon: Warehouse },
  { value: "clipboard-list", label: "Checklist", Icon: ClipboardList },
  { value: "chart-bar", label: "Gráfico barras", Icon: ChartBar },
  { value: "chart-line", label: "Gráfico linha", Icon: ChartLine },
  { value: "file-text", label: "Documento", Icon: FileText },
  { value: "receipt", label: "Recibo", Icon: Receipt },
  { value: "users", label: "Pessoas", Icon: Users },
  { value: "wrench", label: "Manutenção", Icon: Wrench },
  { value: "hammer", label: "Ferramenta", Icon: Hammer },
  { value: "ruler", label: "Régua", Icon: Ruler },
  { value: "scissors", label: "Corte", Icon: Scissors },
  { value: "calendar", label: "Calendário", Icon: Calendar },
  { value: "clock", label: "Relógio", Icon: Clock },
  { value: "gauge", label: "Medidor", Icon: Gauge },
  { value: "settings", label: "Configurações", Icon: Settings },
  { value: "shield", label: "Segurança", Icon: Shield },
  { value: "store", label: "Loja", Icon: Store },
  { value: "shopping-cart", label: "Carrinho", Icon: ShoppingCart },
  { value: "tags", label: "Etiquetas", Icon: Tags },
  { value: "scan-barcode", label: "Código de barras", Icon: ScanBarcode },
  { value: "printer", label: "Impressora", Icon: Printer },
  { value: "list-checks", label: "Lista de tarefas", Icon: ListChecks },
];

const ICON_MAP = new Map(ICON_OPTIONS.map((o) => [o.value, o.Icon]));

function AppIconPreview({ icon, className }: { icon: string | null; className?: string }) {
  const Icon = (icon && ICON_MAP.get(icon)) || LayoutGrid;
  return <Icon className={className ?? "w-4 h-4"} />;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const appsQueryKey = (companyId: string) => ["admin-apps", companyId] as const;

// ─── Form modal (criar/editar) ─────────────────────────────────────────────

interface AppFormValues {
  name: string;
  url: string;
  icon: string;
  sort_order: number;
  active: boolean;
}

function AppFormModal({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: AppRow | null;
  onSave: (values: AppFormValues) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("layout-grid");
  const [sortOrder, setSortOrder] = useState(0);
  const [active, setActive] = useState(true);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setUrl(initial?.url ?? "");
    setIcon(initial?.icon ?? "layout-grid");
    setSortOrder(initial?.sort_order ?? 0);
    setActive(initial?.active ?? true);
    setUrlError(null);
  }, [open, initial]);

  const handleSave = async () => {
    if (!name.trim()) return;
    if (!url.trim().startsWith("https://")) {
      setUrlError("A URL precisa começar com https://");
      return;
    }
    setUrlError(null);
    setSaving(true);
    try {
      await onSave({ name: name.trim(), url: url.trim(), icon, sort_order: sortOrder, active });
    } finally {
      setSaving(false);
    }
  };

  const SelectedIcon = ICON_MAP.get(icon) ?? LayoutGrid;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="bg-surface border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary">
            {initial ? "Editar app" : "Novo app"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="app-name">Nome *</Label>
            <Input
              id="app-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Estoque de Chapas"
            />
            <p className="text-xs text-text-muted">Salvo em CAIXA ALTA.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="app-url">URL *</Label>
            <Input
              id="app-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(null);
              }}
              placeholder="https://..."
            />
            {urlError && <p className="text-xs text-danger">{urlError}</p>}
            <div className="flex items-start gap-1.5 text-xs text-text-muted">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                Só HTTPS. O domínio precisa permitir ser exibido em iframe (header{" "}
                <code>frame-ancestors</code>) e estar listado em <code>frame-src</code> no{" "}
                <code>vercel.json</code>.
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Ícone</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger>
                <SelectValue>
                  <span className="flex items-center gap-2">
                    <SelectedIcon className="w-4 h-4" />
                    {ICON_OPTIONS.find((o) => o.value === icon)?.label ?? icon}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {ICON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <opt.Icon className="w-4 h-4" />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <div className="space-y-1 flex-1">
              <Label htmlFor="app-sort">Ordem</Label>
              <Input
                id="app-sort"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch id="app-active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="app-active">Ativo</Label>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !name.trim() || !url.trim()}
            className="flex-1 bg-text-primary text-background hover:bg-text-primary/90"
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main tab ───────────────────────────────────────────────────────────────

export function AppsTab({ companyId }: AppsTabProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AppRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: apps = [], isLoading } = useQuery({
    queryKey: appsQueryKey(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("apps")
        .select("id,company_id,name,slug,url,icon,sort_order,active")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppRow[];
    },
  });

  const refresh = async () => {
    // Mesma query key usada por useApps (sidebar) — invalida junto para
    // refletir a mudança sem precisar recarregar a página.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: appsQueryKey(companyId) }),
      queryClient.invalidateQueries({ queryKey: ["apps", companyId] }),
    ]);
  };

  const handleOpenCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };
  const handleOpenEdit = (app: AppRow) => {
    setEditTarget(app);
    setFormOpen(true);
  };

  const handleSave = async (values: AppFormValues) => {
    const upperName = values.name.toUpperCase();

    if (editTarget) {
      const { error } = await supabase
        .from("apps")
        .update({
          name: upperName,
          url: values.url,
          icon: values.icon,
          sort_order: values.sort_order,
          active: values.active,
        })
        .eq("id", editTarget.id);
      if (error) {
        toast.error("Erro ao salvar app: " + error.message);
        return;
      }
      toast.success("App atualizado.");
    } else {
      const slug = slugify(values.name) || `app-${Date.now()}`;
      const { error } = await supabase.from("apps").insert({
        company_id: companyId,
        name: upperName,
        slug,
        url: values.url,
        icon: values.icon,
        sort_order: values.sort_order,
        active: values.active,
      });
      if (error) {
        toast.error("Erro ao criar app: " + error.message);
        return;
      }
      toast.success("App criado.");
    }

    setFormOpen(false);
    setEditTarget(null);
    await refresh();
  };

  const handleToggleActive = async (app: AppRow) => {
    setTogglingId(app.id);
    try {
      const { error } = await supabase
        .from("apps")
        .update({ active: !app.active })
        .eq("id", app.id);
      if (error) {
        toast.error("Erro ao atualizar app.");
        return;
      }
      toast.success(app.active ? "App desativado." : "App ativado.");
      await refresh();
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-text-muted" />
          <p className="text-sm font-medium text-text-primary">Apps</p>
          <p className="text-xs text-text-muted">
            Mini-apps embutidos por iframe, exibidos na sidebar.
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleOpenCreate}
          className="h-8 px-3 text-xs bg-text-primary text-background hover:bg-text-primary/90"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Novo app
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-md bg-accent-light animate-pulse" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <p className="text-sm text-text-muted py-10 text-center">
          Nenhum app cadastrado para esta empresa.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-20">Ordem</TableHead>
              <TableHead className="w-20">Ativo</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {apps.map((app) => (
              <TableRow key={app.id} className={!app.active ? "opacity-60" : undefined}>
                <TableCell>
                  <AppIconPreview icon={app.icon} className="w-4 h-4 text-text-muted" />
                </TableCell>
                <TableCell className="font-medium text-text-primary">{app.name}</TableCell>
                <TableCell className="max-w-xs truncate text-xs text-text-muted">
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-info hover:underline"
                  >
                    {app.url}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </TableCell>
                <TableCell className="text-xs text-text-muted">{app.sort_order}</TableCell>
                <TableCell>
                  <Switch
                    checked={app.active}
                    disabled={togglingId === app.id}
                    onCheckedChange={() => void handleToggleActive(app)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(app)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                    title="Editar app"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AppFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditTarget(null);
        }}
        initial={editTarget}
        onSave={handleSave}
      />
    </div>
  );
}
