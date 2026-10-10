// Onda B — item #10: CORS allowlist fixo compartilhado entre Edge Functions.
// Lê ALLOWED_ORIGINS (secret já configurado por projeto — mesma fonte usada
// pelas demais funções que já seguem o padrão correto). Diferença deliberada:
// origem fora da lista NÃO recebe Access-Control-Allow-Origin (antes, algumas
// funções caíam para allowedOrigins[0] por padrão, ou refletiam a origem sem
// validar, ou usavam '*').
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req.headers.get("origin")) });
  }
  return null;
}
