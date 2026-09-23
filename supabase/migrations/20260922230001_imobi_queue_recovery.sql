-- NULL changed_fields = envio completo; '{}' = nenhum campo remoto; lista =
-- envio parcial. Jobs falhos ainda não absorvidos participam da união.
CREATE OR REPLACE FUNCTION public.property_save_revision_enqueue_v2(
  _property_id uuid, _expected_revision integer, _payload jsonb, _targets text[],
  _requested_by uuid, _action text DEFAULT 'update', _changed_fields text[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_revision integer;
  next_revision integer;
  cols text;
  target text;
  merged text[];
  _intent_revision integer;
  _enabled_targets text[];
  _queued_targets text[] := '{}'::text[];
BEGIN
  -- A RPC usa service_role, então a RLS do chamador não se aplica aqui.
  -- A autorização acompanha o usuário autenticado que iniciou a edição.
  IF _requested_by IS NULL OR NOT (
    public.has_role(_requested_by, 'admin'::public.app_role) OR
    public.has_role(_requested_by, 'secretaria'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'sem_permissao_para_editar_imovel';
  END IF;
  IF _action IS DISTINCT FROM 'update' THEN
    RAISE EXCEPTION 'acao_de_edicao_invalida';
  END IF;
  SELECT revision INTO current_revision FROM public.properties
   WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'notFound', true); END IF;
  current_revision := COALESCE(current_revision, 1);
  IF _expected_revision IS NOT NULL AND _expected_revision <> current_revision THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'revision', current_revision);
  END IF;
  next_revision := current_revision + 1;

  SELECT string_agg(quote_ident(k), ', ') INTO cols FROM jsonb_object_keys(_payload) AS k
   WHERE EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'properties'
        AND c.column_name = k AND c.column_name NOT IN ('id','created_by','created_at','revision'));
  IF cols IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.properties p SET (%s, revision, updated_at) = '
      || '(SELECT %s, $3, now() FROM jsonb_populate_record(NULL::public.properties, $1)) '
      || 'WHERE p.id = $2', cols, cols
    ) USING _payload, _property_id, next_revision;
  ELSE
    UPDATE public.properties SET revision = next_revision, updated_at = now()
     WHERE id = _property_id;
  END IF;

  -- _targets era lido antes da transação pelo servidor. Uma publicação pode
  -- ter sido habilitada/desabilitada entre essa leitura e o SAVE. O conjunto
  -- efetivo vem das linhas de publicação sob a mesma transação da revisão.
  -- Inclui uma criação explícita ainda pendente de ID remoto; sua edição
  -- posterior não pode cancelar o POST original e deixar o destino sem job.
  SELECT COALESCE(array_agg(p.provider::text ORDER BY p.provider::text), '{}'::text[])
    INTO _enabled_targets
    FROM public.property_provider_publications p
   WHERE p.property_id = _property_id AND p.enabled
     AND p.desired_availability = 'visible'
     AND p.status NOT IN ('draft', 'unpublished');
  IF cardinality(_enabled_targets) > 0 THEN
    FOREACH target IN ARRAY _enabled_targets LOOP
      SELECT publication_intent_revision INTO _intent_revision
        FROM public.property_provider_publications
       WHERE property_id = _property_id AND provider = target::public.imobi_provider;

      IF _action = 'update' THEN
        IF _changed_fields IS NULL OR EXISTS (
          SELECT 1 FROM public.property_sync_jobs j
           WHERE j.property_id = _property_id AND j.provider = target::public.imobi_provider
             AND j.action = 'update' AND j.superseded_by IS NULL
             AND j.status IN ('pending','retry','processing','failed')
             AND j.changed_fields IS NULL
        ) THEN
          merged := NULL;
        ELSE
          SELECT COALESCE(array_agg(DISTINCT f ORDER BY f), '{}'::text[]) INTO merged
            FROM (
              SELECT unnest(_changed_fields) AS f
              UNION
              SELECT unnest(j.changed_fields) AS f
                FROM public.property_sync_jobs j
               WHERE j.property_id = _property_id
                 AND j.provider = target::public.imobi_provider
                 AND j.action = 'update' AND j.superseded_by IS NULL
                 AND j.status IN ('pending','retry','processing','failed')
            ) AS pending_fields
           WHERE f IS NOT NULL AND f <> '';
        END IF;
        IF merged IS NOT NULL AND cardinality(merged) = 0 THEN CONTINUE; END IF;
      ELSE
        merged := _changed_fields;
      END IF;

      INSERT INTO public.property_sync_jobs
        (property_id, provider, action, requested_revision, requested_by,
         status, next_run_at, changed_fields, publication_intent_revision)
      VALUES
        (_property_id, target::public.imobi_provider,
         _action::public.property_sync_action, next_revision, _requested_by,
         'pending', now(), merged, _intent_revision)
      ON CONFLICT (property_id, provider, action, requested_revision)
      DO UPDATE SET status = 'pending', next_run_at = now(), updated_at = now(),
                    changed_fields = EXCLUDED.changed_fields,
                    publication_intent_revision = EXCLUDED.publication_intent_revision;

      UPDATE public.property_provider_publications SET status = 'pending', updated_at = now()
       WHERE property_id = _property_id AND provider = target::public.imobi_provider;
      _queued_targets := array_append(_queued_targets, target);
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok', true, 'conflict', false,
                            'revision', next_revision, 'providers', to_jsonb(_queued_targets));
