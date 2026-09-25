-- =============================================================================
-- MIGRATION: profiles_admin_delete_pending
-- Bancos   : hubm-mowig / hubm-moveria (bancos de empresa — hubm-core não tem
--            o enum global_role/company_id nesse modelo e é pulado pelo guard
--            abaixo, igual ao padrão de 20260531010000_company_rls_audit.sql).
--
-- Bug corrigido:
--   20260531000000_core_rls_superadmin.sql criou "profiles_superadmin_delete"
--   (USING auth_is_superadmin()) como a ÚNICA policy de DELETE em
--   public.profiles. Como esse arquivo roda em todos os bancos (não só core),
--   passou a ser a única forma de apagar uma linha de profiles em produção —
--   inclusive para admin de empresa comum.
--
--   Isso quebrou silenciosamente "Rejeitar" em Admin > Colaboradores >
--   Solicitações Pendentes: UsersTab.handleReject fazia
--   `.from("profiles").delete().eq("id", id)` sem checar linhas afetadas.
--   RLS negava a linha (admin não é superadmin) e o Postgres/PostgREST
--   retornava sucesso com 0 rows e SEM erro — o toast de sucesso aparecia,
--   mas nada era apagado. 13 perfis (já anonimizados via delete-user, com
--   anonymized_at preenchido mas deleted_at NULL) ficaram presos para sempre
--   na lista de pendentes.
--
-- Correção: policy de DELETE para admin da própria empresa, restrita a
-- perfis nunca ativados (active = false) — ou seja, apenas solicitações de
-- acesso pendentes (aprovadas nunca viram active=false de novo). Não depende
-- de deleted_at/anonymized_at, então cobre tanto pendentes comuns quanto as
-- já anonimizadas. Perfis ativos (usuários reais em uso) continuam
-- protegidos: só saem de circulação via anonimização (delete-user), nunca
-- por hard delete direto do client.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'global_role'
  ) THEN
    RAISE NOTICE 'profiles_admin_delete_pending: banco core detectado (sem global_role enum) — migration pulada.';
    RETURN;
  END IF;

  EXECUTE $sql$ DROP POLICY IF EXISTS "profiles: admin remove solicitação pendente da empresa" ON public.profiles $sql$;
  EXECUTE $sql$
    CREATE POLICY "profiles: admin remove solicitação pendente da empresa"
      ON public.profiles FOR DELETE
      USING (
        auth_global_role() = 'admin'::global_role
        AND company_id = auth_company_id()
        AND active = false
      )
  $sql$;
END
$$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260925000000_profiles_admin_delete_pending.sql')
ON CONFLICT (filename) DO NOTHING;
