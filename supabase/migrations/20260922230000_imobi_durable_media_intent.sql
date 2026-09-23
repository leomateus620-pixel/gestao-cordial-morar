-- A alteração local da galeria e a intenção de envio passam a confirmar juntas.
-- A fila continua sendo property_sync_jobs; media_dirty_revision é a marca durável
-- que permite reconstruir um job perdido sem depender do navegador ou do kick HTTP.
ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS replacement_target_image_id uuid;
CREATE INDEX IF NOT EXISTS property_images_staged_replacement_idx
  ON public.property_images (property_id, replacement_target_image_id)
  WHERE replacement_target_image_id IS NOT NULL;

ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS media_dirty_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_recovery_next_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desired_availability text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS publication_intent_revision integer NOT NULL DEFAULT 0;

UPDATE public.property_provider_publications
   SET desired_availability = 'hidden'
 WHERE NOT enabled OR status = 'unpublished';

ALTER TABLE public.property_provider_publications
  ADD CONSTRAINT property_publication_desired_availability_check
  CHECK (desired_availability IN ('visible', 'hidden', 'deleted'));

ALTER TABLE public.property_sync_jobs
  ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_recovery_at timestamptz,
  ADD COLUMN IF NOT EXISTS publication_intent_revision integer;

CREATE INDEX IF NOT EXISTS ppp_media_recovery_due_idx
  ON public.property_provider_publications (media_recovery_next_at, media_dirty_at, id)
  WHERE enabled AND external_property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS psj_failed_recovery_due_idx
  ON public.property_sync_jobs (next_recovery_at, next_run_at, id)
  WHERE status = 'failed';

