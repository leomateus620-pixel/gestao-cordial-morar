ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS client_intent_key text;
CREATE UNIQUE INDEX IF NOT EXISTS properties_client_intent_key_uidx
  ON public.properties (created_by, client_intent_key)
  WHERE client_intent_key IS NOT NULL;

ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS commercial_reference text;

ALTER TABLE public.property_sync_jobs ADD COLUMN IF NOT EXISTS lease_token uuid;

CREATE OR REPLACE FUNCTION public.property_sync_claim_jobs(_worker text, _limit integer DEFAULT 5, _lease_seconds integer DEFAULT 120, _actions text[] DEFAULT NULL::text[])
 RETURNS SETOF public.property_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         locked_by = _worker,
         lease_token = gen_random_uuid()
    FROM claimed c
   WHERE j.id = c.id
  RETURNING j.*;
END;
$function$;

-- Conclui o trabalho apenas se a posse ainda for desta execução.
CREATE OR REPLACE FUNCTION public.property_sync_finish_job(_job_id uuid, _lease_token uuid, _fields jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cols text;
  updated integer;
BEGIN
  SELECT string_agg(quote_ident(k), ', ')
    INTO cols
    FROM jsonb_object_keys(_fields) AS k
   WHERE EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'property_sync_jobs'
        AND c.column_name = k AND c.column_name NOT IN ('id','property_id','provider','action','lease_token')
   );

  IF cols IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'UPDATE public.property_sync_jobs j SET (%s, updated_at, lease_token) = (SELECT %s, now(), NULL FROM jsonb_populate_record(NULL::public.property_sync_jobs, $1)) WHERE j.id = $2 AND j.lease_token = $3',
    cols, cols
  ) USING _fields, _job_id, _lease_token;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.property_sync_renew_lease(_job_id uuid, _lease_token uuid, _seconds integer DEFAULT 120)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated integer;
BEGIN
  UPDATE public.property_sync_jobs
     SET lock_expires_at = now() + make_interval(secs => GREATEST(30, _seconds)),
         updated_at = now()
   WHERE id = _job_id AND lease_token = _lease_token AND status = 'processing';
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$function$;

-- Salva os dados, incrementa a revisão e registra os envios em uma única transação.
CREATE OR REPLACE FUNCTION public.property_save_revision_enqueue(
  _property_id uuid,
  _expected_revision integer,
  _payload jsonb,
  _targets text[],
  _requested_by uuid,
  _action text DEFAULT 'update'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_revision integer;
  next_revision integer;
  cols text;
  target text;
BEGIN
  SELECT revision INTO current_revision
    FROM public.properties
   WHERE id = _property_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'conflict', false, 'notFound', true);
  END IF;

  current_revision := COALESCE(current_revision, 1);

  IF _expected_revision IS NOT NULL AND _expected_revision <> current_revision THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'revision', current_revision);
  END IF;

  next_revision := current_revision + 1;

  SELECT string_agg(quote_ident(k), ', ')
    INTO cols
    FROM jsonb_object_keys(_payload) AS k
   WHERE EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'properties'
        AND c.column_name = k AND c.column_name NOT IN ('id','created_by','created_at','revision')
   );

  IF cols IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.properties p SET (%s, revision, updated_at) = (SELECT %s, $3, now() FROM jsonb_populate_record(NULL::public.properties, $1)) WHERE p.id = $2',
      cols, cols
    ) USING _payload, _property_id, next_revision;
  ELSE
    UPDATE public.properties SET revision = next_revision, updated_at = now() WHERE id = _property_id;
  END IF;

  IF _targets IS NOT NULL THEN
    FOREACH target IN ARRAY _targets LOOP
      INSERT INTO public.property_sync_jobs
        (property_id, provider, action, requested_revision, requested_by, status, next_run_at)
      VALUES
        (_property_id, target::public.imobi_provider, _action::public.property_sync_action,
         next_revision, _requested_by, 'pending', now())
      ON CONFLICT (property_id, provider, action, requested_revision)
      DO UPDATE SET status = 'pending', next_run_at = now(), updated_at = now();

      UPDATE public.property_provider_publications
         SET status = 'pending', updated_at = now()
       WHERE property_id = _property_id AND provider = target::public.imobi_provider;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'revision', next_revision);
END;
$function$;

REVOKE ALL ON FUNCTION public.property_sync_finish_job(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_sync_renew_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_save_revision_enqueue(uuid, integer, jsonb, text[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_finish_job(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.property_sync_renew_lease(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.property_save_revision_enqueue(uuid, integer, jsonb, text[], uuid, text) TO service_role;