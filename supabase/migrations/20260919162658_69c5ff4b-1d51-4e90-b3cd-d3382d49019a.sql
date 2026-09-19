-- 1. Estado de criação / duplicidade e trava por (imóvel, provedor)
ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS create_state text,
  ADD COLUMN IF NOT EXISTS create_lock_worker text,
  ADD COLUMN IF NOT EXISTS create_lock_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS create_ambiguous_at timestamptz,
  ADD COLUMN IF NOT EXISTS create_absent_checks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remote_match_count integer,
  ADD COLUMN IF NOT EXISTS remote_match_ids text[],
  ADD COLUMN IF NOT EXISTS remote_match_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_dirty_revision integer;

-- 2. Saneamento: mantém apenas o media_sync pendente mais recente por (imóvel, provedor)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY property_id, provider
           ORDER BY requested_revision DESC, created_at DESC
         ) AS rn
    FROM public.property_sync_jobs
   WHERE action = 'media_sync'
     AND status IN ('pending', 'retry')
)
UPDATE public.property_sync_jobs j
   SET status = 'cancelled',
       finished_at = now(),
       locked_at = NULL,
       lock_expires_at = NULL,
       locked_by = NULL,
       last_error_category = 'superseded',
       last_error_message = 'Substituído por versão mais recente da galeria.'
  FROM ranked
 WHERE j.id = ranked.id
   AND ranked.rn > 1;

-- 3. Um único media_sync ativo por (imóvel, provedor)
CREATE UNIQUE INDEX IF NOT EXISTS psj_media_active_unique
  ON public.property_sync_jobs (property_id, provider)
  WHERE action = 'media_sync' AND status IN ('pending', 'retry');

-- 4. Trava de criação com lease
CREATE OR REPLACE FUNCTION public.property_publication_acquire_create_lock(
  _publication_id uuid,
  _worker text,
  _lease_seconds integer DEFAULT 120
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.property_provider_publications;
BEGIN
  UPDATE public.property_provider_publications
     SET create_lock_worker = _worker,
         create_lock_expires_at = now() + make_interval(secs => GREATEST(10, _lease_seconds))
   WHERE id = _publication_id
     AND (create_lock_expires_at IS NULL
          OR create_lock_expires_at < now()
          OR create_lock_worker = _worker)
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    SELECT * INTO _row FROM public.property_provider_publications WHERE id = _publication_id;
    RETURN jsonb_build_object('acquired', false, 'publication', to_jsonb(_row));
  END IF;

  RETURN jsonb_build_object('acquired', true, 'publication', to_jsonb(_row));
END $$;

CREATE OR REPLACE FUNCTION public.property_publication_release_create_lock(
  _publication_id uuid,
  _worker text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.property_provider_publications
     SET create_lock_worker = NULL,
         create_lock_expires_at = NULL
   WHERE id = _publication_id
     AND (create_lock_worker = _worker OR create_lock_worker IS NULL);
$$;

-- 5. Fila de mídia coalescida: latest revision wins
CREATE OR REPLACE FUNCTION public.queue_media_sync_coalesced(
  _property_id uuid,
  _provider imobi_provider,
  _revision integer,
  _requested_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _active public.property_sync_jobs;
  _processing boolean;
  _target integer := GREATEST(1, COALESCE(_revision, 1));
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text || ':' || _provider::text, 7));

  SELECT EXISTS (
    SELECT 1 FROM public.property_sync_jobs
     WHERE property_id = _property_id AND provider = _provider
       AND action = 'media_sync' AND status = 'processing'
  ) INTO _processing;

  SELECT * INTO _active
    FROM public.property_sync_jobs
   WHERE property_id = _property_id AND provider = _provider
     AND action = 'media_sync' AND status IN ('pending', 'retry')
   ORDER BY requested_revision DESC
   LIMIT 1;

  IF _active.id IS NOT NULL THEN
    IF _active.requested_revision < _target THEN
      BEGIN
        UPDATE public.property_sync_jobs
           SET requested_revision = _target,
               status = 'pending',
               attempts = 0,
               next_run_at = now(),
               locked_at = NULL,
               lock_expires_at = NULL,
               locked_by = NULL,
               last_error_category = NULL,
               last_error_message = NULL
         WHERE id = _active.id;
      EXCEPTION WHEN unique_violation THEN
        UPDATE public.property_provider_publications
           SET media_dirty_revision = GREATEST(COALESCE(media_dirty_revision, 0), _target)
         WHERE property_id = _property_id AND provider = _provider;
        RETURN jsonb_build_object('result', 'deferred', 'revision', _target);
      END;
    END IF;
    RETURN jsonb_build_object('result', 'coalesced', 'job_id', _active.id, 'revision', _target);
  END IF;

  IF _processing THEN
    UPDATE public.property_provider_publications
       SET media_dirty_revision = GREATEST(COALESCE(media_dirty_revision, 0), _target)
     WHERE property_id = _property_id AND provider = _provider;
    RETURN jsonb_build_object('result', 'deferred', 'revision', _target);
  END IF;

  INSERT INTO public.property_sync_jobs
    (property_id, provider, action, requested_revision, requested_by, status, attempts, next_run_at)
  VALUES (_property_id, _provider, 'media_sync', _target, _requested_by, 'pending', 0, now())
  ON CONFLICT (property_id, provider, action, requested_revision) DO UPDATE
    SET status = 'pending',
        attempts = 0,
        next_run_at = now(),
        locked_at = NULL,
        lock_expires_at = NULL,
        locked_by = NULL,
        finished_at = NULL,
        last_error_category = NULL,
        last_error_message = NULL;

  RETURN jsonb_build_object('result', 'queued', 'revision', _target);
END $$;

-- 6. Acompanhamento pós-processamento: no máximo um follow-up na última versão
CREATE OR REPLACE FUNCTION public.property_media_finish(
  _property_id uuid,
  _provider imobi_provider,
  _processed_revision integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _desired integer;
  _dirty integer;
  _current integer;
BEGIN
  SELECT COALESCE(gallery_revision, 1) INTO _current FROM public.properties WHERE id = _property_id;

  SELECT media_dirty_revision INTO _dirty
    FROM public.property_provider_publications
   WHERE property_id = _property_id AND provider = _provider;

  UPDATE public.property_provider_publications
     SET media_dirty_revision = NULL
   WHERE property_id = _property_id AND provider = _provider;

  _desired := GREATEST(COALESCE(_current, 1), COALESCE(_dirty, 0));

  IF _desired > COALESCE(_processed_revision, 0) THEN
    RETURN public.queue_media_sync_coalesced(_property_id, _provider, _desired, NULL)
           || jsonb_build_object('followup', true);
  END IF;

  RETURN jsonb_build_object('followup', false, 'revision', _processed_revision);
END $$;

-- 7. Permissões: rotinas internas, apenas service_role
REVOKE ALL ON FUNCTION public.property_publication_acquire_create_lock(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_publication_release_create_lock(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_media_sync_coalesced(uuid, imobi_provider, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_media_finish(uuid, imobi_provider, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_publication_acquire_create_lock(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.property_publication_release_create_lock(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_media_sync_coalesced(uuid, imobi_provider, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.property_media_finish(uuid, imobi_provider, integer) TO service_role;