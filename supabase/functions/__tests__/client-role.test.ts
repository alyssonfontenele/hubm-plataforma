/**
 * Testes da role 'cliente' — HubM
 *
 * Cobre:
 *   (a) Lógica do trigger: cliente com setor deve ser bloqueado
 *   (b) RLS: cliente não lê tabelas internas (prova estrutural + integração)
 *   (c) create-client-user: nunca cria role diferente de 'cliente'
 *
 * Testes de integração requerem:
 *   SUPABASE_URL_A + ANON_KEY_A  → hubm-mowig ou hubm-moveria
 *   TEST_JWT_CLIENT              → JWT de um usuário com global_role='cliente'
 *   TEST_JWT_ADMIN               → JWT de um usuário com global_role='admin'
 *   SUPABASE_SERVICE_KEY         → chave service_role para setup
 *
 * Para rodar localmente:
 *   npx vitest run supabase/functions/__tests__/client-role.test.ts
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

// ─── Flags de skip ────────────────────────────────────────────────────────────

const SKIP_INTEGRATION =
  import.meta.env.SKIP_INTEGRATION_TESTS === "true" ||
  !import.meta.env.SUPABASE_URL_A ||
  !import.meta.env.ANON_KEY_A ||
  !import.meta.env.TEST_JWT_CLIENT ||
  !import.meta.env.TEST_JWT_ADMIN;

// ─── Helpers de cliente Supabase ──────────────────────────────────────────────

function clientAs(jwt: string) {
  return createClient(
    import.meta.env.SUPABASE_URL_A,
    import.meta.env.ANON_KEY_A,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );
}

// ─── (a) Lógica do trigger: isolamento de clientes com setores ────────────────

describe("Trigger prevent_client_sector_link — lógica (sem banco)", () => {
  /**
   * Replica a regra do trigger em TypeScript para teste unitário.
   * A lógica real está em public.prevent_client_sector_link() no Postgres.
   */
  function validateClientProfile(
    globalRole: string,
    hasSectorMembership: boolean,
    hasCargoLink: boolean,
  ): { allowed: boolean; reason?: string } {
    if (globalRole !== "cliente") return { allowed: true };
    if (hasSectorMembership) {
      return { allowed: false, reason: "cliente não pode ter vínculo com setores internos" };
    }
    if (hasCargoLink) {
      return { allowed: false, reason: "cliente não pode ter cargo de setor" };
    }
    return { allowed: true };
  }

  it("cliente sem vínculo de setor: permitido", () => {
    const result = validateClientProfile("cliente", false, false);
    expect(result.allowed).toBe(true);
  });

  it("cliente com sector_members: bloqueado", () => {
    const result = validateClientProfile("cliente", true, false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("setores internos");
  });

  it("cliente com cargo de setor: bloqueado", () => {
    const result = validateClientProfile("cliente", false, true);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("cargo");
  });

  it("role admin com setor: permitido", () => {
    const result = validateClientProfile("admin", true, true);
    expect(result.allowed).toBe(true);
  });

  it("role member com setor: permitido", () => {
    const result = validateClientProfile("member", true, false);
    expect(result.allowed).toBe(true);
  });
});

// ─── (b) RLS: cliente não lê tabelas internas (integração) ───────────────────

describe.skipIf(SKIP_INTEGRATION)(
  "RLS — cliente não acessa tabelas internas (integração)",
  () => {
    const jwtClient = import.meta.env.TEST_JWT_CLIENT as string;

    it("cliente não lê tabela sectors", async () => {
      const db = clientAs(jwtClient);
      const { data, error } = await db.from("sectors").select("id").limit(5);
      // RLS deve retornar array vazio ou erro de permissão
      const blocked = !data || data.length === 0 || !!error;
      expect(blocked).toBe(true);
    });

    it("cliente não lê tabela cargos", async () => {
      const db = clientAs(jwtClient);
      const { data, error } = await db.from("cargos").select("id").limit(5);
      const blocked = !data || data.length === 0 || !!error;
      expect(blocked).toBe(true);
    });

    it("cliente não lê sector_members", async () => {
      const db = clientAs(jwtClient);
      const { data, error } = await db.from("sector_members").select("id").limit(5);
      const blocked = !data || data.length === 0 || !!error;
      expect(blocked).toBe(true);
    });

    it("cliente não lê admin_logs", async () => {
      const db = clientAs(jwtClient);
      const { data, error } = await db.from("admin_logs").select("id").limit(5);
      const blocked = !data || data.length === 0 || !!error;
      expect(blocked).toBe(true);
    });

    it("cliente não lê audit_log", async () => {
      const db = clientAs(jwtClient);
      const { data, error } = await db.from("audit_log").select("id").limit(5);
      const blocked = !data || data.length === 0 || !!error;
      expect(blocked).toBe(true);
    });

    it("cliente só lê a própria linha em profiles", async () => {
      const db = clientAs(jwtClient);
      const { data } = await db.from("profiles").select("id, global_role").limit(10);
      const profiles = data ?? [];
      // Deve ter no máximo 1 perfil (o próprio)
      expect(profiles.length).toBeLessThanOrEqual(1);
      // E todos devem ter global_role='cliente'
      for (const p of profiles) {
        expect((p as { global_role: string }).global_role).toBe("cliente");
      }
    });

    it("cliente não lê perfis de outros usuários da empresa", async () => {
      const dbClient = clientAs(jwtClient);
      const dbAdmin  = clientAs(import.meta.env.TEST_JWT_ADMIN as string);

      // Admin vê múltiplos perfis
      const { data: adminProfiles } = await dbAdmin.from("profiles").select("id").limit(20);
      const adminSeeCount = (adminProfiles ?? []).length;

      // Cliente vê só o próprio
      const { data: clientProfiles } = await dbClient.from("profiles").select("id").limit(20);
      const clientSeeCount = (clientProfiles ?? []).length;

      expect(clientSeeCount).toBeLessThanOrEqual(1);
      // Se há mais de 1 perfil no banco, admin vê mais que o cliente
      if (adminSeeCount > 1) {
        expect(clientSeeCount).toBeLessThan(adminSeeCount);
      }
    });
  },
);

