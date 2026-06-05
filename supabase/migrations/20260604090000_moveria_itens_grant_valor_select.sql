-- =============================================================================
-- Migration: moveria_itens_grant_valor_select
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Concede SELECT nas colunas valor_unitario e valor_item de moveria_itens_contrato
-- ao papel authenticated.
--
-- Contexto: colunas adicionadas via ADD COLUMN não herdam automaticamente os
-- grants table-level já existentes. O PostgREST rejeita a query inteira quando
-- qualquer coluna solicitada não tem SELECT grant, retornando erro e fazendo a
-- aba Ambientes exibir "Nenhum ambiente encontrado" (regressão detectada na
-- Frente C). Este arquivo é de REGISTRO — o GRANT já foi aplicado via MCP.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_itens_contrato'
  ) THEN
    RAISE NOTICE 'moveria_itens_grant_valor_select: moveria_itens_contrato ausente — pulada.'; RETURN;
  END IF;
END $guard$;

GRANT SELECT (valor_unitario, valor_item)
  ON public.moveria_itens_contrato
  TO authenticated;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260604090000_moveria_itens_grant_valor_select.sql')
ON CONFLICT (filename) DO NOTHING;
