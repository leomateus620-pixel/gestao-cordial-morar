CREATE OR REPLACE FUNCTION public.property_save_revision_enqueue_v2(
  _property_id uuid, _expected_revision integer, _payload jsonb, _targets text[],
  _requested_by uuid, _action text DEFAULT 'update', _changed_fields text[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  current_revision integer; next_revision integer; cols text; target text; merged text[];
BEGIN
  SELECT revision INTO current_revision FROM public.properties WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'conflict', false, 'notFound', true); END IF;
  current_revision := COALESCE(current_revision, 1);
  IF _expected_revision IS NOT NULL AND _expected_revision <> current_revision THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'revision', current_revision);
  END IF;
  next_revision := current_revision + 1;

  SELECT string_agg(quote_ident(k), ', ') INTO cols FROM jsonb_object_keys(_payload) AS k
   WHERE EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name='properties'
        AND c.column_name=k AND c.column_name NOT IN ('id','created_by','created_at','revision'));
  IF cols IS NOT NULL THEN
    EXECUTE format('UPDATE public.properties p SET (%s, revision, updated_at) = (SELECT %s, $3, now() FROM jsonb_populate_record(NULL::public.properties, $1)) WHERE p.id = $2', cols, cols)
      USING _payload, _property_id, next_revision;
  ELSE
    UPDATE public.properties SET revision = next_revision, updated_at = now() WHERE id = _property_id;
  END IF;

  IF _targets IS NOT NULL THEN
    FOREACH target IN ARRAY _targets LOOP
      -- União com os campos ainda não enviados de trabalhos anteriores do mesmo destino.
      -- NULL em qualquer trabalho pendente = "todos os campos" e se propaga.
      IF _changed_fields IS NULL OR EXISTS (
        SELECT 1 FROM public.property_sync_jobs j
         WHERE j.property_id=_property_id AND j.provider=target::public.imobi_provider
           AND j.action='update' AND j.status IN ('pending','retry','processing')
           AND j.changed_fields IS NULL) THEN
        merged := NULL;
      ELSE
        SELECT array_agg(DISTINCT f ORDER BY f) INTO merged FROM (
          SELECT unnest(_changed_fields) f
          UNION SELECT unnest(j.changed_fields) FROM public.property_sync_jobs j
           WHERE j.property_id=_property_id AND j.provider=target::public.imobi_provider
             AND j.action='update' AND j.status IN ('pending','retry','processing')) s;
      END IF;

      INSERT INTO public.property_sync_jobs
        (property_id, provider, action, requested_revision, requested_by, status, next_run_at, changed_fields)
      VALUES (_property_id, target::public.imobi_provider, _action::public.property_sync_action,
         next_revision, _requested_by, 'pending', now(), merged)
      ON CONFLICT (property_id, provider, action, requested_revision)
      DO UPDATE SET status='pending', next_run_at=now(), updated_at=now(), changed_fields=EXCLUDED.changed_fields;

      UPDATE public.property_provider_publications SET status='pending', updated_at=now()
       WHERE property_id=_property_id AND provider=target::public.imobi_provider;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok', true, 'conflict', false, 'revision', next_revision);
END; $function$;
REVOKE ALL ON FUNCTION public.property_save_revision_enqueue_v2(uuid, integer, jsonb, text[], uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_save_revision_enqueue_v2(uuid, integer, jsonb, text[], uuid, text, text[]) TO service_role;