// Portal Mowig (J664) — telas de coleta: AGENDAR (slots com vaga + quem busca), COLETA (situação, documentos, remarcar/cancelar)
// e REMARCAR. Contrato: mowig-api docs/api-expedicao.md §Portal. A API decide elegibilidade, vagas e a janela de 24 h; aqui só se
// escolhe e se mostra a mensagem dela. Botões de agendar/remarcar/cancelar só com a capacidade `coleta`; documentos valem para todos.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { usePortalApi, usePortalMe } from "@/components/portal/PortalCasca";
import { BotoesDaColeta } from "@/components/portal/ColetaAcoes";
import { Aviso, Pilula } from "@/components/portal/ui";
import {
  dataBr,
  dataHoraBr,
  mensagemDeErro,
  novaChaveIdempotencia,
  PortalApiErro,
  type ColetaPortal,
  type DocumentoColeta,
  type SlotColeta,
} from "@/lib/portal-api";
import {
  agruparSlotsPorDia,
  montarCorpoColeta,
  podeAlterarColeta,
  podeGerirColeta,
  ROTULO_SITUACAO_COLETA,
  rotuloSlot,
  tamanhoLegivel,
  textoQuemBusca,
  tomDaColeta,
  type QuemBuscaForm,
} from "@/lib/portal-coletas";

function SemPermissao() {
  return (
    <>
      <h1 className="portal-titulo">Coleta</h1>
      <Aviso tipo="info">
        Seu perfil só acompanha as coletas. Para agendar, remarcar ou cancelar, peça ao gestor da sua
        loja.
      </Aviso>
      <Link to="/portal" className="portal-link">
        Voltar aos pedidos
      </Link>
    </>
  );
}

