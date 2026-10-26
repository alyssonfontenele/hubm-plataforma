// supabase/functions/portal-lojista-admin/index.ts
// Função RESTRITA do Portal Mowig (J558 · POR-H1/H8). Chamada só pelo ERP (servidor a servidor), nunca pelo navegador.
// Autenticação: Authorization: Bearer <PORTAL_ADMIN_TOKEN>, comparado em tempo constante. O segredo da função é guardado
// como digest SHA-256 (PORTAL_ADMIN_TOKEN_SHA256) — o valor do token só existe no Secret Manager do GCP (hubm-portal-admin-token).
// Só 4 ações: convidar, reenviar, desativar, reativar. Não lê nem lista usuários; só age sobre usuários com app_metadata.tipo = 'lojista'
// (um e-mail/sub de colaborador é recusado, nunca convertido).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const BAN_LONGO = '876000h' // ~100 anos: "banido" até reativar
const REDIRECT_PADRAO = 'https://hubm.mowig.ind.br/auth/callback'

type Acao = 'convidar' | 'reenviar' | 'desativar' | 'reativar'
type Situacao = 'CONVITE_ENVIADO' | 'ATIVO' | 'DESATIVADO'

interface UsuarioAuth {
  id: string
  email: string | null
  banned_until: string | null
  email_confirmed_at: string | null
  last_sign_in_at: string | null
  raw_app_meta_data: Record<string, unknown> | null
}

function resposta(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), { status, headers: JSON_HEADERS })
}

async function sha256(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))
}

function hexParaBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null
  return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)))
}

/** Comparação em tempo constante de dois digests de 32 bytes. */
function iguaisTempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

async function digestEsperado(): Promise<Uint8Array | null> {
  const hex = Deno.env.get('PORTAL_ADMIN_TOKEN_SHA256')
  if (hex) return hexParaBytes(hex.trim())
  const claro = Deno.env.get('PORTAL_ADMIN_TOKEN')
  return claro ? await sha256(claro) : null
}

