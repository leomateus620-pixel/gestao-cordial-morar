CREATE OR REPLACE FUNCTION public.property_drive_claim_jobs(_worker text, _limit integer DEFAULT 2, _lease_seconds integer DEFAULT 240)
 RETURNS SETOF property_drive_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Lease vencido sem tentativas restantes: encerra como falha (sem loop).
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
    -- Arquivo que estava subindo num job morto recomeça do zero.
    UPDATE public.property_drive_files f
       SET sync_status = 'pending', resumable_session_url = NULL,
           resumable_offset = NULL, resumable_expires_at = NULL
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

CREATE OR REPLACE FUNCTION public.property_drive_rename_on_codes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.codigo_cordial IS DISTINCT FROM OLD.codigo_cordial OR NEW.codigo_morar IS DISTINCT FROM OLD.codigo_morar)
     AND EXISTS (SELECT 1 FROM public.property_drive_folders f WHERE f.property_id = NEW.id AND f.property_folder_id IS NOT NULL)
     -- Pasta compartilhada com outro imóvel nunca é renomeada automaticamente.
     AND NOT EXISTS (
       SELECT 1 FROM public.property_drive_folders f
         JOIN public.property_drive_folders o
           ON o.property_folder_id = f.property_folder_id AND o.property_id <> f.property_id
        WHERE f.property_id = NEW.id)
     AND NOT EXISTS (SELECT 1 FROM public.property_drive_jobs j WHERE j.property_id = NEW.id AND j.status IN ('pending','processing','retry')) THEN
    BEGIN
      INSERT INTO public.property_drive_jobs (property_id) VALUES (NEW.id)
      ON CONFLICT (property_id) WHERE status IN ('pending','processing','retry') DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END $function$;