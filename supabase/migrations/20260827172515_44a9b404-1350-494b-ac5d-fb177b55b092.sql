ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS original_storage_path text,
  ADD COLUMN IF NOT EXISTS processed_storage_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path text,
  ADD COLUMN IF NOT EXISTS original_checksum text,
  ADD COLUMN IF NOT EXISTS processed_checksum text,
  ADD COLUMN IF NOT EXISTS watermark_variant text,
  ADD COLUMN IF NOT EXISTS watermark_version text,
  ADD COLUMN IF NOT EXISTS destination_hash text,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_error_code text,
  ADD COLUMN IF NOT EXISTS processing_error_message text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

UPDATE public.property_images
   SET original_storage_path = COALESCE(original_storage_path, storage_path),
       original_checksum = COALESCE(original_checksum, content_hash),
       processing_status = 'legacy'
 WHERE processing_status = 'pending' AND processed_storage_path IS NULL;

CREATE INDEX IF NOT EXISTS property_images_processing_status_idx
  ON public.property_images (processing_status);

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS publish_targets text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.property_image_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES public.property_images(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  watermark_variant text NOT NULL,
  watermark_version text NOT NULL,
  destination_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.property_image_jobs TO service_role;
ALTER TABLE public.property_image_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins acompanham a fila de fotos"
  ON public.property_image_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS property_image_jobs_active_idx
  ON public.property_image_jobs (image_id, destination_hash)
  WHERE status IN ('pending', 'processing', 'retry');

CREATE INDEX IF NOT EXISTS property_image_jobs_claim_idx
  ON public.property_image_jobs (status, run_after);

DROP TRIGGER IF EXISTS property_image_jobs_touch ON public.property_image_jobs;
CREATE TRIGGER property_image_jobs_touch
  BEFORE UPDATE ON public.property_image_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.property_image_claim_jobs(_worker text, _limit integer DEFAULT 4, _lease_seconds integer DEFAULT 120)
RETURNS SETOF public.property_image_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT id FROM public.property_image_jobs
     WHERE status IN ('pending', 'retry')
       AND run_after <= now()
       AND (lease_expires_at IS NULL OR lease_expires_at < now())
     ORDER BY run_after ASC
     LIMIT GREATEST(1, LEAST(_limit, 10))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.property_image_jobs j
     SET status = 'processing',
         attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = _worker,
         lease_expires_at = now() + make_interval(secs => GREATEST(30, _lease_seconds))
    FROM picked
   WHERE j.id = picked.id
  RETURNING j.*;
$$;

REVOKE ALL ON FUNCTION public.property_image_claim_jobs(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_image_claim_jobs(text, integer, integer) TO service_role;