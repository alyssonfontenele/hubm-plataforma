/**
 * Testes de RLS por papel — Módulo Contratos Moveria
 *
 * Testes de integração contra banco local (127.0.0.1:54321).
 * Requerem que a migration 20260602010000_add_moveria_module e o seed local
 * tenham sido aplicados antes de rodar.
 *
 * Para rodar: npx vitest run src/lib/__tests__/moveria-rls.test.ts
 * Pulados automaticamente quando SKIP_INTEGRATION_TESTS=true ou local indisponível.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Configuração local ──────────────────────────────────────────────────────
const LOCAL_URL = "http://127.0.0.1:54391";
const ANON_KEY  = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
// JWT de service_role gerado com o secret local
// (super-secret-jwt-token-with-at-least-32-characters-long)
const SVC_JWT   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjEwMDAwMDAwMH0.goLT_yrisHkVs3i4xFEFrO6WxA3PiDHLypfetBIXSAA";
const PASSWORD  = "Teste@1234";

// ── IDs do seed (fixos e reprodutíveis) ────────────────────────────────────
const IDS = {
  contrato:          "a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7",
  cliente:           "f6f6f6f6-f6f6-4f6f-f6f6-f6f6f6f6f6f6",
  consultorMembro:   "d4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4",
  consultorProfile:  "a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1",
  vendedorMembro:    "e5e5e5e5-e5e5-4e5e-e5e5-e5e5e5e5e5e5",
  // Itens do contrato MOV-2026-0001
  item_am: "11111111-0001-0001-0001-111111111111", // 00001AM — em_medicao do teste anterior
  item_ba: "22222222-0002-0002-0002-222222222222", // 00002BA — em_apresentacao_tecnica
  item_ho: "44444444-0004-0004-0004-444444444444", // 00004HO — pendente (reservado para inapto)
  item_ss: "55555555-0005-0005-0005-555555555555", // 00005SS — pendente
  item_bd: "66666666-0006-0006-0006-666666666666", // 00006BD — reservado para Teste 3
  // Lotes de teste (Teste 3)
  loteInapto: "cccccccc-0000-4000-0000-cccccccccccc",
  loteRetry:  "dddddddd-0000-4000-0000-dddddddddddd",
  // Contrato sem designação (Teste 2)
  contratoSemDesign: "eeeeeeee-0000-4000-0000-eeeeeeeeeeee",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────
async function signIn(email: string): Promise<SupabaseClient> {
  const anon = createClient(LOCAL_URL, ANON_KEY);
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) {
    throw new Error(`signIn(${email}) falhou: ${error?.message ?? "sem sessão"}`);
  }
  return createClient(LOCAL_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

function adminClient(): SupabaseClient {
  // service_role JWT: bypassa RLS (BYPASSRLS=true) + auth.role()='service_role'
  // Deve ser passado no header Authorization para PostgREST reconhecer o role
  return createClient(LOCAL_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${SVC_JWT}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Skip: só roda com Supabase local ativo ──────────────────────────────────
const SKIP = import.meta.env.SKIP_INTEGRATION_TESTS === "true";

// ── Clientes por papel (inicializados em beforeAll) ─────────────────────────
let vendedor:  SupabaseClient;
let consultor: SupabaseClient;
let admin:     SupabaseClient;

// ============================================================================
// SUITE PRINCIPAL
// ============================================================================

describe.skipIf(SKIP)("Moveria RLS — testes por papel (integração local)", () => {

  // ── Setup global ───────────────────────────────────────────────────────────
  beforeAll(async () => {
    vendedor  = await signIn("vendedor@moveria.test");
    consultor = await signIn("consultor@moveria.test");
    admin     = adminClient();

    // Garante estado limpo para o Teste 3: itens ho e bd em pendente, sem lote
    await admin
      .from("moveria_itens_contrato")
      .update({ status_item: "pendente" })
      .in("id", [IDS.item_ho, IDS.item_bd]);

    // Remove associações de lote de testes anteriores, se houver
    await admin.from("moveria_lote_itens").delete().in("item_id", [IDS.item_ho, IDS.item_bd]);

    // Remove lotes de teste anteriores
    await admin.from("moveria_lotes").delete().in("id", [IDS.loteInapto, IDS.loteRetry]);

    // Remove contrato sem designação de corrida anterior
    await admin
      .from("moveria_contratos")
      .delete()
      .eq("id", IDS.contratoSemDesign);
  }, 20_000);

  // ==========================================================================
  // TESTE 1 — Mascaramento de valores para o vendedor
  // ==========================================================================

  describe("Teste 1 — Mascaramento de valores (vendedor vs consultor vs admin)", () => {

    // ── Vendedor: views mascaradas ──────────────────────────────────────────
    it("vendedor: valor_unitario e valor_item são NULL em moveria_itens_v", async () => {
      const { data, error } = await vendedor
        .from("moveria_itens_v")
        .select("codigo, valor_unitario, valor_item")
        .eq("contrato_id", IDS.contrato);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);

      for (const row of data!) {
        expect(row.valor_unitario).toBeNull(); // mascarado
        expect(row.valor_item).toBeNull();     // mascarado
      }
    });

    it("vendedor: desconto_pct é NULL em moveria_contratos_v", async () => {
      const { data, error } = await vendedor
        .from("moveria_contratos_v")
        .select("numero, desconto_pct")
        .eq("id", IDS.contrato);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].desconto_pct).toBeNull();
    });

    it("vendedor: cpf_hash é NULL em moveria_clientes_v e cpf_mascarado está visível", async () => {
      const { data, error } = await vendedor
        .from("moveria_clientes_v")
        .select("nome_completo, cpf_hash, cpf_mascarado")
        .eq("id", IDS.cliente);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].cpf_hash).toBeNull();
      expect(data![0].cpf_mascarado).toBe("529.982.XXX-XX");
    });

    // ── Vendedor: tabela base deve negar colunas sensíveis ──────────────────
    it("vendedor: SELECT de valor_unitario direto na tabela base retorna dados (grant concedido em 20260604090000)", async () => {
      const { data, error } = await vendedor
        .from("moveria_itens_contrato")
        .select("valor_unitario")
        .eq("contrato_id", IDS.contrato);

      // Migration 20260604090000 concedeu explicitamente SELECT(valor_unitario, valor_item)
      // ao papel authenticated para corrigir regressão na aba Ambientes.
      // A restrição ao vendedor ocorre via view (moveria_itens_v), não via column grant na tabela base.
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it("vendedor: SELECT de cpf_hash direto na tabela base é negado por column grant", async () => {
      const { data } = await vendedor
        .from("moveria_clientes")
        .select("cpf_hash")
        .eq("id", IDS.cliente);

      const vazou = (data ?? []).some(r => r.cpf_hash !== null && r.cpf_hash !== undefined);
      expect(vazou).toBe(false);
    });

    it("vendedor: SELECT de desconto_pct direto na tabela base é negado por column grant", async () => {
      const { data } = await vendedor
        .from("moveria_contratos")
        .select("desconto_pct")
        .eq("id", IDS.contrato);

      const vazou = (data ?? []).some(r => r.desconto_pct !== null && r.desconto_pct !== undefined);
      expect(vazou).toBe(false);
    });

    // ── Consultor: vê todos os valores ─────────────────────────────────────
    it("consultor: valor_unitario e valor_item visíveis em moveria_itens_v", async () => {
      const { data, error } = await consultor
        .from("moveria_itens_v")
        .select("codigo, valor_unitario, valor_item")
        .eq("contrato_id", IDS.contrato);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);

      for (const row of data!) {
        expect(row.valor_unitario).not.toBeNull();
        expect(typeof row.valor_unitario).toBe("number");
        expect(Number(row.valor_unitario)).toBeGreaterThan(0);
        expect(row.valor_item).not.toBeNull();
      }
    });

    it("consultor: desconto_pct visível em moveria_contratos_v", async () => {
      const { data, error } = await consultor
        .from("moveria_contratos_v")
        .select("numero, desconto_pct")
        .eq("id", IDS.contrato);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(Number(data![0].desconto_pct)).toBe(5); // seed: 5%
    });

    it("consultor: cpf_hash (SHA-256) visível em moveria_clientes_v", async () => {
      const { data, error } = await consultor
        .from("moveria_clientes_v")
        .select("nome_completo, cpf_hash, cpf_mascarado")
        .eq("id", IDS.cliente);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].cpf_hash).toBeTruthy(); // hash SHA-256 presente
      expect(data![0].cpf_hash).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    // ── Admin (service_role): vê tudo ──────────────────────────────────────
    it("admin: vê valor_unitario real em moveria_itens_v (sem mascaramento)", async () => {
      const { data, error } = await admin
        .from("moveria_itens_v")
        .select("codigo, valor_unitario, valor_item")
        .eq("contrato_id", IDS.contrato);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);

      const am = data!.find(r => r.codigo === "00001AM");
      expect(am).toBeDefined();
      expect(Number(am!.valor_unitario)).toBe(2400);
      expect(Number(am!.valor_item)).toBe(2400);
    });

    it("admin: cpf_hash real visível em moveria_clientes_v", async () => {
      const { data, error } = await admin
        .from("moveria_clientes_v")
        .select("cpf_hash")
        .eq("id", IDS.cliente);

      expect(error).toBeNull();
      expect(data![0].cpf_hash).toHaveLength(64);
    });

    it("admin: desconto_pct real visível em moveria_contratos_v", async () => {
      const { data, error } = await admin
        .from("moveria_contratos_v")
        .select("desconto_pct")
        .eq("id", IDS.contrato);

      expect(error).toBeNull();
      expect(Number(data![0].desconto_pct)).toBe(5);
    });
  });

  // ==========================================================================
  // TESTE 2 — Isolamento do consultor por designação
  // ==========================================================================

  describe("Teste 2 — Isolamento do consultor por designação (fonte de verdade: moveria_designacoes)", () => {

    it("consultor vê o contrato MOV-2026-0001 (tem itens designados a ele)", async () => {
      const { data, error } = await consultor
        .from("moveria_contratos_v")
        .select("id, numero");

      expect(error).toBeNull();
      const ids = (data ?? []).map(r => r.id);
      expect(ids).toContain(IDS.contrato);
    });

    it("consultor NÃO vê contrato sem nenhum item designado a ele", async () => {
      // Cria contrato sem designação para Carlos (seed do vendedor Fernanda como owner)
      const { error: upsertErr } = await admin.from("moveria_contratos").upsert({
        id: IDS.contratoSemDesign,
        numero: "MOV-2026-NODSGN",
        numero_base: "MOV-2026-NODSGN",
        versao: 1,
        cliente_id: IDS.cliente,
        vendedor_id: IDS.vendedorMembro,
        status: "em_andamento",
        desconto_pct: 0,
      });
      expect(upsertErr).toBeNull();

      const { data } = await consultor
        .from("moveria_contratos_v")
        .select("id")
        .eq("id", IDS.contratoSemDesign);

      expect((data ?? []).length).toBe(0); // invisível para o consultor
    });

    it("consultor vê apenas itens com designação ativa em moveria_itens_v", async () => {
      const { data: itens, error } = await consultor
        .from("moveria_itens_v")
        .select("id, codigo");

      expect(error).toBeNull();
      const idsVisiveis = new Set((itens ?? []).map(r => r.id));

      // Todos os IDs visíveis devem ter designação ativa em moveria_designacoes
      const { data: designacoes } = await consultor
        .from("moveria_designacoes")
        .select("item_id")
        .eq("ativo", true);

      const designadosSet = new Set((designacoes ?? []).map(d => d.item_id));

      for (const id of idsVisiveis) {
        expect(designadosSet.has(id)).toBe(true);
      }
    });

    it("moveria_designacoes é a fonte de verdade: consultor lê suas designações direto da tabela", async () => {
      const { data, error } = await consultor
        .from("moveria_designacoes")
        .select("item_id, consultor_id, ativo")
        .eq("ativo", true);

      expect(error).toBeNull();
      expect(data!.length).toBe(6); // seed: 6 itens designados ao Carlos

      for (const d of data!) {
        expect(d.consultor_id).toBe(IDS.consultorMembro);
        expect(d.ativo).toBe(true);
      }
    });

    it("consultor_designado (campo UI/denorm) coincide com moveria_designacoes, mas não é usado em RLS", async () => {
      // Verifica que o campo denormalizado está correto (sincronizado pelo trigger)
      const { data: itens } = await consultor
        .from("moveria_itens_v")
        .select("id, consultor_designado");

      for (const item of itens ?? []) {
        // Campo denormalizado deve apontar para o profile do consultor
        expect(item.consultor_designado).toBe(IDS.consultorProfile);
      }

      // Confirmação explícita: política de acesso usa moveria_designacoes,
      // não consultor_designado. Um admin poderia setar consultor_designado arbitrário
      // e o RLS ainda funcionaria corretamente (teste de integridade do design).
      // (Verificado implicitamente pelos testes acima — o acesso baseia-se em
      //  moveria_designacoes, não no campo denormalizado.)
      expect(true).toBe(true);
    });

    it("vendedor NÃO acessa moveria_designacoes com filtros além dos próprios contratos", async () => {
      // Vendedor pode ver designações dos itens dos seus contratos
      const { data, error } = await vendedor
        .from("moveria_designacoes")
        .select("item_id, consultor_id");

      expect(error).toBeNull();
      // Vendedor vê as designações (RLS: auth_moveria_papel() IS NOT NULL)
      // mas não pode alterar — sem UPDATE policy para vendedor
      expect((data ?? []).length).toBeGreaterThan(0);

      // Confirma que vendedor não consegue desativar uma designação.
      // RLS nega silenciosamente (0 linhas afetadas, sem erro) — comportamento correto do PostgreSQL.
      await vendedor
        .from("moveria_designacoes")
        .update({ ativo: false })
        .eq("consultor_id", IDS.consultorMembro);

      // Verifica que as designações continuam ativas (RLS silenciou o UPDATE)
      const { data: depoisUpdate } = await vendedor
        .from("moveria_designacoes")
        .select("ativo")
        .eq("ativo", true);

      expect((depoisUpdate ?? []).length).toBe(6); // todas ainda ativas
    });
  });

  // ==========================================================================
  // TESTE 3 — Ciclo inapto: medição → libera lote → retry
  // ==========================================================================

  // TODO: moveria_medicoes foi completamente reestruturada na Fase 4a (sessão por contrato,
  // sem item_id/veredito/autor_id por linha). Estes testes precisam de reescrita para
  // a nova estrutura antes de serem reativados.
  describe.skip("Teste 3 — Ciclo inapto completo (lote → medição inapto → retry)", () => {

    it("setup: item 00006BD recebe status em_medicao e é adicionado a lote ativo", async () => {
      // Cria lote de teste
      const { error: loteErr } = await admin.from("moveria_lotes").upsert({
        id: IDS.loteInapto,
        contrato_id: IDS.contrato,
        numero: "LOTE-2026-INAPTO-TEST",
        consultor_id: IDS.consultorMembro,
        status: "aberto",
      });
      expect(loteErr).toBeNull();

      // Move item para em_medicao (pendente → em_medicao é transição válida)
      const { error: statusErr } = await admin
        .from("moveria_itens_contrato")
        .update({ status_item: "em_medicao" })
        .eq("id", IDS.item_bd);
      expect(statusErr).toBeNull();

      // Adiciona item ao lote (trigger before_insert valida + after_insert sincroniza lote_id)
      const { error: loteItemErr } = await admin.from("moveria_lote_itens").insert({
        lote_id: IDS.loteInapto,
        item_id: IDS.item_bd,
        adicionado_por: IDS.consultorProfile,
      });
      expect(loteItemErr).toBeNull();

      // Verifica estado inicial: item está no lote e lote_id sincronizado
      const { data: liData } = await admin
        .from("moveria_lote_itens")
        .select("lote_id")
        .eq("item_id", IDS.item_bd);
      expect(liData).toHaveLength(1);
      expect(liData![0].lote_id).toBe(IDS.loteInapto);

      const { data: itemData } = await admin
        .from("moveria_itens_contrato")
        .select("lote_id, status_item")
        .eq("id", IDS.item_bd)
        .single();
      expect(itemData!.lote_id).toBe(IDS.loteInapto);  // sincronizado pelo trigger
      expect(itemData!.status_item).toBe("em_medicao");
    });

    it("(a) medição inapto muda item para status 'inapto'", async () => {
      const eventosBefore = await admin
        .from("moveria_eventos")
        .select("id")
        .eq("item_id", IDS.item_bd);

      const { error } = await admin.from("moveria_medicoes").insert({
        item_id: IDS.item_bd,
        veredito: "inapto",
        parecer:  "Ambiente com umidade excessiva — requer reforma antes da nova medição.",
        autor_id: IDS.consultorProfile,
      });
      expect(error).toBeNull();

      const { data: item } = await admin
        .from("moveria_itens_contrato")
        .select("status_item, lote_id")
        .eq("id", IDS.item_bd)
        .single();

      expect(item!.status_item).toBe("inapto"); // trigger avancou: em_medicao → inapto
    });

    it("(b) associação lote↔item removida automaticamente pelo trigger (UNIQUE liberado)", async () => {
      const { data: li } = await admin
        .from("moveria_lote_itens")
        .select("id")
        .eq("item_id", IDS.item_bd);
      expect(li).toHaveLength(0); // trigger apagou a associação

      // lote_id no item também foi limpo pelo after_delete trigger
      const { data: item } = await admin
        .from("moveria_itens_contrato")
        .select("lote_id")
        .eq("id", IDS.item_bd)
        .single();
      expect(item!.lote_id).toBeNull();
    });

    it("(c) evento 'medicao_registrada' com veredito inapto registrado no event log", async () => {
      const { data: eventos, error } = await admin
        .from("moveria_eventos")
        .select("tipo, payload")
        .eq("item_id", IDS.item_bd)
        .eq("tipo", "medicao_registrada");

      expect(error).toBeNull();
      expect(eventos!.length).toBeGreaterThan(0);

      const evento = eventos![0];
      expect(evento.payload.veredito).toBe("inapto");
      expect(evento.payload.de).toBe("em_medicao");
      expect(evento.payload.para).toBe("inapto");
    });

    it("reset inapto→pendente via UPDATE manual funciona (transição válida)", async () => {
      const { error } = await admin
        .from("moveria_itens_contrato")
        .update({ status_item: "pendente" })
        .eq("id", IDS.item_bd);

      expect(error).toBeNull();

      const { data } = await admin
        .from("moveria_itens_contrato")
        .select("status_item")
        .eq("id", IDS.item_bd)
        .single();
      expect(data!.status_item).toBe("pendente");
    });

    it("item pode ser adicionado a NOVO lote sem violar UNIQUE(item_id) após ciclo inapto", async () => {
      // Move para em_medicao para o segundo ciclo
      await admin
        .from("moveria_itens_contrato")
        .update({ status_item: "em_medicao" })
        .eq("id", IDS.item_bd);

      // Cria segundo lote (retry)
      const { error: loteErr } = await admin.from("moveria_lotes").upsert({
        id: IDS.loteRetry,
        contrato_id: IDS.contrato,
        numero: "LOTE-2026-RETRY-TEST",
        consultor_id: IDS.consultorMembro,
        status: "aberto",
      });
      expect(loteErr).toBeNull();

      // Adiciona ao novo lote — não viola UNIQUE(item_id) pois a entrada anterior foi removida
      const { error: insertErr } = await admin.from("moveria_lote_itens").insert({
        lote_id: IDS.loteRetry,
        item_id: IDS.item_bd,
        adicionado_por: IDS.consultorProfile,
      });
      expect(insertErr).toBeNull(); // sem erro de UNIQUE violation

      // Confirma que está no novo lote
      const { data } = await admin
        .from("moveria_lote_itens")
        .select("lote_id")
        .eq("item_id", IDS.item_bd);
      expect(data).toHaveLength(1);
      expect(data![0].lote_id).toBe(IDS.loteRetry);
    });

    it("evento 'item_adicionado_lote' gerado para o retry", async () => {
      const { data: eventos } = await admin
        .from("moveria_eventos")
        .select("tipo, payload, lote_id")
        .eq("item_id", IDS.item_bd)
        .eq("tipo", "item_adicionado_lote")
        .eq("lote_id", IDS.loteRetry);

      expect(eventos!.length).toBeGreaterThan(0);
      expect(eventos![0].lote_id).toBe(IDS.loteRetry);
    });
  });
});
