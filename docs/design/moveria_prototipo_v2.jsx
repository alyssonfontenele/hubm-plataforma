import React, { useState, useMemo } from "react";

// ============================================================
// PROTÓTIPO v2 — Módulo Contratos Moveria
// Fase 3 (lotes) + Fase 4 (medição). Dados fictícios.
// Mudanças v2: filtros robustos · isolamento por contrato ·
// anexo de desenhos (sem campos de medida) · questionário por ambiente.
//
// ⚠️ REFERÊNCIA CANÔNICA DE DESIGN — NÃO É CÓDIGO DE PRODUÇÃO.
// Define a linguagem visual e o layout aprovados para a UI da Fase 5.
// A implementação real usa o stack do projeto (TanStack Router,
// shadcn/ui, Tailwind), mas DEVE reproduzir fielmente: paleta,
// densidade, hierarquia visual e o comportamento das telas.
//
// Notas de domínio para a implementação:
// - "itens" aqui = AMBIENTES no domínio real (contrato cotado por ambiente).
//   Exibir rótulo "Ambiente" na UI; o banco usa moveria_itens_contrato.
// - Status do lote: NUNCA ordenar por enum (valor legado em_medicao fora de ordem).
// - Vendedor (Consultor Comercial): sem acesso a desenhos de medição.
// - Upload de desenho: arquivo no bucket nomeado {item_id}/... (storage policy de INSERT).
// ============================================================

const C = {
  bg: "#0f1115", panel: "#171a21", panel2: "#1d212a", border: "#272c38",
  borderSoft: "#1f2530", text: "#e7e9ee", textMute: "#9aa1b1", textFaint: "#646b7d",
  accent: "#5b8cff", accentSoft: "#1e2942", green: "#3fb968", greenSoft: "#16301f",
  amber: "#e0a52b", amberSoft: "#332811", red: "#e0573f", redSoft: "#331813",
  purple: "#9a7bff", purpleSoft: "#241d3a",
};

const STATUS = {
  medido: { label: "Medido", color: C.accent, soft: C.accentSoft },
  apresentacao_tecnica: { label: "Apresentação", color: C.purple, soft: C.purpleSoft },
  aprovado: { label: "Aprovado", color: C.green, soft: C.greenSoft },
  documentacao_tecnica_completa: { label: "Doc. Técnica", color: C.amber, soft: C.amberSoft },
  cancelado: { label: "Cancelado", color: C.red, soft: C.redSoft },
};
const STATUS_ORDER = ["medido", "apresentacao_tecnica", "aprovado", "documentacao_tecnica_completa"];

const CLIENTES = {
  marquise: { nome: "Marquise Empreendimentos", tipo: "PJ" },
  cdv: { nome: "Construtora CDV", tipo: "PJ" },
  ticiana: { nome: "Ticiana Sampaio", tipo: "PF" },
};

const CONTRATOS = [
  { id: "c1", numero: "100000538", cliente: "marquise", itensTotal: 36, arquiteto: "Estúdio Lina Arquitetura", consultor: "Téc. João Vianna" },
  { id: "c2", numero: "100000672-2", cliente: "cdv", itensTotal: 38, arquiteto: "—", consultor: "Téc. Marina Alves", substitui: "100000672-1" },
  { id: "c3", numero: "100000671-1", cliente: "ticiana", itensTotal: 22, arquiteto: "Marcela Brandão", consultor: "Téc. Marina Alves" },
];

const LOTES = [
  { id: "l1", numero: "1", contratoId: "c1", contrato: "100000538", cliente: "marquise", consultor: "Téc. João Vianna", status: "documentacao_tecnica_completa", itens: 12, criado: "28/05", prazoDias: null, prazoPausado: false, ressalva: false },
  { id: "l2", numero: "2", contratoId: "c1", contrato: "100000538", cliente: "marquise", consultor: "Téc. João Vianna", status: "aprovado", itens: 14, criado: "30/05", prazoDias: 4, prazoPausado: false, ressalva: true },
  { id: "l3", numero: "ÚNICO", contratoId: "c3", contrato: "100000671-1", cliente: "ticiana", consultor: "Téc. Marina Alves", status: "apresentacao_tecnica", itens: 22, criado: "31/05", prazoDias: 2, prazoPausado: true, prazoEspera: "cliente", ressalva: false },
  { id: "l4", numero: "1", contratoId: "c2", contrato: "100000672-2", cliente: "cdv", consultor: "Téc. Marina Alves", status: "medido", itens: 18, criado: "01/06", prazoDias: 6, prazoPausado: false, ressalva: false },
  { id: "l5", numero: "2", contratoId: "c2", contrato: "100000672-2", cliente: "cdv", consultor: "Téc. João Vianna", status: "medido", itens: 9, criado: "02/06", prazoDias: 7, prazoPausado: false, ressalva: true },
];

