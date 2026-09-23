CREATE OR REPLACE FUNCTION public.property_sync_claim_jobs(_worker text, _limit integer DEFAULT 5, _lease_seconds integer DEFAULT 120, _actions text[] DEFAULT NULL::text[])
 RETURNS SETOF property_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('property_sync_claim'));
  PERFORM public.property_sync_reclaim_stale();

  WITH newest AS (
    SELECT DISTINCT ON (property_id, provider)
           id, property_id, provider, requested_revision
      FROM public.property_sync_jobs
     WHERE status IN ('pending','retry') AND action = 'update'
     ORDER BY property_id, provider, requested_revision DESC NULLS LAST, created_at DESC
  ), old AS (
    SELECT j.id, j.changed_fields, n.id AS new_id
      FROM public.property_sync_jobs j
      JOIN newest n ON n.property_id = j.property_id AND n.provider = j.provider AND n.id <> j.id
     WHERE j.action = 'update' AND j.superseded_by IS NULL
       AND j.status IN ('pending','retry','failed')
       AND COALESCE(j.requested_revision, 0) <= COALESCE(n.requested_revision, 0)
  ), merged AS (
    UPDATE public.property_sync_jobs t
       SET changed_fields = CASE
         WHEN t.changed_fields IS NULL OR EXISTS (
           SELECT 1 FROM old o WHERE o.new_id = t.id AND o.changed_fields IS NULL
         ) THEN NULL
         ELSE COALESCE((
           SELECT array_agg(DISTINCT f ORDER BY f)
             FROM (
               SELECT unnest(t.changed_fields) AS f
               UNION
               SELECT unnest(o.changed_fields) AS f FROM old o WHERE o.new_id = t.id
             ) AS all_fields
            WHERE f IS NOT NULL AND f <> ''
         ), '{}'::text[])
       END
     WHERE t.id IN (SELECT new_id FROM old)
     RETURNING t.id
  )
  UPDATE public.property_sync_jobs j
     SET status = CASE WHEN j.status = 'failed' THEN j.status ELSE 'cancelled' END,
         superseded_by = o.new_id,
         last_error_message = 'Absorvido por versão mais nova do imóvel.',
         finished_at = COALESCE(j.finished_at, now())
    FROM old o
   WHERE j.id = o.id;

  RETURN QUERY
  WITH candidates AS (
    SELECT DISTINCT ON (j.property_id, j.provider, (j.action = 'media_sync'))
           j.id, j.next_run_at, j.created_at
      FROM public.property_sync_jobs j
     WHERE j.status IN ('pending','retry') AND j.next_run_at <= now()
       AND (_actions IS NULL OR j.action::text = ANY(_actions))
       AND NOT EXISTS (
         SELECT 1 FROM public.property_sync_jobs r
          WHERE r.status = 'processing' AND r.property_id = j.property_id
            AND r.provider = j.provider
            AND (r.action = 'media_sync') = (j.action = 'media_sync')
       )
       AND (j.action <> 'media_sync' OR EXISTS (
         SELECT 1 FROM public.property_provider_publications p
          WHERE p.property_id = j.property_id AND p.provider = j.provider
            AND p.enabled AND p.desired_availability = 'visible'
            AND p.external_property_id IS NOT NULL
       ))
       AND (j.action <> 'media_sync' OR NOT EXISTS (
         SELECT 1 FROM public.property_sync_jobs c
          WHERE c.property_id = j.property_id AND c.provider = j.provider
            AND (
              (c.action IN ('unpublish','delete') AND c.status IN ('pending','retry','processing'))
              -- Cadastro e galeria são independentes: só espera a gravação em curso.
              OR (c.action = 'publish' AND c.status = 'processing')
            )
       ))
     ORDER BY j.property_id, j.provider, (j.action = 'media_sync'),
              j.next_run_at, j.created_at, j.id
  ), claimed AS (
    SELECT c.id FROM candidates c
     ORDER BY c.next_run_at, c.created_at, c.id
     LIMIT LEAST(10, GREATEST(1, _limit))
  )
  UPDATE public.property_sync_jobs j
     SET status = 'processing', attempts = j.attempts + 1,
         locked_at = now(),
         lock_expires_at = now() + make_interval(secs => GREATEST(30, _lease_seconds)),
         locked_by = _worker, lease_token = gen_random_uuid()
    FROM claimed c WHERE j.id = c.id
  RETURNING j.*;
END $function$;