ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS archive_intent_revision integer;

CREATE TABLE IF NOT EXISTS public.property_archive_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  actor_id uuid,
  transition text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.property_archive_events TO authenticated;
GRANT ALL ON public.property_archive_events TO service_role;
ALTER TABLE public.property_archive_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipe le eventos de arquivamento" ON public.property_archive_events
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria')
    OR public.has_role(auth.uid(),'corretor'));
CREATE INDEX IF NOT EXISTS property_archive_events_property_idx
  ON public.property_archive_events(property_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.property_can_archive(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (
    public.has_role(_user,'admin') OR public.has_role(_user,'secretaria')
    OR public.has_role(_user,'corretor'))
$$;
REVOKE ALL ON FUNCTION public.property_can_archive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_can_archive(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.property_retire_request(_property_id uuid, _requested_by uuid, _action text, _expected_revision integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _property public.properties;
  _publication public.property_provider_publications;
  _new_revision integer;
  _next_intent integer;
  _providers text[] := '{}'::text[];
  _targets text[];
BEGIN
  IF _action NOT IN ('unpublish', 'delete') THEN RAISE EXCEPTION 'retire_action_invalid'; END IF;
  -- Exclusão definitiva: regra inalterada (admin). Arquivamento: equipe de imóveis.
  IF _requested_by IS NULL OR NOT (
    public.has_role(_requested_by, 'admin'::public.app_role) OR
    (_action = 'unpublish' AND public.property_can_archive(_requested_by))
  ) THEN RAISE EXCEPTION 'sem_permissao_para_ocultar_ou_excluir_imovel'; END IF;
  SELECT * INTO _property FROM public.properties WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'notFound', true); END IF;

  -- Idempotência do arquivamento: repetir o pedido não cria novos jobs.
  IF _action = 'unpublish' AND _property.removal_state IN ('pending_archive','archived') THEN
    SELECT COALESCE(array_agg(p.provider::text ORDER BY p.provider::text), '{}'::text[])
      INTO _providers FROM public.property_provider_publications p
     WHERE p.property_id = _property_id AND p.archive_intent_revision IS NOT NULL
       AND (p.status <> 'unpublished' OR p.publication_intent_revision <> p.archive_intent_revision);
    RETURN jsonb_build_object('ok', true, 'alreadyRequested', true,
      'revision', _property.revision, 'state', _property.removal_state,
      'providers', to_jsonb(_providers));
  END IF;
  IF _property.removal_state IS NOT NULL THEN
    RAISE EXCEPTION 'imovel_em_remocao';
  END IF;
  IF _expected_revision IS NOT NULL AND _property.revision <> _expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'revision', _property.revision);
  END IF;
  _new_revision := COALESCE(_property.revision, 1) + 1;
  SELECT COALESCE(array_agg(p.provider::text ORDER BY p.provider::text), '{}'::text[])
    INTO _providers FROM public.property_provider_publications p
   WHERE p.property_id = _property_id AND (
     p.enabled OR p.external_property_id IS NOT NULL OR p.last_synced_at IS NOT NULL
     OR p.create_state = 'awaiting_create_reconcile'
     OR p.status IN ('pending', 'syncing', 'partial', 'out_of_sync', 'published', 'error')
   );
  SELECT COALESCE(array_agg(t.provider ORDER BY t.provider), '{}'::text[])
    INTO _targets FROM unnest(COALESCE(_property.publish_targets, '{}'::text[])) t(provider)
   WHERE t.provider <> ALL(_providers);
  UPDATE public.properties
     SET revision = _new_revision, publish_targets = _targets,
         removal_state = CASE _action WHEN 'delete' THEN 'pending_removal' ELSE 'pending_archive' END,
         updated_at = now()
   WHERE id = _property_id;
  FOR _publication IN
    SELECT * FROM public.property_provider_publications
     WHERE property_id = _property_id AND provider::text = ANY(_providers)
     ORDER BY provider FOR UPDATE
  LOOP
    _next_intent := _publication.publication_intent_revision + 1;
    UPDATE public.property_provider_publications
       SET enabled = false, status = 'pending',
           desired_availability = CASE _action WHEN 'delete' THEN 'deleted' ELSE 'hidden' END,
           publication_intent_revision = _next_intent,
           archive_intent_revision = CASE _action WHEN 'unpublish' THEN _next_intent ELSE archive_intent_revision END,
           updated_at = now()
     WHERE id = _publication.id;
    UPDATE public.property_sync_jobs
       SET status = 'cancelled', finished_at = now(), last_error_category = 'superseded'
     WHERE property_id = _property_id AND provider = _publication.provider
       AND action IN ('media_sync','publish','update','reconcile') AND status IN ('pending', 'retry');
    INSERT INTO public.property_sync_jobs
      (property_id, provider, action, requested_revision, requested_by,
       status, next_run_at, publication_intent_revision)
    VALUES (_property_id, _publication.provider,
            _action::public.property_sync_action, _new_revision, _requested_by,
            'pending', now(), _next_intent);
  END LOOP;
  -- Site próprio: sai do ar assim que a decisão é gravada.
  PERFORM public.cordial_site_sync_property(_property_id);
  IF _action = 'unpublish' THEN
    INSERT INTO public.property_archive_events(property_id, actor_id, transition, detail)
    VALUES (_property_id, _requested_by, 'requested',
            jsonb_build_object('revision', _new_revision, 'providers', to_jsonb(_providers)));
  END IF;
  RETURN jsonb_build_object('ok', true, 'revision', _new_revision, 'providers', to_jsonb(_providers));
END $function$;
REVOKE ALL ON FUNCTION public.property_retire_request(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_retire_request(uuid, uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.property_archive_finalize(_property_id uuid, _expected_revision integer DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _property public.properties;
  _pending text[];
BEGIN
  SELECT * INTO _property FROM public.properties WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
  IF _property.removal_state = 'archived' THEN RETURN jsonb_build_object('status','archived'); END IF;
  IF _property.removal_state IS DISTINCT FROM 'pending_archive' THEN
    RETURN jsonb_build_object('status','not_pending');
  END IF;
  IF _expected_revision IS NOT NULL AND _property.revision <> _expected_revision THEN
    RETURN jsonb_build_object('status','stale','revision',_property.revision);
  END IF;
  SELECT COALESCE(array_agg(p.provider::text ORDER BY p.provider::text), '{}'::text[])
    INTO _pending FROM public.property_provider_publications p
   WHERE p.property_id = _property_id AND p.archive_intent_revision IS NOT NULL
     AND (p.status <> 'unpublished' OR p.desired_availability <> 'hidden'
          OR p.publication_intent_revision <> p.archive_intent_revision);
  IF cardinality(_pending) > 0 THEN
    RETURN jsonb_build_object('status','pending','providers',to_jsonb(_pending));
  END IF;
  UPDATE public.properties SET archived_at = now(), removal_state = 'archived', updated_at = now()
   WHERE id = _property_id;
  PERFORM public.cordial_site_sync_property(_property_id);
  INSERT INTO public.property_archive_events(property_id, transition, detail)
  VALUES (_property_id, 'archived', jsonb_build_object('revision', _property.revision));
  RETURN jsonb_build_object('status','archived');
END $function$;
REVOKE ALL ON FUNCTION public.property_archive_finalize(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_archive_finalize(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.property_unarchive(_property_id uuid, _requested_by uuid, _expected_revision integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _property public.properties;
BEGIN
  IF NOT public.property_can_archive(_requested_by) THEN
    RAISE EXCEPTION 'sem_permissao_para_reativar_imovel';
  END IF;
  SELECT * INTO _property FROM public.properties WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'notFound', true); END IF;
  IF _property.removal_state IS NULL AND _property.archived_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'alreadyActive', true);
  END IF;
  IF _property.removal_state NOT IN ('archived','pending_archive') THEN
    RAISE EXCEPTION 'imovel_em_remocao';
  END IF;
  IF _expected_revision IS NOT NULL AND _property.revision <> _expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'revision', _property.revision);
  END IF;
  UPDATE public.properties SET archived_at = NULL, removal_state = NULL,
         revision = COALESCE(revision,1) + 1, updated_at = now()
   WHERE id = _property_id;
  -- Vínculos continuam ocultos: republicar é ação explícita.
  UPDATE public.property_provider_publications
     SET archive_intent_revision = NULL, enabled = false, updated_at = now()
   WHERE property_id = _property_id;
  PERFORM public.cordial_site_sync_property(_property_id);
  INSERT INTO public.property_archive_events(property_id, actor_id, transition, detail)
  VALUES (_property_id, _requested_by, 'unarchived',
          jsonb_build_object('from', _property.removal_state));
  RETURN jsonb_build_object('ok', true);
END $function$;
REVOKE ALL ON FUNCTION public.property_unarchive(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_unarchive(uuid, uuid, integer) TO service_role;