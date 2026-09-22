-- Importação: nenhuma observação pode ultrapassar a revisão local ou trocar a
-- identidade/versão da publicação, mesmo quando não há patch no imóvel.
-- Mantém a assinatura usada pelo worker para permitir aplicação incremental.
CREATE OR REPLACE FUNCTION public.property_remote_merge(
  _property_id uuid,
  _expected_revision integer,
  _patch jsonb,
  _publication_id uuid,
  _publication_fields jsonb,
  _conflicts jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  property_revision integer;
  publication_row public.property_provider_publications%ROWTYPE;
  other_row public.property_provider_publications%ROWTYPE;
  guard jsonb := _publication_fields->'__guard';
  sets text;
  pub_sets text;
  c jsonb;
  pending_total integer;
  new_revision integer;
  updated_rows integer;
BEGIN
  IF _expected_revision IS NULL OR guard IS NULL
     OR nullif(guard->>'provider', '') IS NULL
     OR nullif(guard->>'external_property_id', '') IS NULL
     OR nullif(guard->>'publication_updated_at', '') IS NULL THEN
    RAISE EXCEPTION 'import_guard_missing' USING ERRCODE = 'P0001';
  END IF;

  SELECT revision INTO property_revision
    FROM public.properties WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND OR property_revision IS DISTINCT FROM _expected_revision THEN
    RAISE EXCEPTION 'revision_changed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO publication_row
    FROM public.property_provider_publications
   WHERE id = _publication_id FOR UPDATE;
  IF NOT FOUND OR publication_row.property_id <> _property_id
     OR publication_row.provider::text <> guard->>'provider'
     OR publication_row.external_property_id IS DISTINCT FROM guard->>'external_property_id'
     OR publication_row.updated_at IS DISTINCT FROM (guard->>'publication_updated_at')::timestamptz THEN
    RAISE EXCEPTION 'publication_changed' USING ERRCODE = 'P0001';
  END IF;

  IF nullif(guard->>'other_publication_id', '') IS NOT NULL THEN
    SELECT * INTO other_row FROM public.property_provider_publications
     WHERE id = (guard->>'other_publication_id')::uuid FOR UPDATE;
    IF NOT FOUND OR other_row.property_id <> _property_id
       OR other_row.provider = publication_row.provider
       OR other_row.updated_at IS DISTINCT FROM (guard->>'other_publication_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'other_publication_changed' USING ERRCODE = 'P0001';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.property_provider_publications p
     WHERE p.property_id = _property_id AND p.provider <> publication_row.provider
  ) THEN
    RAISE EXCEPTION 'other_publication_changed' USING ERRCODE = 'P0001';
  END IF;

  -- A função só aceita campos importáveis; identificadores, vínculo e
  -- disponibilidade não podem ser alterados por um payload remoto.
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(_patch, '{}'::jsonb)) k
     WHERE k <> ALL (ARRAY[
       'operacao','finalidade','tipo','bairro','cidade','uf','cep','logradouro',
       'numero','complemento','valor','valor_condominio','valor_iptu',
       'dormitorios','suites','banheiros','salas','vagas','acomodacoes',
       'ano_construcao','area_privativa','area_total','area_terreno',
       'area_construida','area_principal','area_tipo','descricao_imovel'
     ])
  ) THEN
    RAISE EXCEPTION 'import_field_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(format('%I = r.%I', k, k), ', ')
    INTO sets FROM jsonb_object_keys(coalesce(_patch, '{}'::jsonb)) k;
  new_revision := property_revision;
  IF sets IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.properties p SET %s, revision = p.revision + 1
         FROM jsonb_populate_record(NULL::public.properties, $1) r
        WHERE p.id = $2 RETURNING p.revision', sets)
      INTO new_revision USING _patch, _property_id;
    IF new_revision IS NULL THEN
      RAISE EXCEPTION 'revision_changed' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(_conflicts, '[]'::jsonb)) LOOP
    IF c->>'provider' IS DISTINCT FROM publication_row.provider::text THEN
      RAISE EXCEPTION 'conflict_provider_mismatch' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.property_field_conflicts f
       SET confirmed_value = c->'confirmed_value', local_value = c->'local_value',
           remote_value = c->'remote_value', applied_value = c->'applied_value',
           classification = c->>'classification', detected_revision = new_revision,
           publication_id = _publication_id, updated_at = now()
     WHERE f.property_id = _property_id AND f.provider = publication_row.provider
       AND f.field = c->>'field' AND f.scope = c->>'scope' AND f.resolution = 'pending';
    IF NOT FOUND THEN
      INSERT INTO public.property_field_conflicts
        (property_id, provider, publication_id, field, scope, classification, resolution,
         confirmed_value, local_value, remote_value, applied_value, detected_revision)
      VALUES (_property_id, publication_row.provider, _publication_id, c->>'field', c->>'scope',
              c->>'classification', 'pending', c->'confirmed_value', c->'local_value',
              c->'remote_value', c->'applied_value', new_revision);
    END IF;
  END LOOP;

  -- Uma decisão tomada pela edição normal no Gestão deixa de ser exceção
  -- quando o valor observado na conta coincide com o valor local. Para campo
  -- comum às duas contas, a outra também precisa estar confirmada.
  UPDATE public.property_field_conflicts f
     SET resolution = 'converged', resolved_at = now()
    FROM public.properties p
   WHERE p.id = _property_id AND f.property_id = _property_id
     AND f.publication_id = _publication_id AND f.resolution = 'pending'
     AND (_publication_fields->'remote_field_snapshot') ? f.field
     AND to_jsonb(p)->f.field = _publication_fields->'remote_field_snapshot'->f.field
     AND (f.scope <> 'cross_account' OR (
       other_row.id IS NOT NULL
       AND other_row.remote_field_snapshot ? f.field
       AND other_row.remote_field_snapshot->f.field = to_jsonb(p)->f.field
     ));

  SELECT count(*) INTO pending_total FROM public.property_field_conflicts
   WHERE property_id = _property_id AND publication_id = _publication_id AND resolution = 'pending';

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(_publication_fields, '{}'::jsonb)) k
     WHERE k <> ALL (ARRAY[
       '__guard','remote_field_snapshot','remote_snapshot_at','remote_observed_hash',
       'confirmed_field_snapshot','last_published_hash','baseline_at',
       'last_imported_at','last_verified_at','last_error_category',
       'last_error_message','remote_read_state','external_public_url','import_run_id'
     ])
  ) THEN
    RAISE EXCEPTION 'publication_field_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(format('%I = r.%I', k, k), ', ')
    INTO pub_sets FROM jsonb_object_keys(coalesce(_publication_fields, '{}'::jsonb)) k
   WHERE k <> '__guard';
  EXECUTE format(
    'UPDATE public.property_provider_publications p SET %s conflict_count = $3
       FROM jsonb_populate_record(NULL::public.property_provider_publications, $1) r
      WHERE p.id = $2',
    CASE WHEN pub_sets IS NULL THEN '' ELSE pub_sets || ',' END)
    USING _publication_fields - '__guard', _publication_id, pending_total;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RAISE EXCEPTION 'publication_changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN new_revision;
