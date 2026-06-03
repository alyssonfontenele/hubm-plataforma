-- =================================================================
-- Fase 5 r2 (a): novos valores no enum moveria_status_lote
-- =================================================================

ALTER TYPE moveria_status_lote ADD VALUE IF NOT EXISTS 'em_aprovacao'
  AFTER 'apresentacao_tecnica';

ALTER TYPE moveria_status_lote ADD VALUE IF NOT EXISTS 'pedidos_fornecedores'
  AFTER 'aprovado';
