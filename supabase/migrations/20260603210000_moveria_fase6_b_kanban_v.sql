-- =============================================================================
-- Migration: moveria_fase6_b_kanban_v
-- Reescreve moveria_kanban_v: card sai de BACKLOG → AGUARDANDO MEDIÇÃO
-- por designação ativa (não por lote). Sub-estado por sessão finalizada.
-- Adiciona colunas: sub_estado, data_prevista_max, tem_atraso.
--
-- ROLLBACK (restaurar versão anterior):
-- ver rollback_kanban_v.sql entregue ao final da leva.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'moveria_designacoes'
  ) THEN
    RAISE NOTICE 'fase6_b: moveria_designacoes ausente — pulada.';
    RETURN;
  END IF;
END $guard$;

CREATE OR REPLACE VIEW public.moveria_kanban_v AS

-- Col 1: BACKLOG — contratos com itens em backlog e nenhuma designação ativa
SELECT
  'contrato'::text            AS tipo_card,
  'backlog'::text             AS etapa,
  c.id                        AS contrato_id,
  c.numero_base || CASE WHEN c.versao > 1 THEN '-' || c.versao::text ELSE '' END AS contrato_numero,
  cl.nome_completo            AS cliente_nome,
  NULL::uuid                  AS lote_id,
  NULL::text                  AS lote_numero,
  NULL::uuid                  AS consultor_id,
  NULL::text                  AS consultor_nome,
  NULL::moveria_status_lote   AS status,
  NULL::timestamptz           AS conformado_em,
  false::boolean              AS tem_ressalva,
  0::integer                  AS qtd_itens,
  (SELECT COUNT(*)::integer FROM moveria_itens_contrato i2
   WHERE i2.contrato_id = c.id AND i2.lote_id IS NULL
     AND i2.aptidao IN ('pendente','inapto') AND i2.deletado_em IS NULL
  )                           AS qtd_ambientes_sem_lote,
  NULL::text                  AS sub_estado,
  NULL::date                  AS data_prevista_max,
  false::boolean              AS tem_atraso
FROM moveria_contratos c
JOIN moveria_clientes cl ON cl.id = c.cliente_id
WHERE c.deletado_em IS NULL
  AND EXISTS (
    SELECT 1 FROM moveria_itens_contrato i
    WHERE i.contrato_id = c.id AND i.lote_id IS NULL
      AND i.aptidao IN ('pendente','inapto') AND i.deletado_em IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM moveria_itens_contrato i
    JOIN moveria_designacoes d ON d.item_id = i.id AND d.ativo = true
    WHERE i.contrato_id = c.id AND i.lote_id IS NULL AND i.deletado_em IS NULL
  )
  AND (auth_is_moveria_admin() OR moveria_vendedor_tem_contrato(c.id))

UNION ALL

