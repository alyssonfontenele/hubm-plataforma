import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Company } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  editTarget: Company | null;
}

const DEFAULT_FORM = {
  name: "",
  slug: "",
  domain: "",
  primary_color: "#111111",
  email_sender: "",
  allowed_domains_raw: "",
  active: true,
};

const inputCls =
  "w-full h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
      {children}
    </div>
  );
}

export function CompanyFormModal({ open, onClose, onSaved, editTarget }: Props) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setForm({
        name: editTarget.name,
        slug: editTarget.slug,
        domain: editTarget.domain ?? "",
        primary_color: editTarget.primary_color ?? "#111111",
        email_sender: editTarget.email_sender ?? "",
        allowed_domains_raw: "",
        active: editTarget.active,
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [open, editTarget]);

  const set = (k: keyof typeof DEFAULT_FORM, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error("Nome e slug são obrigatórios.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(form.slug.trim())) {
      toast.error("Slug deve conter apenas letras minúsculas, números e hífens.");
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        const { error } = await supabase
          .from("companies")
          .update({
            name: form.name.trim(),
            slug: form.slug.trim(),
            domain: form.domain.trim() || null,
            primary_color: form.primary_color,
            email_sender: form.email_sender.trim() || null,
            active: form.active,
          })
          .eq("id", editTarget.id);
        if (error) throw error;
        toast.success("Empresa atualizada.");
      } else {
        const allowed: string[] = form.allowed_domains_raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        const { data: newCompany, error: compErr } = await supabase
          .from("companies")
          .insert({
            name: form.name.trim(),
            slug: form.slug.trim(),
            domain: form.domain.trim() || null,
            primary_color: form.primary_color,
            email_sender: form.email_sender.trim() || null,
            allowed_domains: allowed,
            active: form.active,
          })
          .select("id")
          .single();
        if (compErr) throw compErr;

        const companyId = newCompany.id as string;

        const { data: sector, error: secErr } = await supabase
          .from("sectors")
          .insert({
            company_id: companyId,
            name: "Geral",
            slug: "geral",
            icon: "🏠",
            sort_order: 1,
            active: true,
          })
          .select("id")
          .single();
        if (secErr) throw secErr;

        const { data: cargo, error: cargErr } = await supabase
          .from("cargos")
          .insert({
            company_id: companyId,
            name: "Membro",
            description: "Membro da empresa.",
          })
          .select("id")
          .single();
        if (cargErr) throw cargErr;

        const { error: csErr } = await supabase
          .from("cargo_sectors")
          .insert({ cargo_id: (cargo as { id: string }).id, sector_id: (sector as { id: string }).id });
        if (csErr) throw csErr;

        toast.success("Empresa criada com sucesso.");
      }

      await onSaved();
    } catch (err) {
      toast.error("Erro: " + (err instanceof Error ? err.message : "Tente novamente."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editTarget ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          <DialogDescription>
            {editTarget
              ? "Edite as informações da empresa."
              : "Preencha os dados para cadastrar uma nova empresa. Um setor 'Geral' e cargo 'Membro' serão criados automaticamente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Field label="Nome *">
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Acme Corp"
              className={inputCls}
            />
          </Field>

          <Field label="Slug *">
            <input
              type="text"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="acme"
              disabled={!!editTarget}
              className={inputCls + (editTarget ? " opacity-60 cursor-not-allowed" : "")}
            />
            <p className="text-xs text-text-muted mt-1">
              Identificador único. Não pode ser alterado após criação.
            </p>
          </Field>

          <Field label="Domínio">
            <input
              type="text"
              value={form.domain}
              onChange={(e) => set("domain", e.target.value)}
              placeholder="acme.com.br"
              className={inputCls}
            />
          </Field>

          <Field label="E-mail remetente">
            <input
              type="email"
              value={form.email_sender}
              onChange={(e) => set("email_sender", e.target.value)}
              placeholder="noreply@acme.com.br"
              className={inputCls}
            />
          </Field>

          {!editTarget && (
            <Field label="Domínios Google permitidos">
              <input
                type="text"
                value={form.allowed_domains_raw}
                onChange={(e) => set("allowed_domains_raw", e.target.value)}
                placeholder="acme.com.br, acme.com"
                className={inputCls}
              />
              <p className="text-xs text-text-muted mt-1">
                Separados por vírgula. Deixe em branco para desabilitar login Google.
              </p>
            </Field>
          )}

          <Field label="Cor principal">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primary_color}
                onChange={(e) => set("primary_color", e.target.value)}
                className="h-9 w-12 rounded-md border border-border bg-surface cursor-pointer p-0.5"
              />
              <span className="text-sm text-text-secondary font-mono">{form.primary_color}</span>
            </div>
          </Field>

          <Field label="Status">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="company-active"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="company-active" className="text-sm text-text-primary cursor-pointer">
                Empresa ativa
              </label>
            </div>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose} className="border-border">
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={() => void handleSave()}
            className="bg-text-primary text-background hover:bg-text-primary/90"
          >
            {saving ? "Salvando…" : editTarget ? "Salvar" : "Criar empresa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
