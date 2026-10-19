-- lovable-cron-fallback-reviewed: time-based retention of pg_cron history backlog in small batches; replaces unbounded growth
CREATE OR REPLACE FUNCTION public.cron_history_prune(p_batch integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
SET statement_timeout = '5s'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM cron.job_run_details
   WHERE runid IN (
     SELECT runid FROM cron.job_run_details
      WHERE end_time < now() - interval '3 days'
      ORDER BY runid
      LIMIT GREATEST(1, LEAST(p_batch, 5000)));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.cron_history_prune(integer) FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS property_images_recovery_idx
  ON public.property_images (updated_at, id)
  WHERE NOT COALESCE(pending_remote_delete, false)
    AND desired_destination_hash IS NOT NULL
    AND (processing_status IN ('pending','processing','failed_retryable')
         OR (processing_status IN ('ready','legacy') AND destination_hash IS DISTINCT FROM desired_destination_hash));

CREATE INDEX IF NOT EXISTS property_image_jobs_image_hash_active_idx
  ON public.property_image_jobs (image_id, destination_hash)
  WHERE status IN ('pending','processing','retry');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-history-prune') THEN
    PERFORM cron.schedule('cron-history-prune', '*/10 * * * *', 'SELECT public.cron_history_prune(5000)');
  END IF;
  PERFORM cron.alter_job(482, schedule := '1-59/2 * * * *');
  PERFORM cron.alter_job(350, schedule := '*/3 * * * *');
  PERFORM cron.alter_job(358, schedule := '2-59/5 * * * *');
  PERFORM cron.alter_job(333, schedule := '1-59/3 * * * *');
  PERFORM cron.alter_job(556, schedule := '*/2 * * * *');
  PERFORM cron.alter_job(470, schedule := '1-59/2 * * * *');
  PERFORM cron.alter_job(103, schedule := '3-59/5 * * * *');
  PERFORM cron.alter_job(621, schedule := '4-59/5 * * * *');
  PERFORM cron.alter_job(446, schedule := '7-59/10 * * * *');
END $$;