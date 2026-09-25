-- =============================================================================
-- MIGRATION: request_access_cargos
-- Projeto  : hubm-mowig (xpoqiclaqkudznmshzal) e hubm-moveria (fzgasvcfxufhrbrdakow)
-- Objetivo : Corrigir /request-access retornando 0 cargos para usuários Google
--            de primeiro acesso (sem linha em profiles ainda).
--
-- CAUSA RAIZ:
--   A policy "cargos: leitura da empresa" (migration 20260602000000_add_client_role)
--   exige `auth_global_role()::text <> 'cliente'`. Para um usuário autenticado sem
--   linha em profiles, auth_global_role() retorna NULL, e `NULL <> 'cliente'`
--   avalia para NULL — não TRUE — então o RLS descarta a linha. Resultado: SELECT
--   em public.cargos sempre retorna 0 linhas para quem ainda não tem profile,
--   exatamente o caso de uso do fluxo de solicitação de acesso.
--
-- FIX: RPC SECURITY DEFINER que resolve a empresa pelo domínio do e-mail do
--   chamador (companies.allowed_domains), sem depender de profiles. Não
--   flexibiliza o RLS da tabela base para anon — apenas authenticated pode
--   executar a função, e ela só devolve cargos da empresa correspondente ao
--   domínio do e-mail autenticado.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_cargos_for_request_access()
RETURNS TABLE (id uuid, name text, description text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.description
  FROM public.cargos c
  JOIN public.companies co ON co.id = c.company_id
  WHERE co.active = true
    AND (
      co.allowed_domains @> ARRAY['*']
      OR co.allowed_domains @> ARRAY[lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2))]
    )
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.list_cargos_for_request_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_cargos_for_request_access() TO authenticated;

-- =============================================================================
-- Registro no tracker interno (histórico do CLI está desincronizado — não usar
-- `supabase db push` para esta migration; aplicar via SQL direto nos 2 bancos).
-- =============================================================================
INSERT INTO public.schema_migrations (filename)
VALUES ('20260925020000_request_access_cargos.sql')
ON CONFLICT (filename) DO NOTHING;
