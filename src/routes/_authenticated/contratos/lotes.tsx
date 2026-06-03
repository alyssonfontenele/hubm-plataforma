import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Users, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/contratos/lotes")({
  ssr: false,
  component: LotesPage,
});

type LoteRow = {
  id: string;
  numero: string;
  status: string;
  conformado_em: string | null;
  criado_em: string;
  contrato_id: string | null;
  contrato_numero: string | null;
  cliente_nome: string | null;
  consultor_nome: string | null;
  qtd_itens: number;
  tem_ressalva: boolean;
};

type ContratoOption = { id: string; numero: string };

type ItemRow = {
  id: string;
  codigo: string;
  descricao: string;
  status_item: string;
  consultor_designado: string | null;
};

type ConsultorOption = {
  id: string;
  profile_id: string;
  full_name: string | null;
};

type DesignacaoRow = {
  id: string;
  item_id: string;
  consultor_id: string;
  ativo: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  conformado: "Conformado",
  em_medicao: "Em Medição",
  medido: "Medido",
  apresentacao_tecnica: "Apres. Técnica",
  aprovado: "Aprovado",
  documentacao_tecnica_completa: "Doc. Completa",
  cancelado: "Cancelado",
  concluido: "Concluído",
};

function statusVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "conformado") return "default";
  if (s === "em_medicao") return "secondary";
  return "outline";
}

function LotesPage() {
  const { globalRole } = useAuth();
  const isAdmin = globalRole === "admin" || globalRole === "superadmin";

  return (
    <Tabs defaultValue="lotes" className="space-y-4">
      <TabsList>
        <TabsTrigger value="lotes" className="gap-1.5">
          <Layers className="w-4 h-4" />
          Lotes
        </TabsTrigger>
        {isAdmin && (
          <TabsTrigger value="designacoes" className="gap-1.5">
            <Users className="w-4 h-4" />
            Designações
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="lotes">
        <LotesTab />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="designacoes">
          <DesignacoesTab />
        </TabsContent>
      )}
    </Tabs>
  );
}

