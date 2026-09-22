-- A variante desejada pertence à intenção durável da foto. A versão v2 deve
-- avançar aqui junto com WATERMARK_VERSION quando o template mudar.
ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS desired_destination_hash text;

CREATE OR REPLACE FUNCTION public.property_expected_watermark_hash(_targets text[])
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN 'cordial' = ANY(COALESCE(_targets, '{}'::text[]))
     AND NOT ('morar' = ANY(COALESCE(_targets, '{}'::text[]))) THEN 'cordial@v2'
    WHEN 'morar' = ANY(COALESCE(_targets, '{}'::text[]))
     AND NOT ('cordial' = ANY(COALESCE(_targets, '{}'::text[]))) THEN 'morar@v2'
    ELSE 'morar-cordial@v2'
  END;
$$;

-- Não enfileira toda a base no deploy. O scanner seleciona um lote pequeno
-- por execução e a fila de imagem tem seu próprio limite de trabalho.
UPDATE public.property_images i
   SET desired_destination_hash = public.property_expected_watermark_hash(p.publish_targets)
  FROM public.properties p
 WHERE p.id = i.property_id AND NOT COALESCE(i.pending_remote_delete, false)
   AND i.desired_destination_hash IS DISTINCT FROM
       public.property_expected_watermark_hash(p.publish_targets);

CREATE OR REPLACE FUNCTION public.property_image_set_desired_watermark()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _targets text[];
BEGIN
  SELECT publish_targets INTO _targets FROM public.properties WHERE id = NEW.property_id;
  NEW.desired_destination_hash := public.property_expected_watermark_hash(_targets);
  IF NOT COALESCE(NEW.pending_remote_delete, false)
     AND NEW.destination_hash IS DISTINCT FROM NEW.desired_destination_hash THEN
    NEW.processing_status := 'pending';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS property_image_desired_watermark_on_insert ON public.property_images;
CREATE TRIGGER property_image_desired_watermark_on_insert
  BEFORE INSERT ON public.property_images FOR EACH ROW
  EXECUTE FUNCTION public.property_image_set_desired_watermark();

CREATE OR REPLACE FUNCTION public.property_targets_mark_images_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _hash text := public.property_expected_watermark_hash(NEW.publish_targets);
BEGIN
  IF NEW.publish_targets IS NOT DISTINCT FROM OLD.publish_targets THEN RETURN NEW; END IF;
  UPDATE public.property_images i
     SET desired_destination_hash = _hash,
         processing_status = CASE
           WHEN i.destination_hash IS DISTINCT FROM _hash THEN 'pending'
           WHEN i.processed_storage_path IS NOT NULL THEN 'ready'
           ELSE i.processing_status END,
         processing_error_code = NULL,
         processing_error_message = NULL
   WHERE i.property_id = NEW.id AND NOT COALESCE(i.pending_remote_delete, false)
     AND i.desired_destination_hash IS DISTINCT FROM _hash;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS property_targets_mark_images_pending ON public.properties;
CREATE TRIGGER property_targets_mark_images_pending
  AFTER UPDATE OF publish_targets ON public.properties FOR EACH ROW
  EXECUTE FUNCTION public.property_targets_mark_images_pending();

