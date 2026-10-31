// Portal Mowig (J664) — REMARCAR e CANCELAR (com confirmação) de uma coleta, usados no quadro e na tela da coleta.
// Só com a capacidade `coleta`. A janela de 24 h é da API (`podeRemarcarOuCancelar`): a tela só esconde os botões e mostra o aviso.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  mensagemDeErro,
  novaChaveIdempotencia,
  type CapacidadesPortal,
  type ColetaPortal,
} from "@/lib/portal-api";
import { Aviso } from "@/components/portal/ui";
import { usePortalApi } from "@/components/portal/PortalCasca";
import { podeAlterarColeta, podeGerirColeta } from "@/lib/portal-coletas";

export function BotoesDaColeta({
  coleta,
  cap,
}: {
  coleta: ColetaPortal;
  cap: CapacidadesPortal;
}) {
  const api = usePortalApi();
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);
  const cancelar = useMutation({
    mutationFn: () => api.cancelarColeta(coleta.id, null, novaChaveIdempotencia()),
    onSuccess: async () => {
      setConfirmando(false);
      await qc.invalidateQueries({ queryKey: ["portal"] });
    },
  });

  if (!podeGerirColeta(cap) || (coleta.situacao !== "SOLICITADA" && coleta.situacao !== "AGENDADA")) {
    return null;
  }
  if (!podeAlterarColeta(coleta)) {
    return (
      <p className="portal-meta" data-testid="coleta-trava-24h">
        Coleta em menos de 24 h: só a logística da Mowig altera.
      </p>
    );
  }
  return (
    <>
      {!confirmando && (
        <div className="portal-coleta-botoes">
          <Link
            to="/portal/remarcar/$id"
            params={{ id: String(coleta.id) }}
            className="portal-botao portal-botao-secundario portal-botao-pequeno portal-botao-link"
          >
            REMARCAR
          </Link>
          <button
            type="button"
            className="portal-botao portal-botao-secundario portal-botao-pequeno"
            onClick={() => setConfirmando(true)}
          >
            CANCELAR
          </button>
        </div>
      )}
      {confirmando && (
        <div className="portal-confirmar" role="group" aria-label={`Cancelar a coleta ${coleta.id}`}>
          <p>
            Cancelar esta coleta? Os pedidos voltam para AGUARDANDO COLETA
            {coleta.pedidos.length > 1 ? ` (${coleta.pedidos.length} pedidos)` : ""}.
          </p>
          <div className="portal-coleta-botoes">
            <button
              type="button"
              className="portal-botao portal-botao-pequeno"
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate()}
            >
              {cancelar.isPending ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
            <button
              type="button"
              className="portal-botao portal-botao-secundario portal-botao-pequeno"
              disabled={cancelar.isPending}
              onClick={() => {
                cancelar.reset();
                setConfirmando(false);
              }}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
      {cancelar.isError && <Aviso tipo="erro">{mensagemDeErro(cancelar.error)}</Aviso>}
    </>
  );
}
