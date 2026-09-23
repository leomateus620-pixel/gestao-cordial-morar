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
    public.has_role(_requested_by, 'secretaria'::public.app_role) OR
    public.has_role(_requested_by, 'corretor'::public.app_role)
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