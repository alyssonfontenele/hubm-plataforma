-- =================================================================
-- Buckets e policies de storage do módulo Moveria
-- =================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moveria-docs',
  'moveria-docs',
  false,
  20971520,
  ARRAY['application/pdf','image/png','image/jpeg',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'moveria-medicoes',
  'moveria-medicoes',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/heic','image/webp','image/jpg']
)
ON CONFLICT (id) DO NOTHING;

-- ── moveria-docs policies ────────────────────────────────────────

DROP POLICY IF EXISTS "moveria-docs: select" ON storage.objects;
CREATE POLICY "moveria-docs: select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'moveria-docs'
    AND (
      auth_is_moveria_admin()
      OR EXISTS (
        SELECT 1 FROM moveria_documentos d
        WHERE d.storage_path = objects.name
          AND d.deletado_em IS NULL
          AND moveria_consultor_tem_contrato(d.contrato_id)
      )
      OR EXISTS (
        SELECT 1 FROM moveria_documentos d
        WHERE d.storage_path = objects.name
          AND d.deletado_em IS NULL
          AND moveria_vendedor_tem_contrato(d.contrato_id)
      )
    )
  );

DROP POLICY IF EXISTS "moveria-docs: insert" ON storage.objects;
CREATE POLICY "moveria-docs: insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'moveria-docs'
    AND (auth_moveria_papel() IS NOT NULL OR auth_is_moveria_admin())
  );

DROP POLICY IF EXISTS "moveria-docs: delete" ON storage.objects;
CREATE POLICY "moveria-docs: delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'moveria-docs'
    AND auth_is_moveria_admin()
  );

-- ── moveria-medicoes policies ────────────────────────────────────

DROP POLICY IF EXISTS "moveria-medicoes: select" ON storage.objects;
CREATE POLICY "moveria-medicoes: select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'moveria-medicoes'
    AND (
      auth_is_moveria_admin()
      OR (
        auth_moveria_papel()::text = 'consultor_tecnico'
        AND EXISTS (
          SELECT 1
          FROM moveria_desenhos_medicao d
          JOIN moveria_designacoes des ON des.item_id = d.item_id AND des.ativo = true
          JOIN moveria_membros      m  ON m.id = des.consultor_id AND m.profile_id = auth.uid()
          WHERE d.path = objects.name
        )
      )
    )
  );

DROP POLICY IF EXISTS "moveria-medicoes: insert" ON storage.objects;
CREATE POLICY "moveria-medicoes: insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'moveria-medicoes'
    AND (
      auth_is_moveria_admin()
      OR (
        auth_moveria_papel()::text = 'consultor_tecnico'
        AND EXISTS (
          SELECT 1
          FROM moveria_designacoes des
          JOIN moveria_membros     m  ON m.id = des.consultor_id AND m.profile_id = auth.uid()
          WHERE des.item_id::text = split_part(objects.name, '/', 1)
            AND des.ativo = true
        )
      )
    )
  );

DROP POLICY IF EXISTS "moveria-medicoes: delete" ON storage.objects;
CREATE POLICY "moveria-medicoes: delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'moveria-medicoes'
    AND (
      auth_is_moveria_admin()
      OR (
        auth_moveria_papel()::text = 'consultor_tecnico'
        AND EXISTS (
          SELECT 1
          FROM moveria_desenhos_medicao d
          JOIN moveria_designacoes des ON des.item_id = d.item_id AND des.ativo = true
          JOIN moveria_membros      m  ON m.id = des.consultor_id AND m.profile_id = auth.uid()
          WHERE d.path = objects.name
        )
      )
    )
  );
