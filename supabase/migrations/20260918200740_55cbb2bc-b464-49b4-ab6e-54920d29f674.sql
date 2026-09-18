-- lovable-cron-fallback-reviewed: 288 runs/day; rede de segurança para leases expirados na fila de publicação de imóveis — sem ela, um worker interrompido deixa jobs presos em "processing" indefinidamente (incidente 18/09).
CREATE OR REPLACE FUNCTION public.property_sync_reclaim_stale()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.property_sync_jobs
     SET status = 'retry',
         locked_at = NULL,
         lock_expires_at = NULL,
         locked_by = NULL,
         next_run_at = LEAST(next_run_at, now()),
         last_error_category = COALESCE(last_error_category, 'lease_expired'),
         last_error_message = COALESCE(last_error_message, 'Execução interrompida: reserva expirada, devolvido para a fila.')
   WHERE status = 'processing'
     AND lock_expires_at IS NOT NULL
     AND lock_expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.property_sync_reclaim_stale() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.property_sync_reclaim_stale() FROM anon;
REVOKE ALL ON FUNCTION public.property_sync_reclaim_stale() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_reclaim_stale() TO service_role;

DROP FUNCTION IF EXISTS public.property_sync_claim_jobs(text, integer, integer);

CREATE OR REPLACE FUNCTION public.property_sync_claim_jobs(
  _worker text,
  _limit integer DEFAULT 5,
  _lease_seconds integer DEFAULT 120,
  _actions text[] DEFAULT NULL
)
RETURNS SETOF property_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.property_sync_reclaim_stale();

  RETURN QUERY
  WITH claimed AS (
    SELECT j.id
      FROM public.property_sync_jobs j
     WHERE j.status IN ('pending','retry')
       AND j.next_run_at <= now()
       AND (_actions IS NULL OR j.action::text = ANY(_actions))
     ORDER BY j.next_run_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(1, _limit)
  )
  UPDATE public.property_sync_jobs j
     SET status = 'processing',
         attempts = j.attempts + 1,
         locked_at = now(),
         lock_expires_at = now() + make_interval(secs => GREATEST(30, _lease_seconds)),
         locked_by = _worker
    FROM claimed c
   WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.property_sync_claim_jobs(text, integer, integer, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.property_sync_claim_jobs(text, integer, integer, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.property_sync_claim_jobs(text, integer, integer, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_claim_jobs(text, integer, integer, text[]) TO service_role;

SELECT cron.schedule(
  'property-sync-reclaim-stale',
  '*/5 * * * *',
  $cron$SELECT public.property_sync_reclaim_stale();$cron$
);