async function autorizado(req: Request): Promise<boolean> {
  const esperado = await digestEsperado()
  if (!esperado) return false // sem segredo configurado a função não faz nada
  const m = /^Bearer\s+(\S+)$/i.exec((req.headers.get('authorization') ?? '').trim())
  // sempre calcula o digest (mesmo sem token) para não vazar por tempo
  const recebido = await sha256(m?.[1] ?? '')
  return iguaisTempoConstante(recebido, esperado) && !!m
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function situacaoDe(u: UsuarioAuth): Situacao {
  if (u.banned_until && Date.parse(u.banned_until) > Date.now()) return 'DESATIVADO'
  return u.email_confirmed_at || u.last_sign_in_at ? 'ATIVO' : 'CONVITE_ENVIADO'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta(405, { ok: false, erro: 'método não permitido' })
  if (!(await autorizado(req))) return resposta(401, { ok: false, erro: 'não autorizado' })

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return resposta(400, { ok: false, erro: 'JSON inválido' })
  }

  const acao = corpo.acao as Acao
  if (!['convidar', 'reenviar', 'desativar', 'reativar'].includes(acao)) {
    return resposta(400, { ok: false, erro: 'ação inválida' })
  }
  const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : ''
  const sub = typeof corpo.sub === 'string' ? corpo.sub.trim().toLowerCase() : ''
  const nome = typeof corpo.nome === 'string' ? corpo.nome.trim().slice(0, 120) : ''
  if (email && !EMAIL_RE.test(email)) return resposta(400, { ok: false, erro: 'e-mail inválido' })
  if (sub && !UUID_RE.test(sub)) return resposta(400, { ok: false, erro: 'sub inválido' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
  const redirectTo = Deno.env.get('PORTAL_REDIRECT_URL') || REDIRECT_PADRAO

  const buscar = async (): Promise<UsuarioAuth | null> => {
    const linhas = sub
      ? await sql<UsuarioAuth[]>`SELECT id, email, banned_until, email_confirmed_at, last_sign_in_at, raw_app_meta_data FROM auth.users WHERE id = ${sub}::uuid LIMIT 1`
      : await sql<UsuarioAuth[]>`SELECT id, email, banned_until, email_confirmed_at, last_sign_in_at, raw_app_meta_data FROM auth.users WHERE lower(email) = ${email} LIMIT 1`
    return linhas[0] ?? null
  }
  const ehLojista = (u: UsuarioAuth) => u.raw_app_meta_data?.tipo === 'lojista'
  const saida = (u: { id: string; email: string | null }, situacao: Situacao, extra: Record<string, unknown> = {}) =>
    resposta(200, { ok: true, sub: u.id, email: u.email, situacao, ...extra })

  try {
    if (acao === 'convidar' || acao === 'reenviar') {
      if (!email && !sub) return resposta(400, { ok: false, erro: 'informe email' })
      let u = await buscar()

      if (u && !ehLojista(u)) {
        // colaborador/CPF/admin com esse e-mail: nunca vira lojista
        return resposta(409, { ok: false, erro: 'e-mail pertence a um usuário que não é lojista' })
      }

      if (acao === 'convidar') {
        if (!email) return resposta(400, { ok: false, erro: 'informe email' })
        if (u) return saida(u, situacaoDe(u), { jaExistia: true }) // idempotente: mesmo sub, sem novo e-mail
        const criado = await admin.auth.admin.createUser({
          email,
          app_metadata: { tipo: 'lojista' }, // gravado na criação: não há instante sem o marcador
          user_metadata: nome ? { nome } : {},
        })
        if (criado.error || !criado.data.user) {
          return resposta(502, { ok: false, erro: 'falha ao criar o usuário', detalhe: criado.error?.message })
        }
        u = await buscar()
        if (!u) return resposta(502, { ok: false, erro: 'usuário criado não encontrado' })
      } else if (!u) {
        return resposta(404, { ok: false, erro: 'usuário não encontrado' })
      }

      const alvo = u.email ?? email
      if (situacaoDe(u) === 'DESATIVADO') return resposta(409, { ok: false, erro: 'usuário desativado; reative antes', sub: u.id })
      if (situacaoDe(u) === 'CONVITE_ENVIADO') {
        const r = await admin.auth.admin.inviteUserByEmail(alvo, { redirectTo, data: nome ? { nome } : undefined })
        if (r.error) return resposta(502, { ok: false, erro: 'falha ao enviar o convite', detalhe: r.error.message, sub: u.id })
      } else {
        // já ativou a conta: reenviar = e-mail de redefinição de senha
        const r = await admin.auth.resetPasswordForEmail(alvo, { redirectTo })
        if (r.error) return resposta(502, { ok: false, erro: 'falha ao enviar a redefinição', detalhe: r.error.message, sub: u.id })
      }
      return saida(u, situacaoDe(u), { emailEnviado: true })
    }

    // desativar / reativar: por sub (preferido) ou e-mail
    if (!sub && !email) return resposta(400, { ok: false, erro: 'informe sub ou email' })
    const u = await buscar()
    if (!u) return resposta(404, { ok: false, erro: 'usuário não encontrado' })
    if (!ehLojista(u)) return resposta(409, { ok: false, erro: 'o usuário não é lojista' })

    if (acao === 'desativar') {
      const r = await admin.auth.admin.updateUserById(u.id, { ban_duration: BAN_LONGO })
      if (r.error) return resposta(502, { ok: false, erro: 'falha ao desativar', detalhe: r.error.message })
      // encerra as sessões: refresh tokens invalidados; o access token já emitido vale até expirar (o ERP corta pelo vínculo)
      await sql`DELETE FROM auth.sessions WHERE user_id = ${u.id}::uuid`
      return saida(u, 'DESATIVADO')
    }

    const r = await admin.auth.admin.updateUserById(u.id, { ban_duration: 'none' })
    if (r.error) return resposta(502, { ok: false, erro: 'falha ao reativar', detalhe: r.error.message })
    const atual = (await buscar()) ?? u
    return saida(atual, situacaoDe(atual))
  } catch (e) {
    console.error('[portal-lojista-admin]', (e as Error).message)
    return resposta(500, { ok: false, erro: 'erro interno' })
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {})
  }
})