-- Filtro no banco, inclusive para não deixar os primeiros 60 registros com
-- jobs ativos esconderem fotos mais novas que perderam o enfileiramento.
CREATE OR REPLACE FUNCTION public.property_image_recovery_candidates(_limit integer DEFAULT 60)
RETURNS TABLE(id uuid, property_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.property_id
    FROM public.property_images i
   WHERE NOT COALESCE(i.pending_remote_delete, false)
     AND i.desired_destination_hash IS NOT NULL
     AND i.updated_at < now() - interval '2 minutes'
     AND (
       i.processing_status IN ('pending', 'processing', 'failed_retryable')
       OR (i.processing_status IN ('ready', 'legacy')
           AND i.destination_hash IS DISTINCT FROM i.desired_destination_hash)
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.property_image_jobs j
        WHERE j.image_id = i.id AND j.destination_hash = i.desired_destination_hash
          AND j.status IN ('pending', 'processing', 'retry')
     )
   ORDER BY i.updated_at, i.id
   LIMIT GREATEST(1, LEAST(_limit, 60));
$$;

CREATE OR REPLACE FUNCTION public.property_image_renew_lease(
  _job_id uuid, _worker text, _lease_seconds integer DEFAULT 180
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated integer;
BEGIN
  UPDATE public.property_image_jobs j
     SET lease_expires_at = now() + make_interval(secs => GREATEST(30, LEAST(_lease_seconds, 300)))
    FROM public.property_images i
   WHERE j.id = _job_id AND j.locked_by = _worker AND j.status = 'processing'
     AND j.lease_expires_at > now() AND i.id = j.image_id
     AND NOT COALESCE(i.pending_remote_delete, false)
     AND i.desired_destination_hash = j.destination_hash;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated = 1;
END $$;

CREATE OR REPLACE FUNCTION public.property_image_complete_job(
  _job_id uuid, _worker text, _result jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _job public.property_image_jobs; _image public.property_images;
BEGIN
  SELECT * INTO _job FROM public.property_image_jobs
   WHERE id = _job_id AND locked_by = _worker AND status = 'processing'
     AND lease_expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _image FROM public.property_images
   WHERE id = _job.image_id AND property_id = _job.property_id FOR UPDATE;
  IF NOT FOUND OR COALESCE(_image.pending_remote_delete, false)
     OR _image.desired_destination_hash IS DISTINCT FROM _job.destination_hash THEN
    UPDATE public.property_image_jobs SET status = 'cancelled', lease_expires_at = NULL,
           locked_by = NULL, last_error_code = 'image_or_destination_changed'
     WHERE id = _job_id;
    RETURN false;
  END IF;

  UPDATE public.property_images SET
    original_storage_path = _result->>'original_storage_path',
    processed_storage_path = _result->>'processed_storage_path',
    thumbnail_storage_path = _result->>'thumbnail_storage_path',
    processed_checksum = _result->>'processed_checksum',
    watermark_variant = _job.watermark_variant,
    watermark_version = _job.watermark_version,
    destination_hash = _job.destination_hash,
    processing_status = 'ready',
    processing_error_code = NULL,
    processing_error_message = NULL,
    processed_at = now(), processing_finished_at = now(),
    width = NULLIF(_result->>'width','')::integer,
    height = NULLIF(_result->>'height','')::integer
   WHERE id = _job.image_id;
  UPDATE public.property_image_jobs SET status = 'succeeded', lease_expires_at = NULL,
    locked_by = NULL, last_error_code = NULL, last_error_message = NULL
   WHERE id = _job_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.property_image_fail_job(
  _job_id uuid, _worker text, _failure jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _job public.property_image_jobs; _image public.property_images; _terminal boolean;
BEGIN
  SELECT * INTO _job FROM public.property_image_jobs
   WHERE id = _job_id AND locked_by = _worker AND status = 'processing'
     AND lease_expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _image FROM public.property_images WHERE id = _job.image_id FOR UPDATE;
  IF NOT FOUND OR COALESCE(_image.pending_remote_delete, false)
     OR _image.desired_destination_hash IS DISTINCT FROM _job.destination_hash THEN
    UPDATE public.property_image_jobs SET status = 'cancelled', lease_expires_at = NULL,
           locked_by = NULL, last_error_code = 'image_or_destination_changed'
     WHERE id = _job_id;
    RETURN false;
  END IF;
  _terminal := COALESCE((_failure->>'terminal')::boolean, false);
  UPDATE public.property_image_jobs
     SET status = CASE WHEN _terminal THEN 'failed' ELSE 'retry' END,
         run_after = COALESCE((_failure->>'run_after')::timestamptz, now() + interval '5 minutes'),
         lease_expires_at = NULL, locked_by = NULL,
         last_error_code = left(COALESCE(_failure->>'code', 'unexpected'), 80),
         last_error_message = left(COALESCE(_failure->>'message', 'Falha no processamento.'), 400)
   WHERE id = _job_id;
  UPDATE public.property_images
     SET processing_status = CASE WHEN _terminal THEN 'failed_permanent' ELSE 'failed_retryable' END,
         processing_error_code = left(COALESCE(_failure->>'code', 'unexpected'), 80),
         processing_error_message = left(COALESCE(_failure->>'message', 'Falha no processamento.'), 400),
         processing_finished_at = now()
   WHERE id = _job.image_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.property_expected_watermark_hash(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_image_set_desired_watermark() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_targets_mark_images_pending() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_image_recovery_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_image_recovery_candidates(integer) TO service_role;
