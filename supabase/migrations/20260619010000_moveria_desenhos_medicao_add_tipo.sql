-- =============================================================================
-- Migration: moveria_desenhos_medicao_add_tipo
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Adiciona coluna tipo text NOT NULL DEFAULT 'desenho' com CHECK (tipo IN ('desenho','foto')).
-- Registros existentes herdam 'desenho' (correto semanticamente).
-- Guard por moveria_designacoes; skip se coluna já existir (idempotente).
-- =============================================================================

DO $migration$
BEGIN
  -- Guard: só Moveria
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_designacoes'
  ) THEN
    RAISE NOTICE 'desenhos_medicao_add_tipo: banco não é Moveria — pulado.'; RETURN;
  END IF;

  -- Idempotente: só adiciona se coluna ainda não existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'moveria_desenhos_medicao'
      AND column_name  = 'tipo'
  ) THEN
    ALTER TABLE public.moveria_desenhos_medicao
      ADD COLUMN tipo text NOT NULL DEFAULT 'desenho'
        CONSTRAINT moveria_desenhos_medicao_tipo_check CHECK (tipo IN ('desenho', 'foto'));
    RAISE NOTICE 'Coluna tipo adicionada a moveria_desenhos_medicao.';
  ELSE
    RAISE NOTICE 'Coluna tipo já existe — nada alterado.';
  END IF;
END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260619010000_moveria_desenhos_medicao_add_tipo.sql')
ON CONFLICT (filename) DO NOTHING;
