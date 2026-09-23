-- Image processing must not be confirmed by a worker whose lease has expired.
-- These RPCs update the image and its job under the same row lock.
CREATE OR REPLACE FUNCTION public.property_image_renew_lease(
  _job_id uuid, _worker text, _lease_seconds integer DEFAULT 180
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated integer;
BEGIN
  UPDATE public.property_image_jobs
     SET lease_expires_at = now() + make_interval(secs => GREATEST(30, LEAST(_lease_seconds, 300)))
   WHERE id = _job_id AND locked_by = _worker AND status = 'processing'
     AND lease_expires_at > now();
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
     OR (_image.destination_hash IS NOT NULL AND _image.destination_hash <> _job.destination_hash) THEN
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
DECLARE _job public.property_image_jobs; _terminal boolean;
BEGIN
  SELECT * INTO _job FROM public.property_image_jobs
   WHERE id = _job_id AND locked_by = _worker AND status = 'processing'
     AND lease_expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
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
   WHERE id = _job.image_id
     AND NOT COALESCE(pending_remote_delete, false)
     AND (destination_hash IS NULL OR destination_hash = _job.destination_hash);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.property_image_renew_lease(uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_image_complete_job(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_image_fail_job(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_image_renew_lease(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.property_image_complete_job(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.property_image_fail_job(uuid,text,jsonb) TO service_role;
