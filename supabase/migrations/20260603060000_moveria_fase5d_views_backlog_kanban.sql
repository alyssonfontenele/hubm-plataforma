-- =================================================================
-- Migration (d): moveria_backlog_v e moveria_kanban_v
-- =================================================================

-- 4. moveria_backlog_v
CREATE OR REPLACE VIEW public.moveria_backlog_v AS
SELECT
  i.contrato_id,
  c.numero_base
    || CASE WHEN c.versao > 1 THEN '-' || c.versao::text ELSE '' END AS contrato_numero,
  cl.nome_completo  AS cliente_nome,
  i.id              AS item_id,
  i.codigo,
  i.descricao,
  i.aptidao
FROM moveria_itens_contrato i
JOIN moveria_contratos c  ON c.id = i.contrato_id  AND c.deletado_em IS NULL
JOIN moveria_clientes  cl ON cl.id = c.cliente_id
WHERE i.lote_id     IS NULL
  AND i.aptidao     IN ('pendente', 'inapto')
  AND i.deletado_em IS NULL
  AND (
        auth_is_moveria_admin()
    OR (
        auth_moveria_papel()::text = 'consultor_tecnico'
        AND EXISTS (
          SELECT 1
          FROM moveria_designacoes d
          JOIN moveria_membros     m ON m.id = d.consultor_id
          WHERE d.item_id  = i.id
            AND d.ativo    = true
            AND m.profile_id = auth.uid()
        )
    )
    OR moveria_vendedor_tem_item(i.id)
  );

GRANT SELECT ON public.moveria_backlog_v TO authenticated;

-- 5. moveria_kanban_v
CREATE OR REPLACE VIEW public.moveria_kanban_v AS

-- Contratos sem nenhum lote não-cancelado, com ≥1 item em backlog
SELECT
  'contrato'::text           AS tipo_card,
  'backlog'::text            AS etapa,
  c.id                       AS contrato_id,
  c.numero_base
    || CASE WHEN c.versao > 1 THEN '-' || c.versao::text ELSE '' END
                             AS contrato_numero,
  cl.nome_completo           AS cliente_nome,
  NULL::uuid                 AS lote_id,
  NULL::text                 AS lote_numero,
  NULL::uuid                 AS consultor_id,
  NULL::text                 AS consultor_nome,
  NULL::moveria_status_lote  AS status,
  NULL::timestamptz          AS conformado_em,
  NULL::boolean              AS tem_ressalva,
  NULL::integer              AS qtd_itens,
  COUNT(b.item_id)::integer  AS qtd_ambientes_sem_lote
FROM moveria_contratos c
JOIN moveria_clientes  cl ON cl.id = c.cliente_id
JOIN moveria_backlog_v  b ON b.contrato_id = c.id
WHERE c.deletado_em IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM moveria_lotes l
    WHERE l.contrato_id = c.id
      AND l.status != 'cancelado'
  )
GROUP BY c.id, c.numero_base, c.versao, cl.nome_completo

UNION ALL

-- Contratos com ≥1 lote não-cancelado e ainda com ≥1 item em backlog
SELECT
  'contrato'::text           AS tipo_card,
  'aguardando_medicao'::text AS etapa,
  c.id                       AS contrato_id,
  c.numero_base
    || CASE WHEN c.versao > 1 THEN '-' || c.versao::text ELSE '' END
                             AS contrato_numero,
  cl.nome_completo           AS cliente_nome,
  NULL::uuid                 AS lote_id,
  NULL::text                 AS lote_numero,
  NULL::uuid                 AS consultor_id,
  NULL::text                 AS consultor_nome,
  NULL::moveria_status_lote  AS status,
  NULL::timestamptz          AS conformado_em,
  NULL::boolean              AS tem_ressalva,
  NULL::integer              AS qtd_itens,
  COUNT(b.item_id)::integer  AS qtd_ambientes_sem_lote
FROM moveria_contratos c
JOIN moveria_clientes  cl ON cl.id = c.cliente_id
JOIN moveria_backlog_v  b ON b.contrato_id = c.id
WHERE c.deletado_em IS NULL
  AND EXISTS (
    SELECT 1 FROM moveria_lotes l
    WHERE l.contrato_id = c.id
      AND l.status != 'cancelado'
  )
GROUP BY c.id, c.numero_base, c.versao, cl.nome_completo

UNION ALL

-- Lotes em andamento (etapa = status do lote)
SELECT
  'lote'::text               AS tipo_card,
  l.status::text             AS etapa,
  l.contrato_id,
  l.contrato_numero,
  l.cliente_nome,
  l.id                       AS lote_id,
  l.numero                   AS lote_numero,
  l.consultor_id,
  l.consultor_nome,
  l.status,
  l.conformado_em,
  l.tem_ressalva,
  l.qtd_itens,
  NULL::integer              AS qtd_ambientes_sem_lote
FROM moveria_lotes_v l
WHERE l.status IN (
  'medido', 'apresentacao_tecnica', 'em_aprovacao',
  'aprovado', 'pedidos_fornecedores', 'documentacao_tecnica_completa'
);

GRANT SELECT ON public.moveria_kanban_v TO authenticated;