/** Escolha de horário: um grupo de rádios por dia (só entram os horários com vaga que a API mandou). */
function EscolhaDeHorario({
  slots,
  escolhido,
  aoEscolher,
  atual,
}: {
  slots: SlotColeta[];
  escolhido: number | null;
  aoEscolher: (id: number) => void;
  atual?: number;
}) {
  const dias = agruparSlotsPorDia(slots);
  if (dias.length === 0) {
    return <p className="portal-meta">Nenhum horário com vaga no momento. Tente novamente mais tarde.</p>;
  }
  return (
    <div className="portal-slots" role="radiogroup" aria-label="Horário da coleta">
      {dias.map((dia) => (
        <fieldset key={dia.data} className="portal-slot-dia">
          <legend>{dataBr(dia.data)}</legend>
          {dia.slots.map((s) => (
            <label
              key={s.id}
              className={`portal-slot${escolhido === s.id ? " portal-slot-ativo" : ""}`}
            >
              <input
                type="radio"
                name="slot"
                value={s.id}
                checked={escolhido === s.id}
                disabled={s.id === atual}
                onChange={() => aoEscolher(s.id)}
              />
              <span>{s.rotuloTurno}</span>
              {s.id === atual && <span className="portal-meta">horário atual</span>}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// AGENDAR
// ---------------------------------------------------------------------------------------------------------------------
export function AgendarPagina({ pedidos }: { pedidos: number[] }) {
  const api = usePortalApi();
  const me = usePortalMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gerir = podeGerirColeta(me.capacidades);

  const slots = useQuery({
    queryKey: ["portal", "slots"],
    queryFn: () => api.slots(),
    enabled: gerir && pedidos.length > 0,
    retry: false,
  });
  const transportadoras = useQuery({
    queryKey: ["portal", "transportadoras"],
    queryFn: () => api.transportadoras(),
    enabled: gerir && pedidos.length > 0,
    retry: false,
  });

  const [slotId, setSlotId] = useState<number | null>(null);
  const [quem, setQuem] = useState<QuemBuscaForm>({ tipo: "TRANSPORTADORA", transportadoraCodigo: "" });
  const [observacao, setObservacao] = useState("");

  const solicitar = useMutation({
    mutationFn: async () => {
      const corpo = montarCorpoColeta({ slotId, pedidos, quemBusca: quem, observacao });
      if (!corpo) throw new PortalApiErro(0, null, "Escolha o horário e quem busca.");
      return api.solicitarColeta(corpo, novaChaveIdempotencia());
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["portal"] });
      await navigate({ to: "/portal/coleta/$id", params: { id: String(r.coletaId) } });
    },
    onError: () => {
      // sem vaga / horário fechado: a lista de horários mudou, recarrega
      void slots.refetch();
    },
  });

  if (!gerir) return <SemPermissao />;
  if (pedidos.length === 0) {
    return (
      <>
        <h1 className="portal-titulo">Agendar coleta</h1>
        <Aviso tipo="info">
          Escolha os pedidos na coluna AGUARDANDO COLETA do quadro e use AGENDAR COLETA.
        </Aviso>
        <Link to="/portal" className="portal-link">
          Voltar aos pedidos
        </Link>
      </>
    );
  }

  const pronto = montarCorpoColeta({ slotId, pedidos, quemBusca: quem, observacao }) !== null;

  return (
    <>
      <p className="portal-migalha">
        <Link to="/portal" className="portal-link">
          Pedidos
        </Link>
      </p>
      <h1 className="portal-titulo">Agendar coleta</h1>
      <form
        className="portal-form-coleta"
        onSubmit={(e) => {
          e.preventDefault();
          if (pronto && !solicitar.isPending) solicitar.mutate();
        }}
      >
        <section className="portal-painel" aria-labelledby="ped">
          <h2 id="ped">Pedidos na coleta</h2>
          <ul className="portal-pilulas" data-testid="pedidos-da-coleta">
            {pedidos.map((n) => (
              <li key={n}>
                <Pilula>{n}</Pilula>
              </li>
            ))}
          </ul>
          <p className="portal-meta">
            A Mowig confere se cada pedido está pronto e quitado. Se algum não puder sair, você verá o
            motivo ao enviar.
          </p>
        </section>

        <section className="portal-painel" aria-labelledby="hor">
          <h2 id="hor">Horário</h2>
          {slots.isPending && <p className="portal-meta">Carregando horários…</p>}
          {slots.isError && <Aviso tipo="erro">{mensagemDeErro(slots.error)}</Aviso>}
          {slots.data && (
            <>
              <EscolhaDeHorario slots={slots.data.slots} escolhido={slotId} aoEscolher={setSlotId} />
              <p className="portal-meta">
                Horários com vaga nos próximos {slots.data.horizonteDias} dias. Alterações só até 24 h
                antes.
              </p>
            </>
          )}
        </section>

        <section className="portal-painel" aria-labelledby="quem">
          <h2 id="quem">Quem busca</h2>
          <div className="portal-opcoes" role="radiogroup" aria-label="Quem busca">
            <label className="portal-opcao">
              <input
                type="radio"
                name="quem"
                checked={quem.tipo === "TRANSPORTADORA"}
                onChange={() => setQuem({ tipo: "TRANSPORTADORA", transportadoraCodigo: "" })}
              />
              <span>Transportadora</span>
            </label>
            <label className="portal-opcao">
              <input
                type="radio"
                name="quem"
                checked={quem.tipo === "VEICULO_PROPRIO"}
                onChange={() => setQuem({ tipo: "VEICULO_PROPRIO", placa: "", motorista: "" })}
              />
              <span>Veículo próprio</span>
            </label>
          </div>
          {quem.tipo === "TRANSPORTADORA" ? (
            <label className="portal-campo">
              <span>Transportadora</span>
              <select
                value={quem.transportadoraCodigo}
                onChange={(e) =>
                  setQuem({ tipo: "TRANSPORTADORA", transportadoraCodigo: e.target.value })
                }
              >
                <option value="">Escolha…</option>
                {(transportadoras.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
              {transportadoras.isError && (
                <span className="portal-meta">{mensagemDeErro(transportadoras.error)}</span>
              )}
            </label>
          ) : (
            <>
              <label className="portal-campo">
                <span>Placa (opcional)</span>
                <input
                  value={quem.placa}
                  maxLength={10}
                  autoComplete="off"
                  onChange={(e) => setQuem({ ...quem, placa: e.target.value })}
                />
              </label>
              <label className="portal-campo">
                <span>Motorista (opcional)</span>
                <input
                  value={quem.motorista}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setQuem({ ...quem, motorista: e.target.value })}
                />
              </label>
            </>
          )}
        </section>

        <section className="portal-painel" aria-labelledby="obs">
          <h2 id="obs">Observação</h2>
          <label className="portal-campo">
            <span>Algo que a logística precise saber (opcional)</span>
            <textarea
              value={observacao}
              maxLength={500}
              rows={3}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </label>
        </section>

        {solicitar.isError && <Aviso tipo="erro">{mensagemDeErro(solicitar.error)}</Aviso>}
        <div className="portal-acoes">
          <button type="submit" className="portal-botao" disabled={!pronto || solicitar.isPending}>
            {solicitar.isPending ? "Enviando…" : "Solicitar coleta"}
          </button>
          <Link to="/portal" className="portal-link">
            Voltar
          </Link>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// COLETA (detalhe + documentos)
// ---------------------------------------------------------------------------------------------------------------------
function salvarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Documento({ coletaId, doc }: { coletaId: number; doc: DocumentoColeta }) {
  const api = usePortalApi();
  const baixar = useMutation({
    mutationFn: async () => {
      const blob = await api.baixarDocumento(coletaId, doc.id);
      salvarArquivo(blob, doc.nomeArquivo ?? `documento-${doc.id}`);
    },
  });
  const titulo = doc.tipo.replace(/_/g, " ");
  return (
    <li className="portal-documento" data-testid={`documento-${doc.id}`}>
      <div>
        <strong>{doc.nfeNumero ? `${titulo} nº ${doc.nfeNumero}` : titulo}</strong>
        {doc.pedidoNumero !== null && (
          <span className="portal-meta"> · pedido {doc.pedidoNumero}</span>
        )}
        {doc.automatico && doc.nfeChave && (
          <div className="portal-meta portal-chave">Chave {doc.nfeChave}</div>
        )}
        {!doc.automatico && doc.nomeArquivo && (
          <div className="portal-meta">
            {doc.nomeArquivo}
            {doc.tamanho !== null ? ` · ${tamanhoLegivel(doc.tamanho)}` : ""}
          </div>
        )}
      </div>
      {doc.automatico ? (
        <span className="portal-meta">Ligada pela chave</span>
      ) : (
        <div>
          <button
            type="button"
            className="portal-botao portal-botao-secundario portal-botao-pequeno"
            disabled={baixar.isPending}
            onClick={() => baixar.mutate()}
            aria-label={`Baixar ${doc.nomeArquivo ?? titulo}`}
          >
            {baixar.isPending ? "Baixando…" : "Baixar"}
          </button>
          {baixar.isError && <Aviso tipo="erro">{mensagemDeErro(baixar.error)}</Aviso>}
        </div>
      )}
    </li>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="portal-linha-info">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ColetaPagina({ id }: { id: number }) {
  const api = usePortalApi();
  const me = usePortalMe();
  const q = useQuery({
    queryKey: ["portal", "coleta", id],
    queryFn: () => api.coleta(id),
    retry: false,
  });

  if (q.isPending) return <p className="portal-meta">Carregando…</p>;
  if (q.isError) {
    const naoAchou = q.error instanceof PortalApiErro && q.error.status === 404;
    return (
      <>
        <h1 className="portal-titulo">Coleta</h1>
        <Aviso tipo="erro">{naoAchou ? "Coleta não encontrada." : mensagemDeErro(q.error)}</Aviso>
        <Link to="/portal" className="portal-link">
          Voltar aos pedidos
        </Link>
      </>
    );
  }
  const { coleta: c, documentos } = q.data;
  return (
    <>
      <p className="portal-migalha">
        <Link to="/portal" className="portal-link">
          Pedidos
        </Link>
      </p>
      <h1 className="portal-titulo">Coleta {c.id}</h1>
      <section className="portal-painel" aria-labelledby="sit">
        <h2 id="sit">Situação</h2>
        <dl className="portal-lista-info">
          <Linha rotulo="Situação">
            <Pilula tom={tomDaColeta(c.situacao)}>{ROTULO_SITUACAO_COLETA[c.situacao]}</Pilula>
          </Linha>
          <Linha rotulo="Horário">
            <span className="portal-centro-num" data-testid="coleta-horario">
              {rotuloSlot(c.slot)}
            </span>
          </Linha>
          <Linha rotulo="Quem busca">{textoQuemBusca(c.quemBusca)}</Linha>
          <Linha rotulo="Pedidos">
            {c.pedidos.map((n, i) => (
              <span key={n}>
                {i > 0 && ", "}
                <Link
                  to="/portal/pedido/$numero"
                  params={{ numero: String(n) }}
                  className="portal-link portal-centro-num"
                >
                  {n}
                </Link>
              </span>
            ))}
          </Linha>
          <Linha rotulo="Solicitada em">{dataHoraBr(c.solicitadaEm)}</Linha>
          {c.confirmadaEm && <Linha rotulo="Confirmada em">{dataHoraBr(c.confirmadaEm)}</Linha>}
          {c.despachadaEm && <Linha rotulo="Despachada em">{dataHoraBr(c.despachadaEm)}</Linha>}
          {c.observacao && <Linha rotulo="Observação">{c.observacao}</Linha>}
          {c.motivo && <Linha rotulo="Motivo">{c.motivo}</Linha>}
        </dl>
        {c.situacao === "SOLICITADA" && (
          <p className="portal-meta">A logística da Mowig ainda vai confirmar este horário.</p>
        )}
        <BotoesDaColeta coleta={c} cap={me.capacidades} />
      </section>

      <section className="portal-painel" aria-labelledby="docs">
        <h2 id="docs">Documentos</h2>
        {documentos.length === 0 ? (
          <p className="portal-meta">
            {c.situacao === "DESPACHADA"
              ? "Nenhum documento anexado ainda."
              : "Os documentos aparecem aqui depois do despacho."}
          </p>
        ) : (
          <ul className="portal-lista-documentos" data-testid="documentos">
            {documentos.map((d) => (
              <Documento key={d.id} coletaId={c.id} doc={d} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// REMARCAR
// ---------------------------------------------------------------------------------------------------------------------
export function RemarcarPagina({ id }: { id: number }) {
  const api = usePortalApi();
  const me = usePortalMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const gerir = podeGerirColeta(me.capacidades);
  const coleta = useQuery({
    queryKey: ["portal", "coleta", id],
    queryFn: () => api.coleta(id),
    retry: false,
  });
  const alteravel = coleta.data ? podeAlterarColeta(coleta.data.coleta) : false;
  const slots = useQuery({
    queryKey: ["portal", "slots"],
    queryFn: () => api.slots(),
    enabled: gerir && alteravel,
    retry: false,
  });
  const [slotId, setSlotId] = useState<number | null>(null);
  const remarcar = useMutation({
    mutationFn: () => {
      if (!slotId) throw new PortalApiErro(0, null, "Escolha o novo horário.");
      return api.remarcarColeta(id, slotId, novaChaveIdempotencia());
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["portal"] });
      await navigate({ to: "/portal/coleta/$id", params: { id: String(id) } });
    },
    onError: () => void slots.refetch(),
  });

  if (!gerir) return <SemPermissao />;
  if (coleta.isPending) return <p className="portal-meta">Carregando…</p>;
  if (coleta.isError) {
    return (
      <>
        <h1 className="portal-titulo">Remarcar coleta</h1>
        <Aviso tipo="erro">{mensagemDeErro(coleta.error)}</Aviso>
        <Link to="/portal" className="portal-link">
          Voltar aos pedidos
        </Link>
      </>
    );
  }
  const c: ColetaPortal = coleta.data.coleta;
  return (
    <>
      <p className="portal-migalha">
        <Link to="/portal/coleta/$id" params={{ id: String(c.id) }} className="portal-link">
          Coleta {c.id}
        </Link>
      </p>
      <h1 className="portal-titulo">Remarcar coleta {c.id}</h1>
      {!alteravel ? (
        <>
          <Aviso tipo="info">
            Esta coleta não pode mais ser remarcada por aqui (faltam menos de 24 horas ou ela já
            seguiu). Fale com a logística da Mowig.
          </Aviso>
          <Link to="/portal/coleta/$id" params={{ id: String(c.id) }} className="portal-link">
            Ver coleta
          </Link>
        </>
      ) : (
        <form
          className="portal-form-coleta"
          onSubmit={(e) => {
            e.preventDefault();
            if (slotId && !remarcar.isPending) remarcar.mutate();
          }}
        >
          <section className="portal-painel" aria-labelledby="atual">
            <h2 id="atual">Horário atual</h2>
            <p className="portal-centro-num">{rotuloSlot(c.slot)}</p>
          </section>
          <section className="portal-painel" aria-labelledby="novo">
            <h2 id="novo">Novo horário</h2>
            {slots.isPending && <p className="portal-meta">Carregando horários…</p>}
            {slots.isError && <Aviso tipo="erro">{mensagemDeErro(slots.error)}</Aviso>}
            {slots.data && (
              <EscolhaDeHorario
                slots={slots.data.slots}
                escolhido={slotId}
                aoEscolher={setSlotId}
                atual={c.slot.id}
              />
            )}
            <p className="portal-meta">
              Ao remarcar, a coleta volta a SOLICITADA e a logística confirma o novo horário.
            </p>
          </section>
          {remarcar.isError && <Aviso tipo="erro">{mensagemDeErro(remarcar.error)}</Aviso>}
          <div className="portal-acoes">
            <button type="submit" className="portal-botao" disabled={!slotId || remarcar.isPending}>
              {remarcar.isPending ? "Remarcando…" : "Remarcar coleta"}
            </button>
            <Link to="/portal/coleta/$id" params={{ id: String(c.id) }} className="portal-link">
              Voltar
            </Link>
          </div>
        </form>
      )}
    </>
  );
}
