DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sectors'
  ) THEN
    ALTER TABLE sectors
      ADD COLUMN IF NOT EXISTS layout_config jsonb NOT NULL DEFAULT '{"mode":"grid","columns":3}';
  END IF;
END;
$$;