function LotesTab() {
  const { data: lotes = [], isLoading } = useQuery<LoteRow[]>({
    queryKey: ["moveria_lotes_v"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_lotes_v")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LoteRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (lotes.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface px-6 py-10 text-center space-y-2">
        <Layers className="mx-auto w-8 h-8 text-text-muted opacity-30" />
        <p className="text-sm font-medium text-text-primary">Nenhum lote ainda</p>
        <p className="text-xs text-text-muted">
          Lotes são criados automaticamente a partir das medições (Fase 4).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Nº</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Consultor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right w-16">Itens</TableHead>
            <TableHead className="w-32">Conformado em</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lotes.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-mono font-semibold text-sm">
                {l.numero}
              </TableCell>
              <TableCell className="text-sm text-text-muted">
                {l.contrato_numero ?? "—"}
              </TableCell>
              <TableCell className="text-sm">{l.cliente_nome ?? "—"}</TableCell>
              <TableCell className="text-sm">{l.consultor_nome ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(l.status)}>
                  {STATUS_LABEL[l.status] ?? l.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {l.qtd_itens}
              </TableCell>
              <TableCell className="text-xs text-text-muted">
                {l.conformado_em
                  ? new Date(l.conformado_em).toLocaleDateString("pt-BR")
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DesignacoesTab() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedContratoId, setSelectedContratoId] = useState<string>("");

  const { data: contratos = [] } = useQuery<ContratoOption[]>({
    queryKey: ["moveria_contratos_para_designacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_contratos_v")
        .select("id, numero")
        .eq("status", "em_andamento")
        .order("numero");
      if (error) throw error;
      return (data ?? []) as ContratoOption[];
    },
  });

  const { data: consultorMembros = [] } = useQuery<ConsultorOption[]>({
    queryKey: ["moveria_consultores_membros"],
    queryFn: async () => {
      const { data: membros, error } = await supabase
        .from("moveria_membros")
        .select("id, profile_id")
        .eq("papel", "consultor_tecnico")
        .eq("ativo", true);
      if (error) throw error;

      const profileIds = (membros ?? []).map((m: any) => m.profile_id as string);
      if (profileIds.length === 0) return [];

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);

      return (membros ?? []).map((m: any) => ({
        id: m.id as string,
        profile_id: m.profile_id as string,
        full_name:
          (profs ?? []).find((p: any) => p.id === m.profile_id)?.full_name ?? null,
      }));
    },
  });

  const { data: itens = [], isLoading: loadingItens } = useQuery<ItemRow[]>({
    queryKey: ["moveria_itens_para_designacao", selectedContratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_itens_v")
        .select("id, codigo, descricao, status_item, consultor_designado")
        .eq("contrato_id", selectedContratoId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
    enabled: !!selectedContratoId,
  });

  const { data: designacoes = [] } = useQuery<DesignacaoRow[]>({
    queryKey: ["moveria_designacoes_ativas", selectedContratoId],
    queryFn: async () => {
      if (!itens.length) return [];
      const { data, error } = await supabase
        .from("moveria_designacoes")
        .select("id, item_id, consultor_id, ativo")
        .eq("ativo", true)
        .in("item_id", itens.map((i) => i.id));
      if (error) throw error;
      return (data ?? []) as DesignacaoRow[];
    },
    enabled: !!selectedContratoId && itens.length > 0,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["moveria_designacoes_ativas", selectedContratoId],
    });
    queryClient.invalidateQueries({
      queryKey: ["moveria_itens_para_designacao", selectedContratoId],
    });
  };

  const assign = useMutation({
    mutationFn: async ({
      itemId,
      consultorMembroId,
    }: {
      itemId: string;
      consultorMembroId: string;
    }) => {
      await supabase
        .from("moveria_designacoes")
        .update({ ativo: false })
        .eq("item_id", itemId)
        .eq("ativo", true);

      const { error } = await supabase.from("moveria_designacoes").insert({
        item_id: itemId,
        consultor_id: consultorMembroId,
        designado_por: profile?.id,
        ativo: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Consultor designado");
    },
    onError: (err: any) => {
      toast.error(err.message ?? "Erro ao designar consultor");
    },
  });

  const revoke = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("moveria_designacoes")
        .update({ ativo: false })
        .eq("item_id", itemId)
        .eq("ativo", true);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Designação removida");
    },
    onError: (err: any) => {
      toast.error(err.message ?? "Erro ao remover designação");
    },
  });

  const getDesignacao = (itemId: string) =>
    designacoes.find((d) => d.item_id === itemId);

  const getConsultorNome = (membroId: string) =>
    consultorMembros.find((c) => c.id === membroId)?.full_name ?? "—";

  const isBusy = assign.isPending || revoke.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-text-primary whitespace-nowrap">
          Contrato
        </span>
        <Select value={selectedContratoId} onValueChange={setSelectedContratoId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Selecione um contrato…" />
          </SelectTrigger>
          <SelectContent>
            {contratos.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.numero}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedContratoId && (
        <div className="rounded-md border border-border bg-surface px-6 py-8 text-center text-sm text-text-muted">
          Selecione um contrato para gerenciar as designações.
        </div>
      )}

      {selectedContratoId && loadingItens && (
        <div className="flex items-center justify-center py-8">
          <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      )}

      {selectedContratoId && !loadingItens && itens.length === 0 && (
        <div className="rounded-md border border-border bg-surface px-6 py-8 text-center text-sm text-text-muted">
          Nenhum item encontrado para este contrato.
        </div>
      )}

      {selectedContratoId && !loadingItens && itens.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-44">Consultor Designado</TableHead>
                <TableHead className="w-64">Atribuir / Remover</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((item) => {
                const desg = getDesignacao(item.id);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                    <TableCell className="text-sm">{item.descricao}</TableCell>
                    <TableCell>
                      {desg ? (
                        <span className="text-sm font-medium">
                          {getConsultorNome(desg.consultor_id)}
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted italic">
                          sem designação
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          onValueChange={(consultorMembroId) =>
                            assign.mutate({ itemId: item.id, consultorMembroId })
                          }
                          disabled={isBusy}
                        >
                          <SelectTrigger className="h-8 text-xs w-40">
                            <SelectValue placeholder="Escolher…" />
                          </SelectTrigger>
                          <SelectContent>
                            {consultorMembros.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.full_name ?? c.profile_id.slice(0, 8)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {desg && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-destructive hover:text-destructive"
                            onClick={() => revoke.mutate(item.id)}
                            disabled={isBusy}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
