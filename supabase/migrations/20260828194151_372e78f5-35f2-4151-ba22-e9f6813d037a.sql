DROP INDEX IF EXISTS public.property_image_jobs_active_idx;

CREATE UNIQUE INDEX property_image_jobs_image_destination_uidx
  ON public.property_image_jobs (image_id, destination_hash);

INSERT INTO public.property_image_jobs (
  image_id,
  property_id,
  watermark_variant,
  watermark_version,
  destination_hash,
  status,
  attempts,
  max_attempts,
  run_after,
  lease_expires_at,
  locked_at,
  locked_by,
  last_error_code,
  last_error_message,
  correlation_id
)
SELECT
  i.id,
  i.property_id,
  'morar-cordial',
  'v1',
  'morar-cordial@v1',
  'pending',
  0,
  5,
  now(),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  gen_random_uuid()::text
FROM public.property_images i
WHERE i.processing_status IN ('pending', 'processing', 'failed_retryable', 'failed_permanent', 'failed')
ON CONFLICT (image_id, destination_hash) DO UPDATE
SET status = 'pending',
    attempts = 0,
    max_attempts = 5,
    run_after = now(),
    lease_expires_at = NULL,
    locked_at = NULL,
    locked_by = NULL,
    last_error_code = NULL,
    last_error_message = NULL,
    correlation_id = gen_random_uuid()::text;

UPDATE public.property_images
SET processing_status = 'pending',
    destination_hash = NULL,
    processing_error_code = NULL,
    processing_error_message = NULL,
    processing_started_at = NULL,
    processing_finished_at = NULL
WHERE processing_status IN ('pending', 'processing', 'failed_retryable', 'failed_permanent', 'failed');