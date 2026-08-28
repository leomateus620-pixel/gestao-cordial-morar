ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_finished_at timestamptz;

CREATE INDEX IF NOT EXISTS property_image_jobs_status_run_after_idx
  ON public.property_image_jobs (status, run_after);

ALTER TABLE public.property_drive_files
  ADD COLUMN IF NOT EXISTS resumable_session_url text,
  ADD COLUMN IF NOT EXISTS resumable_offset bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resumable_expires_at timestamptz;

ALTER TABLE public.property_drive_jobs
  ADD COLUMN IF NOT EXISTS cursor jsonb;

CREATE OR REPLACE FUNCTION public.property_image_reclaim_stale(_max integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  WITH stale AS (
    SELECT id FROM public.property_image_jobs
    WHERE status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at < now()
    ORDER BY lease_expires_at
    LIMIT _max
  )
  UPDATE public.property_image_jobs j
     SET status = CASE WHEN j.attempts >= j.max_attempts THEN 'failed' ELSE 'retry' END,
         lease_expires_at = NULL,
         locked_by = NULL,
         run_after = now(),
         last_error_code = 'lease_expired'
    FROM stale
   WHERE j.id = stale.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.property_image_reclaim_stale(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.property_image_reclaim_stale(integer) TO service_role;