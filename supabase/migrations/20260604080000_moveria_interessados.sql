-- =============================================================================
-- Migration: moveria_interessados
-- Banco: Moveria (fzgasvcfxufhrbrdakow) APENAS
-- Cria enum moveria_papel_interessado e tabela moveria_interessados.
-- Guard: moveria_contratos ausente → pula (Core/Mowig).
-- Observação §11.4: CREATE TYPE e CREATE TABLE na mesma transação é permitido
-- no Postgres (DDL é transacional); o risco de §11.4 é usar ALTER TYPE em
-- conjunto com uso imediato na mesma tx — aqui usamos apenas CREATE TYPE,
-- portanto não há restrição.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_contratos'
  ) THEN
    RAISE NOTICE 'moveria_interessados: moveria_contratos ausente — pulada.'; RETURN;
  END IF;
END $guard$;

-- ── Enum de papel do interessado ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.moveria_papel_interessado AS ENUM (
    'arquiteto',
    'proprietario',
    'comprador'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL; -- idempotente: re-execução não quebra
END $$;

-- ── Tabela principal ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.moveria_interessados (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id  uuid NOT NULL
               REFERENCES public.moveria_contratos(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  telefone     text,
  email        text,
  papel        public.moveria_papel_interessado NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moveria_interessados_contrato_id_idx
  ON public.moveria_interessados (contrato_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.moveria_interessados ENABLE ROW LEVEL SECURITY;

-- SELECT: admin OR consultor designado no contrato OR vendedor do contrato
CREATE POLICY "moveria_interessados: select"
  ON public.moveria_interessados FOR SELECT
  USING (
    auth_is_moveria_admin()
    OR moveria_consultor_tem_contrato(contrato_id)
    OR moveria_vendedor_tem_contrato(contrato_id)
  );

-- INSERT: admin OR consultor designado no contrato (vendedor NÃO insere)
CREATE POLICY "moveria_interessados: insert"
  ON public.moveria_interessados FOR INSERT
  WITH CHECK (
    auth_is_moveria_admin()
    OR moveria_consultor_tem_contrato(contrato_id)
  );

-- UPDATE: admin OR consultor designado no contrato (USING = acesso à linha atual; WITH CHECK = resultado após update)
CREATE POLICY "moveria_interessados: update"
  ON public.moveria_interessados FOR UPDATE
  USING (
    auth_is_moveria_admin()
    OR moveria_consultor_tem_contrato(contrato_id)
  )
  WITH CHECK (
    auth_is_moveria_admin()
    OR moveria_consultor_tem_contrato(contrato_id)
  );

-- DELETE: admin OR consultor designado no contrato
CREATE POLICY "moveria_interessados: delete"
  ON public.moveria_interessados FOR DELETE
  USING (
    auth_is_moveria_admin()
    OR moveria_consultor_tem_contrato(contrato_id)
  );

-- ── Grants ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.moveria_interessados TO authenticated;

-- ── Tracker ───────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (filename)
VALUES ('20260604080000_moveria_interessados.sql')
ON CONFLICT (filename) DO NOTHING;
