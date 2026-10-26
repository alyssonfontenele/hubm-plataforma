import type { Session, User } from "@supabase/supabase-js";

/** Lojista = usuário do Auth com app_metadata.tipo = 'lojista' (gravado só pelo servidor; sem linha em profiles). */
export function isLojistaUser(user: User | null | undefined): boolean {
  return user?.app_metadata?.tipo === "lojista";
}

export function isLojistaSession(session: Session | null | undefined): boolean {
  return isLojistaUser(session?.user);
}

/** API do ERP (rotas /v1/portal/*). Origem também liberada em connect-src (vercel.json). */
export const PORTAL_API_URL = (
  (import.meta.env.VITE_PORTAL_API_URL as string | undefined) ??
  "https://mowig-api-596192369800.southamerica-east1.run.app"
).replace(/\/$/, "");

export interface PortalMe {
  ok: true;
  usuario: { email: string; papel: "LOJISTA_ADMIN" | "LOJISTA_USUARIO" };
  cliente: {
    numero: number;
    razaoSocial: string | null;
    nomeFantasia: string | null;
    cnpj: string | null;
  };
}

export type PortalMeResultado =
  | { estado: "ok"; me: PortalMe }
  | { estado: "em-preparacao" } // ERP 503 (portal desligado) ou fora do ar
  | { estado: "nao-autenticado" } // 401
  | { estado: "sem-acesso" }; // 403 (sem vínculo vigente)

export async function buscarPortalMe(accessToken: string): Promise<PortalMeResultado> {
  let resp: Response;
  try {
    resp = await fetch(`${PORTAL_API_URL}/v1/portal/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // rede/CORS ainda não liberado: tratado como portal em preparação
    return { estado: "em-preparacao" };
  }
  if (resp.status === 401) return { estado: "nao-autenticado" };
  if (resp.status === 403) return { estado: "sem-acesso" };
  if (!resp.ok) return { estado: "em-preparacao" };
  const corpo = (await resp.json()) as PortalMe;
  return { estado: "ok", me: corpo };
}

/** Tradução das mensagens do Supabase Auth para o lojista. */
export function mensagemErroAuth(
  erro: { message?: string; code?: string } | null | undefined,
): string {
  const msg = (erro?.message ?? "").toLowerCase();
  const code = erro?.code ?? "";
  if (code === "user_banned" || msg.includes("banned"))
    return "Acesso desativado. Fale com a Mowig.";
  if (code === "invalid_credentials" || msg.includes("invalid login"))
    return "E-mail ou senha incorretos.";
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    msg.includes("rate limit")
  )
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (code === "weak_password" || msg.includes("password"))
    return "A senha não atende aos requisitos de segurança.";
  return "Não foi possível concluir. Tente novamente.";
}

export const SENHA_MIN = 10;

export function validarSenha(senha: string): string | null {
  if (senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "Use letras e números na senha.";
  return null;
}
