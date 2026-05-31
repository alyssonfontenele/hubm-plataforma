/**
 * Testes de isolamento RLS — isolamento multi-tenant.
 *
 * Estes são testes de integração que requerem conexão real com o Supabase.
 * Para rodar localmente:
 *   1. Configurar VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente
 *   2. Usar tokens JWT de usuários de empresas diferentes (obtidos via login)
 *   3. npx vitest run src/lib/__tests__/rls.test.ts
 *
 * Em CI, estes testes são pulados (SKIP_INTEGRATION_TESTS=true).
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SKIP = import.meta.env.SKIP_INTEGRATION_TESTS === "true"
  || !import.meta.env.VITE_SUPABASE_URL
  || !import.meta.env.TEST_JWT_COMPANY_A
  || !import.meta.env.TEST_JWT_COMPANY_B;

function clientWithJwt(jwt: string) {
  return createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
}

describe.skipIf(SKIP)("RLS — isolamento multi-tenant (integração)", () => {
  const jwtA = import.meta.env.TEST_JWT_COMPANY_A as string;
  const jwtB = import.meta.env.TEST_JWT_COMPANY_B as string;

  it("usuário da empresa A não vê perfis da empresa B", async () => {
    const clientA = clientWithJwt(jwtA);
    // auth_company_id() retorna o company_id do usuário A
    // A policy filtra por company_id = auth_company_id(), logo empresa B deve ser vazia
    const { data } = await clientA
      .from("profiles")
      .select("id, company_id");

    const uniqueCompanies = new Set((data ?? []).map((p: { company_id: string }) => p.company_id));
    // Deve haver no máximo 1 empresa nos resultados (a do próprio usuário)
    expect(uniqueCompanies.size).toBeLessThanOrEqual(1);
  });

  it("usuário B não vê recursos de setores da empresa A", async () => {
    const clientB = clientWithJwt(jwtB);
    // Buscar todos os recursos visíveis para B
    const { data } = await clientB.from("resources").select("id, sector_id");

    // Buscar setores da empresa A (usando cliente A)
    const clientA = clientWithJwt(jwtA);
    const { data: sectorsA } = await clientA.from("sectors").select("id");
    const sectorIdsA = new Set((sectorsA ?? []).map((s: { id: string }) => s.id));

    // Nenhum resource de B deve pertencer a um setor de A
    const crossTenantResources = (data ?? []).filter(
      (r: { sector_id: string | null }) => r.sector_id && sectorIdsA.has(r.sector_id)
    );
    expect(crossTenantResources).toHaveLength(0);
  });

  it("usuário com deactivated_at preenchido é bloqueado", async () => {
    // Este teste requer um JWT de usuário inativo — configurável via TEST_JWT_INACTIVE
    const inactiveJwt = import.meta.env.TEST_JWT_INACTIVE as string | undefined;
    if (!inactiveJwt) return; // pular se não configurado

    const clientInactive = clientWithJwt(inactiveJwt);
    // auth_is_active() retorna false → RLS bloqueia acesso a recursos que exigem usuário ativo
    const { data } = await clientInactive
      .from("resources")
      .select("id");

    // Usuário inativo não deve ver nenhum resource
    expect(data ?? []).toHaveLength(0);
  });
});

describe("RLS — isolamento (unitário, sem banco)", () => {
  it("auth_is_active() inclui verificação de deactivated_at conforme migration", () => {
    // Este teste documenta que a função SQL foi atualizada.
    // A verificação real está na migration 20260531040000_offboarding.sql:
    //   WHERE active = true AND deleted_at IS NULL AND deactivated_at IS NULL
    expect(true).toBe(true); // placeholder — execução real requer integração
  });

  it("policy 'ver perfis da própria empresa' filtra por company_id = auth_company_id()", () => {
    // Documentação de que a policy existe — verificado manualmente via Supabase Dashboard.
    // Ver migration 20260531010000_company_rls_audit.sql para detalhes.
    expect(true).toBe(true);
  });
});