END;
$function$;

REVOKE ALL ON FUNCTION public.property_remote_merge(uuid, integer, jsonb, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_remote_merge(uuid, integer, jsonb, uuid, jsonb, jsonb)
  TO service_role;

-- Importação tem os mesmos requisitos de posse que cadastro/mídia. Jobs já
-- processando ficam intactos; apenas leases vencidos voltam para a fila.
ALTER TABLE public.property_import_jobs
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.property_import_claim_jobs(
  _worker text, _limit integer DEFAULT 5, _lease_seconds integer DEFAULT 180
) RETURNS SETOF public.property_import_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.property_import_jobs
     SET status = 'retry', locked_at = NULL, lock_expires_at = NULL,
         locked_by = NULL, lease_token = NULL
   WHERE status = 'processing' AND lock_expires_at < now();

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id FROM public.property_import_jobs j
    JOIN public.property_import_runs r ON r.id = j.run_id
    WHERE j.status IN ('pending', 'retry') AND j.next_run_at <= now()
      AND r.status IN ('queued', 'running')
    ORDER BY j.next_run_at, j.created_at, j.id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT LEAST(4, GREATEST(1, _limit))
  )
  UPDATE public.property_import_jobs j
     SET status = 'processing', attempts = j.attempts + 1,
         locked_at = now(), lock_expires_at = now() + make_interval(secs => GREATEST(30, _lease_seconds)),
         locked_by = _worker, lease_token = gen_random_uuid()
    FROM candidates c WHERE j.id = c.id
  RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.property_import_claim_jobs(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_claim_jobs(text, integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.property_import_renew_lease(
  _job_id uuid, _lease_token uuid, _seconds integer DEFAULT 180
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated integer;
BEGIN
  UPDATE public.property_import_jobs
     SET lock_expires_at = now() + make_interval(secs => GREATEST(30, _seconds))
   WHERE id = _job_id AND lease_token = _lease_token AND status = 'processing'
     AND lock_expires_at > now();
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated = 1;
END $$;
REVOKE ALL ON FUNCTION public.property_import_renew_lease(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_renew_lease(uuid, uuid, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.property_import_finish_job(
  _job_id uuid, _lease_token uuid, _status text,
  _next_run_at timestamptz DEFAULT NULL, _attempts integer DEFAULT NULL,
  _error_category text DEFAULT NULL, _error_message text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated integer;
BEGIN
  IF _status NOT IN ('succeeded', 'retry', 'failed') THEN
    RAISE EXCEPTION 'import_finish_invalid_status';
  END IF;
  UPDATE public.property_import_jobs
     SET status = _status::public.property_sync_job_status,
         next_run_at = COALESCE(_next_run_at, next_run_at),
         attempts = COALESCE(_attempts, attempts),
         finished_at = CASE WHEN _status = 'retry' THEN NULL ELSE now() END,
         locked_at = NULL, lock_expires_at = NULL, locked_by = NULL, lease_token = NULL,
         last_error_category = _error_category,
         last_error_message = left(_error_message, 300)
   WHERE id = _job_id AND lease_token = _lease_token AND status = 'processing'
     AND lock_expires_at > now();
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated = 1;
END $$;
REVOKE ALL ON FUNCTION public.property_import_finish_job(uuid, uuid, text, timestamptz, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_finish_job(uuid, uuid, text, timestamptz, integer, text, text)
  TO service_role;

-- Contadores por incremento atômico: dois hydrates não perdem resultados por
-- read-modify-write concorrente. Apenas contadores conhecidos são aceitos.
CREATE OR REPLACE FUNCTION public.property_import_bump_run(_run_id uuid, _deltas jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _key text; _value integer; _sets text := ''; _updated integer;
BEGIN
  IF jsonb_typeof(_deltas) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'import_deltas_invalid'; END IF;
  FOR _key, _value IN SELECT key, value::integer FROM jsonb_each_text(_deltas) LOOP
    IF _key <> ALL (ARRAY[
      'pages_processed','properties_discovered','properties_created','properties_linked',
      'properties_updated','properties_ambiguous','properties_ignored','properties_errored',
      'images_discovered','images_imported','images_errored'
    ]) OR _value < 0 THEN RAISE EXCEPTION 'import_delta_invalid'; END IF;
    _sets := _sets || CASE WHEN _sets = '' THEN '' ELSE ', ' END
      || format('%I = %I + %s', _key, _key, _value);
  END LOOP;
  IF _sets = '' THEN RETURN true; END IF;
  EXECUTE format('UPDATE public.property_import_runs SET %s WHERE id = $1', _sets)
    USING _run_id;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated = 1;
END $$;
REVOKE ALL ON FUNCTION public.property_import_bump_run(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_bump_run(uuid, jsonb)
  TO service_role;

-- A conclusão precisa observar a fila e gravar run + finalize na mesma
-- transação. Falha de SELECT nunca pode ser tratada como contagem zero.
CREATE OR REPLACE FUNCTION public.property_import_finalize_if_owned(
  _job_id uuid, _lease_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _job public.property_import_jobs; _pending integer; _failed integer; _recoverable integer;
BEGIN
  SELECT * INTO _job FROM public.property_import_jobs
   WHERE id = _job_id AND lease_token = _lease_token AND status = 'processing'
     AND lock_expires_at > now() AND job_type = 'finalize' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'lease_lost'); END IF;
  SELECT count(*) INTO _pending FROM public.property_import_jobs
   WHERE run_id = _job.run_id AND id <> _job.id
     AND status IN ('pending','processing','retry');
  SELECT count(*) INTO _recoverable FROM public.property_import_jobs
   WHERE run_id = _job.run_id AND status = 'failed'
     AND last_error_category IN ('config','auth','rate_limit','server','network','protocol','unknown');
  IF _pending > 0 OR _recoverable > 0 THEN
    UPDATE public.property_import_jobs
       SET status = 'retry', next_run_at = now() + interval '5 minutes', attempts = 0,
           locked_at = NULL, lock_expires_at = NULL, locked_by = NULL, lease_token = NULL
     WHERE id = _job.id;
    RETURN jsonb_build_object('state', 'waiting', 'pending', _pending,
                              'recoverable', _recoverable);
  END IF;
  SELECT count(*) INTO _failed FROM public.property_import_jobs
   WHERE run_id = _job.run_id AND status = 'failed';
  UPDATE public.property_import_runs
     SET status = CASE WHEN _failed > 0 THEN 'completed_with_errors' ELSE 'completed' END,
         finished_at = now()
   WHERE id = _job.run_id AND status IN ('queued','running');
  IF NOT FOUND THEN RETURN jsonb_build_object('state', 'run_changed'); END IF;
  UPDATE public.property_import_jobs
     SET status = 'succeeded', finished_at = now(), locked_at = NULL,
         lock_expires_at = NULL, locked_by = NULL, lease_token = NULL
   WHERE id = _job.id;
  RETURN jsonb_build_object('state', 'completed', 'failed', _failed);
END $$;
REVOKE ALL ON FUNCTION public.property_import_finalize_if_owned(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_finalize_if_owned(uuid, uuid)
  TO service_role;

-- Um job técnico falho continua recuperável em ritmo limitado. Erros de dado
-- ou conflito de negócio não são sondados sem uma edição que mude a causa.
CREATE OR REPLACE FUNCTION public.property_import_recover_jobs(_limit integer DEFAULT 2)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated integer;
BEGIN
  WITH due AS (
    SELECT j.id FROM public.property_import_jobs j
    JOIN public.property_import_runs r ON r.id = j.run_id
    WHERE j.status = 'failed' AND j.next_run_at <= now()
      AND j.last_error_category IN ('config','auth','rate_limit','server','network','protocol','unknown')
      AND r.status IN ('queued','running')
      AND NOT EXISTS (
        SELECT 1 FROM public.property_provider_recovery_circuit c
         WHERE c.provider = j.provider AND c.blocked_until > now()
      )
    ORDER BY j.next_run_at, j.created_at, j.id
    FOR UPDATE OF j SKIP LOCKED
    LIMIT LEAST(4, GREATEST(1, _limit))
  ), recovered AS (
    UPDATE public.property_import_jobs j
       SET status = 'retry', attempts = 0, next_run_at = now(),
           finished_at = NULL, recovery_attempts = recovery_attempts + 1
      FROM due WHERE j.id = due.id RETURNING j.id
  ) SELECT count(*) INTO _updated FROM recovered;
  RETURN _updated;
END $$;
REVOKE ALL ON FUNCTION public.property_import_recover_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_recover_jobs(integer)
  TO service_role;