const AMBIENTES_MED = [
  { id: "amb1", nome: "Dormitório casal", itens: [
      { codigo: "CA", desc: "Guarda-roupa 6 portas", status: "apto", desenhos: 2 },
      { codigo: "CB", desc: "Cabeceira planejada", status: "apto", desenhos: 1 },
      { codigo: "CC", desc: "Criado-mudo (par)", status: "apto_ressalva", desenhos: 1, obs: "Tomada deslocada 15cm" },
  ]},
  { id: "amb2", nome: "Home office", itens: [
      { codigo: "DA", desc: "Bancada + prateleiras", status: "inapto", desenhos: 0, obs: "Parede sem reboco" },
      { codigo: "DB", desc: "Armário arquivo", status: "pendente", desenhos: 0 },
  ]},
  { id: "amb3", nome: "Closet", itens: [
      { codigo: "EA", desc: "Módulo calçadeira", status: "pendente", desenhos: 0 },
  ]},
];

const APT = {
  apto: { label: "Apto", color: C.green, soft: C.greenSoft },
  apto_ressalva: { label: "Apto c/ ressalva", color: C.amber, soft: C.amberSoft },
  inapto: { label: "Inapto", color: C.red, soft: C.redSoft },
  pendente: { label: "Pendente", color: C.textFaint, soft: "#1a1d24" },
};

// Questionário por ambiente — 4 blocos, escolha única (no banco: moveria_q_blocos/opcoes)
const QUEST_BLOCOS = [
  { id: "pedireito", label: "Pé-direito", opcoes: [
    { v: "conferido", l: "Conferido in loco" },
    { v: "especificado", l: "Especificado em projeto/obra", campo: true },
    { v: "determinado", l: "Determinado pela Moveria", campo: true },
    { v: "na", l: "Não se aplica" },
  ]},
  { id: "bancadas", label: "Bancadas", opcoes: [
    { v: "conferidas", l: "Conferidas in loco" },
    { v: "especificadas", l: "Especificadas em projeto" },
    { v: "enviado", l: "Projeto enviado pela Moveria" },
    { v: "na", l: "Não se aplica" },
  ]},
  { id: "instalacoes", label: "Instalações", sub: "elétricas/hidráulicas/afins", opcoes: [
    { v: "conferidas", l: "Conferidas in loco" },
    { v: "especificadas", l: "Especificadas em projeto" },
    { v: "enviado", l: "Projeto enviado pela Moveria" },
    { v: "na", l: "Não se aplica" },
  ]},
  { id: "eletros", label: "Eletros/Equipamentos", opcoes: [
    { v: "cliente", l: "Conferido/determinado pelo cliente" },
    { v: "sugeridos", l: "Sugeridos pela Moveria" },
    { v: "indefinidos", l: "Indefinidos" },
    { v: "na", l: "Não se aplica" },
  ]},
];

function Badge({ children, color, soft, dot }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: soft, color, border: `1px solid ${color}33`, padding: "2px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: color }} />}{children}
    </span>
  );
}
function ProgressTrack({ status }) {
  if (status === "cancelado") return <span style={{ color: C.red, fontSize: 11, fontWeight: 600 }}>● Cancelado</span>;
  const idx = STATUS_ORDER.indexOf(status);
  return <div style={{ display: "flex", gap: 3 }}>{STATUS_ORDER.map((s, i) => <div key={s} title={STATUS[s].label} style={{ width: 22, height: 5, borderRadius: 3, background: i <= idx ? STATUS[s].color : C.border, opacity: i <= idx ? 1 : 0.5 }} />)}</div>;
}
function SlaPill({ dias, pausado, espera }) {
  if (dias == null) return <span style={{ color: C.textFaint, fontSize: 12 }}>—</span>;
  if (pausado) return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.textMute }}><span style={{ color: C.amber }}>❚❚</span> Pausado · {espera}</span>;
  const color = dias <= 2 ? C.red : dias <= 4 ? C.amber : C.green;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color, fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: color }} />{dias}d</span>;
}

