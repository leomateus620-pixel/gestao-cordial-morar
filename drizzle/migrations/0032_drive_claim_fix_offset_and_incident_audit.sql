CREATE OR REPLACE FUNCTION public.property_drive_claim_jobs(_worker text, _limit integer DEFAULT 2, _lease_seconds integer DEFAULT 240)
 RETURNS SETOF property_drive_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.property_drive_jobs
     SET status = 'failed', lease_expires_at = NULL,
         last_error_code = 'max_attempts',
         last_error_message = 'Execução interrompida e tentativas esgotadas.'
   WHERE status = 'processing'
     AND (lease_expires_at IS NULL OR lease_expires_at < now())
     AND attempts >= max_attempts;

  RETURN QUERY
  WITH picked AS (
    SELECT id, property_id, status AS old_status FROM public.property_drive_jobs
     WHERE ((status IN ('pending', 'retry')
             AND run_after <= now()
             AND (lease_expires_at IS NULL OR lease_expires_at < now()))
         OR (status = 'processing'
             AND (lease_expires_at IS NULL OR lease_expires_at < now())
             AND attempts < max_attempts))
     ORDER BY run_after ASC
     LIMIT GREATEST(1, LEAST(_limit, 5))
     FOR UPDATE SKIP LOCKED
  ), reset_files AS (
    -- resumable_offset é NOT NULL (padrão 0): recomeça do zero sem violar a coluna.
    UPDATE public.property_drive_files f
       SET sync_status = 'pending', resumable_session_url = NULL,
           resumable_offset = 0, resumable_expires_at = NULL
      FROM picked
     WHERE picked.old_status = 'processing'
       AND f.property_id = picked.property_id
       AND f.sync_status = 'uploading'
    RETURNING f.id
  )
  UPDATE public.property_drive_jobs j
     SET status = 'processing',
         attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = _worker,
         lease_expires_at = now() + make_interval(secs => GREATEST(60, _lease_seconds))
    FROM picked
   WHERE j.id = picked.id
     AND (SELECT count(*) FROM reset_files) >= 0
  RETURNING j.*;
END $function$;
REVOKE ALL ON FUNCTION public.property_drive_claim_jobs(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_drive_claim_jobs(text, integer, integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.property_incident_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  revert_hint text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.property_incident_audit TO service_role;
GRANT SELECT ON public.property_incident_audit TO authenticated;
ALTER TABLE public.property_incident_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read incident audit" ON public.property_incident_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));