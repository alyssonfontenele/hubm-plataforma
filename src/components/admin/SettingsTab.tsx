import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ImageIcon, Palette, ShieldCheck, Type } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/x-icon": "ico",
};

async function uploadAsset(companyId: string, file: File, name: string): Promise<string> {
  const ext = MIME_TO_EXT[file.type] ?? "png";
  const path = `${companyId}/${name}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from("company-assets")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) throw uploadErr;
  const { data } = supabase.storage.from("company-assets").getPublicUrl(path);
  return data.publicUrl;
}

function BrandingSection() {
  const { company, refresh } = useAuth();

  const logoInputRef    = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  const [logoLoading,    setLogoLoading]    = useState(false);
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [colorLoading,   setColorLoading]   = useState(false);
  const [nameLoading,    setNameLoading]    = useState(false);

  const [color, setColor] = useState(company?.primary_color ?? "#111111");
  const [name,  setName]  = useState(company?.name ?? "");

  useEffect(() => {
    setColor(company?.primary_color ?? "#111111");
    setName(company?.name ?? "");
  }, [company]);

  if (!company) return null;

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo deve ter no máximo 2MB.");
      return;
    }
    setLogoLoading(true);
    try {
      const url = await uploadAsset(company.id, file, "logo");
      const { error } = await supabase.from("companies").update({ logo_url: url }).eq("id", company.id);
      if (error) throw error;
      await refresh();
      toast.success("Logo atualizado.");
    } catch (err) {
      toast.error("Erro ao atualizar logo: " + (err instanceof Error ? err.message : "Tente novamente."));
    } finally {
      setLogoLoading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleFaviconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      toast.error("Favicon deve ter no máximo 512KB.");
      return;
    }
    setFaviconLoading(true);
    try {
      const url = await uploadAsset(company.id, file, "favicon");
      const { error } = await supabase.from("companies").update({ favicon_url: url }).eq("id", company.id);
      if (error) throw error;
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
      if (link) link.href = url;
      await refresh();
      toast.success("Favicon atualizado.");
    } catch (err) {
      toast.error("Erro ao atualizar favicon: " + (err instanceof Error ? err.message : "Tente novamente."));
    } finally {
      setFaviconLoading(false);
      if (faviconInputRef.current) faviconInputRef.current.value = "";
    }
  };

  const handleColorSave = async () => {
    setColorLoading(true);
    try {
      const { error } = await supabase.from("companies").update({ primary_color: color }).eq("id", company.id);
      if (error) throw error;
      document.documentElement.style.setProperty("--company-primary", color);
      await refresh();
      toast.success("Cor atualizada.");
    } catch (err) {
      toast.error("Erro ao salvar cor: " + (err instanceof Error ? err.message : "Tente novamente."));
    } finally {
      setColorLoading(false);
    }
  };

  const handleNameSave = async () => {
    if (!name.trim()) {
      toast.error("Nome não pode ser vazio.");
      return;
    }
    setNameLoading(true);
    try {
      const { error } = await supabase.from("companies").update({ name: name.trim() }).eq("id", company.id);
      if (error) throw error;
      await refresh();
      toast.success("Nome atualizado.");
    } catch (err) {
      toast.error("Erro ao salvar nome: " + (err instanceof Error ? err.message : "Tente novamente."));
    } finally {
      setNameLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      <header>
        <p className="text-sm font-medium text-text-primary flex items-center gap-2">
          <Palette className="w-4 h-4" /> Identidade visual
        </p>
        <p className="text-xs text-text-muted">
          Personalize a aparência do hub para sua empresa.
        </p>
      </header>

      {/* Logo */}
      <div className="border border-border rounded-lg bg-surface p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Logo
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Recomendado: 200×60px, PNG com fundo transparente
            </p>
          </div>
          <Button
            variant="outline"
            className="border-border shrink-0"
            disabled={logoLoading}
            onClick={() => logoInputRef.current?.click()}
          >
            {logoLoading ? "Enviando…" : "Alterar logo"}
          </Button>
        </div>
        {company.logo_url && (
          <div className="rounded-md border border-border bg-accent-light p-3 flex items-center justify-center h-16">
            <img src={company.logo_url} alt="Logo atual" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={handleLogoChange}
        />
      </div>

      {/* Favicon */}
      <div className="border border-border rounded-lg bg-surface p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Favicon
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Recomendado: 64×64px ou 32×32px
            </p>
          </div>
          <Button
            variant="outline"
            className="border-border shrink-0"
            disabled={faviconLoading}
            onClick={() => faviconInputRef.current?.click()}
          >
            {faviconLoading ? "Enviando…" : "Alterar favicon"}
          </Button>
        </div>
        {company.favicon_url && (
          <div className="rounded-md border border-border bg-accent-light p-3 flex items-center justify-center h-16">
            <img src={company.favicon_url} alt="Favicon atual" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <input
          ref={faviconInputRef}
          type="file"
          accept="image/png,image/svg+xml,image/x-icon"
          className="hidden"
          onChange={handleFaviconChange}
        />
      </div>

      {/* Cor primária */}
      <div className="border border-border rounded-lg bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-text-primary">
            Cor principal (sidebar e botões)
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 rounded-md border border-border bg-surface cursor-pointer p-0.5"
            />
            <Button
              onClick={handleColorSave}
              disabled={colorLoading}
              className="bg-text-primary text-background hover:bg-text-primary/90"
            >
              {colorLoading ? "Salvando…" : "Salvar cor"}
            </Button>
          </div>
        </div>
      </div>

      {/* Nome de exibição */}
      <div className="border border-border rounded-lg bg-surface p-4">
        <p className="text-sm font-medium text-text-primary flex items-center gap-2 mb-3">
          <Type className="w-4 h-4" /> Nome de exibição
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 h-9 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
          <Button
            onClick={handleNameSave}
            disabled={nameLoading}
            className="bg-text-primary text-background hover:bg-text-primary/90 shrink-0"
          >
            {nameLoading ? "Salvando…" : "Salvar nome"}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SecuritySection() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error) {
      const verified = data?.totp?.find((f) => f.status === "verified");
      setFactorId(verified?.id ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleRemove = async () => {
    if (!factorId) return;
    setRemoving(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setRemoving(false);
    setConfirmOpen(false);
    if (error) {
      toast.error("Falha ao remover MFA: " + error.message);
      return;
    }
    toast.success("Autenticação em duas etapas removida.");
    setFactorId(null);
  };

  const enrolled = !!factorId;

  return (
    <section className="space-y-4">
      <header>
        <p className="text-sm font-medium text-text-primary flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Segurança
        </p>
        <p className="text-xs text-text-muted">
          Proteja sua conta com camadas extras de autenticação.
        </p>
      </header>

      <div className="border border-border rounded-lg bg-surface p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary">
              Autenticação em duas etapas (MFA)
            </p>
            {enrolled && (
              <Badge variant="outline" className="border-border text-text-primary">
                Ativo
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            {enrolled
              ? "Sua conta exige um código TOTP a cada novo acesso."
              : "Adicione um aplicativo autenticador para reforçar a segurança da sua conta."}
          </p>
        </div>
        <div className="shrink-0">
          {loading ? (
            <span className="text-xs text-text-muted">Carregando…</span>
          ) : enrolled ? (
            <Button
              variant="outline"
              className="border-border"
              onClick={() => setConfirmOpen(true)}
            >
              Remover
            </Button>
          ) : (
            <Button
              onClick={() => void navigate({ to: "/setup-mfa" })}
              className="bg-text-primary text-background hover:bg-text-primary/90"
            >
              Ativar
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover autenticação em duas etapas</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover a autenticação em duas etapas? Sua conta ficará menos protegida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void handleRemove();
              }}
            >
              {removing ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function SettingsTab() {
  const { globalRole } = useAuth();
  return (
    <div className="space-y-6">
      {globalRole === "admin" && <BrandingSection />}
      <SecuritySection />
    </div>
  );
}