export default function App() {
  const [route, setRoute] = useState({ screen: "dashboard" });
  const [role, setRole] = useState("admin");
  const nav = (screen, params = {}) => setRoute({ screen, ...params });
  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 9px; height: 9px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 9px; }
        .mono { font-family: 'DM Mono', monospace; }
        .row-hover:hover { background: ${C.panel2} !important; }
        .clickable { cursor: pointer; transition: all .12s ease; }
        .clickable:hover { filter: brightness(1.12); }
        .navitem:hover { background: ${C.panel2}; color: ${C.text}; }
        input, textarea { font-family: inherit; }
      `}</style>
      <Sidebar route={route} nav={nav} role={role} setRole={setRole} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar route={route} role={role} />
        <div style={{ flex: 1, overflow: "auto", padding: "24px 30px" }}>
          {route.screen === "dashboard" && <Dashboard nav={nav} role={role} />}
          {route.screen === "lotes" && <Lotes nav={nav} />}
          {route.screen === "lote" && <LoteDetalhe nav={nav} loteId={route.loteId} />}
          {route.screen === "contrato" && <ContratoView nav={nav} contratoId={route.contratoId} />}
          {route.screen === "medicao" && <Medicao nav={nav} contratoId={route.contratoId} />}
          {route.screen === "designar" && <FilaDesignar nav={nav} />}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ route, nav, role, setRole }) {
  const items = [
    { id: "dashboard", label: "Painel", icon: "▦" },
    { id: "designar", label: "Fila a designar", icon: "⊕", badge: 2, admin: true },
    { id: "lotes", label: "Lotes", icon: "◫" },
  ];
  return (
    <div style={{ width: 224, background: C.panel, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${C.borderSoft}` }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Moveria<span style={{ color: C.accent }}>.</span></div>
        <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>Contratos · HubM</div>
      </div>
      <div style={{ padding: 10, flex: 1 }}>
        {items.filter(i => !(i.admin && role !== "admin")).map(i => {
          const active = route.screen === i.id;
          return (
            <div key={i.id} className="navitem clickable" onClick={() => nav(i.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 8, marginBottom: 2, fontSize: 13.5, fontWeight: active ? 600 : 500, background: active ? C.accentSoft : "transparent", color: active ? C.text : C.textMute, borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent" }}>
              <span style={{ fontSize: 15 }}>{i.icon}</span><span style={{ flex: 1 }}>{i.label}</span>
              {i.badge && <span style={{ background: C.accent, color: "#fff", fontSize: 10.5, fontWeight: 700, padding: "1px 6px", borderRadius: 10 }}>{i.badge}</span>}
            </div>
          );
        })}
        <div style={{ fontSize: 10.5, color: C.textFaint, margin: "14px 11px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>Contratos</div>
        {CONTRATOS.map(c => (
          <div key={c.id} className="navitem clickable" onClick={() => nav("contrato", { contratoId: c.id })} style={{ padding: "8px 11px", borderRadius: 8, marginBottom: 2, fontSize: 12.5, color: route.contratoId === c.id ? C.text : C.textMute, background: route.contratoId === c.id ? C.panel2 : "transparent" }}>
            <span className="mono">{c.numero}</span>
            <div style={{ fontSize: 11, color: C.textFaint }}>{CLIENTES[c.cliente].nome}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${C.borderSoft}` }}>
        <div style={{ fontSize: 10.5, color: C.textFaint, marginBottom: 7, textTransform: "uppercase" }}>Visão do perfil</div>
        {[["admin", "Admin"], ["tecnico", "Consultor Técnico"], ["comercial", "Consultor Comercial"]].map(([k, label]) => (
          <div key={k} className="clickable" onClick={() => setRole(k)} style={{ padding: "6px 9px", borderRadius: 6, fontSize: 12.5, marginBottom: 2, background: role === k ? C.panel2 : "transparent", color: role === k ? C.text : C.textMute, border: `1px solid ${role === k ? C.border : "transparent"}` }}>{role === k ? "● " : "○ "}{label}</div>
        ))}
      </div>
    </div>
  );
}

function Topbar({ route, role }) {
  const titles = { dashboard: "Painel", lotes: "Lotes", lote: "Detalhe do lote", contrato: "Contrato", medicao: "Medição em campo", designar: "Fila a designar" };
  const roleLabels = { admin: "Admin", tecnico: "Consultor Técnico", comercial: "Consultor Comercial" };
  return (
    <div style={{ height: 56, borderBottom: `1px solid ${C.border}`, background: C.panel, display: "flex", alignItems: "center", padding: "0 24px", gap: 14, flexShrink: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{titles[route.screen]}</div>
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 12, color: C.textMute }}>Logado como <span style={{ color: C.text, fontWeight: 600 }}>{roleLabels[role]}</span></div>
      <div style={{ width: 30, height: 30, borderRadius: 99, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>A</div>
    </div>
  );
}

function Dashboard({ nav, role }) {
  const stats = [
    { label: "Lotes ativos", val: 5, sub: "2 aguardando ação", color: C.accent },
    { label: "Prazo crítico", val: 1, sub: "≤2 dias", color: C.red },
    { label: "Pausados", val: 1, sub: "aguardando cliente", color: C.amber },
    { label: "Com ressalva", val: 2, sub: "atenção visual", color: C.amber },
  ];
  return (
    <div>
      <SectionTitle>Resumo operacional</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 26 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, color: C.textMute }}>{s.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: s.color, margin: "4px 0 2px" }}>{s.val}</div>
            <div style={{ fontSize: 11.5, color: C.textFaint }}>{s.sub}</div>
          </div>
        ))}
      </div>
      {role === "tecnico" && (
        <>
          <SectionTitle>Minha agenda de hoje <span style={{ fontSize: 11, color: C.textFaint, textTransform: "none", fontWeight: 400 }}>· cada visita abre 1 contrato isolado</span></SectionTitle>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, marginBottom: 26 }}>
            {[{ h: "09:00", t: "Medição — Construtora CDV", c: "c2", tag: "Visita" }, { h: "14:30", t: "Coleta de specs — Ticiana Sampaio", c: "c3", tag: "Apresentação" }].map((a, i) => (
              <div key={i} className="row-hover clickable" onClick={() => nav("medicao", { contratoId: a.c })} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 8 }}>
                <span className="mono" style={{ color: C.accent, fontSize: 13, width: 44 }}>{a.h}</span>
                <span style={{ flex: 1 }}>{a.t}</span>
                <Badge color={C.purple} soft={C.purpleSoft}>{a.tag}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
      <SectionTitle action={{ label: "Ver todos →", onClick: () => nav("lotes") }}>{role === "comercial" ? "Meus contratos" : "Lotes recentes"}</SectionTitle>
      <LotesTable nav={nav} data={LOTES.slice(0, 4)} compact />
    </div>
  );
}

function Lotes({ nav }) {
  const [view, setView] = useState("lista");
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("todos");
  const [fConsultor, setFConsultor] = useState("todos");
  const [fFlag, setFFlag] = useState("todos");
  const consultores = ["todos", ...new Set(LOTES.map(l => l.consultor))];
  const filtered = useMemo(() => LOTES.filter(l => {
    if (q) { const hay = `${l.numero} ${l.contrato} ${CLIENTES[l.cliente].nome} ${l.consultor}`.toLowerCase(); if (!hay.includes(q.toLowerCase())) return false; }
    if (fStatus !== "todos" && l.status !== fStatus) return false;
    if (fConsultor !== "todos" && l.consultor !== fConsultor) return false;
    if (fFlag === "critico" && !(l.prazoDias != null && l.prazoDias <= 2 && !l.prazoPausado)) return false;
    if (fFlag === "pausado" && !l.prazoPausado) return false;
    if (fFlag === "ressalva" && !l.ressalva) return false;
    return true;
  }), [q, fStatus, fConsultor, fFlag]);
  const sel = { background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 12.5 };
  return (
    <div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <span style={{ position: "absolute", left: 11, top: 8, color: C.textFaint, fontSize: 13 }}>⌕</span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por contrato, cliente, consultor, nº do lote…" style={{ width: "100%", background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px 8px 30px", fontSize: 13, outline: "none" }} />
          </div>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={sel}>
            <option value="todos">Etapa: todas</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
          <select value={fConsultor} onChange={e => setFConsultor(e.target.value)} style={sel}>
            {consultores.map(c => <option key={c} value={c}>{c === "todos" ? "Consultor: todos" : c}</option>)}
          </select>
          <div style={{ display: "flex", gap: 5 }}>
            {[["todos", "Tudo"], ["critico", "Crítico"], ["pausado", "Pausado"], ["ressalva", "Ressalva"]].map(([k, l]) => (
              <div key={k} className="clickable" onClick={() => setFFlag(k)} style={{ padding: "7px 11px", borderRadius: 7, fontSize: 12, fontWeight: 500, background: fFlag === k ? C.accentSoft : C.panel2, border: `1px solid ${fFlag === k ? C.accent + "66" : C.border}`, color: fFlag === k ? C.accent : C.textMute }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 4, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3 }}>
          {[["lista", "Lista"], ["kanban", "Kanban"], ["cards", "Cards"]].map(([k, l]) => (
            <div key={k} className="clickable" onClick={() => setView(k)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, background: view === k ? C.accentSoft : "transparent", color: view === k ? C.accent : C.textMute }}>{l}</div>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: C.textFaint }}>{filtered.length} de {LOTES.length} lotes</span>
      </div>
      {view === "lista" && <LotesTable nav={nav} data={filtered} />}
      {view === "kanban" && <LotesKanban nav={nav} data={filtered} />}
      {view === "cards" && <LotesCards nav={nav} data={filtered} />}
    </div>
  );
}

function LotesTable({ nav, data, compact }) {
  const gt = compact ? "70px 1fr 1.3fr 130px 60px" : "70px 1.1fr 1.2fr 1.1fr 120px 130px 55px 90px";
  const cols = compact ? ["Lote", "Contrato", "Cliente", "Status", "Itens"] : ["Lote", "Contrato", "Cliente", "Consultor", "Progresso", "Status", "Itens", "Prazo"];
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: gt, padding: "11px 18px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.textFaint, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600, background: C.panel2 }}>
        {cols.map(c => <div key={c}>{c}</div>)}
      </div>
      {data.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.textFaint, fontSize: 13 }}>Nenhum lote com esses filtros.</div>}
      {data.map(l => {
        const st = STATUS[l.status];
        return (
          <div key={l.id} className="row-hover clickable" onClick={() => nav("lote", { loteId: l.id })} style={{ display: "grid", gridTemplateColumns: gt, padding: "13px 18px", borderBottom: `1px solid ${C.borderSoft}`, alignItems: "center", fontSize: 13 }}>
            <div className="mono" style={{ fontWeight: 600, color: l.numero === "ÚNICO" ? C.purple : C.text }}>{l.numero}</div>
            <div className="mono" style={{ fontSize: 12, color: C.textMute }}>{l.contrato}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>{CLIENTES[l.cliente].nome}{l.ressalva && <span title="ressalva" style={{ color: C.amber }}>⚠</span>}</div>
            {!compact && <div style={{ color: C.textMute, fontSize: 12.5 }}>{l.consultor}</div>}
            {!compact && <div><ProgressTrack status={l.status} /></div>}
            <div><Badge color={st.color} soft={st.soft} dot>{st.label}</Badge></div>
            <div className="mono" style={{ color: C.textMute }}>{l.itens}</div>
            {!compact && <div><SlaPill dias={l.prazoDias} pausado={l.prazoPausado} espera={l.prazoEspera} /></div>}
          </div>
        );
      })}
    </div>
  );
}
function LotesKanban({ nav, data }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${STATUS_ORDER.length},1fr)`, gap: 12 }}>
      {STATUS_ORDER.map(s => {
        const st = STATUS[s]; const items = data.filter(l => l.status === s);
        return (
          <div key={s} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "11px 14px", borderBottom: `1px solid ${C.borderSoft}`, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: st.color }} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{st.label}</span>
              <span className="mono" style={{ marginLeft: "auto", color: C.textFaint, fontSize: 12 }}>{items.length}</span>
            </div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
              {items.map(l => (
                <div key={l.id} className="clickable" onClick={() => nav("lote", { loteId: l.id })} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="mono" style={{ fontWeight: 600, fontSize: 13, color: l.numero === "ÚNICO" ? C.purple : C.text }}>Lote {l.numero}</span>
                    {l.ressalva && <span style={{ color: C.amber }}>⚠</span>}
                  </div>
                  <div style={{ fontSize: 12.5, marginBottom: 3 }}>{CLIENTES[l.cliente].nome}</div>
                  <div className="mono" style={{ fontSize: 11, color: C.textFaint, marginBottom: 9 }}>{l.contrato} · {l.itens} ambientes</div>
                  <SlaPill dias={l.prazoDias} pausado={l.prazoPausado} espera={l.prazoEspera} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function LotesCards({ nav, data }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
      {data.map(l => {
        const st = STATUS[l.status];
        return (
          <div key={l.id} className="clickable" onClick={() => nav("lote", { loteId: l.id })} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, borderTop: `3px solid ${st.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: l.numero === "ÚNICO" ? C.purple : C.text }}>Lote {l.numero}</span>
              <Badge color={st.color} soft={st.soft} dot>{st.label}</Badge>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{CLIENTES[l.cliente].nome}</div>
            <div className="mono" style={{ fontSize: 12, color: C.textFaint, marginBottom: 14 }}>{l.contrato}</div>
            <ProgressTrack status={l.status} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.borderSoft}` }}>
              <span style={{ fontSize: 12, color: C.textMute }}>{l.itens} ambientes</span>
              <SlaPill dias={l.prazoDias} pausado={l.prazoPausado} espera={l.prazoEspera} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContratoView({ nav, contratoId }) {
  const c = CONTRATOS.find(x => x.id === contratoId) || CONTRATOS[0];
  const lotes = LOTES.filter(l => l.contratoId === c.id);
  return (
    <div>
      <ContractBanner c={c} />
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <Btn onClick={() => nav("medicao", { contratoId: c.id })}>⊹ Abrir medição</Btn>
        <Btn ghost>Gerenciar interessados</Btn>
      </div>
      <SectionTitle>Lotes deste contrato</SectionTitle>
      <LotesTable nav={nav} data={lotes} />
    </div>
  );
}
function ContractBanner({ c }) {
  return (
    <div style={{ background: `linear-gradient(180deg, ${C.accentSoft}, ${C.panel})`, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: "16px 20px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>● Contexto isolado</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
        <h1 className="mono" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{c.numero}</h1>
        <span style={{ fontSize: 15, color: C.text }}>{CLIENTES[c.cliente].nome}</span>
        <Badge color={C.textMute} soft={C.panel2}>{CLIENTES[c.cliente].tipo}</Badge>
      </div>
      <div style={{ fontSize: 12.5, color: C.textMute, marginTop: 6 }}>
        {c.itensTotal} ambientes · consultor {c.consultor} · arquiteto {c.arquiteto}
        {c.substitui && <> · <span style={{ color: C.amber }}>substitui {c.substitui}</span></>}
      </div>
    </div>
  );
}

function LoteDetalhe({ nav, loteId }) {
  const lote = LOTES.find(l => l.id === loteId) || LOTES[0];
  const c = CONTRATOS.find(x => x.id === lote.contratoId);
  const st = STATUS[lote.status];
  const itens = AMBIENTES_MED.flatMap(a => a.itens).slice(0, 5);
  return (
    <div>
      <div className="clickable" onClick={() => nav("lotes")} style={{ color: C.textMute, fontSize: 13, marginBottom: 12 }}>← Lotes</div>
      <ContractBanner c={c} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>Lote <span className="mono" style={{ color: lote.numero === "ÚNICO" ? C.purple : C.accent }}>{lote.numero}</span></h2>
        <Badge color={st.color} soft={st.soft} dot>{st.label}</Badge>
        {lote.ressalva && <Badge color={C.amber} soft={C.amberSoft}>⚠ Contém ressalva</Badge>}
        <div style={{ flex: 1 }} />
        <Btn ghost>Histórico</Btn><Btn danger>Dissolver</Btn>
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {STATUS_ORDER.map((s, i) => {
            const idx = STATUS_ORDER.indexOf(lote.status); const done = i < idx, cur = i === idx;
            return (
              <React.Fragment key={s}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", background: done ? STATUS[s].color : cur ? STATUS[s].soft : C.panel2, border: `2px solid ${done || cur ? STATUS[s].color : C.border}`, color: done ? "#fff" : cur ? STATUS[s].color : C.textFaint, fontSize: 13, fontWeight: 700 }}>{done ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 11.5, color: cur ? C.text : C.textMute, fontWeight: cur ? 600 : 500 }}>{STATUS[s].label}</span>
                </div>
                {i < STATUS_ORDER.length - 1 && <div style={{ flex: 1, height: 2, background: i < idx ? STATUS[s].color : C.border, margin: "0 8px 20px" }} />}
              </React.Fragment>
            );
          })}
        </div>
        {lote.prazoPausado && <div style={{ marginTop: 16, padding: "10px 14px", background: C.amberSoft, borderRadius: 8, fontSize: 12.5, color: C.amber, display: "flex", gap: 8 }}><span>❚❚</span> Prazo pausado há 2 dias — aguardando cliente. <span style={{ color: C.textMute }}>(interno, não visível ao cliente)</span></div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <PanelHead>Composição · {itens.length} ambientes</PanelHead>
          {itens.map((it, i) => {
            const a = APT[it.status] || APT.apto;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: i < itens.length - 1 ? `1px solid ${C.borderSoft}` : "none" }}>
                <span className="mono" style={{ fontSize: 12, color: C.textMute, width: 28 }}>{it.codigo}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{it.desc}</div>{it.obs && <div style={{ fontSize: 11.5, color: C.amber, marginTop: 2 }}>↳ {it.obs}</div>}</div>
                <Badge color={a.color} soft={a.soft}>{a.label}</Badge>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <PanelHead>Apresentação técnica</PanelHead>
            <div style={{ padding: 16 }}>
              {lote.status === "apresentacao_tecnica" ? (
                <>
                  <div style={{ display: "flex", gap: 10, padding: "10px 12px", background: C.panel2, borderRadius: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>📄</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>apresentacao_v2.pdf</div><div style={{ fontSize: 11, color: C.textFaint }}>enviada 31/05 · aguardando cliente</div></div>
                  </div>
                  <Btn full>+ Registrar retorno do cliente</Btn>
                </>
              ) : <div style={{ fontSize: 12.5, color: C.textFaint }}>Sem apresentação nesta etapa.</div>}
            </div>
          </div>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <PanelHead>Interessados</PanelHead>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {[{ p: "Cliente", n: CLIENTES[lote.cliente].nome, e: "contato@cliente.com.br" }, { p: "Arquiteto", n: c.arquiteto, e: "arq@estudio.com" }].map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 99, background: C.accentSoft, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{x.n[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{x.n}</div><div style={{ fontSize: 11, color: C.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.p} · {x.e}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Medicao({ nav, contratoId }) {
  const c = CONTRATOS.find(x => x.id === contratoId) || CONTRATOS[1];
  const [ambSel, setAmbSel] = useState(AMBIENTES_MED[0].id);
  const [tab, setTab] = useState("itens");
  const amb = AMBIENTES_MED.find(a => a.id === ambSel);
  const ambAptos = amb.itens.filter(i => i.status === "apto" || i.status === "apto_ressalva").length;
  const totalAptos = AMBIENTES_MED.flatMap(a => a.itens).filter(i => i.status === "apto" || i.status === "apto_ressalva").length;
  return (
    <div>
      <div className="clickable" onClick={() => nav("contrato", { contratoId: c.id })} style={{ color: C.textMute, fontSize: 13, marginBottom: 12 }}>← Contrato</div>
      <ContractBanner c={c} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Medição em campo</h2>
        <Badge color={C.accent} soft={C.accentSoft}>Visita em andamento</Badge>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: C.textMute }}><span style={{ color: C.green, fontWeight: 600 }}>{totalAptos} aptos</span> no contrato</span>
        <Btn>Revisar e conformar lote →</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 18 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", height: "fit-content" }}>
          <PanelHead>Ambientes</PanelHead>
          {AMBIENTES_MED.map(a => {
            const aptos = a.itens.filter(i => i.status === "apto" || i.status === "apto_ressalva").length;
            const on = a.id === ambSel;
            return (
              <div key={a.id} className="clickable" onClick={() => setAmbSel(a.id)} style={{ padding: "12px 16px", borderBottom: `1px solid ${C.borderSoft}`, background: on ? C.panel2 : "transparent", borderLeft: on ? `2px solid ${C.accent}` : "2px solid transparent" }}>
                <div style={{ fontSize: 13, fontWeight: on ? 600 : 500, color: on ? C.text : C.textMute }}>{a.nome}</div>
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>{a.itens.length} itens · {aptos} aptos</div>
              </div>
            );
          })}
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
            {[["itens", "Aptidão & Desenhos"], ["questionario", "Questionário do ambiente"]].map(([k, l]) => (
              <div key={k} className="clickable" onClick={() => setTab(k)} style={{ padding: "12px 18px", fontSize: 12.5, fontWeight: 600, color: tab === k ? C.text : C.textMute, borderBottom: tab === k ? `2px solid ${C.accent}` : "2px solid transparent" }}>{l}</div>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ padding: "12px 18px", fontSize: 12, color: C.textMute }}>{amb.nome}</div>
          </div>
          {tab === "itens" && (
            <div>
              {amb.itens.map((it, i) => (
                <div key={i} style={{ padding: "14px 18px", borderBottom: i < amb.itens.length - 1 ? `1px solid ${C.borderSoft}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <span className="mono" style={{ fontSize: 12, color: C.textMute, width: 26 }}>{it.codigo}</span>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{it.desc}</span>
                  </div>
                  <div style={{ display: "flex", gap: 16, paddingLeft: 38 }}>
                    <div style={{ flex: 1 }}>
                      <FieldLabel>Aptidão</FieldLabel>
                      <div style={{ display: "flex", gap: 5 }}>
                        {["apto", "apto_ressalva", "inapto"].map(k => {
                          const ap = APT[k]; const onx = it.status === k;
                          return <div key={k} className="clickable" style={{ flex: 1, textAlign: "center", padding: "6px 4px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: onx ? ap.soft : C.panel2, color: onx ? ap.color : C.textMute, border: `1px solid ${onx ? ap.color + "66" : C.border}` }}>{ap.label}</div>;
                        })}
                      </div>
                    </div>
                    <div style={{ width: 160 }}>
                      <FieldLabel>Desenhos de medição</FieldLabel>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {Array.from({ length: it.desenhos }).map((_, j) => <div key={j} style={{ width: 34, height: 34, borderRadius: 6, background: C.panel2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✎</div>)}
                        <div className="clickable" style={{ width: 34, height: 34, borderRadius: 6, border: `1.5px dashed ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: C.textMute }}>+</div>
                      </div>
                    </div>
                  </div>
                  {it.obs && <div style={{ paddingLeft: 38, marginTop: 8, fontSize: 11.5, color: C.amber }}>↳ {it.obs}</div>}
                </div>
              ))}
            </div>
          )}
          {tab === "questionario" && <Questionario amb={amb} ambAptos={ambAptos} />}
        </div>
      </div>
    </div>
  );
}

function Questionario({ amb, ambAptos }) {
  const [resp, setResp] = useState({});
  const [campos, setCampos] = useState({});
  const obrig = ambAptos > 0;
  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 12.5, color: obrig ? C.amber : C.textFaint }}>
        {obrig ? <><span>⚠</span> Obrigatório — este ambiente tem {ambAptos} item(ns) apto(s).</> : <>Opcional — ambiente sem itens aptos.</>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {QUEST_BLOCOS.map(b => (
          <div key={b.id}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: C.text }}>
              {b.label}{b.sub && <span style={{ fontSize: 10.5, color: C.textFaint, fontWeight: 400 }}> ({b.sub})</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {b.opcoes.map(o => {
                const on = resp[b.id] === o.v;
                return (
                  <div key={o.v}>
                    <div className="clickable" onClick={() => setResp({ ...resp, [b.id]: o.v })} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: on ? C.text : C.textMute }}>
                      <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.accent : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>{on ? "✕" : ""}</span>
                      {o.l}{o.campo && <span style={{ color: C.textFaint }}>=</span>}
                    </div>
                    {o.campo && on && (
                      <input value={campos[b.id + o.v] || ""} onChange={e => setCampos({ ...campos, [b.id + o.v]: e.target.value })} placeholder="valor" style={{ marginLeft: 23, marginTop: 4, width: 120, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none" }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>Observações sobre o ambiente <span style={{ fontSize: 10.5, color: C.textFaint, fontWeight: 400 }}>(pode citar itens específicos)</span></div>
          <textarea placeholder="Anotações livres do ambiente…" style={{ width: "100%", minHeight: 64, background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 11px", fontSize: 12.5, outline: "none", resize: "vertical" }} />
        </div>
      </div>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn ghost>Salvar rascunho</Btn>
        <Btn>Salvar questionário do ambiente</Btn>
      </div>
    </div>
  );
}

function FilaDesignar({ nav }) {
  const fila = [
    { contrato: "100000538", cliente: "Marquise Empreendimentos", itens: 36, importado: "28/05", arquiteto: "Estúdio Lina" },
    { contrato: "100000700-1", cliente: "Roberto Nunes", itens: 14, importado: "02/06", arquiteto: "—" },
  ];
  return (
    <div>
      <SectionTitle>Contratos aguardando designação</SectionTitle>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        {fila.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderBottom: i < fila.length - 1 ? `1px solid ${C.borderSoft}` : "none" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                <span className="mono" style={{ fontWeight: 600 }}>{f.contrato}</span>
                <Badge color={C.amber} soft={C.amberSoft} dot>A designar</Badge>
              </div>
              <div style={{ fontSize: 13, color: C.textMute }}>{f.cliente} · {f.itens} ambientes · importado {f.importado} · arq. {f.arquiteto}</div>
            </div>
            <select style={{ background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 12px", fontSize: 13 }}>
              <option>Designar consultor…</option><option>Téc. João Vianna</option><option>Téc. Marina Alves</option>
            </select>
            <Btn>Designar</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: C.textMute, margin: 0, textTransform: "uppercase", letterSpacing: 0.6 }}>{children}</h2>
      <div style={{ flex: 1 }} />
      {action && <span className="clickable" onClick={action.onClick} style={{ fontSize: 12.5, color: C.accent, fontWeight: 600 }}>{action.label}</span>}
    </div>
  );
}
function PanelHead({ children }) { return <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5, fontWeight: 600, color: C.textMute, background: C.panel2 }}>{children}</div>; }
function FieldLabel({ children }) { return <div style={{ fontSize: 10.5, color: C.textFaint, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{children}</div>; }
function Btn({ children, ghost, danger, full, onClick }) {
  const base = { padding: "8px 15px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "1px solid", width: full ? "100%" : "auto", textAlign: "center" };
  let style = danger ? { ...base, background: C.redSoft, color: C.red, borderColor: C.red + "55" } : ghost ? { ...base, background: "transparent", color: C.textMute, borderColor: C.border } : { ...base, background: C.accent, color: "#fff", borderColor: C.accent };
  return <div className="clickable" onClick={onClick} style={style}>{children}</div>;
}
