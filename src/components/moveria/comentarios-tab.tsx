import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Comentario = {
  id: string;
  autor_id: string;
  texto: string;
  criado_em: string;
  autor_nome?: string;
};

export function ComentariosTab({ contratoId }: { contratoId: string }) {
  const { profile, globalRole } = useAuth();
  const qc = useQueryClient();
  const isAdmin = globalRole === "admin" || globalRole === "superadmin";
  const [texto, setTexto] = useState("");

  const { data: comentarios = [], isLoading } = useQuery<Comentario[]>({
    queryKey: ["moveria_comentarios", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moveria_comentarios")
        .select("id, autor_id, texto, criado_em")
        .eq("contrato_id", contratoId)
        .is("removido_em", null)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      if (!data?.length) return [];
      // Buscar nomes dos autores
      const autorIds = [...new Set((data as any[]).map((c) => c.autor_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, display_name")
        .in("id", autorIds);
      return (data as any[]).map((c) => ({
        id: c.id,
        autor_id: c.autor_id,
        texto: c.texto,
        criado_em: c.criado_em,
        autor_nome:
          (profs ?? []).find((p: any) => p.id === c.autor_id)?.display_name ||
          (profs ?? []).find((p: any) => p.id === c.autor_id)?.full_name ||
          "Usuário",
      }));
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Não autenticado");
      const { error } = await supabase.from("moveria_comentarios").insert({
        contrato_id: contratoId,
        autor_id: profile.id,
        texto: texto.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["moveria_comentarios", contratoId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao enviar comentário"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("moveria_comentarios")
        .update({ removido_em: new Date().toISOString(), removido_por: profile?.id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moveria_comentarios", contratoId] });
      toast.success("Comentário removido");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  function formatTs(ts: string) {
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Lista de comentários */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      ) : comentarios.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-5 py-8 text-center text-sm text-text-muted">
          Nenhuma mensagem ainda.<br />
          <span className="text-xs block mt-1">Use este espaço para comunicação entre equipe técnica e comercial.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {comentarios.map((c) => {
            const isMe = c.autor_id === profile?.id;
            return (
              <div key={c.id} className={`group flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                <div className={`flex-1 max-w-[85%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  <div className={`flex items-center gap-2 text-xs text-text-muted ${isMe ? "flex-row-reverse" : ""}`}>
                    <span className="font-medium text-text-secondary">{c.autor_nome}</span>
                    <span>{formatTs(c.criado_em)}</span>
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--color-danger)] hover:text-[var(--color-danger-text)]">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover comentário</AlertDialogTitle>
                            <AlertDialogDescription>
                              O comentário será removido permanentemente do histórico (auditado). Continuar?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => remover.mutate(c.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                  <div className={`rounded-lg px-3 py-2 text-sm leading-relaxed border ${
                    isMe
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "bg-surface text-text-primary border-border"
                  }`}>
                    {c.texto}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end pt-2 border-t border-border">
        <Textarea
          rows={2}
          placeholder="Escrever mensagem para a equipe..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && texto.trim()) {
              e.preventDefault();
              enviar.mutate();
            }
          }}
          className="resize-none flex-1"
        />
        <Button
          size="sm"
          onClick={() => enviar.mutate()}
          disabled={!texto.trim() || enviar.isPending}
        >
          {enviar.isPending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
