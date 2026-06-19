-- =============================================================================
-- Migration: moveria_papel_interessado_recriar_enum
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Recria o ENUM moveria_papel_interessado com os 4 novos valores:
--   especificador | responsavel_obra | proprietario_delegado | outro
-- Remapeia dados:
--   arquiteto    → especificador
--   comprador    → responsavel_obra
--   proprietario → proprietario_delegado
-- Guard: moveria_designacoes ausente → pula (Core/Mowig).
-- Idempotente: verifica se o tipo já tem os novos valores antes de agir.
-- =============================================================================

DO $migration$
DECLARE
  v_dep_count integer;
  v_bad_count integer;
BEGIN
  -- Guard: só Moveria
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_designacoes'
  ) THEN
    RAISE NOTICE 'papel_interessado_enum: banco não é Moveria — pulado.'; RETURN;
  END IF;

  -- Idempotência: se o ENUM já tem 'especificador', os novos valores já estão.
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'moveria_papel_interessado'
      AND e.enumlabel = 'especificador'
  ) THEN
    RAISE NOTICE 'papel_interessado_enum: enum já tem ''especificador'' — nada a fazer.'; RETURN;
  END IF;

  -- ── Passo 0: revalidar dependências (segurança extra além do diagnóstico) ──
  SELECT count(*) INTO v_dep_count
  FROM pg_depend d
  JOIN pg_type t    ON t.oid = d.refobjid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN pg_class c   ON c.oid = d.objid
  WHERE n.nspname = 'public'
    AND t.typname = 'moveria_papel_interessado'
    AND c.relname != 'moveria_interessados'
    AND d.deptype IN ('n','a');

  IF v_dep_count > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: moveria_papel_interessado tem % dependência(s) fora de moveria_interessados. Investigue antes de prosseguir.',
      v_dep_count
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Passo 1: converter coluna para text ──
  ALTER TABLE public.moveria_interessados
    ALTER COLUMN papel TYPE text USING papel::text;

  RAISE NOTICE '  papel convertida para text.';

  -- ── Passo 2: remapear todos os valores antigos ──
  UPDATE public.moveria_interessados SET papel = 'especificador'         WHERE papel = 'arquiteto';
  UPDATE public.moveria_interessados SET papel = 'responsavel_obra'      WHERE papel = 'comprador';
  UPDATE public.moveria_interessados SET papel = 'proprietario_delegado' WHERE papel = 'proprietario';

  RAISE NOTICE '  remapeamento de dados concluído.';

  -- ── Passo 2b: verificar que não restou nenhum valor antigo ──
  SELECT count(*) INTO v_bad_count
  FROM public.moveria_interessados
  WHERE papel NOT IN ('especificador','responsavel_obra','proprietario_delegado','outro');

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % registro(s) com valor de papel não mapeado. Corrija o UPDATE antes de prosseguir.',
      v_bad_count
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Passo 3: dropar tipo antigo ──
  DROP TYPE public.moveria_papel_interessado;

  RAISE NOTICE '  tipo antigo dropado.';

  -- ── Passo 4: criar tipo novo ──
  CREATE TYPE public.moveria_papel_interessado AS ENUM (
    'especificador',
    'responsavel_obra',
    'proprietario_delegado',
    'outro'
  );

  RAISE NOTICE '  tipo novo criado com 4 valores.';

  -- ── Passo 5: reconverter coluna para o enum novo ──
  ALTER TABLE public.moveria_interessados
    ALTER COLUMN papel TYPE public.moveria_papel_interessado
    USING papel::public.moveria_papel_interessado;

  RAISE NOTICE '  coluna papel reconvertida para moveria_papel_interessado.';
  RAISE NOTICE 'papel_interessado_enum: concluído com sucesso.';
END $migration$;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260619040000_moveria_papel_interessado_recriar_enum.sql')
ON CONFLICT (filename) DO NOTHING;
