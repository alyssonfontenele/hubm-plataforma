import { useEffect, useState } from "react";
import {
  BarChart2,
  BookOpen,
  Code2,
  FileText,
  Film,
  Folder as FolderIcon,
  Globe,
  Image as ImageIcon,
  Link2,
  Table2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase, type ResourceType } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Folder {
  id: string;
  name: string;
  sector_id: string;
  parent_id: string | null;
  sort_order: number | null;
  is_page: boolean;
}

export interface Resource {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  type: ResourceType;
  folder_id: string | null;
  thumbnail_url: string | null;
  sort_order: number | null;
  mime_type: string | null;
  created_by: string | null;
  created_at: string | null;
  icon: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sectorId: string;
  folders: Folder[];
  currentFolderId: string | null;
  onCreated: (resource: Resource) => void;
}

const TYPE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: "link",        label: "Link"         },
  { value: "spreadsheet", label: "Planilha"     },
  { value: "document",    label: "Documento"    },
  { value: "pdf",         label: "PDF"          },
  { value: "slides",      label: "Apresentação" },
  { value: "system",      label: "Sistema"      },
  { value: "file",        label: "Arquivo"      },
];

const ICON_OPTIONS: { iconName: string; Icon: typeof FileText }[] = [
  { iconName: "FileText",  Icon: FileText  },
  { iconName: "Link2",     Icon: Link2     },
  { iconName: "Table2",    Icon: Table2    },
  { iconName: "Film",      Icon: Film      },
  { iconName: "Image",     Icon: ImageIcon },
  { iconName: "Folder",    Icon: FolderIcon },
  { iconName: "BookOpen",  Icon: BookOpen  },
  { iconName: "BarChart2", Icon: BarChart2 },
  { iconName: "Globe",     Icon: Globe     },
  { iconName: "Code2",     Icon: Code2     },
];

export function ResourceCreateModal({
  open,
  onClose,
  sectorId: _sectorId,
  folders,
  currentFolderId,
  onCreated,
}: Props) {
  const { profile } = useAuth();
  const [resourceName, setResourceName] = useState("");
  const [type, setType] = useState<ResourceType>("link");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pre-select folder when modal opens
  useEffect(() => {
    if (open) {
      const valid =
        currentFolderId && folders.some((f) => f.id === currentFolderId)
          ? currentFolderId
          : (folders[0]?.id ?? null);
      setFolderId(valid);
    }
  }, [open, currentFolderId, folders]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setResourceName("");
      setType("link");
      setFolderId(null);
      setDescription("");
      setUrl("");
      setIcon(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!resourceName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("resources")
      .insert({
        folder_id: folderId || null,
        type,
        name: resourceName.trim(),
        description: description.trim() || null,
        url: url.trim() || null,
        icon: icon || null,
        created_by: profile?.id ?? null,
        sort_order: 0,
      })
      .select("id,name,description,url,type,folder_id,thumbnail_url,sort_order,mime_type,created_by,created_at,icon")
      .single();
    setSaving(false);
    if (error) {
      toast.error("Erro ao criar recurso: " + error.message);
      return;
    }
    toast.success("Recurso criado.");
    onCreated(data as Resource);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-surface border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Novo recurso</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-text-secondary">Nome *</label>
            <input
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              placeholder="Nome do recurso"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary">Tipo *</label>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    type === opt.value
                      ? "bg-text-primary text-background border-text-primary"
                      : "bg-background text-text-secondary border-border hover:bg-accent-light"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-text-secondary">Pasta</label>
            <select
              value={folderId ?? ""}
              onChange={(e) => setFolderId(e.target.value || null)}
              className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="">Nenhuma (raiz do setor)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-text-secondary">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Descrição opcional"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-text-secondary">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary">Ícone</label>
            <div className="grid grid-cols-5 gap-2">
              {ICON_OPTIONS.map(({ iconName, Icon }) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => setIcon(icon === iconName ? null : iconName)}
                  className={`flex items-center justify-center h-9 rounded-md border transition-colors ${
                    icon === iconName
                      ? "border-text-primary bg-text-primary/10 text-text-primary"
                      : "border-border bg-background text-text-muted hover:bg-accent-light"
                  }`}
                  aria-label={iconName}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !resourceName.trim()}
            className="flex-1 bg-text-primary text-background hover:bg-text-primary/90"
          >
            {saving ? "Criando…" : "Criar recurso"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