-- A versão anterior não observava pending_remote_delete quando uma foto que não
-- era capa deixava a galeria. Também não via troca de conteúdo no mesmo lugar.
CREATE OR REPLACE FUNCTION public.property_images_bump_gallery_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _property uuid := COALESCE(NEW.property_id, OLD.property_id);
BEGIN
  -- Um original enviado para substituir outra foto fica invisível até a troca
  -- transacional. Ele não cria intenção nem aparece na galeria sozinho.
  IF TG_OP = 'INSERT' AND COALESCE(NEW.pending_remote_delete, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' AND COALESCE(OLD.pending_remote_delete, false) THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(NEW.pending_remote_delete, false)
     AND COALESCE(OLD.pending_remote_delete, false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND
     NEW.position IS NOT DISTINCT FROM OLD.position AND
     NEW.is_cover IS NOT DISTINCT FROM OLD.is_cover AND
     NEW.pending_remote_delete IS NOT DISTINCT FROM OLD.pending_remote_delete AND
     NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path AND
     NEW.original_storage_path IS NOT DISTINCT FROM OLD.original_storage_path AND
     NEW.processed_storage_path IS NOT DISTINCT FROM OLD.processed_storage_path AND
     NEW.processed_checksum IS NOT DISTINCT FROM OLD.processed_checksum AND
     NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash AND
     NEW.watermark_variant IS NOT DISTINCT FROM OLD.watermark_variant AND
     NEW.processing_status IS NOT DISTINCT FROM OLD.processing_status THEN
    RETURN NEW;
  END IF;

  UPDATE public.properties
     SET gallery_revision = gallery_revision + 1
   WHERE id = _property;
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.property_images_bump_gallery_revision() FROM PUBLIC, anon, authenticated;

-- Registra os bytes já duráveis sem publicar uma segunda foto. O alvo é
-- validado sob a mesma trava por imóvel que protege a troca posterior.
CREATE OR REPLACE FUNCTION public.property_image_stage_replacement(
  _property_id uuid, _old_image_id uuid, _payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old public.property_images; _id uuid; _position integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria') OR
    public.has_role(auth.uid(), 'corretor')
  ) THEN RAISE EXCEPTION 'sem_permissao_para_editar_fotos'; END IF;
  IF nullif(_payload->>'storage_path', '') IS NULL THEN RAISE EXCEPTION 'arquivo_nao_persistido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));
  SELECT * INTO _old FROM public.property_images
   WHERE id = _old_image_id AND property_id = _property_id
     AND NOT COALESCE(pending_remote_delete, false) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'foto_substituida_foi_removida'; END IF;
  SELECT COALESCE(max(position) + 1, 0) INTO _position
    FROM public.property_images WHERE property_id = _property_id;
  INSERT INTO public.property_images (
    property_id, storage_path, original_storage_path, original_checksum,
    file_name, mime_type, size_bytes, content_hash, position, is_cover,
    pending_remote_delete, replacement_target_image_id,
    upload_status, processing_status, uploaded_by, batch_id
  ) VALUES (
    _property_id, _payload->>'storage_path',
    COALESCE(_payload->>'original_storage_path', _payload->>'storage_path'),
    _payload->>'original_checksum', _payload->>'file_name', _payload->>'mime_type',
    NULLIF(_payload->>'size_bytes', '')::bigint, _payload->>'content_hash',
    _position, false, true, _old_image_id,
    'ready', 'pending', NULLIF(_payload->>'uploaded_by', '')::uuid,
    NULLIF(_payload->>'batch_id', '')::uuid
  ) RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.property_image_stage_replacement(uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_image_stage_replacement(uuid, uuid, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.property_gallery_intent_on_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _publication record;
BEGIN
  IF NEW.gallery_revision IS NOT DISTINCT FROM OLD.gallery_revision THEN RETURN NEW; END IF;

  -- Nenhum status de publicação é alterado aqui: uma mudança de fotos não
  -- transforma uma edição cadastral em publicação ou vice-versa.
  FOR _publication IN
    UPDATE public.property_provider_publications p
       SET media_dirty_revision = GREATEST(COALESCE(p.media_dirty_revision, 0), NEW.gallery_revision),
           media_dirty_at = now(),
           media_recovery_next_at = now(),
           media_recovery_attempts = 0
     WHERE p.property_id = NEW.id
       AND p.enabled
       AND p.desired_availability = 'visible'
       AND p.status NOT IN ('draft', 'unpublished')
    RETURNING p.provider, p.external_property_id
  LOOP
    -- Identidade remota deve ser confirmada antes de iniciar mídia. Quando
    -- surgir, outro gatilho materializa o job a partir da intenção preservada.
    IF _publication.external_property_id IS NOT NULL AND NOT NEW.is_draft AND NEW.archived_at IS NULL THEN
      PERFORM public.queue_media_sync_coalesced(
        NEW.id, _publication.provider, NEW.gallery_revision, NULL
      );
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.property_gallery_intent_on_revision() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS property_gallery_intent_revision_trg ON public.properties;
CREATE TRIGGER property_gallery_intent_revision_trg
  AFTER UPDATE OF gallery_revision ON public.properties
  FOR EACH ROW WHEN (NEW.gallery_revision IS DISTINCT FROM OLD.gallery_revision)
  EXECUTE FUNCTION public.property_gallery_intent_on_revision();

CREATE OR REPLACE FUNCTION public.property_gallery_intent_on_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _revision integer;
  _activated boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _activated := true;
  ELSE
    _activated := OLD.external_property_id IS NULL
               OR OLD.enabled IS DISTINCT FROM NEW.enabled
               OR OLD.status IN ('draft', 'unpublished', 'pending');
  END IF;
  IF NEW.enabled AND NEW.desired_availability = 'visible'
     AND NEW.external_property_id IS NOT NULL
     AND NEW.status IN ('published', 'partial', 'out_of_sync', 'error')
     AND _activated THEN
    SELECT p.gallery_revision INTO _revision FROM public.properties p
     WHERE p.id = NEW.property_id AND NOT p.is_draft AND p.archived_at IS NULL;
    IF _revision IS NOT NULL AND
       GREATEST(COALESCE(NEW.media_dirty_revision, 0), _revision) > COALESCE(NEW.synced_gallery_revision, 0) THEN
      PERFORM public.queue_media_sync_coalesced(
        NEW.property_id, NEW.provider,
        GREATEST(COALESCE(NEW.media_dirty_revision, 0), _revision), NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.property_gallery_intent_on_publication() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS property_gallery_intent_publication_trg ON public.property_provider_publications;
CREATE TRIGGER property_gallery_intent_publication_trg
  AFTER INSERT OR UPDATE OF external_property_id, enabled, status
  ON public.property_provider_publications
  FOR EACH ROW EXECUTE FUNCTION public.property_gallery_intent_on_publication();

-- As mutações abaixo mantêm o tombstone e os links até todas as exclusões
-- remotas serem confirmadas. Storage é limpo somente depois do commit e só
-- quando a resposta traz caminhos órfãos.
CREATE OR REPLACE FUNCTION public.property_image_delete_atomic(
  _property_id uuid, _image_id uuid, _expected_gallery_revision integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _image public.property_images;
  _revision integer;
  _pending integer;
  _paths text[] := '{}'::text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'secretaria') OR
    public.has_role(auth.uid(), 'corretor')
  ) THEN RAISE EXCEPTION 'sem_permissao_para_editar_fotos'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));
  SELECT gallery_revision INTO _revision FROM public.properties
   WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'imovel_nao_encontrado'; END IF;
  IF _expected_gallery_revision IS NOT NULL AND _revision <> _expected_gallery_revision THEN
    RAISE EXCEPTION 'galeria_desatualizada: a galeria mudou enquanto você editava.';
  END IF;

  SELECT * INTO _image FROM public.property_images
   WHERE id = _image_id AND property_id = _property_id
     AND NOT COALESCE(pending_remote_delete, false) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'foto_nao_esta_ativa'; END IF;

  UPDATE public.property_image_provider_publications
     SET desired_state = 'absent', pending_delete_at = COALESCE(pending_delete_at, now()),
         status = 'pending_delete', attempts = 0, next_retry_at = NULL
   WHERE image_id = _image_id AND deleted_at IS NULL;
  GET DIAGNOSTICS _pending = ROW_COUNT;

  IF _pending > 0 THEN
    UPDATE public.property_images
       SET pending_remote_delete = true, is_cover = false
     WHERE id = _image_id;
  ELSE
    DELETE FROM public.property_images WHERE id = _image_id;
    SELECT COALESCE(array_agg(DISTINCT candidate.path), '{}'::text[]) INTO _paths
      FROM unnest(ARRAY[_image.storage_path, _image.original_storage_path,
                        _image.processed_storage_path, _image.thumbnail_storage_path]) AS candidate(path)
     WHERE candidate.path IS NOT NULL AND candidate.path <> ''
       AND NOT EXISTS (
         SELECT 1 FROM public.property_images remaining
          WHERE candidate.path IN (remaining.storage_path, remaining.original_storage_path,
                                   remaining.processed_storage_path, remaining.thumbnail_storage_path)
       );
  END IF;

  PERFORM public.property_images_normalize(_property_id);
  SELECT gallery_revision INTO _revision FROM public.properties WHERE id = _property_id;
  RETURN jsonb_build_object('ok', true, 'revision', _revision,
                            'retained', _pending > 0, 'orphanStoragePaths', to_jsonb(_paths));
END $$;

CREATE OR REPLACE FUNCTION public.property_image_replace_atomic(
  _property_id uuid, _old_image_id uuid, _new_image_id uuid,
  _expected_gallery_revision integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _revision integer;
  _old public.property_images;
  _new public.property_images;
  _ids uuid[];
  _ordered uuid[] := '{}'::uuid[];
  _id uuid;
  _deleted jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'secretaria') OR
    public.has_role(auth.uid(), 'corretor')
  ) THEN RAISE EXCEPTION 'sem_permissao_para_editar_fotos'; END IF;
  IF _old_image_id = _new_image_id THEN RAISE EXCEPTION 'foto_substituta_igual_a_original'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));
  SELECT gallery_revision INTO _revision FROM public.properties
   WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'imovel_nao_encontrado'; END IF;
  IF _expected_gallery_revision IS NOT NULL AND _revision <> _expected_gallery_revision THEN
    RAISE EXCEPTION 'galeria_desatualizada: a galeria mudou enquanto você editava.';
  END IF;

  SELECT * INTO _old FROM public.property_images
   WHERE id = _old_image_id AND property_id = _property_id
     AND NOT COALESCE(pending_remote_delete, false) FOR UPDATE;
  SELECT * INTO _new FROM public.property_images
   WHERE id = _new_image_id AND property_id = _property_id
     AND COALESCE(pending_remote_delete, false)
     AND replacement_target_image_id = _old_image_id FOR UPDATE;
  IF _old.id IS NULL OR _new.id IS NULL THEN RAISE EXCEPTION 'foto_nao_esta_ativa'; END IF;

  SELECT array_agg(id ORDER BY position, created_at, id) INTO _ids
    FROM public.property_images WHERE property_id = _property_id
      AND NOT COALESCE(pending_remote_delete, false);
  FOREACH _id IN ARRAY _ids LOOP
    IF _id = _new_image_id THEN CONTINUE; END IF;
    _ordered := array_append(_ordered, CASE WHEN _id = _old_image_id THEN _new_image_id ELSE _id END);
  END LOOP;

  UPDATE public.property_image_provider_publications
     SET replacement_of_image_id = _new_image_id
   WHERE image_id = _old_image_id AND deleted_at IS NULL;
  _deleted := public.property_image_delete_atomic(_property_id, _old_image_id, NULL);
  UPDATE public.property_images
     SET pending_remote_delete = false, replacement_target_image_id = NULL,
         position = _old.position
   WHERE id = _new_image_id;
  PERFORM public.reorder_property_images(_property_id, _ordered, NULL);
  SELECT gallery_revision INTO _revision FROM public.properties WHERE id = _property_id;
  RETURN jsonb_build_object('ok', true, 'revision', _revision,
                            'retained', _deleted->'retained',
                            'orphanStoragePaths', _deleted->'orphanStoragePaths');
