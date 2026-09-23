-- Versão do 20260923060000 SEM as rotinas diárias de importação (autorizado 23/09).
CREATE TABLE IF NOT EXISTS public.backup_20260923_policies_060000 AS
SELECT now() AS saved_at, tablename, policyname, cmd, roles::text, qual, with_check
  FROM pg_policies WHERE schemaname='public' AND tablename IN ('property_images','property_image_batches');
REVOKE ALL ON public.backup_20260923_policies_060000 FROM anon, authenticated;
GRANT ALL ON public.backup_20260923_policies_060000 TO service_role;
ALTER TABLE public.backup_20260923_policies_060000 ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.property_publication_prepare_create(
  _job_id uuid, _lease_token uuid, _publication_id uuid, _worker text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _property_id uuid;
  _property public.properties;
  _publication public.property_provider_publications;
  _job public.property_sync_jobs;
BEGIN
  IF _lease_token IS NULL OR _worker IS NULL OR _worker <> _lease_token::text THEN
    RETURN false;
  END IF;
  SELECT property_id INTO _property_id
    FROM public.property_provider_publications WHERE id = _publication_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _property FROM public.properties WHERE id = _property_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _publication FROM public.property_provider_publications
   WHERE id = _publication_id FOR UPDATE;
  SELECT * INTO _job FROM public.property_sync_jobs
   WHERE id = _job_id AND lease_token = _lease_token
     AND status = 'processing' AND lock_expires_at > now() FOR UPDATE;
  IF NOT FOUND OR _job.property_id <> _property_id
     OR _job.provider <> _publication.provider
     OR _job.action NOT IN ('publish', 'update')
     OR _job.requested_revision <> _property.revision
     OR COALESCE(_job.publication_intent_revision, 0) <>
        _publication.publication_intent_revision
     OR _publication.desired_availability <> 'visible'
     OR NOT _publication.enabled
     OR _publication.external_property_id IS NOT NULL
     OR _publication.create_lock_worker IS DISTINCT FROM _worker
     OR _publication.create_lock_expires_at <= now() THEN
    RETURN false;
  END IF;
  UPDATE public.property_provider_publications
     SET create_state = 'awaiting_create_reconcile',
         create_ambiguous_at = now(), create_absent_checks = 0,
         updated_at = now()
   WHERE id = _publication_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.property_publication_prepare_create(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_publication_prepare_create(uuid, uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.property_publication_finish_availability_if_owned(
  _job_id uuid, _lease_token uuid, _publication_id uuid, _action text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _property_id uuid;
  _property public.properties;
  _publication public.property_provider_publications;
  _job public.property_sync_jobs;
BEGIN
  IF _lease_token IS NULL OR _action NOT IN ('unpublish', 'delete') THEN RETURN false; END IF;
  SELECT property_id INTO _property_id
    FROM public.property_provider_publications WHERE id = _publication_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _property FROM public.properties WHERE id = _property_id FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _publication FROM public.property_provider_publications
   WHERE id = _publication_id FOR UPDATE;
  SELECT * INTO _job FROM public.property_sync_jobs
   WHERE id = _job_id AND lease_token = _lease_token
     AND status = 'processing' AND lock_expires_at > now() FOR UPDATE;
  IF NOT FOUND OR _job.property_id <> _property_id
     OR _job.provider <> _publication.provider
     OR _job.action::text <> _action
     OR COALESCE(_job.publication_intent_revision, 0) <>
        _publication.publication_intent_revision
     OR (_action = 'unpublish' AND _publication.desired_availability <> 'hidden')
     OR (_action = 'delete' AND _publication.desired_availability <> 'deleted') THEN
    RETURN false;
  END IF;
  IF _action = 'unpublish' THEN
    UPDATE public.property_provider_publications
       SET status = 'unpublished', enabled = false, last_synced_at = now(),
           last_payload_snapshot = jsonb_set(
             COALESCE(last_payload_snapshot, '{}'::jsonb),
             '{exibirImovel}', '"nao"'::jsonb, true),
           updated_at = now()
     WHERE id = _publication_id;
  ELSE
    UPDATE public.property_provider_publications
       SET status = 'draft', enabled = false, external_property_id = NULL,
           last_synced_at = now(), updated_at = now()
     WHERE id = _publication_id;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.property_publication_finish_availability_if_owned(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_publication_finish_availability_if_owned(uuid, uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.property_retire_request(
  _property_id uuid, _requested_by uuid, _action text, _expected_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _property public.properties;
  _publication public.property_provider_publications;
  _new_revision integer;
  _next_intent integer;
  _providers text[] := '{}'::text[];
  _targets text[];
BEGIN
  IF _action NOT IN ('unpublish', 'delete') THEN RAISE EXCEPTION 'retire_action_invalid'; END IF;
  IF _requested_by IS NULL OR NOT (
    public.has_role(_requested_by, 'admin'::public.app_role) OR
    (_action = 'unpublish' AND public.has_role(_requested_by, 'secretaria'::public.app_role))
  ) THEN RAISE EXCEPTION 'sem_permissao_para_ocultar_ou_excluir_imovel'; END IF;
  SELECT * INTO _property FROM public.properties WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'notFound', true); END IF;
  IF _expected_revision IS NOT NULL AND _property.revision <> _expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'revision', _property.revision);
  END IF;
  _new_revision := COALESCE(_property.revision, 1) + 1;
  SELECT COALESCE(array_agg(p.provider::text ORDER BY p.provider::text), '{}'::text[])
    INTO _providers FROM public.property_provider_publications p
   WHERE p.property_id = _property_id AND (
     p.enabled OR p.external_property_id IS NOT NULL OR p.last_synced_at IS NOT NULL
     OR p.create_state = 'awaiting_create_reconcile'
     OR p.status IN ('pending', 'syncing', 'partial', 'out_of_sync')
   );
  SELECT COALESCE(array_agg(t.provider ORDER BY t.provider), '{}'::text[])
    INTO _targets FROM unnest(COALESCE(_property.publish_targets, '{}'::text[])) t(provider)
   WHERE t.provider <> ALL(_providers);
  UPDATE public.properties
     SET revision = _new_revision, publish_targets = _targets,
         removal_state = CASE _action WHEN 'delete' THEN 'pending_removal'
                                      ELSE 'pending_archive' END,
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
           publication_intent_revision = _next_intent, updated_at = now()
     WHERE id = _publication.id;
    UPDATE public.property_sync_jobs
       SET status = 'cancelled', finished_at = now(),
           last_error_category = 'superseded'
     WHERE property_id = _property_id AND provider = _publication.provider
       AND action = 'media_sync' AND status IN ('pending', 'retry');
    INSERT INTO public.property_sync_jobs
      (property_id, provider, action, requested_revision, requested_by,
       status, next_run_at, publication_intent_revision)
    VALUES (_property_id, _publication.provider,
            _action::public.property_sync_action, _new_revision, _requested_by,
            'pending', now(), _next_intent);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'revision', _new_revision,
                            'providers', to_jsonb(_providers));
END $$;

REVOKE ALL ON FUNCTION public.property_retire_request(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_retire_request(uuid, uuid, text, integer)
  TO service_role;

DROP POLICY IF EXISTS "property_images_insert" ON public.property_images;
DROP POLICY IF EXISTS "property_images_update" ON public.property_images;
DROP POLICY IF EXISTS "property_images_delete" ON public.property_images;
CREATE POLICY "property_images_insert" ON public.property_images FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "property_images_update" ON public.property_images FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'secretaria'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'secretaria'::public.app_role));
CREATE POLICY "property_images_delete" ON public.property_images FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'secretaria'::public.app_role));

CREATE OR REPLACE FUNCTION public.property_import_seed_incremental(
  _provider public.imobi_provider
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _run_id uuid;
  _last_started timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('property_import_seed:' || _provider::text));
  SELECT id INTO _run_id FROM public.property_import_runs
   WHERE provider = _provider AND status IN ('queued', 'running', 'paused')
   ORDER BY created_at DESC LIMIT 1;
  IF _run_id IS NOT NULL THEN
    RETURN jsonb_build_object('started', false, 'reason', 'active_run', 'run_id', _run_id);
  END IF;
  SELECT max(started_at) INTO _last_started FROM public.property_import_runs
   WHERE provider = _provider AND mode = 'incremental';
  IF _last_started > now() - interval '23 hours' THEN
    RETURN jsonb_build_object('started', false, 'reason', 'recent_run');
  END IF;
  INSERT INTO public.property_import_runs
    (provider, mode, status, requested_by, started_at)
  VALUES (_provider, 'incremental', 'running', NULL, now())
  RETURNING id INTO _run_id;
  INSERT INTO public.property_import_jobs
    (run_id, provider, job_type, page, idempotency_key, status, next_run_at)
  VALUES (_run_id, _provider, 'fetch_page', 1, 'page:1', 'pending', now());
  RETURN jsonb_build_object('started', true, 'run_id', _run_id);
END $$;

REVOKE ALL ON FUNCTION public.property_import_seed_incremental(public.imobi_provider)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_import_seed_incremental(public.imobi_provider)
  TO service_role;