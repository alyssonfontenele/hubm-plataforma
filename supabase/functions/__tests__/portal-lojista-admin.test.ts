/**
 * Testes da função restrita `portal-lojista-admin` (J661 · contrato de mowig-api/src/modules/portal/identidade/hubm.ts).
 * Exercita o handler real (../portal-lojista-admin/handler.ts) com Auth Admin e SQL em dublê: sem rede, sem Deno, sem dados reais.
 * Todos os e-mails e ids abaixo são sintéticos.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  autorizado,
  iguaisTempoConstante,
  sha256,
  situacaoDe,
  tratar,
  type AuthAdmin,
  type Dependencias,
  type Sql,
  type UsuarioAuth,
} from "../portal-lojista-admin/handler";

const TOKEN = "token-de-teste-nao-e-segredo-0123456789abcdef";
const SUB_A = "11111111-1111-4111-8111-111111111111";
const SUB_COLAB = "22222222-2222-4222-8222-222222222222";

const hex = async (t: string) =>
  [...(await sha256(t))].map((b) => b.toString(16).padStart(2, "0")).join("");

interface Mundo {
  usuarios: UsuarioAuth[];
  chamadas: string[];
  sessoesApagadas: string[];
  erroNo?: "createUser" | "invite" | "reset" | "update";
  fechou: boolean;
}

function novoMundo(): Mundo {
  return { usuarios: [], chamadas: [], sessoesApagadas: [], fechou: false };
}

function usuario(p: Partial<UsuarioAuth> & { id: string; email: string }): UsuarioAuth {
  return {
    banned_until: null,
    email_confirmed_at: null,
    last_sign_in_at: null,
    raw_app_meta_data: { tipo: "lojista" },
    ...p,
  };
}

function montar(m: Mundo, env: Record<string, string | undefined>): Dependencias & { logs: string[] } {
  const logs: string[] = [];
  const sql = (async (strings: TemplateStringsArray, ...v: unknown[]) => {
    const texto = strings.join("?");
    if (texto.includes("DELETE FROM auth.sessions")) {
      m.sessoesApagadas.push(String(v[0]));
      return [];
    }
    if (texto.includes("WHERE id =")) return m.usuarios.filter((u) => u.id === v[0]);
    if (texto.includes("lower(email)")) return m.usuarios.filter((u) => u.email?.toLowerCase() === v[0]);
    throw new Error(`SQL inesperado: ${texto}`);
  }) as unknown as Sql;
  (sql as { end: Sql["end"] }).end = async () => {
    m.fechou = true;
  };
  const falha = (qual: Mundo["erroNo"]) => (m.erroNo === qual ? { message: "falha simulada" } : null);
  const admin: AuthAdmin = {
    async createUser(a) {
      m.chamadas.push(`createUser:${a.email}:${JSON.stringify(a.app_metadata)}`);
      if (m.erroNo === "createUser") return { error: falha("createUser") };
      m.usuarios.push(usuario({ id: SUB_A, email: a.email, raw_app_meta_data: a.app_metadata }));
      return { error: null, data: { user: { id: SUB_A } } };
    },
    async inviteUserByEmail(email, o) {
      m.chamadas.push(`invite:${email}:${o.redirectTo}`);
      return { error: falha("invite") };
    },
    async resetPasswordForEmail(email, o) {
      m.chamadas.push(`reset:${email}:${o.redirectTo}`);
      return { error: falha("reset") };
    },
    async updateUserById(id, a) {
      m.chamadas.push(`update:${id}:${a.ban_duration}`);
      if (m.erroNo === "update") return { error: falha("update") };
      const u = m.usuarios.find((x) => x.id === id);
      if (u) u.banned_until = a.ban_duration === "none" ? null : "2999-01-01T00:00:00Z";
      return { error: null };
    },
  };
  return {
    env: (n) => env[n],
    abrir: () => ({ admin, sql }),
    logErro: (msg) => logs.push(msg),
    logs,
  };
}

function req(corpo: unknown, opcoes: { token?: string | null; metodo?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opcoes.token !== null) headers.authorization = `Bearer ${opcoes.token ?? TOKEN}`;
  return new Request("https://exemplo.test/functions/v1/portal-lojista-admin", {
    method: opcoes.metodo ?? "POST",
    headers,
    body: opcoes.metodo === "GET" ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

let mundo: Mundo;
let env: Record<string, string | undefined>;
let deps: ReturnType<typeof montar>;

beforeEach(async () => {
  mundo = novoMundo();
  env = { PORTAL_ADMIN_TOKEN_SHA256: await hex(TOKEN) };
  deps = montar(mundo, env);
});

const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe("autenticação (Bearer em tempo constante)", () => {
  it("recusa método diferente de POST", async () => {
    expect((await tratar(req({}, { metodo: "GET" }), deps)).status).toBe(405);
  });

  it("recusa sem Authorization, com token errado e com esquema errado", async () => {
    expect((await tratar(req({ acao: "convidar" }, { token: null }), deps)).status).toBe(401);
    expect((await tratar(req({ acao: "convidar" }, { token: "outro" }), deps)).status).toBe(401);
    const basic = new Request("https://x.test/", {
      method: "POST",
      headers: { authorization: `Basic ${TOKEN}` },
      body: "{}",
    });
    expect((await tratar(basic, deps)).status).toBe(401);
    expect(mundo.chamadas).toEqual([]);
  });

  it("sem segredo configurado a função não faz nada (nem com token vazio)", async () => {
    const semSegredo = montar(mundo, {});
    expect((await tratar(req({ acao: "convidar", email: "a@b.co" }), semSegredo)).status).toBe(401);
    expect((await tratar(req({ acao: "convidar" }, { token: "" }), semSegredo)).status).toBe(401);
  });

  it("aceita o segredo em claro (PORTAL_ADMIN_TOKEN) e o digest tem precedência", async () => {
    const claro = montar(mundo, { PORTAL_ADMIN_TOKEN: TOKEN });
    expect((await tratar(req({ acao: "xx" }), claro)).status).toBe(400); // passou da autenticação
    const ambos = montar(mundo, { PORTAL_ADMIN_TOKEN: "x", PORTAL_ADMIN_TOKEN_SHA256: await hex(TOKEN) });
    expect((await tratar(req({ acao: "xx" }), ambos)).status).toBe(400);
  });

  it("digest hexadecimal inválido não autoriza ninguém", async () => {
    const ruim = montar(mundo, { PORTAL_ADMIN_TOKEN_SHA256: "nao-e-hex" });
    expect(await autorizado(req({}), ruim.env)).toBe(false);
  });

  it("iguaisTempoConstante compara conteúdo e tamanho", () => {
    const a = new Uint8Array([1, 2, 3]);
    expect(iguaisTempoConstante(a, new Uint8Array([1, 2, 3]))).toBe(true);
    expect(iguaisTempoConstante(a, new Uint8Array([1, 2, 4]))).toBe(false);
    expect(iguaisTempoConstante(a, new Uint8Array([1, 2]))).toBe(false);
  });

  it("o token nunca aparece na resposta nem no log, mesmo num erro interno", async () => {
    mundo.usuarios.push(usuario({ id: SUB_A, email: "loja@exemplo.test" }));
    const quebrado = montar(mundo, env);
    const abrir = quebrado.abrir;
    quebrado.abrir = () => {
      const r = abrir();
      r.admin.inviteUserByEmail = async () => {
        throw new Error(`explodiu com ${TOKEN}`.replace(TOKEN, "detalhe"));
      };
      return r;
    };
    const r = await tratar(req({ acao: "reenviar", email: "loja@exemplo.test" }), quebrado);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await json(r))).not.toContain(TOKEN);
    expect(quebrado.logs.join("\n")).not.toContain(TOKEN);
  });
});

describe("validação do corpo", () => {
  it("JSON inválido e corpo que não é objeto = 400", async () => {
    expect((await tratar(req("{nao-json"), deps)).status).toBe(400);
    expect((await tratar(req("null"), deps)).status).toBe(400);
    expect((await tratar(req("[1]"), deps)).status).toBe(400);
  });

  it("ação desconhecida, e-mail e sub malformados = 400", async () => {
    expect((await tratar(req({ acao: "apagar-tudo" }), deps)).status).toBe(400);
    expect((await tratar(req({ acao: "convidar", email: "sem-arroba" }), deps)).status).toBe(400);
    expect((await tratar(req({ acao: "desativar", sub: "x'; DROP TABLE auth.users;--" }), deps)).status).toBe(400);
    expect(mundo.chamadas).toEqual([]);
  });

  it("convidar sem e-mail = 400; desativar sem sub nem e-mail = 400", async () => {
    expect((await tratar(req({ acao: "convidar" }), deps)).status).toBe(400);
    expect((await tratar(req({ acao: "desativar" }), deps)).status).toBe(400);
  });
});

describe("convidar", () => {
  it("cria o usuário JÁ com app_metadata.tipo=lojista e envia o convite", async () => {
    const r = await tratar(req({ acao: "convidar", email: "  Loja@Exemplo.TEST ", nome: "Loja Teste" }), deps);
    expect(r.status).toBe(200);
    const c = await json(r);
    expect(c).toMatchObject({ ok: true, sub: SUB_A, email: "loja@exemplo.test", situacao: "CONVITE_ENVIADO", emailEnviado: true });
    expect(mundo.chamadas[0]).toBe('createUser:loja@exemplo.test:{"tipo":"lojista"}');
    expect(mundo.chamadas[1]).toBe("invite:loja@exemplo.test:https://hubm.mowig.ind.br/auth/callback");
    expect(mundo.fechou).toBe(true);
  });

  it("é idempotente: e-mail existente devolve o mesmo sub e não manda novo e-mail", async () => {
    mundo.usuarios.push(usuario({ id: SUB_A, email: "loja@exemplo.test" }));
    const r = await tratar(req({ acao: "convidar", email: "loja@exemplo.test" }), deps);
    expect(await json(r)).toMatchObject({ ok: true, sub: SUB_A, jaExistia: true });
    expect(mundo.chamadas).toEqual([]);
  });

  it("e-mail de colaborador = 409 e nunca vira lojista", async () => {
    mundo.usuarios.push(usuario({ id: SUB_COLAB, email: "colab@exemplo.test", raw_app_meta_data: { global_role: "admin" } }));
    const r = await tratar(req({ acao: "convidar", email: "colab@exemplo.test" }), deps);
    expect(r.status).toBe(409);
    expect(mundo.chamadas).toEqual([]);
    expect(mundo.usuarios[0].raw_app_meta_data).toEqual({ global_role: "admin" });
  });

  it("usa PORTAL_REDIRECT_URL quando definido", async () => {
    const d = montar(mundo, { ...env, PORTAL_REDIRECT_URL: "https://previa.exemplo.test/auth/callback" });
    await tratar(req({ acao: "convidar", email: "loja@exemplo.test" }), d);
    expect(mundo.chamadas[1]).toContain("https://previa.exemplo.test/auth/callback");
  });

  it("falha do Auth vira 502 sem vazar o corpo", async () => {
    mundo.erroNo = "createUser";
    const r = await tratar(req({ acao: "convidar", email: "loja@exemplo.test" }), deps);
    expect(r.status).toBe(502);
    expect(mundo.fechou).toBe(true);
  });
});

describe("reenviar", () => {
  it("convite pendente = novo convite; conta ativa = e-mail de redefinição de senha", async () => {
    mundo.usuarios.push(usuario({ id: SUB_A, email: "pendente@exemplo.test" }));
    mundo.usuarios.push(usuario({ id: SUB_COLAB, email: "ativo@exemplo.test", email_confirmed_at: "2026-10-01T00:00:00Z" }));
    expect((await json(await tratar(req({ acao: "reenviar", email: "pendente@exemplo.test" }), deps))).situacao).toBe("CONVITE_ENVIADO");
    expect((await json(await tratar(req({ acao: "reenviar", email: "ativo@exemplo.test" }), deps))).situacao).toBe("ATIVO");
    expect(mundo.chamadas[0]).toMatch(/^invite:pendente@/);
    expect(mundo.chamadas[1]).toMatch(/^reset:ativo@/);
  });

  it("inexistente = 404; desativado = 409; não lojista = 409", async () => {
    expect((await tratar(req({ acao: "reenviar", email: "ninguem@exemplo.test" }), deps)).status).toBe(404);
    mundo.usuarios.push(usuario({ id: SUB_A, email: "off@exemplo.test", banned_until: "2999-01-01T00:00:00Z" }));
    expect((await tratar(req({ acao: "reenviar", email: "off@exemplo.test" }), deps)).status).toBe(409);
    mundo.usuarios.push(usuario({ id: SUB_COLAB, email: "colab@exemplo.test", raw_app_meta_data: {} }));
    expect((await tratar(req({ acao: "reenviar", email: "colab@exemplo.test" }), deps)).status).toBe(409);
  });
});

describe("desativar e reativar", () => {
  it("desativar bane, apaga as sessões e devolve DESATIVADO (por sub)", async () => {
    mundo.usuarios.push(usuario({ id: SUB_A, email: "loja@exemplo.test", email_confirmed_at: "2026-10-01T00:00:00Z" }));
    const r = await tratar(req({ acao: "desativar", sub: SUB_A }), deps);
    expect(await json(r)).toMatchObject({ ok: true, sub: SUB_A, situacao: "DESATIVADO" });
    expect(mundo.chamadas).toEqual([`update:${SUB_A}:876000h`]);
    expect(mundo.sessoesApagadas).toEqual([SUB_A]);
  });

  it("reativar remove o banimento e a situação volta a ATIVO", async () => {
    mundo.usuarios.push(
      usuario({ id: SUB_A, email: "loja@exemplo.test", email_confirmed_at: "2026-10-01T00:00:00Z", banned_until: "2999-01-01T00:00:00Z" }),
    );
    const r = await tratar(req({ acao: "reativar", sub: SUB_A }), deps);
    expect(await json(r)).toMatchObject({ ok: true, situacao: "ATIVO" });
    expect(mundo.chamadas).toEqual([`update:${SUB_A}:none`]);
  });

  it("recusa agir sobre quem não é lojista (409) e sobre quem não existe (404)", async () => {
    mundo.usuarios.push(usuario({ id: SUB_COLAB, email: "colab@exemplo.test", raw_app_meta_data: { global_role: "admin" } }));
    expect((await tratar(req({ acao: "desativar", sub: SUB_COLAB }), deps)).status).toBe(409);
    expect((await tratar(req({ acao: "reativar", sub: SUB_A }), deps)).status).toBe(404);
    expect(mundo.chamadas).toEqual([]);
    expect(mundo.sessoesApagadas).toEqual([]);
  });

  it("falha no banimento = 502 e as sessões NÃO são apagadas", async () => {
    mundo.usuarios.push(usuario({ id: SUB_A, email: "loja@exemplo.test" }));
    mundo.erroNo = "update";
    const r = await tratar(req({ acao: "desativar", sub: SUB_A }), deps);
    expect(r.status).toBe(502);
    expect(mundo.sessoesApagadas).toEqual([]);
  });
});

describe("situacaoDe", () => {
  const base = usuario({ id: SUB_A, email: "a@b.co" });
  it("banimento no futuro = DESATIVADO; passado não conta", () => {
    expect(situacaoDe({ ...base, banned_until: "2999-01-01T00:00:00Z" })).toBe("DESATIVADO");
    expect(situacaoDe({ ...base, banned_until: "2000-01-01T00:00:00Z" })).toBe("CONVITE_ENVIADO");
  });
  it("confirmou e-mail ou já entrou = ATIVO", () => {
    expect(situacaoDe({ ...base, email_confirmed_at: "2026-01-01T00:00:00Z" })).toBe("ATIVO");
    expect(situacaoDe({ ...base, last_sign_in_at: "2026-01-01T00:00:00Z" })).toBe("ATIVO");
  });
});

describe("saída das respostas", () => {
  it("toda resposta é JSON sem cache", async () => {
    const r = await tratar(req({ acao: "convidar" }), deps);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(r.headers.get("cache-control")).toBe("no-store");
    vi.restoreAllMocks();
  });
});