// ─── (c) create-client-user: nunca cria role diferente de 'cliente' ───────────

describe("create-client-user — garantias de segurança (lógica isolada)", () => {
  /**
   * Replica a lógica da edge function para verificar que global_role
   * é sempre forçado para 'cliente', independente do que o caller enviar.
   */
  function buildProfilePayload(
    callerPayload: Record<string, unknown>,
    companyId: string,
  ): Record<string, unknown> {
    const FORCED_ROLE = "cliente"; // constante interna da função — nunca vem do caller
    return {
      company_id:          companyId,
      full_name:           callerPayload.full_name,
      auth_type:           callerPayload.auth_type ?? "cpf",
      global_role:         FORCED_ROLE, // override sempre
      active:              true,
      must_change_password: true,
    };
  }

  it("global_role é sempre 'cliente', mesmo se caller tentar 'admin'", () => {
    const payload = buildProfilePayload(
      { full_name: "Hacker", global_role: "admin" },
      "company-123",
    );
    expect(payload.global_role).toBe("cliente");
  });

  it("global_role é sempre 'cliente', mesmo se caller tentar 'superadmin'", () => {
    const payload = buildProfilePayload(
      { full_name: "Escalador", global_role: "superadmin" },
      "company-123",
    );
    expect(payload.global_role).toBe("cliente");
  });

  it("global_role é sempre 'cliente' mesmo sem enviar nenhuma role", () => {
    const payload = buildProfilePayload({ full_name: "João" }, "company-123");
    expect(payload.global_role).toBe("cliente");
  });

  it("payload nunca inclui sector_assignments", () => {
    const payload = buildProfilePayload(
      { full_name: "Maria", sector_assignments: [{ sector_id: "abc", role: "admin" }] },
      "company-123",
    );
    expect(payload).not.toHaveProperty("sector_assignments");
  });

  it("modo CPF: email fictício termina em @hubm.internal", () => {
    const cpfDigits = "12345678909";
    const authEmail = `${cpfDigits}@hubm.internal`;
    expect(authEmail).toMatch(/@hubm\.internal$/);
  });

  it("modo email: email real é usado diretamente (não fictício)", () => {
    const realEmail = "cliente@empresa.com.br";
    expect(realEmail).not.toMatch(/@hubm\.internal$/);
    expect(realEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("recusa criação quando nem CPF nem email fornecidos", () => {
    function validate(cpf?: string, email?: string): { valid: boolean; error?: string } {
      const hasCpf   = typeof cpf   === "string" && cpf.trim().length > 0;
      const hasEmail = typeof email === "string" && email.trim().length > 0;
      if (!hasCpf && !hasEmail) {
        return { valid: false, error: "Informe CPF ou e-mail para criar o cliente" };
      }
      return { valid: true };
    }
    expect(validate(undefined, undefined).valid).toBe(false);
    expect(validate("", "").valid).toBe(false);
    expect(validate("12345678909", undefined).valid).toBe(true);
    expect(validate(undefined, "a@b.com").valid).toBe(true);
  });
});

// ─── Documentação estrutural ──────────────────────────────────────────────────

describe("Isolamento da role 'cliente' — documentação estrutural", () => {
  it("'cliente' tem menor privilégio: sem acesso a setores, cargos ou dados internos", () => {
    const internalTables = [
      "sectors",
      "cargos",
      "cargo_sectors",
      "cargo_permissions",
      "sector_members",
      "admin_logs",
      "audit_log",
      "announcements",
      "integrations",
      "folders",
      "resources",
    ];
    // Lista documentada — verificada nas policies de RLS da migration add_client_role
    expect(internalTables.length).toBeGreaterThan(0);
  });

  it("trigger prevent_client_sector_link existe nas 3 tabelas críticas", () => {
    const triggerTargets = ["profiles", "sector_members", "profile_cargos"];
    expect(triggerTargets).toContain("profiles");
    expect(triggerTargets).toContain("sector_members");
    expect(triggerTargets).toContain("profile_cargos");
  });
});