END $$;

REVOKE ALL ON FUNCTION public.property_save_revision_enqueue_v2(uuid, integer, jsonb, text[], uuid, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_save_revision_enqueue_v2(uuid, integer, jsonb, text[], uuid, text, text[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.property_sync_claim_jobs(
  _worker text, _limit integer DEFAULT 5, _lease_seconds integer DEFAULT 120,
  _actions text[] DEFAULT NULL::text[]
) RETURNS SETOF public.property_sync_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('property_sync_claim'));
  PERFORM public.property_sync_reclaim_stale();

  -- Absorção preserva NULL de qualquer job: envio completo absorve parcial.
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
            AND c.action IN ('publish','unpublish','delete')
            AND c.status IN ('pending','retry','processing')
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
END $$;

REVOKE ALL ON FUNCTION public.property_sync_claim_jobs(text, integer, integer, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_claim_jobs(text, integer, integer, text[])
  TO service_role;

CREATE TABLE IF NOT EXISTS public.property_provider_recovery_circuit (
  provider public.imobi_provider PRIMARY KEY,
  next_probe_at timestamptz NOT NULL DEFAULT now(),
  probe_count integer NOT NULL DEFAULT 0,
  last_probe_at timestamptz,
  last_success_at timestamptz
);
INSERT INTO public.property_provider_recovery_circuit (provider)
VALUES ('cordial'), ('morar') ON CONFLICT (provider) DO NOTHING;
ALTER TABLE public.property_provider_recovery_circuit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_provider_recovery_circuit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.property_provider_recovery_circuit TO service_role;

CREATE OR REPLACE FUNCTION public.property_provider_recovery_success()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'succeeded' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.property_provider_recovery_circuit
       SET next_probe_at = now(), probe_count = 0, last_success_at = now()
     WHERE provider = NEW.provider;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.property_provider_recovery_success()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS property_provider_recovery_success_trg ON public.property_sync_jobs;
CREATE TRIGGER property_provider_recovery_success_trg
  AFTER UPDATE OF status ON public.property_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.property_provider_recovery_success();

-- Watchdog independente de HTTP: filas antigas e intents sem job são
-- selecionadas no banco por vencimento. Recuperação permanente/ambígua não
-- vira POST cego. Um backlog é liberado em pequenos lotes por minuto.
CREATE OR REPLACE FUNCTION public.property_sync_recover_intents(_limit integer DEFAULT 12)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _reclaimed integer := 0;
  _media integer := 0;
  _cadastro integer := 0;
  _row record;
  _limit_bounded integer := LEAST(30, GREATEST(1, _limit));
  _desired integer;
  _probes integer := 0;
  _next_probe timestamptz;
BEGIN
  _reclaimed := public.property_sync_reclaim_stale();

  FOR _row IN
    SELECT p.id, p.property_id, p.provider, p.media_recovery_attempts,
           GREATEST(COALESCE(p.media_dirty_revision, 0), COALESCE(x.gallery_revision, 1)) AS desired
      FROM public.property_provider_publications p
      JOIN public.properties x ON x.id = p.property_id
     WHERE p.enabled AND p.desired_availability = 'visible'
       AND p.external_property_id IS NOT NULL
       AND p.status NOT IN ('draft', 'unpublished')
       AND NOT x.is_draft AND x.archived_at IS NULL
       AND (
         GREATEST(COALESCE(p.media_dirty_revision, 0), COALESCE(x.gallery_revision, 1))
           > COALESCE(p.synced_gallery_revision, 0)
         OR EXISTS (
           SELECT 1 FROM public.property_image_provider_publications link
            WHERE link.publication_id = p.id
              AND ((link.desired_state = 'absent' AND link.deleted_at IS NULL)
                   OR link.status IN ('error', 'delivery_unknown'))
         )
       )
       AND COALESCE(p.media_recovery_next_at, '-infinity'::timestamptz) <= now()
       AND NOT EXISTS (
         SELECT 1 FROM public.property_sync_jobs j
          WHERE j.property_id = p.property_id AND j.provider = p.provider
            AND j.action = 'media_sync' AND j.status IN ('pending','retry','processing')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.property_sync_jobs blocked
          WHERE blocked.property_id = p.property_id AND blocked.provider = p.provider
            AND blocked.action = 'media_sync' AND blocked.status = 'failed'
            AND blocked.requested_revision >=
              GREATEST(COALESCE(p.media_dirty_revision, 0), COALESCE(x.gallery_revision, 1))
            AND blocked.last_error_category IN
              ('business', 'validation', 'mapping', 'delivery_unknown', 'ambiguous',
               'config', 'auth')
       )
     ORDER BY COALESCE(p.media_recovery_next_at, '-infinity'::timestamptz),
              COALESCE(p.media_dirty_at, p.created_at), p.id
     FOR UPDATE OF p SKIP LOCKED LIMIT _limit_bounded
  LOOP
    _desired := _row.desired;
    PERFORM public.queue_media_sync_coalesced(
      _row.property_id, _row.provider, _desired, NULL
    );
    UPDATE public.property_provider_publications
       SET media_recovery_attempts = media_recovery_attempts + 1,
           media_recovery_next_at = now() + make_interval(
             mins => LEAST(360, power(2, LEAST(8, _row.media_recovery_attempts + 1))::integer)
           )
     WHERE id = _row.id;
    _media := _media + 1;
  END LOOP;

  -- Credencial corrigida não exige clique. Só uma sondagem por conta e por
  -- janela, inclusive para criação/ocultação/exclusão bloqueadas antes da API.
  FOR _row IN
    SELECT DISTINCT ON (j.provider) j.id, j.provider
      FROM public.property_sync_jobs j
     WHERE j.status = 'failed' AND j.superseded_by IS NULL
       AND j.last_error_category IN ('config', 'auth')
       AND j.next_run_at <= now()
       AND COALESCE(j.next_recovery_at, '-infinity'::timestamptz) <= now()
     ORDER BY j.provider, COALESCE(j.next_recovery_at, '-infinity'::timestamptz),
              j.next_run_at, j.id
  LOOP
    SELECT next_probe_at INTO _next_probe
      FROM public.property_provider_recovery_circuit
     WHERE provider = _row.provider FOR UPDATE;
    IF _next_probe IS NULL OR _next_probe > now() THEN CONTINUE; END IF;
    UPDATE public.property_sync_jobs
       SET status = 'retry', attempts = 0, finished_at = NULL,
           next_run_at = now(), recovery_attempts = recovery_attempts + 1,
           next_recovery_at = now() + make_interval(
             mins => LEAST(360, 5 * power(2, LEAST(6, recovery_attempts))::integer)
           )
     WHERE id = _row.id AND status = 'failed';
    IF FOUND THEN
      UPDATE public.property_provider_recovery_circuit
         SET last_probe_at = now(), probe_count = probe_count + 1,
             next_probe_at = now() + make_interval(
               mins => LEAST(360, 5 * power(2, LEAST(6, probe_count))::integer)
             )
       WHERE provider = _row.provider;
      _probes := _probes + 1;
    END IF;
  END LOOP;

  -- Uma alteração comum é idempotente sob a verificação de revisão do worker;
  -- criar ou excluir remotamente exige reconciliação própria e fica fora desta
  -- reabertura automática para evitar duplicação em resultado ambíguo.
  WITH due AS (
    SELECT j.id
      FROM public.property_sync_jobs j
      JOIN public.property_provider_publications p
        ON p.property_id = j.property_id AND p.provider = j.provider
     WHERE j.status = 'failed' AND j.superseded_by IS NULL
       AND j.action IN ('update', 'reconcile')
       AND j.last_error_category IN ('rate_limit','server','network','protocol','unknown')
       AND j.next_run_at <= now()
       AND COALESCE(j.next_recovery_at, '-infinity'::timestamptz) <= now()
       AND p.enabled AND p.desired_availability = 'visible'
       AND NOT EXISTS (
         SELECT 1 FROM public.property_sync_jobs newer
          WHERE newer.id <> j.id AND newer.property_id = j.property_id
            AND newer.provider = j.provider AND newer.action = j.action
            AND newer.requested_revision >= j.requested_revision
            AND newer.status IN ('pending','retry','processing','succeeded')
       )
     ORDER BY COALESCE(j.next_recovery_at, '-infinity'::timestamptz),
              j.next_run_at, j.id
     FOR UPDATE OF j SKIP LOCKED LIMIT _limit_bounded
  ), revived AS (
    UPDATE public.property_sync_jobs j
       SET status = 'retry', attempts = 0, finished_at = NULL,
           next_run_at = now(), recovery_attempts = recovery_attempts + 1,
           next_recovery_at = now() + make_interval(
             mins => LEAST(360, power(2, LEAST(8, recovery_attempts + 1))::integer)
           )
      FROM due WHERE j.id = due.id RETURNING j.id
  ) SELECT count(*) INTO _cadastro FROM revived;

  RETURN jsonb_build_object('reclaimedLeases', _reclaimed,
                            'mediaQueued', _media, 'cadastroRevived', _cadastro,
                            'configProbes', _probes);
END $$;

REVOKE ALL ON FUNCTION public.property_sync_recover_intents(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_recover_intents(integer)
  TO service_role;

-- Reparação classificada pela reconciliação: apenas a publicação existente e
-- somente os campos permitidos. Nunca cria anúncio nem limpa outro destino.
ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS last_repair_signature text,
  ADD COLUMN IF NOT EXISTS last_repair_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.property_sync_request_repair(
  _property_id uuid, _provider public.imobi_provider, _fields text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _revision integer;
  _publication public.property_provider_publications;
  _merged text[];
  _job_id uuid;
  _wanted jsonb;
  _signature text;
BEGIN
  IF _fields IS NOT NULL AND cardinality(_fields) = 0 THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'no_fields');
  END IF;
  SELECT revision INTO _revision FROM public.properties
   WHERE id = _property_id AND NOT is_draft AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'property_unavailable');
  END IF;
  SELECT * INTO _publication FROM public.property_provider_publications
   WHERE property_id = _property_id AND provider = _provider FOR UPDATE;
  IF NOT FOUND OR NOT _publication.enabled
     OR _publication.desired_availability <> 'visible'
     OR _publication.external_property_id IS NULL THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'publication_unavailable');
  END IF;

  -- O mesmo desejo já tem trabalho ativo; uma varredura periódica não pode
  -- criar uma revisão nova a cada leitura remota.
  SELECT j.id INTO _job_id FROM public.property_sync_jobs j
   WHERE j.property_id = _property_id AND j.provider = _provider
     AND j.action = 'update' AND j.status IN ('pending','retry','processing')
     AND j.superseded_by IS NULL
     AND (j.changed_fields IS NULL OR
          (_fields IS NOT NULL AND _fields <@ j.changed_fields))
   ORDER BY j.requested_revision DESC, j.created_at DESC LIMIT 1;
  IF _job_id IS NOT NULL THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'already_queued', 'jobId', _job_id);
  END IF;

  SELECT CASE WHEN _fields IS NULL THEN
           to_jsonb(p) - 'revision' - 'updated_at' - 'gallery_revision'
         ELSE COALESCE((
           SELECT jsonb_object_agg(field, to_jsonb(p)->field)
             FROM unnest(_fields) AS t(field)
         ), '{}'::jsonb) END
    INTO _wanted FROM public.properties p WHERE p.id = _property_id;
  _signature := md5(COALESCE(array_to_string(_fields, ','), '*') || '|'
                    || COALESCE(_wanted::text, '{}') || '|'
                    || COALESCE(_publication.remote_field_snapshot::text, '{}'));
  IF _publication.last_repair_signature = _signature THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'already_requested');
  END IF;

  IF _fields IS NULL OR EXISTS (
    SELECT 1 FROM public.property_sync_jobs j
     WHERE j.property_id = _property_id AND j.provider = _provider
       AND j.action = 'update' AND j.superseded_by IS NULL
       AND j.status IN ('pending','retry','processing','failed')
       AND j.changed_fields IS NULL
  ) THEN
    _merged := NULL;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT field ORDER BY field), '{}'::text[])
      INTO _merged FROM (
        SELECT unnest(_fields) AS field
        UNION
        SELECT unnest(j.changed_fields) AS field
          FROM public.property_sync_jobs j
         WHERE j.property_id = _property_id AND j.provider = _provider
           AND j.action = 'update' AND j.superseded_by IS NULL
           AND j.status IN ('pending','retry','processing','failed')
      ) AS wanted WHERE field IS NOT NULL AND field <> '';
  END IF;
  IF _merged IS NOT NULL AND cardinality(_merged) = 0 THEN
    RETURN jsonb_build_object('scheduled', false, 'reason', 'no_fields');
  END IF;

  _revision := _revision + 1;
  UPDATE public.properties SET revision = _revision, updated_at = now()
   WHERE id = _property_id;
  INSERT INTO public.property_sync_jobs
    (property_id, provider, action, requested_revision, changed_fields,
     publication_intent_revision, status, next_run_at)
  VALUES
    (_property_id, _provider, 'update', _revision, _merged,
     _publication.publication_intent_revision, 'pending', now())
  RETURNING id INTO _job_id;
  UPDATE public.property_provider_publications
     SET last_repair_signature = _signature, last_repair_requested_at = now()
   WHERE id = _publication.id;
  RETURN jsonb_build_object('scheduled', true, 'jobId', _job_id,
                            'revision', _revision, 'full', _merged IS NULL);
END $$;

REVOKE ALL ON FUNCTION public.property_sync_request_repair(uuid, public.imobi_provider, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_request_repair(uuid, public.imobi_provider, text[])
  TO service_role;
