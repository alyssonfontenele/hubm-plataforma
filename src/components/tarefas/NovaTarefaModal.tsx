import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCreateTarefa,
  type TarefasModo,
  type TarefasTipo,
} from "@/hooks/useTarefas";

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface ProfileOption {
  id: string;
  full_name: string;
  display_name: string | null;
}

function displayName(p: ProfileOption): string {
  return p.display_name ?? p.full_name;
}

// ---------------------------------------------------------------------------
// Hook: perfis ativos da empresa atual
// ---------------------------------------------------------------------------

function useProfilesEmpresa() {
  const { company } = useAuth();
  const companyId = company?.id;

  return useQuery<ProfileOption[]>({
    queryKey: ["profiles-empresa", companyId ?? ""],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, display_name")
        .eq("company_id", companyId!)
        .eq("active", true)
        .is("deleted_at", null)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileOption[];
    },
  });
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface Props {
  /** Texto e ícone do botão que abre o modal. */
  label?: string;
  /** Tamanho do botão. */
  size?: "sm" | "default";
}

export function NovaTarefaModal({ label = "Nova Tarefa", size = "default" }: Props) {
  const { profile } = useAuth();
  const { data: profiles = [], isLoading: loadingProfiles } = useProfilesEmpresa();
  const createTarefa = useCreateTarefa();

  const [open, setOpen] = useState(false);

  // --- form state ---
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<TarefasTipo>("requisitada");
  const [modo, setModo] = useState<TarefasModo>("unica");
  const [responsavelId, setResponsavelId] = useState("");
  const [atribuidoIds, setAtribuidoIds] = useState<string[]>([]);
  const [prazo, setPrazo] = useState("");

  // Tipo=propria força modo=unica e responsavel=self
  const modoEfetivo: TarefasModo = tipo === "propria" ? "unica" : modo;

  function resetForm() {
    setTitulo("");
    setDescricao("");
    setTipo("requisitada");
    setModo("unica");
    setResponsavelId("");
    setAtribuidoIds([]);
    setPrazo("");
  }

  function toggleAtribuido(id: string) {
    setAtribuidoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;

    // Validações
    if (modoEfetivo === "unica" && tipo !== "propria" && !responsavelId) {
      toast.error("Selecione um responsável para a tarefa.");
      return;
    }
    if (modoEfetivo === "colaborativo" && atribuidoIds.length === 0) {
      toast.error("Selecione ao menos um atribuído para o modo colaborativo.");
      return;
    }

    try {
      const tarefaId = await createTarefa.mutateAsync({
        objetivo:     titulo.trim(),
        instrucoes:   descricao.trim() || undefined,
        prazo:        prazo ? new Date(prazo).toISOString() : undefined,
        tipo,
        modo:         modoEfetivo,
        responsavel_id:
          tipo === "propria"
            ? profile?.id
            : modoEfetivo === "unica"
            ? responsavelId
            : undefined,
        atribuido_ids:
          modoEfetivo === "colaborativo" ? atribuidoIds : undefined,
      });

      toast.success(
        tipo === "propria"
          ? "Tarefa criada e em andamento!"
          : "Tarefa criada e aguardando aceite."
      );

      resetForm();
      setOpen(false);

      // Suprimir aviso de variável não usada (tarefaId pode ser usado no futuro para navegar)
      void tarefaId;
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Erro desconhecido";
      if (msg.includes("violates row-level security") || msg.includes("policy")) {
        toast.error("Sem permissão para criar tarefas. Verifique com o administrador.");
      } else {
        toast.error(`Erro ao criar tarefa: ${msg}`);
      }
    }
  }

  // Profiles disponíveis excluindo o próprio usuário (para selects de responsável/atribuídos)
  const outrosProfiles = profiles.filter((p) => p.id !== profile?.id);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size={size} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4 pt-1">

          {/* Título */}
          <div className="space-y-1.5">
            <Label htmlFor="nt-titulo">Título *</Label>
            <Input
              id="nt-titulo"
              placeholder="Descreva a tarefa em uma frase"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
              maxLength={300}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label htmlFor="nt-desc">Descrição <span className="text-text-muted text-xs">(opcional)</span></Label>
            <Textarea
              id="nt-desc"
              placeholder="Instruções adicionais, contexto…"
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="resize-none"
            />
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex gap-4">
              {(["requisitada", "propria"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="tipo"
                    value={t}
                    checked={tipo === t}
                    onChange={() => setTipo(t)}
                    className="accent-[var(--company-primary)]"
                  />
                  {t === "propria" ? "Própria" : "Requisitada"}
                </label>
              ))}
            </div>
            {tipo === "propria" && (
              <p className="text-xs text-text-muted leading-relaxed">
                Tarefa criada para você mesmo — irá direto para <strong>Em andamento</strong>.
              </p>
            )}
          </div>

          {/* Modo — visível só para tipo=requisitada */}
          {tipo === "requisitada" && (
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <div className="flex gap-4">
                {(["unica", "colaborativo"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="modo"
                      value={m}
                      checked={modo === m}
                      onChange={() => { setModo(m); setResponsavelId(""); setAtribuidoIds([]); }}
                      className="accent-[var(--company-primary)]"
                    />
                    {m === "unica" ? "Única (1 responsável)" : "Colaborativo (N atribuídos)"}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Responsável — modo=unica, tipo=requisitada */}
          {modoEfetivo === "unica" && tipo === "requisitada" && (
            <div className="space-y-1.5">
              <Label htmlFor="nt-responsavel">Responsável *</Label>
              {loadingProfiles ? (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Carregando…
                </div>
              ) : (
                <select
                  id="nt-responsavel"
                  value={responsavelId}
                  onChange={(e) => setResponsavelId(e.target.value)}
                  required
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Selecione…</option>
                  {outrosProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayName(p)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Atribuídos — modo=colaborativo */}
          {modoEfetivo === "colaborativo" && (
            <div className="space-y-1.5">
              <Label>
                Atribuídos * <span className="text-text-muted text-xs">(mínimo 1)</span>
              </Label>
              {loadingProfiles ? (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Carregando…
                </div>
              ) : outrosProfiles.length === 0 ? (
                <p className="text-sm text-text-muted">Nenhum outro membro disponível.</p>
              ) : (
                <div className="border border-border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                  {outrosProfiles.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={atribuidoIds.includes(p.id)}
                        onChange={() => toggleAtribuido(p.id)}
                        className="accent-[var(--company-primary)]"
                      />
                      {displayName(p)}
                    </label>
                  ))}
                </div>
              )}
              {atribuidoIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {atribuidoIds.map((id) => {
                    const p = profiles.find((x) => x.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-text-primary/10 text-xs text-text-secondary"
                      >
                        {p ? displayName(p) : id.slice(0, 8)}
                        <button
                          type="button"
                          onClick={() => toggleAtribuido(id)}
                          className="hover:text-text-primary"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Prazo */}
          <div className="space-y-1.5">
            <Label htmlFor="nt-prazo">
              Prazo <span className="text-text-muted text-xs">(opcional — padrão 30 dias)</span>
            </Label>
            <Input
              id="nt-prazo"
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setOpen(false); resetForm(); }}
              disabled={createTarefa.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createTarefa.isPending || !titulo.trim()}>
              {createTarefa.isPending ? (
                <><LoaderCircle className="w-4 h-4 animate-spin mr-1.5" />Criando…</>
              ) : (
                "Criar Tarefa"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
