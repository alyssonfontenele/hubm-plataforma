-- Tabela interna de rastreamento de migrations aplicadas em cada banco.
-- Permite auditar divergências entre o repositório e os bancos de produção.
-- RLS desabilitado — tabela de sistema, não dados de usuário.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id         serial PRIMARY KEY,
  filename   text        NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE schema_migrations DISABLE ROW LEVEL SECURITY;
