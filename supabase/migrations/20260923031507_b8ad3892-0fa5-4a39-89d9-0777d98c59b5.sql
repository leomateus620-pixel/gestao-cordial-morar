-- A URL assinada é emitida depois de uma reserva durável. Se o navegador
-- fechar após o PUT, o worker encontra o original pelo caminho reservado.
CREATE TABLE IF NOT EXISTS public.property_image_upload_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  content_hash text NOT NULL,
  replacement_for uuid,
  batch_id uuid REFERENCES public.property_image_batches(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'registered', 'duplicated', 'missing', 'blocked')),
  image_id uuid REFERENCES public.property_images(id) ON DELETE SET NULL,
  storage_cleaned_at timestamptz,
  error_code text,
  attempts integer NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL DEFAULT now() + interval '1 minute',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS property_image_upload_reservations_due_idx
  ON public.property_image_upload_reservations (next_check_at, id)
  WHERE status IN ('reserved', 'missing');
CREATE INDEX IF NOT EXISTS property_image_upload_reservations_issues_idx
  ON public.property_image_upload_reservations (property_id, created_at DESC)
  WHERE status IN ('missing', 'blocked');
CREATE INDEX IF NOT EXISTS property_image_upload_reservations_cleanup_idx
  ON public.property_image_upload_reservations (next_check_at, id)
  WHERE status = 'duplicated' AND storage_cleaned_at IS NULL;