-- Col 2: AGUARDANDO MEDIÇÃO — contratos com itens em backlog e ≥1 designação ativa
SELECT
  'contrato'::text            AS tipo_card,
  'aguardando_medicao'::text  AS etapa,
  c.id                        AS contrato_id,
  c.numero_base || CASE WHEN c.versao > 1 THEN '-' || c.versao::text ELSE '' END AS contrato_numero,
  cl.nome_completo            AS cliente_nome,
  NULL::uuid                  AS lote_id,
  NULL::text                  AS lote_numero,
  (SELECT d2.consultor_id FROM moveria_itens_contrato i2
   JOIN moveria_designacoes d2 ON d2.item_id = i2.id AND d2.ativo = true
   WHERE i2.contrato_id = c.id AND i2.lote_id IS NULL AND i2.deletado_em IS NULL
   ORDER BY d2.designado_em DESC LIMIT 1)  AS consultor_id,
  (SELECT p2.full_name FROM moveria_itens_contrato i2
   JOIN moveria_designacoes d2 ON d2.item_id = i2.id AND d2.ativo = true
   JOIN moveria_membros m2 ON m2.id = d2.consultor_id
   JOIN profiles p2 ON p2.id = m2.profile_id
   WHERE i2.contrato_id = c.id AND i2.lote_id IS NULL AND i2.deletado_em IS NULL
   ORDER BY d2.designado_em DESC LIMIT 1)  AS consultor_nome,
  NULL::moveria_status_lote   AS status,
  NULL::timestamptz           AS conformado_em,
  false::boolean              AS tem_ressalva,
  0::integer                  AS qtd_itens,
  (SELECT COUNT(*)::integer FROM moveria_itens_contrato i3
   WHERE i3.contrato_id = c.id AND i3.lote_id IS NULL
     AND i3.aptidao IN ('pendente','inapto') AND i3.deletado_em IS NULL
  )                           AS qtd_ambientes_sem_lote,
  CASE
    WHEN EXISTS (SELECT 1 FROM moveria_medicoes med
                 WHERE med.contrato_id = c.id AND med.status = 'finalizada')
    THEN 'em_rodadas' ELSE 'designado'
  END                         AS sub_estado,
  (SELECT MAX(d3.data_prevista) FROM moveria_itens_contrato i4
   JOIN moveria_designacoes d3 ON d3.item_id = i4.id AND d3.ativo = true
   WHERE i4.contrato_id = c.id AND i4.lote_id IS NULL AND i4.deletado_em IS NULL
  )                           AS data_prevista_max,
  (CURRENT_DATE > COALESCE(
    (SELECT MAX(d4.data_prevista) FROM moveria_itens_contrato i5
     JOIN moveria_designacoes d4 ON d4.item_id = i5.id AND d4.ativo = true
     WHERE i5.contrato_id = c.id AND i5.lote_id IS NULL AND i5.deletado_em IS NULL),
    CURRENT_DATE)
   AND (SELECT MAX(d4.data_prevista) FROM moveria_itens_contrato i5
        JOIN moveria_designacoes d4 ON d4.item_id = i5.id AND d4.ativo = true
        WHERE i5.contrato_id = c.id AND i5.lote_id IS NULL AND i5.deletado_em IS NULL)
   IS NOT NULL)::boolean      AS tem_atraso
FROM moveria_contratos c
JOIN moveria_clientes cl ON cl.id = c.cliente_id
WHERE c.deletado_em IS NULL
  AND EXISTS (
    SELECT 1 FROM moveria_itens_contrato i
    WHERE i.contrato_id = c.id AND i.lote_id IS NULL
      AND i.aptidao IN ('pendente','inapto') AND i.deletado_em IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM moveria_itens_contrato i
    JOIN moveria_designacoes d ON d.item_id = i.id AND d.ativo = true
    WHERE i.contrato_id = c.id AND i.lote_id IS NULL AND i.deletado_em IS NULL
  )
  AND (
    auth_is_moveria_admin()
    OR moveria_consultor_tem_contrato(c.id)
    OR moveria_vendedor_tem_contrato(c.id)
  )

UNION ALL

-- Col 3+: LOTES em andamento
SELECT
  'lote'::text              AS tipo_card,
  l.status::text            AS etapa,
  l.contrato_id,
  l.contrato_numero,
  l.cliente_nome,
  l.id                      AS lote_id,
  l.numero                  AS lote_numero,
  l.consultor_id,
  l.consultor_nome,
  l.status,
  l.conformado_em,
  l.tem_ressalva,
  l.qtd_itens,
  NULL::integer             AS qtd_ambientes_sem_lote,
  NULL::text                AS sub_estado,
  NULL::date                AS data_prevista_max,
  false::boolean            AS tem_atraso
FROM moveria_lotes_v l
WHERE l.status IN (
  'medido','apresentacao_tecnica','em_aprovacao',
  'aprovado','pedidos_fornecedores','documentacao_tecnica_completa'
);

GRANT SELECT ON public.moveria_kanban_v TO authenticated;

INSERT INTO public.schema_migrations (filename)
VALUES ('20260603210000_moveria_fase6_b_kanban_v.sql')
ON CONFLICT (filename) DO NOTHING;