END $$;

REVOKE ALL ON FUNCTION public.property_image_delete_atomic(uuid, uuid, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.property_image_replace_atomic(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_image_delete_atomic(uuid, uuid, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.property_image_replace_atomic(uuid, uuid, uuid, integer)
  TO authenticated, service_role;

-- O token só vale enquanto o lease está ativo. Conclusão tardia não pode
-- confirmar um resultado depois da expiração, ainda que o watchdog não tenha
-- reivindicado a linha novamente.
CREATE OR REPLACE FUNCTION public.property_sync_finish_job(
  _job_id uuid, _lease_token uuid, _fields jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cols text;
  updated integer;
BEGIN
  SELECT string_agg(quote_ident(k), ', ') INTO cols
    FROM jsonb_object_keys(_fields) AS k
   WHERE EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'property_sync_jobs'
        AND c.column_name = k
        AND c.column_name NOT IN ('id','property_id','provider','action','lease_token')
   );
  IF cols IS NULL THEN RETURN false; END IF;

  EXECUTE format(
    'UPDATE public.property_sync_jobs j SET (%s, updated_at, lease_token) = '
    || '(SELECT %s, now(), NULL::uuid FROM jsonb_populate_record(NULL::public.property_sync_jobs, $1)) '
    || 'WHERE j.id = $2 AND j.lease_token = $3 AND j.status = ''processing'' '
    || 'AND j.lock_expires_at > now() '
     || 'AND (COALESCE($1->>''status'', '''') NOT IN (''succeeded'', ''retry'') '
     || 'OR EXISTS ('
     || 'SELECT 1 FROM public.property_provider_publications p '
     || 'JOIN public.properties x ON x.id = p.property_id '
     || 'WHERE p.property_id = j.property_id AND p.provider = j.provider '
     || 'AND p.publication_intent_revision = COALESCE(j.publication_intent_revision, 0) '
     || 'AND (j.action NOT IN (''publish'', ''update'') '
     || 'OR x.revision = j.requested_revision)))', cols, cols
  ) USING _fields, _job_id, _lease_token;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END $$;

CREATE OR REPLACE FUNCTION public.property_sync_renew_lease(
  _job_id uuid, _lease_token uuid, _seconds integer DEFAULT 120
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated integer;
BEGIN
  UPDATE public.property_sync_jobs
     SET lock_expires_at = now() + make_interval(secs => GREATEST(30, _seconds)),
         updated_at = now()
   WHERE id = _job_id AND lease_token = _lease_token
     AND status = 'processing' AND lock_expires_at > now();
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END $$;

REVOKE ALL ON FUNCTION public.property_sync_finish_job(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.property_sync_renew_lease(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_finish_job(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.property_sync_renew_lease(uuid, uuid, integer) TO service_role;

-- Confirmação da publicação é condicional na MESMA transação do lease e da
-- decisão de disponibilidade. A verificação anterior ao HTTP não basta:
-- outro worker pode reivindicar o job entre essa leitura e o UPDATE.
CREATE OR REPLACE FUNCTION public.property_publication_update_if_owned(
  _job_id uuid, _lease_token uuid, _publication_id uuid, _fields jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _property public.properties;
  _publication public.property_provider_publications;
  _job public.property_sync_jobs;
  _property_id uuid;
  _columns text;
BEGIN
  IF _lease_token IS NULL THEN RETURN false; END IF;
  SELECT property_id INTO _property_id FROM public.property_provider_publications
   WHERE id = _publication_id;
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
      -- Jobs antigos com NULL pertencem somente à intenção inicial (0).
      -- Uma decisão nova nunca herda confirmação de um job legado.
      OR COALESCE(_job.publication_intent_revision, 0) <>
         _publication.publication_intent_revision
      OR (_job.action IN ('publish', 'update') AND
          _property.revision <> _job.requested_revision)
     OR (_job.action IN ('publish', 'update', 'media_sync') AND
         (_publication.desired_availability <> 'visible' OR NOT _publication.enabled))
     OR (_job.action = 'media_sync' AND
         (_property.archived_at IS NOT NULL OR
          _property.gallery_revision <> _job.requested_revision)) THEN
    RETURN false;
  END IF;
  SELECT string_agg(quote_ident(k), ', ') INTO _columns
    FROM jsonb_object_keys(_fields) AS k
   WHERE EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'property_provider_publications'
        AND c.column_name = k
        AND c.column_name NOT IN (
          'id', 'property_id', 'provider', 'external_property_id',
          'external_reference', 'enabled', 'desired_availability',
          'publication_intent_revision', 'created_at', 'updated_at'
        )
   );
  IF _columns IS NULL THEN RETURN false; END IF;
  EXECUTE format(
    'UPDATE public.property_provider_publications p SET (%s, updated_at) = '
    || '(SELECT %s, now() FROM jsonb_populate_record(NULL::public.property_provider_publications, $1)) '
    || 'WHERE p.id = $2', _columns, _columns
  ) USING _fields, _publication_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.property_publication_update_if_owned(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_publication_update_if_owned(uuid, uuid, uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.property_media_finish_job(
  _job_id uuid, _lease_token uuid, _fields jsonb, _property_id uuid,
  _provider public.imobi_provider, _processed_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owned boolean;
  _followup jsonb;
BEGIN
  IF _lease_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.property_sync_jobs
     WHERE id = _job_id AND property_id = _property_id AND provider = _provider
       AND action = 'media_sync'
  ) THEN
    RETURN jsonb_build_object('owned', false, 'followup', NULL);
  END IF;
  SELECT public.property_sync_finish_job(_job_id, _lease_token, _fields) INTO _owned;
  IF NOT COALESCE(_owned, false) THEN
    RETURN jsonb_build_object('owned', false, 'followup', NULL);
  END IF;
  _followup := public.property_media_finish(_property_id, _provider, _processed_revision);
  RETURN jsonb_build_object('owned', true, 'followup', _followup);
END $$;

REVOKE ALL ON FUNCTION public.property_media_finish_job(uuid, uuid, jsonb, uuid, public.imobi_provider, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_media_finish_job(uuid, uuid, jsonb, uuid, public.imobi_provider, integer)
  TO service_role;

-- Novos jobs de mídia recebem a versão da intenção de disponibilidade.
-- Recoalescência atualiza o snapshot somente enquanto o job está na fila;
-- uma execução antiga conserva o token anterior e perde a confirmação.
CREATE OR REPLACE FUNCTION public.property_media_job_intent_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _changed := true;
  ELSE
    _changed := OLD.requested_revision IS DISTINCT FROM NEW.requested_revision
                OR OLD.status IS DISTINCT FROM NEW.status;
  END IF;
  IF NEW.action = 'media_sync' AND NEW.status IN ('pending', 'retry')
     AND _changed THEN
    SELECT publication_intent_revision INTO NEW.publication_intent_revision
      FROM public.property_provider_publications
     WHERE property_id = NEW.property_id AND provider = NEW.provider;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.property_media_job_intent_snapshot()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS property_media_job_intent_snapshot_trg ON public.property_sync_jobs;
CREATE TRIGGER property_media_job_intent_snapshot_trg
  BEFORE INSERT OR UPDATE OF requested_revision, status ON public.property_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.property_media_job_intent_snapshot();

-- Decisão explícita de disponibilidade, vínculo por conta e job formam uma
-- transação. O código remoto nunca entra nos argumentos nem é copiado entre
-- contas. Uma nova decisão incrementa a revisão local e a versão da intenção
-- de cada destino, invalidando trabalhos de disponibilidade anteriores.
CREATE OR REPLACE FUNCTION public.property_publication_request(
  _property_id uuid, _providers text[], _action text, _requested_by uuid,
  _external_reference text, _expected_revision integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _property public.properties;
  _revision integer;
  _gallery_revision integer;
  _provider text;
  _providers_distinct text[];
  _targets text[];
  _availability text;
  _enabled boolean;
  _publication_id uuid;
  _intent_revision integer;
  _reference text := 'GC-' || left(upper(replace(_property_id::text, '-', '')), 12);
BEGIN
  IF _action NOT IN ('publish', 'update', 'unpublish', 'delete') THEN
    RAISE EXCEPTION 'acao_de_publicacao_invalida';
  END IF;
  IF _external_reference IS DISTINCT FROM _reference THEN
    RAISE EXCEPTION 'referencia_externa_invalida';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT t.provider ORDER BY t.provider), '{}'::text[])
    INTO _providers_distinct FROM unnest(_providers) AS t(provider);
  IF cardinality(_providers_distinct) = 0 OR
     EXISTS (SELECT 1 FROM unnest(_providers_distinct) AS t(provider)
              WHERE t.provider NOT IN ('cordial', 'morar')) THEN
    RAISE EXCEPTION 'destino_de_publicacao_invalido';
  END IF;

  SELECT * INTO _property FROM public.properties WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'notFound', true); END IF;
  IF _expected_revision IS NOT NULL AND _property.revision <> _expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'revision', _property.revision);
  END IF;
  IF _action IN ('publish', 'update') AND _property.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'imovel_arquivado_nao_pode_publicar';
  END IF;

  _revision := COALESCE(_property.revision, 1) + 1;
  _availability := CASE _action WHEN 'unpublish' THEN 'hidden'
                                WHEN 'delete' THEN 'deleted' ELSE 'visible' END;
  _enabled := _availability = 'visible';
  IF _enabled THEN
    SELECT COALESCE(array_agg(DISTINCT t.provider ORDER BY t.provider), '{}'::text[])
      INTO _targets
      FROM unnest(COALESCE(_property.publish_targets, '{}'::text[]) || _providers_distinct) AS t(provider);
  ELSE
    SELECT COALESCE(array_agg(DISTINCT t.provider ORDER BY t.provider), '{}'::text[])
      INTO _targets FROM unnest(COALESCE(_property.publish_targets, '{}'::text[])) AS t(provider)
     WHERE t.provider <> ALL(_providers_distinct);
  END IF;
  UPDATE public.properties
     SET revision = _revision, publish_targets = _targets,
         is_draft = CASE WHEN _enabled THEN false ELSE is_draft END,
         removal_state = CASE WHEN _enabled AND removal_state IN ('pending_archive', 'pending_removal')
                              THEN NULL ELSE removal_state END,
         updated_at = now()
   WHERE id = _property_id;
  -- A troca de destinos pode tornar outra variante de marca pendente e
  -- avançar a galeria no gatilho. A publicação nova precisa dessa revisão.
  SELECT gallery_revision INTO _gallery_revision
    FROM public.properties WHERE id = _property_id;

  FOREACH _provider IN ARRAY _providers_distinct LOOP
    INSERT INTO public.property_provider_publications
      (property_id, provider, external_reference, enabled, status,
       desired_availability, publication_intent_revision,
       media_dirty_revision, media_dirty_at, media_recovery_next_at)
    VALUES
      (_property_id, _provider::public.imobi_provider, _reference, _enabled, 'pending',
       _availability, 1,
       CASE WHEN _enabled THEN _gallery_revision ELSE NULL END,
       CASE WHEN _enabled THEN now() ELSE NULL END,
       CASE WHEN _enabled THEN now() ELSE NULL END)
    ON CONFLICT (property_id, provider) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          status = 'pending',
          desired_availability = EXCLUDED.desired_availability,
          publication_intent_revision =
            public.property_provider_publications.publication_intent_revision + 1,
          media_dirty_revision = CASE WHEN EXCLUDED.enabled THEN
            GREATEST(COALESCE(public.property_provider_publications.media_dirty_revision, 0),
                     COALESCE(_gallery_revision, 1))
            ELSE public.property_provider_publications.media_dirty_revision END,
          media_dirty_at = CASE WHEN EXCLUDED.enabled THEN now()
                                ELSE public.property_provider_publications.media_dirty_at END,
          media_recovery_next_at = CASE WHEN EXCLUDED.enabled THEN now()
                                        ELSE public.property_provider_publications.media_recovery_next_at END
    RETURNING id, publication_intent_revision INTO _publication_id, _intent_revision;

    IF NOT _enabled THEN
      UPDATE public.property_sync_jobs
         SET status = 'cancelled', finished_at = now(),
             last_error_category = 'superseded',
             last_error_message = 'A disponibilidade do imóvel mudou; fotos antigas não serão enviadas.'
       WHERE property_id = _property_id AND provider = _provider::public.imobi_provider
         AND action = 'media_sync' AND status IN ('pending', 'retry');
    END IF;

    INSERT INTO public.property_sync_jobs
      (property_id, provider, action, requested_revision, requested_by,
       status, next_run_at, publication_intent_revision)
    VALUES
      (_property_id, _provider::public.imobi_provider,
       _action::public.property_sync_action, _revision, _requested_by,
       'pending', now(), _intent_revision);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'revision', _revision,
                            'providers', to_jsonb(_providers_distinct),
                            'availability', _availability);
END $$;

REVOKE ALL ON FUNCTION public.property_publication_request(uuid, text[], text, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_publication_request(uuid, text[], text, uuid, text, integer)
  TO service_role;

-- Jobs legados continuam válidos depois da migração. Somente novas decisões
-- explícitas avançam publication_intent_revision.
UPDATE public.property_sync_jobs j
   SET publication_intent_revision = p.publication_intent_revision
  FROM public.property_provider_publications p
 WHERE j.property_id = p.property_id AND j.provider = p.provider
   AND j.publication_intent_revision IS NULL;
