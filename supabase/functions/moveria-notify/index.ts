// supabase/functions/moveria-notify/index.ts
// Notificações internas do módulo Moveria.
// Chamada com JWT do usuário autenticado; encaminha para send-email via x-internal-secret.
// Tipos suportados: 'designacao' | 'medicao_finalizada' | 'lote_conformado'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const rawOrigins = Deno.env.get("ALLOWED_ORIGINS") ?? "";
const allowedOrigins = rawOrigins.split(",").map((o) => o.trim()).filter(Boolean);

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? ""),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors(origin), "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const SERVICE_ROLE_KEY  = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const INTERNAL_SECRET   = Deno.env.get("INTERNAL_SECRET") ?? "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY || !INTERNAL_SECRET) {
    console.error("moveria-notify: missing env vars");
    return json({ error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  // 1. Validar JWT do caller
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  // 2. Verificar que o caller é membro Moveria
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: membro } = await admin
    .from("moveria_membros")
    .select("id, papel")
    .eq("profile_id", userData.user.id)
    .eq("ativo", true)
    .maybeSingle();

  if (!membro) return json({ error: "forbidden" }, 403);

  // 3. Parsear payload
  let body: { tipo?: string; contrato_numero?: string; consultor_email?: string; consultor_nome?: string; gestor_email?: string; lote_numero?: string };
  try { body = await req.json(); } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { tipo } = body;

  if (tipo === "designacao") {
    // Admin designou consultor — notificar consultor
    if (membro.papel !== "admin_moveria") return json({ error: "forbidden" }, 403);
    const { consultor_email, consultor_nome, contrato_numero } = body;
    if (!consultor_email || !contrato_numero) return json({ error: "missing_fields" }, 400);

    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
      body: JSON.stringify({
        to: [{ email: consultor_email, name: consultor_nome ?? consultor_email }],
        subject: `Moveria — Você foi designado ao contrato ${contrato_numero}`,
        html: `
          <p>Olá${consultor_nome ? ` ${consultor_nome}` : ""},</p>
          <p>Você foi designado como consultor técnico responsável pelo contrato
             <strong>${contrato_numero}</strong> na plataforma Moveria.</p>
          <p>Acesse a plataforma para verificar os ambientes e sua previsão de medição.</p>
          <p style="color:#666;font-size:12px">Moveria · mensagem automática</p>
        `,
      }),
    });
    return json({ ok: true });
  }

  if (tipo === "medicao_finalizada" || tipo === "lote_conformado") {
    // Consultor finalizou / conformou — notificar gestor
    const { gestor_email, contrato_numero, lote_numero } = body;
    if (!gestor_email || !contrato_numero) return json({ error: "missing_fields" }, 400);

    const isLote = tipo === "lote_conformado";
    const subject = isLote
      ? `Moveria — Lote ${lote_numero ?? ""} conformado (${contrato_numero})`
      : `Moveria — Medição finalizada (${contrato_numero})`;
    const descricao = isLote
      ? `O lote <strong>${lote_numero ?? ""}</strong> do contrato <strong>${contrato_numero}</strong> foi conformado.`
      : `A medição do contrato <strong>${contrato_numero}</strong> foi finalizada.`;

    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
      body: JSON.stringify({
        to: [{ email: gestor_email, name: "Gestor Moveria" }],
        subject,
        html: `
          <p>Olá,</p>
          <p>${descricao}</p>
          <p>Acesse a plataforma para acompanhar o status.</p>
          <p style="color:#666;font-size:12px">Moveria · mensagem automática</p>
        `,
      }),
    });
    return json({ ok: true });
  }

  return json({ error: "unknown_tipo" }, 400);
});