ALTER TABLE public.property_image_upload_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_image_upload_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.property_image_upload_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.property_image_upload_reserve(
  _property_id uuid, _storage_path text, _file_name text,
  _mime_type text, _size_bytes bigint, _content_hash text,
  _replacement_for uuid DEFAULT NULL, _batch_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid;
  _removal_state text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
    public.has_role(auth.uid(), 'corretor'::public.app_role)
  ) THEN RAISE EXCEPTION 'sem_permissao_para_editar_fotos'; END IF;
  IF _storage_path NOT LIKE _property_id::text || '/originais/%'
     OR length(_storage_path) > 400 OR nullif(_file_name, '') IS NULL
     OR _size_bytes IS NULL OR _size_bytes <= 0
     OR _content_hash !~ '^[a-fA-F0-9]{64}$' THEN
    RAISE EXCEPTION 'reserva_de_upload_invalida';
  END IF;
  SELECT removal_state INTO _removal_state FROM public.properties
   WHERE id = _property_id FOR SHARE;
  IF NOT FOUND OR _removal_state IN ('pending_removal', 'pending_archive') THEN
    RAISE EXCEPTION 'imovel_indisponivel_para_fotos';
  END IF;
  IF _replacement_for IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.property_images
     WHERE id = _replacement_for AND property_id = _property_id
       AND NOT COALESCE(pending_remote_delete, false)
  ) THEN RAISE EXCEPTION 'foto_substituida_foi_removida'; END IF;
  IF _batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.property_image_batches
     WHERE id = _batch_id AND property_id = _property_id
  ) THEN RAISE EXCEPTION 'lote_de_fotos_invalido'; END IF;
  INSERT INTO public.property_image_upload_reservations
    (property_id, storage_path, file_name, mime_type, size_bytes,
     content_hash, replacement_for, batch_id, uploaded_by)
  VALUES (_property_id, _storage_path, _file_name, _mime_type, _size_bytes,
          lower(_content_hash), _replacement_for, _batch_id, auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.property_image_upload_reserve(
  uuid, text, text, text, bigint, text, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_image_upload_reserve(
  uuid, text, text, text, bigint, text, uuid, uuid
) TO authenticated;

-- Todo efeito local do registro (incluindo substituição e contador de lote)
-- confirma na mesma transação. Duas chamadas simultâneas da UI/watchdog
-- serializam pela reserva e devolvem a mesma identidade.
CREATE OR REPLACE FUNCTION public.property_image_upload_finalize(
  _reservation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _reservation public.property_image_upload_reservations;
  _existing uuid;
  _new_id uuid;
  _property public.properties;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'apenas_servidor_pode_confirmar_upload';
  END IF;
  SELECT * INTO _reservation FROM public.property_image_upload_reservations
   WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reserva_de_upload_nao_encontrada'; END IF;
  IF _reservation.status IN ('registered', 'duplicated') THEN
    RETURN jsonb_build_object('status', _reservation.status, 'imageId', _reservation.image_id);
  END IF;
  IF _reservation.status = 'blocked' THEN
    RETURN jsonb_build_object('status', 'blocked', 'reason', _reservation.error_code);
  END IF;
  IF _reservation.status = 'missing' AND _reservation.batch_id IS NOT NULL THEN
    -- O Storage pode ter apresentado o objeto tardiamente. Reabrir a
    -- confirmação reverte o único contador de falta antes de concluir.
    UPDATE public.property_image_batches
       SET failed_count = GREATEST(failed_count - 1, 0)
     WHERE id = _reservation.batch_id;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_reservation.property_id::text, 0));
  SELECT * INTO _property FROM public.properties
   WHERE id = _reservation.property_id FOR UPDATE;
  IF NOT FOUND OR _property.removal_state IN ('pending_removal', 'pending_archive') THEN
    UPDATE public.property_image_upload_reservations
       SET status = 'blocked', error_code = 'imovel_indisponivel',
           resolved_at = now() WHERE id = _reservation_id;
    IF _reservation.batch_id IS NOT NULL THEN
      PERFORM public.property_image_batch_bump(_reservation.batch_id, 'failed_count');
    END IF;
    RETURN '{"status":"blocked","reason":"imovel_indisponivel"}'::jsonb;
  END IF;
  -- A consulta também cobre um deploy anterior que registrou os bytes antes
  -- de confirmar a reserva. Nunca criar uma segunda foto para o mesmo objeto.
  SELECT id INTO _existing FROM public.property_images
   WHERE property_id = _reservation.property_id
     AND storage_path = _reservation.storage_path ORDER BY created_at LIMIT 1;
  IF _existing IS NULL AND _reservation.replacement_for IS NULL THEN
    SELECT id INTO _existing FROM public.property_images
     WHERE property_id = _reservation.property_id
       AND content_hash = _reservation.content_hash
       AND NOT COALESCE(pending_remote_delete, false)
     ORDER BY created_at LIMIT 1;
    IF _existing IS NOT NULL THEN
      UPDATE public.property_image_upload_reservations
         SET status = 'duplicated', image_id = _existing, resolved_at = now()
       WHERE id = _reservation_id;
      IF _reservation.batch_id IS NOT NULL THEN
        PERFORM public.property_image_batch_bump(_reservation.batch_id, 'duplicated_count');
      END IF;
      RETURN jsonb_build_object('status', 'duplicated', 'imageId', _existing);
    END IF;
  END IF;
  IF _existing IS NULL AND _reservation.replacement_for IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.property_images
        WHERE id = _reservation.replacement_for
          AND property_id = _reservation.property_id
          AND NOT COALESCE(pending_remote_delete, false)
     ) THEN
    UPDATE public.property_image_upload_reservations
       SET status = 'blocked', error_code = 'foto_substituida_foi_removida',
           resolved_at = now() WHERE id = _reservation_id;
    IF _reservation.batch_id IS NOT NULL THEN
      PERFORM public.property_image_batch_bump(_reservation.batch_id, 'failed_count');
    END IF;
    RETURN '{"status":"blocked","reason":"foto_substituida_foi_removida"}'::jsonb;
  END IF;
  IF _existing IS NULL THEN
    IF _reservation.replacement_for IS NULL THEN
      _new_id := public.property_image_register(_reservation.property_id,
        jsonb_build_object(
          'storage_path', _reservation.storage_path,
          'original_storage_path', _reservation.storage_path,
          'original_checksum', _reservation.content_hash,
          'content_hash', _reservation.content_hash,
          'file_name', _reservation.file_name,
          'mime_type', _reservation.mime_type,
          'size_bytes', _reservation.size_bytes,
          'uploaded_by', _reservation.uploaded_by,
          'batch_id', _reservation.batch_id,
          'upload_status', 'ready',
          'processing_status', 'pending'
        ));
    ELSE
      _new_id := public.property_image_stage_replacement(
        _reservation.property_id, _reservation.replacement_for,
        jsonb_build_object(
          'storage_path', _reservation.storage_path,
          'original_storage_path', _reservation.storage_path,
          'original_checksum', _reservation.content_hash,
          'content_hash', _reservation.content_hash,
          'file_name', _reservation.file_name,
          'mime_type', _reservation.mime_type,
          'size_bytes', _reservation.size_bytes,
          'uploaded_by', _reservation.uploaded_by,
          'batch_id', _reservation.batch_id
        ));
      PERFORM public.property_image_replace_atomic(
        _reservation.property_id, _reservation.replacement_for, _new_id, NULL);
    END IF;
  ELSE
    _new_id := _existing;
  END IF;
  UPDATE public.property_image_upload_reservations
     SET status = 'registered', image_id = _new_id,
         error_code = NULL, resolved_at = now()
   WHERE id = _reservation_id;
  IF _reservation.batch_id IS NOT NULL THEN
    PERFORM public.property_image_batch_bump(_reservation.batch_id, 'registered_count');
  END IF;
  RETURN jsonb_build_object('status', 'registered', 'imageId', _new_id);
