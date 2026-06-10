-- =================================================================
-- Fase 5 r2 (b): agendamento e sequência em moveria_medicoes
-- =================================================================

DO $$ BEGIN
  CREATE TYPE moveria_status_agendamento AS ENUM ('designado', 'data_confirmada', 'liberado_medir');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE moveria_medicoes
  ADD COLUMN IF NOT EXISTS data_prevista       date                       NULL,
  ADD COLUMN IF NOT EXISTS data_confirmada     date                       NULL,
  ADD COLUMN IF NOT EXISTS status_agendamento  moveria_status_agendamento NOT NULL DEFAULT 'designado',
  ADD COLUMN IF NOT EXISTS sequencia           text;

CREATE OR REPLACE FUNCTION public.moveria_fn_atribuir_sequencia_medicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_occupied TEXT[];
  v_pos      INTEGER := 1;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('moveria_medicao_seq:' || NEW.contrato_id::text)
  );

  SELECT array_agg(sequencia)
  INTO v_occupied
  FROM moveria_medicoes
  WHERE contrato_id = NEW.contrato_id;

  WHILE v_pos <= 26 LOOP
    EXIT WHEN NOT (chr(64 + v_pos) = ANY(COALESCE(v_occupied, ARRAY[]::TEXT[])));
    v_pos := v_pos + 1;
  END LOOP;

  IF v_pos > 26 THEN
    RAISE EXCEPTION
      'Limite de 26 visitas por contrato atingido (A-Z). Encerrar sessoes obsoletas antes de criar novas. Suporte a sequencias alem de Z nao implementado.'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.sequencia := chr(64 + v_pos);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_moveria_medicoes_seq_auto ON moveria_medicoes;
CREATE TRIGGER trg_moveria_medicoes_seq_auto
  BEFORE INSERT ON moveria_medicoes
  FOR EACH ROW
  WHEN (NEW.sequencia IS NULL)
  EXECUTE FUNCTION moveria_fn_atribuir_sequencia_medicao();
