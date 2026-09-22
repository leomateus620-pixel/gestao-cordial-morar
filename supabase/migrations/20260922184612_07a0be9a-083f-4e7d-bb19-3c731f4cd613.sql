ALTER TABLE public.property_sync_jobs ADD COLUMN IF NOT EXISTS checkpoint jsonb;
ALTER TABLE public.property_sync_jobs ADD COLUMN IF NOT EXISTS superseded_by uuid;

-- Um job em execução por imóvel, site e tipo (cadastro x fotos).
CREATE UNIQUE INDEX IF NOT EXISTS property_sync_jobs_one_running_uidx
  ON public.property_sync_jobs (property_id, provider, (action = 'media_sync'))
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.property_sync_claim_jobs(_worker text, _limit integer DEFAULT 5, _lease_seconds integer DEFAULT 120, _actions text[] DEFAULT NULL::text[])
 RETURNS SETOF public.property_sync_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Serializa as reservas: evita que duas execuções peguem o mesmo imóvel/site.
  PERFORM pg_advisory_xact_lock(hashtext('property_sync_claim'));
  PERFORM public.property_sync_reclaim_stale();

  -- Absorve jobs cadastrais antigos no mais novo do mesmo imóvel/site:
  -- campos não entregues (inclusive de jobs que falharam) seguem no novo.
  WITH newest AS (
    SELECT DISTINCT ON (property_id, provider) id, property_id, provider, requested_revision
      FROM public.property_sync_jobs
     WHERE status IN ('pending','retry') AND action::text = 'update'
     ORDER BY property_id, provider, requested_revision DESC NULLS LAST, created_at DESC
  ), old AS (
    SELECT j.id, j.changed_fields, n.id AS new_id
      FROM public.property_sync_jobs j
      JOIN newest n ON n.property_id = j.property_id AND n.provider = j.provider AND n.id <> j.id
     WHERE j.action::text = 'update'
       AND (j.status IN ('pending','retry')
            OR (j.status = 'failed' AND j.superseded_by IS NULL AND j.created_at > now() - interval '7 days'))
       AND coalesce(j.requested_revision, 0) <= coalesce(n.requested_revision, 0)
  ), merged AS (
    UPDATE public.property_sync_jobs t
       SET changed_fields = (
             SELECT array_agg(DISTINCT f) FROM unnest(coalesce(t.changed_fields,'{}') || coalesce(
               (SELECT array_agg(DISTINCT x) FROM old o, unnest(coalesce(o.changed_fields,'{}')) x WHERE o.new_id = t.id), '{}')) f)
     WHERE t.id IN (SELECT new_id FROM old)
     RETURNING t.id
  )
  UPDATE public.property_sync_jobs j
     SET status = CASE WHEN j.status = 'failed' THEN j.status ELSE 'cancelled' END,
         superseded_by = o.new_id,
         last_error_message = 'Absorvido por versão mais nova do imóvel.',
         finished_at = coalesce(j.finished_at, now())
    FROM old o
   WHERE j.id = o.id;

  RETURN QUERY
  WITH candidates AS (
    SELECT DISTINCT ON (j.property_id, j.provider, (j.action::text = 'media_sync')) j.id, j.next_run_at
      FROM public.property_sync_jobs j
     WHERE j.status IN ('pending','retry')
       AND j.next_run_at <= now()
       AND (_actions IS NULL OR j.action::text = ANY(_actions))
       AND NOT EXISTS (
         SELECT 1 FROM public.property_sync_jobs r
          WHERE r.status = 'processing'
            AND r.property_id = j.property_id AND r.provider = j.provider
            AND (r.action::text = 'media_sync') = (j.action::text = 'media_sync'))
     ORDER BY j.property_id, j.provider, (j.action::text = 'media_sync'), j.next_run_at
  ), claimed AS (
    SELECT c.id FROM candidates c ORDER BY c.next_run_at LIMIT GREATEST(1, _limit)
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

-- Importação numa só transação: patch + revisão + conflitos + publicação.
CREATE OR REPLACE FUNCTION public.property_remote_merge(
  _property_id uuid,
  _expected_revision integer,
  _patch jsonb,
  _publication_id uuid,
  _publication_fields jsonb,
  _conflicts jsonb
) RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cols text;
  sets text;
  new_rev integer;
  c jsonb;
  pub_sets text;
  pending_total integer;
BEGIN
  SELECT string_agg(quote_ident(k), ', '), string_agg(format('%I = r.%I', k, k), ', ')
    INTO cols, sets
    FROM jsonb_object_keys(coalesce(_patch, '{}'::jsonb)) k
   WHERE k NOT IN ('id','revision','codigo','referencia','created_at','created_by')
     AND EXISTS (SELECT 1 FROM information_schema.columns ic
                  WHERE ic.table_schema='public' AND ic.table_name='properties' AND ic.column_name=k);

  IF sets IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.properties p SET %s, revision = p.revision + 1
         FROM jsonb_populate_record(NULL::public.properties, $1) r
        WHERE p.id = $2 AND ($3 IS NULL OR p.revision = $3)
        RETURNING p.revision', sets)
      INTO new_rev USING _patch, _property_id, _expected_revision;
    IF new_rev IS NULL THEN
      RAISE EXCEPTION 'revision_changed' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(_conflicts, '[]'::jsonb)) LOOP
    UPDATE public.property_field_conflicts f
       SET confirmed_value = c->'confirmed_value', local_value = c->'local_value',
           remote_value = c->'remote_value', applied_value = c->'applied_value',
           classification = c->>'classification', detected_revision = coalesce(new_rev, _expected_revision),
           publication_id = _publication_id, updated_at = now()
     WHERE f.property_id = _property_id AND f.provider::text = c->>'provider'
       AND f.field = c->>'field' AND f.scope = c->>'scope' AND f.resolution = 'pending';
    IF NOT FOUND THEN
      INSERT INTO public.property_field_conflicts
        (property_id, provider, publication_id, field, scope, classification, resolution,
         confirmed_value, local_value, remote_value, applied_value, detected_revision)
      VALUES (_property_id, (c->>'provider')::imobi_provider, _publication_id, c->>'field', c->>'scope',
              c->>'classification', 'pending', c->'confirmed_value', c->'local_value',
              c->'remote_value', c->'applied_value', coalesce(new_rev, _expected_revision));
    END IF;
  END LOOP;

  SELECT count(*) INTO pending_total FROM public.property_field_conflicts
   WHERE property_id = _property_id AND publication_id = _publication_id AND resolution = 'pending';

  SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO pub_sets
    FROM jsonb_object_keys(coalesce(_publication_fields, '{}'::jsonb)) k
   WHERE k NOT IN ('id','property_id','provider','conflict_count')
     AND EXISTS (SELECT 1 FROM information_schema.columns ic
                  WHERE ic.table_schema='public' AND ic.table_name='property_provider_publications' AND ic.column_name=k);
  EXECUTE format(
    'UPDATE public.property_provider_publications p SET %s conflict_count = $3
       FROM jsonb_populate_record(NULL::public.property_provider_publications, $1) r
      WHERE p.id = $2',
    CASE WHEN pub_sets IS NULL THEN '' ELSE pub_sets || ',' END)
    USING coalesce(_publication_fields, '{}'::jsonb), _publication_id, pending_total;

  RETURN coalesce(new_rev, _expected_revision);
END;
$function$;

REVOKE ALL ON FUNCTION public.property_remote_merge(uuid, integer, jsonb, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_remote_merge(uuid, integer, jsonb, uuid, jsonb, jsonb) TO service_role;