// supabase/functions/portal-lojista-admin/index.ts
// Ponto de entrada (Deno). Toda a lógica está em ./handler.ts (testada no vitest com dependências injetadas — J661).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'
import { tratar, type AuthAdmin, type Sql } from './handler.ts'

Deno.serve((req) =>
  tratar(req, {
    env: (nome) => Deno.env.get(nome),
    abrir: () => {
      const cliente = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const auth = cliente.auth
      const admin: AuthAdmin = {
        createUser: (a) => auth.admin.createUser(a),
        inviteUserByEmail: (email, o) => auth.admin.inviteUserByEmail(email, o),
        resetPasswordForEmail: (email, o) => auth.resetPasswordForEmail(email, o),
        updateUserById: (id, a) => auth.admin.updateUserById(id, a),
      }
      const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false }) as unknown as Sql
      return { admin, sql }
    },
    logErro: (mensagem) => console.error(mensagem),
  }),
)