END $$;
REVOKE ALL ON FUNCTION public.property_image_upload_finalize(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_image_upload_finalize(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.property_image_upload_mark_missing(
  _reservation_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _reservation public.property_image_upload_reservations;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'apenas_servidor_pode_confirmar_ausencia';
  END IF;
  SELECT * INTO _reservation FROM public.property_image_upload_reservations
   WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND OR _reservation.status <> 'reserved' OR _reservation.attempts < 2
     OR _reservation.created_at > now() - interval '24 hours' THEN RETURN false; END IF;
  UPDATE public.property_image_upload_reservations
     SET status = 'missing', error_code = 'original_nao_chegou',
         attempts = attempts + 1, resolved_at = now(),
         next_check_at = now() + interval '1 day'
   WHERE id = _reservation_id;
  IF _reservation.batch_id IS NOT NULL THEN
    PERFORM public.property_image_batch_bump(_reservation.batch_id, 'failed_count');
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.property_image_upload_mark_missing(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_image_upload_mark_missing(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.property_image_upload_issues(_property_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _issues jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
    public.has_role(auth.uid(), 'corretor'::public.app_role)
  ) THEN RAISE EXCEPTION 'sem_permissao_para_ver_fotos'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fileName', file_name, 'reason', error_code, 'createdAt', created_at)
    ORDER BY created_at DESC), '[]'::jsonb)
    INTO _issues FROM public.property_image_upload_reservations
   WHERE property_id = _property_id AND status IN ('missing', 'blocked');
  RETURN _issues;
END $$;
REVOKE ALL ON FUNCTION public.property_image_upload_issues(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_image_upload_issues(uuid) TO authenticated, service_role;

-- Somente reservas resolvidas são podadas. Reservas bloqueadas/sem bytes
-- continuam auditáveis; nenhuma foto ou vínculo remoto é apagado por aqui.
CREATE OR REPLACE FUNCTION public.property_image_upload_prune()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _deleted integer;
BEGIN
  DELETE FROM public.property_image_upload_reservations
   WHERE resolved_at < now() - interval '90 days'
     AND (status = 'registered'
       OR (status = 'duplicated' AND storage_cleaned_at IS NOT NULL));
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END $$;
REVOKE ALL ON FUNCTION public.property_image_upload_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_image_upload_prune() TO service_role;

DO $schedule$
DECLARE _job record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  FOR _job IN SELECT jobid FROM cron.job
    WHERE jobname = 'property-upload-reservation-prune'
  LOOP
    PERFORM cron.unschedule(_job.jobid);
  END LOOP;
  PERFORM cron.schedule('property-upload-reservation-prune', '17 4 * * 0',
    'SELECT public.property_image_upload_prune()');
END $schedule$;

-- Endurece os caminhos legados enquanto abas antigas ainda chamam as RPCs
-- anteriores. SECURITY DEFINER não pode dispensar a checagem de papel/autor.
CREATE OR REPLACE FUNCTION public.property_image_register(
  _property_id uuid, _payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _pos integer; _id uuid; _has_cover boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
    public.has_role(auth.uid(), 'corretor'::public.app_role)
  ) THEN RAISE EXCEPTION 'sem_permissao_para_editar_fotos'; END IF;
  IF nullif(_payload->>'storage_path', '') IS NULL
     OR _payload->>'storage_path' NOT LIKE _property_id::text || '/%'
  THEN RAISE EXCEPTION 'caminho_de_foto_invalido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.properties WHERE id = _property_id
      AND removal_state IS DISTINCT FROM 'pending_removal'
      AND removal_state IS DISTINCT FROM 'pending_archive'
  ) THEN RAISE EXCEPTION 'imovel_indisponivel_para_fotos'; END IF;
  SELECT COALESCE(max(position) + 1, 0) INTO _pos
    FROM public.property_images WHERE property_id = _property_id;
  SELECT EXISTS (
    SELECT 1 FROM public.property_images
     WHERE property_id = _property_id AND is_cover
       AND NOT COALESCE(pending_remote_delete, false)
  ) INTO _has_cover;
  INSERT INTO public.property_images (
    property_id, storage_path, original_storage_path, original_checksum,
    file_name, mime_type, size_bytes, content_hash, position, is_cover,
    upload_status, processing_status, uploaded_by, batch_id,
    processed_storage_path, thumbnail_storage_path, processed_checksum,
    watermark_variant, watermark_version, destination_hash, processed_at,
    width, height
  ) VALUES (
    _property_id, _payload->>'storage_path',
    COALESCE(_payload->>'original_storage_path', _payload->>'storage_path'),
    _payload->>'original_checksum', _payload->>'file_name', _payload->>'mime_type',
    NULLIF(_payload->>'size_bytes','')::bigint, _payload->>'content_hash',
    _pos, (_pos = 0 AND NOT _has_cover),
    COALESCE(_payload->>'upload_status', 'ready'),
    COALESCE(_payload->>'processing_status', 'pending'),
    NULLIF(_payload->>'uploaded_by','')::uuid,
    NULLIF(_payload->>'batch_id','')::uuid,
    _payload->>'processed_storage_path', _payload->>'thumbnail_storage_path',
    _payload->>'processed_checksum', _payload->>'watermark_variant',
    _payload->>'watermark_version', _payload->>'destination_hash',
    NULLIF(_payload->>'processed_at','')::timestamptz,
    NULLIF(_payload->>'width','')::integer, NULLIF(_payload->>'height','')::integer
  ) RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.property_image_register(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_image_register(uuid, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.property_image_batch_bump(
  _batch_id uuid, _column text
) RETURNS public.property_image_batches
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.property_image_batches;
BEGIN
  IF _column NOT IN ('registered_count', 'duplicated_count', 'failed_count') THEN
    RAISE EXCEPTION 'coluna_invalida';
  END IF;
  SELECT * INTO _row FROM public.property_image_batches
   WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    _row.created_by IS DISTINCT FROM auth.uid() OR NOT (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
      public.has_role(auth.uid(), 'corretor'::public.app_role)
    )
  ) THEN RAISE EXCEPTION 'sem_permissao_para_lote_de_fotos'; END IF;
  UPDATE public.property_image_batches
     SET registered_count = registered_count + (_column = 'registered_count')::integer,
         duplicated_count = duplicated_count + (_column = 'duplicated_count')::integer,
         failed_count = failed_count + (_column = 'failed_count')::integer,
         status = CASE
           WHEN registered_count + duplicated_count + failed_count + 1 < expected_count
             THEN 'open'
           WHEN failed_count + (_column = 'failed_count')::integer > 0 THEN 'incomplete'
           ELSE 'complete' END
   WHERE id = _batch_id RETURNING * INTO _row;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.property_image_batch_bump(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_image_batch_bump(uuid, text)
  TO authenticated, service_role;

REVOKE UPDATE ON public.property_image_batches FROM authenticated;
DROP POLICY IF EXISTS "Autenticados leem lotes de fotos"
  ON public.property_image_batches;
DROP POLICY IF EXISTS "Autenticados criam lotes de fotos"
  ON public.property_image_batches;
DROP POLICY IF EXISTS "Autenticados atualizam lotes de fotos"
  ON public.property_image_batches;
CREATE POLICY "Lotes de fotos por autor ou administracao"
  ON public.property_image_batches FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Criar lote de fotos para si"
  ON public.property_image_batches FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
      public.has_role(auth.uid(), 'corretor'::public.app_role)
    )
  );

-- A política efetiva de properties inclui corretores desde 28/08. Mantém
-- a galeria com a mesma autorização após a restrição da migração anterior.
DROP POLICY IF EXISTS "property_images_insert" ON public.property_images;
DROP POLICY IF EXISTS "property_images_update" ON public.property_images;
DROP POLICY IF EXISTS "property_images_delete" ON public.property_images;
CREATE POLICY "property_images_insert" ON public.property_images
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
    public.has_role(auth.uid(), 'corretor'::public.app_role));
CREATE POLICY "property_images_update" ON public.property_images
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
    public.has_role(auth.uid(), 'corretor'::public.app_role))
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
    public.has_role(auth.uid(), 'corretor'::public.app_role));
CREATE POLICY "property_images_delete" ON public.property_images
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'secretaria'::public.app_role) OR
    public.has_role(auth.uid(), 'corretor'::public.app_role));