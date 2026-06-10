-- =============================================================================
-- Bootstrap de empresas para ambiente local (db reset)
-- Em produção: tabela nunca está vazia → INSERT é no-op (ON CONFLICT DO NOTHING)
-- Em db reset: tabela começa vazia → popula antes das migrations guardadas
--              que dependem de public.companies.slug para decidir se aplicam.
-- =============================================================================
DO $$
BEGIN
  -- Só insere se a tabela estiver completamente vazia
  -- (produção: sempre há dados → nenhum INSERT ocorre)
  IF NOT EXISTS (SELECT 1 FROM public.companies LIMIT 1) THEN
    INSERT INTO public.companies (id, slug, name, active)
    VALUES
      ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'mowig',   'Mowig',   true),
      ('fac9ae68-d906-4055-b228-02861cff3a7f', 'moveria', 'Moveria', true)
    ON CONFLICT (slug) DO NOTHING;
  END IF;
END $$;
