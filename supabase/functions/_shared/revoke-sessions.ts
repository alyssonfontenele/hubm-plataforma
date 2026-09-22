// supabase/functions/_shared/revoke-sessions.ts
// Apaga as sessões de um usuário diretamente em auth.sessions (não exposto via
// PostgREST, e o SDK não tem "signOut por user_id" — signOut() exige o JWT da
// própria sessão). Requer conexão Postgres direta via SUPABASE_DB_URL (secret
// padrão de toda Edge Function). Mesmo efeito de um signOut global: refresh
// tokens invalidados imediatamente; o access token já emitido continua válido
// até expirar.
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

export async function revokeAllSessions(userId: string): Promise<number> {
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false })
  try {
    const rows = await sql`DELETE FROM auth.sessions WHERE user_id = ${userId} RETURNING id`
    return rows.length
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {})
  }
}
