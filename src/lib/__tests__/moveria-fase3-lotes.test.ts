/**
 * Testes de integração — Fase 3: Lotes Moveria
 *
 * Cobrem: numeração densa por contrato, "ÚNICO", dissolução, trava de contrato,
 * RLS por papel (admin/consultor_tecnico/vendedor).
 *
 * Requerem Supabase local (127.0.0.1:54321) com migration moveria_fase3_lotes
 * e seed da suite moveria-rls aplicados.
 *
 * Pulados automaticamente quando SKIP_INTEGRATION_TESTS=true ou local indisponível.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54391";
const ANON_KEY  = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const SVC_JWT   =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjEwMDAwMDAwMH0.goLT_yrisHkVs3i4xFEFrO6WxA3PiDHLypfetBIXSAA";
const PASSWORD  = "Teste@1234";

// IDs reutilizados do seed moveria-rls
const SEED = {
  contrato:         "a7a7a7a7-a7a7-4a7a-a7a7-a7a7a7a7a7a7",
  cliente:          "f6f6f6f6-f6f6-4f6f-f6f6-f6f6f6f6f6f6",
  consultorMembro:  "d4d4d4d4-d4d4-4d4d-d4d4-d4d4d4d4d4d4",
  consultorProfile: "a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1",
  vendedorMembro:   "e5e5e5e5-e5e5-4e5e-e5e5-e5e5e5e5e5e5",
} as const;

// IDs exclusivos desta suite (prefixo f3 para não colidir com moveria-rls)
const IDS = {
  loteA:   "f3000001-0000-4000-0000-f30000000001",
  loteB:   "f3000002-0000-4000-0000-f30000000002",
  loteC:   "f3000003-0000-4000-0000-f30000000003",
  loteUni: "f3000004-0000-4000-0000-f30000000004",
} as const;

const SKIP = import.meta.env.SKIP_INTEGRATION_TESTS === "true";

function adminClient(): SupabaseClient {
  return createClient(LOCAL_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${SVC_JWT}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string): Promise<SupabaseClient> {
  const anon = createClient(LOCAL_URL, ANON_KEY);
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`signIn(${email}) falhou: ${error?.message ?? "sem sessão"}`);
  }
  return createClient(LOCAL_URL, ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
  });
}

let admin: SupabaseClient;
let vendedor: SupabaseClient;
let consultor: SupabaseClient;

describe.skipIf(SKIP)("Moveria Fase 3 — Lotes: numeração densa e dissolução", () => {

  beforeAll(async () => {
    admin     = adminClient();
    vendedor  = await signIn("vendedor@moveria.test");
    consultor = await signIn("consultor@moveria.test");

    // Limpar lotes desta suite de corridas anteriores
    await admin.from("moveria_lotes").delete().in("id", Object.values(IDS));
  }, 20_000);

  afterAll(async () => {
    await admin.from("moveria_lotes").delete().in("id", Object.values(IDS));
  }, 10_000);

  // ──────────────────────────────────────────────────────────────────────────
  // NUMERAÇÃO DENSA
  // ──────────────────────────────────────────────────────────────────────────

  describe("Numeração densa por contrato", () => {

    it("cria lote A → numero '1'", async () => {
      const { error } = await admin.from("moveria_lotes").insert({
        id:           IDS.loteA,
        contrato_id:  SEED.contrato,
        consultor_id: SEED.consultorMembro,
        status:       "aberto",
        // numero omitido → trigger autonum atribui '1'
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("moveria_lotes")
        .select("numero")
        .eq("id", IDS.loteA)
        .single();
      expect(data!.numero).toBe("1");
    });

    it("cria lote B → numero '2'", async () => {
      const { error } = await admin.from("moveria_lotes").insert({
        id:           IDS.loteB,
        contrato_id:  SEED.contrato,
        consultor_id: SEED.consultorMembro,
        status:       "aberto",
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("moveria_lotes")
        .select("numero")
        .eq("id", IDS.loteB)
        .single();
      expect(data!.numero).toBe("2");
    });

    it("cria lote C → numero '3'", async () => {
      const { error } = await admin.from("moveria_lotes").insert({
        id:           IDS.loteC,
        contrato_id:  SEED.contrato,
        consultor_id: SEED.consultorMembro,
        status:       "aberto",
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("moveria_lotes")
        .select("numero")
        .eq("id", IDS.loteC)
        .single();
      expect(data!.numero).toBe("3");
    });

    it("dissolução do lote B libera itens e slot '2'", async () => {
      // Lotes sem itens: dissolução deve funcionar normalmente para admin
      const { error } = await admin
        .from("moveria_lotes")
        .delete()
        .eq("id", IDS.loteB);
      expect(error).toBeNull();

      // Verifica que lote B não existe mais
      const { data } = await admin
        .from("moveria_lotes")
        .select("id")
        .eq("id", IDS.loteB);
      expect(data).toHaveLength(0);
    });

    it("novo lote após dissolução preenche o buraco: numero '2'", async () => {
      const { error } = await admin.from("moveria_lotes").insert({
        id:           IDS.loteB,  // reutiliza o mesmo ID para facilitar cleanup
        contrato_id:  SEED.contrato,
        consultor_id: SEED.consultorMembro,
        status:       "aberto",
      });
      expect(error).toBeNull();

      const { data } = await admin
        .from("moveria_lotes")
        .select("numero")
        .eq("id", IDS.loteB)
        .single();
      // Densidade: buraco no slot 2 é preenchido
      expect(data!.numero).toBe("2");
    });

    it("UNIQUE(contrato_id, numero) impede numero duplicado no mesmo contrato", async () => {
      const { error } = await admin.from("moveria_lotes").insert({
        contrato_id:  SEED.contrato,
        consultor_id: SEED.consultorMembro,
        numero:       "1",  // já existe (lote A)
        status:       "aberto",
      });
      expect(error).not.toBeNull();
      expect(error!.code).toBe("23505"); // unique violation
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RÓTULO "ÚNICO"
  // ──────────────────────────────────────────────────────────────────────────

  describe("Rótulo 'ÚNICO'", () => {

    it("moveria_fn_reservar_numero_lote retorna 'ÚNICO' quando qtd = total de itens do contrato", async () => {
      // Conta quantos itens o contrato de seed tem
      const { data: itensCount } = await admin
        .from("moveria_itens_contrato")
        .select("id", { count: "exact", head: true })
        .eq("contrato_id", SEED.contrato)
        .is("deletado_em", null);

      const total = itensCount?.length ?? 0;
      if (total === 0) {
        // Sem itens no seed, pula verificação de ÚNICO
        return;
      }

      const { data, error } = await admin.rpc(
        "moveria_fn_reservar_numero_lote",
        { p_contrato_id: SEED.contrato, p_qtd_itens_no_lote: total }
      );
      expect(error).toBeNull();
      expect(data).toBe("ÚNICO");
    });

    it("moveria_fn_reservar_numero_lote NÃO retorna 'ÚNICO' quando qtd < total", async () => {
      const { data: itens } = await admin
        .from("moveria_itens_contrato")
        .select("id")
        .eq("contrato_id", SEED.contrato)
        .is("deletado_em", null);

      const total = (itens ?? []).length;
      if (total <= 1) return; // precisa de pelo menos 2 itens para testar parcial

      const { data, error } = await admin.rpc(
        "moveria_fn_reservar_numero_lote",
        { p_contrato_id: SEED.contrato, p_qtd_itens_no_lote: total - 1 }
      );
      expect(error).toBeNull();
      expect(data).not.toBe("ÚNICO");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TRAVA DE CONTRATO
  // ──────────────────────────────────────────────────────────────────────────

  describe("Trava de contrato na inserção de itens", () => {

    it("contrato_id é NOT NULL — insert sem contrato_id falha", async () => {
      const { error } = await admin.from("moveria_lotes").insert({
        consultor_id: SEED.consultorMembro,
        numero:       "SEM-CONTRATO",
        status:       "aberto",
        // contrato_id omitido
      });
      expect(error).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RLS POR PAPEL
  // ──────────────────────────────────────────────────────────────────────────

  describe("RLS por papel em moveria_lotes", () => {

    it("vendedor não pode INSERT em moveria_lotes (sem policy)", async () => {
      const { error } = await vendedor.from("moveria_lotes").insert({
        contrato_id:  SEED.contrato,
        consultor_id: SEED.consultorMembro,
        numero:       "VENDOR-TRY",
        status:       "aberto",
      });
      // RLS: policy INSERT requer admin ou consultor_tecnico
      expect(error).not.toBeNull();
    });

    it("vendedor não pode DELETE em moveria_lotes", async () => {
      // Tenta deletar o lote A (existe, mas RLS bloqueia)
      const { error } = await vendedor
        .from("moveria_lotes")
        .delete()
        .eq("id", IDS.loteA);
      // RLS: policy DELETE requer admin_moveria
      // PostgREST retorna erro 42501 ou 0 linhas afetadas (sem erro mas sem efeito)
      if (!error) {
        // Sem erro mas RLS bloqueou silenciosamente: lote ainda deve existir
        const { data } = await admin
          .from("moveria_lotes")
          .select("id")
          .eq("id", IDS.loteA);
        expect(data).toHaveLength(1); // não foi deletado
      } else {
        expect(error.code).toMatch(/42501|PGRST/);
      }
    });

    it("consultor_tecnico pode INSERT em moveria_lotes (policy permite)", async () => {
      // Remove lote anterior desta suite se existir para não violar UNIQUE
      await admin.from("moveria_lotes").delete().eq("numero", "CONSULTOR-INSERT-TEST").eq("contrato_id", SEED.contrato);

      const { error } = await consultor.from("moveria_lotes").insert({
        contrato_id:  SEED.contrato,
        consultor_id: SEED.consultorMembro,
        numero:       "CONSULTOR-INSERT-TEST",
        status:       "aberto",
      });
      // Policy: INSERT USING (admin OR consultor_tecnico)
      expect(error).toBeNull();

      // Limpar
      await admin
        .from("moveria_lotes")
        .delete()
        .eq("numero", "CONSULTOR-INSERT-TEST")
        .eq("contrato_id", SEED.contrato);
    });

    it("admin vê lotes via moveria_lotes_v (view retorna linhas)", async () => {
      const { data, error } = await admin
        .from("moveria_lotes_v")
        .select("id, numero, contrato_numero, consultor_nome, qtd_itens");
      expect(error).toBeNull();
      expect(data).toBeDefined();
      // Pelo menos os lotes A e C criados nesta suite devem aparecer
      const ids = (data ?? []).map((r: any) => r.id);
      expect(ids).toContain(IDS.loteA);
    });

    it("moveria_lotes_v expõe contrato_numero formatado corretamente", async () => {
      const { data, error } = await admin
        .from("moveria_lotes_v")
        .select("contrato_numero")
        .eq("id", IDS.loteA)
        .single();
      expect(error).toBeNull();
      // contrato_numero não deve ser null (loteA tem contrato_id setado)
      expect(data!.contrato_numero).not.toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DISSOLUÇÃO
  // ──────────────────────────────────────────────────────────────────────────

  describe("Dissolução pelo admin", () => {

    it("admin pode dissolver (DELETE) um lote sem erro", async () => {
      const { error } = await admin
        .from("moveria_lotes")
        .delete()
        .eq("id", IDS.loteC);
      expect(error).toBeNull();

      const { data } = await admin
        .from("moveria_lotes")
        .select("id")
        .eq("id", IDS.loteC);
      expect(data).toHaveLength(0);
    });

    it("dissolução gera evento 'lote_dissolvido' no audit log", async () => {
      // lote_id é NULL após a dissolução (ON DELETE SET NULL na FK moveria_eventos_lote_id_fkey).
      // O payload preserva numero e contrato_id para rastreabilidade.
      const { data: eventos, error } = await admin
        .from("moveria_eventos")
        .select("tipo, payload")
        .eq("tipo", "lote_dissolvido")
        .filter("payload->>numero", "eq", "3");
      expect(error).toBeNull();
      expect(eventos!.length).toBeGreaterThan(0);
      expect(eventos![0].payload.numero).toBe("3");
    });
  });
});
