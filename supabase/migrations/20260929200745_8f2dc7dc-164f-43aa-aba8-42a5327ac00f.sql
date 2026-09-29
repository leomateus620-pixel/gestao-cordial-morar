ALTER TABLE public.property_sync_attempts
  ADD COLUMN IF NOT EXISTS response_excerpt text,
  ADD COLUMN IF NOT EXISTS request_path text,
  ADD COLUMN IF NOT EXISTS outcome text;

ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS create_state_before text,
  ADD COLUMN IF NOT EXISTS create_absent_checks_before integer,
  ADD COLUMN IF NOT EXISTS create_prepared_at timestamptz,
  ADD COLUMN IF NOT EXISTS create_first_requested_at timestamptz;

CREATE OR REPLACE FUNCTION public.property_publication_prepare_create(
  _job_id uuid, _lease_token uuid, _publication_id uuid, _worker text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _property_id uuid;
  _property public.properties;
  _publication public.property_provider_publications;
  _job public.property_sync_jobs;
  _now timestamptz := now();
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
     SET create_state_before = _publication.create_state,
         create_absent_checks_before = _publication.create_absent_checks,
         create_prepared_at = _now,
         create_first_requested_at = COALESCE(_publication.create_first_requested_at, _now),
         create_state = 'awaiting_create_reconcile',
         create_ambiguous_at = _now, create_absent_checks = 0,
         updated_at = now()
   WHERE id = _publication_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.property_publication_prepare_create(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_publication_prepare_create(uuid, uuid, uuid, text)
  TO service_role;

-- Desfaz o checkpoint quando o site recusou a criação de forma DEFINITIVA.
-- Só vale para o mesmo job com lease válido e se nada remarcou a publicação
-- depois do prepare (create_ambiguous_at = create_prepared_at, contador 0).
CREATE OR REPLACE FUNCTION public.property_publication_revert_prepare_create(
  _job_id uuid, _lease_token uuid, _publication_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _publication public.property_provider_publications;
  _job public.property_sync_jobs;
BEGIN
  IF _lease_token IS NULL THEN RETURN false; END IF;
  SELECT * INTO _publication FROM public.property_provider_publications
   WHERE id = _publication_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO _job FROM public.property_sync_jobs
   WHERE id = _job_id AND lease_token = _lease_token
     AND status = 'processing' AND lock_expires_at > now();
  IF NOT FOUND OR _job.property_id <> _publication.property_id
     OR _job.provider <> _publication.provider
     OR _publication.external_property_id IS NOT NULL
     OR _publication.create_state IS DISTINCT FROM 'awaiting_create_reconcile'
     OR _publication.create_prepared_at IS NULL
     OR _publication.create_ambiguous_at IS DISTINCT FROM _publication.create_prepared_at
     OR COALESCE(_publication.create_absent_checks, 0) <> 0 THEN
    RETURN false;
  END IF;
  UPDATE public.property_provider_publications
     SET create_state = _publication.create_state_before,
         create_absent_checks = COALESCE(_publication.create_absent_checks_before, 0),
         create_ambiguous_at = CASE WHEN _publication.create_state_before IS NULL THEN NULL
                                    ELSE create_ambiguous_at END,
         create_prepared_at = NULL,
         updated_at = now()
   WHERE id = _publication_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.property_publication_revert_prepare_create(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_publication_revert_prepare_create(uuid, uuid, uuid)
  TO service_role;

-- Aviso aos administradores: anúncio pedido há mais de 20 min e ainda sem
-- código no site. Um aviso por publicação/ciclo e por administrador.
CREATE OR REPLACE FUNCTION public.property_create_stuck_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer := 0;
BEGIN
  WITH stuck AS (
    SELECT p.id, p.property_id, p.provider::text AS provider, p.create_first_requested_at,
           pr.codigo_interno, pr.titulo
      FROM public.property_provider_publications p
      JOIN public.properties pr ON pr.id = p.property_id
     WHERE p.external_property_id IS NULL
       AND p.enabled
       AND p.desired_availability = 'visible'
       AND p.create_first_requested_at IS NOT NULL
       AND p.create_first_requested_at < now() - interval '20 minutes'
       AND p.create_first_requested_at > now() - interval '7 days'
  ), admins AS (
    SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin'
  ), ins AS (
    INSERT INTO public.notifications
      (user_id, tipo, titulo, mensagem, link, lida, category, entity_type, entity_id, dedup_key, metadata)
    SELECT a.user_id, 'imobi_create_stuck',
           'Imóvel ainda não está no ar na ' || initcap(s.provider),
           COALESCE('Código ' || s.codigo_interno || ' · ', '') || COALESCE(s.titulo, 'Imóvel') ||
             ' — pedido de criação há mais de 20 minutos sem confirmação do site.',
           '/imoveis/' || s.property_id, false, 'system', 'property', s.property_id,
           'imobi-create-stuck:' || s.id || ':' || extract(epoch from s.create_first_requested_at)::bigint || ':' || a.user_id,
           jsonb_build_object('provider', s.provider, 'publication_id', s.id)
      FROM stuck s CROSS JOIN admins a
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM ins;
  RETURN _count;
END $$;

REVOKE ALL ON FUNCTION public.property_create_stuck_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_create_stuck_alerts() TO service_role;