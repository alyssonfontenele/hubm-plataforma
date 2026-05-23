-- Add layout_config column to sectors table.
-- Stores the admin-defined default layout mode and grid column count.
-- Falls back gracefully: existing rows get the default value on next read.
ALTER TABLE sectors
  ADD COLUMN IF NOT EXISTS layout_config jsonb NOT NULL DEFAULT '{"mode":"grid","columns":3}';
