-- 1. Saneamento determinístico das posições (nenhuma foto é removida).
WITH ranked AS (
  SELECT id,
         property_id,
         (row_number() OVER (
            PARTITION BY property_id
            ORDER BY is_cover DESC, position NULLS LAST, created_at, id
          ) - 1)::int AS pos
    FROM public.property_images
)
UPDATE public.property_images pi
   SET position = ranked.pos - 1000000, updated_at = now()
  FROM ranked
 WHERE pi.id = ranked.id
   AND pi.position IS DISTINCT FROM ranked.pos;

UPDATE public.property_images
   SET position = position + 1000000
 WHERE position < -1;

-- 2. Exatamente uma capa por imóvel, sempre na posição 0.
UPDATE public.property_images
   SET is_cover = false, updated_at = now()
 WHERE is_cover = true AND position <> 0;

UPDATE public.property_images
   SET is_cover = true, updated_at = now()
 WHERE position = 0 AND is_cover = false;

-- 3. Validação: aborta a migração se sobrar qualquer duplicidade/lacuna.
DO $$
DECLARE
  _dup int;
  _gap int;
  _cover int;
BEGIN
  SELECT count(*) INTO _dup FROM (
    SELECT property_id, position FROM public.property_images
     GROUP BY 1,2 HAVING count(*) > 1
  ) t;
  SELECT count(*) INTO _gap FROM (
    SELECT property_id FROM public.property_images
     GROUP BY property_id
    HAVING max(position) <> count(*) - 1 OR min(position) <> 0
  ) t;
  SELECT count(*) INTO _cover FROM (
    SELECT property_id FROM public.property_images
     GROUP BY property_id
    HAVING count(*) FILTER (WHERE is_cover) <> 1
  ) t;
  IF _dup > 0 OR _gap > 0 OR _cover > 0 THEN
    RAISE EXCEPTION 'Saneamento incompleto: % duplicadas, % com lacuna, % sem capa única', _dup, _gap, _cover;
  END IF;
END $$;

-- 4. Integridade permanente (deferrable: permite renumerar o lote inteiro).
ALTER TABLE public.property_images
  ADD CONSTRAINT property_images_property_position_key
  UNIQUE (property_id, position) DEFERRABLE INITIALLY DEFERRED;

-- 5. Versão da galeria por imóvel.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS gallery_revision integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.property_images_bump_gallery_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _property uuid := COALESCE(NEW.property_id, OLD.property_id);
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.position = OLD.position
     AND NEW.is_cover IS NOT DISTINCT FROM OLD.is_cover
     AND NEW.processed_checksum IS NOT DISTINCT FROM OLD.processed_checksum
     AND NEW.processing_status IS NOT DISTINCT FROM OLD.processing_status THEN
    RETURN NEW;
  END IF;
  UPDATE public.properties
     SET gallery_revision = gallery_revision + 1
   WHERE id = _property;
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE EXECUTE ON FUNCTION public.property_images_bump_gallery_revision() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS property_images_gallery_revision ON public.property_images;
CREATE TRIGGER property_images_gallery_revision
AFTER INSERT OR UPDATE OR DELETE ON public.property_images
FOR EACH ROW EXECUTE FUNCTION public.property_images_bump_gallery_revision();

-- 6. Lotes de envio de fotos (estado transacional do lote).
CREATE TABLE IF NOT EXISTS public.property_image_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  expected_count integer NOT NULL CHECK (expected_count > 0),
  registered_count integer NOT NULL DEFAULT 0,
  duplicated_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.property_image_batches TO authenticated;
GRANT ALL ON public.property_image_batches TO service_role;
ALTER TABLE public.property_image_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem lotes de fotos"
  ON public.property_image_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados criam lotes de fotos"
  ON public.property_image_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados atualizam lotes de fotos"
  ON public.property_image_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS property_image_batches_touch ON public.property_image_batches;
CREATE TRIGGER property_image_batches_touch
BEFORE UPDATE ON public.property_image_batches
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.property_image_batches(id) ON DELETE SET NULL;

-- 7. Registro de foto com posição atômica (à prova de envios simultâneos).
CREATE OR REPLACE FUNCTION public.property_image_register(_property_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pos int;
  _id uuid;
  _has_cover boolean;
BEGIN
  -- Serializa por imóvel: dois envios simultâneos nunca recebem a mesma posição.
  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));

  SELECT COALESCE(max(position) + 1, 0) INTO _pos
    FROM public.property_images WHERE property_id = _property_id;

  SELECT EXISTS (
    SELECT 1 FROM public.property_images
     WHERE property_id = _property_id AND is_cover
  ) INTO _has_cover;

  INSERT INTO public.property_images (
    property_id, storage_path, original_storage_path, original_checksum,
    file_name, mime_type, size_bytes, content_hash, position, is_cover,
    upload_status, processing_status, uploaded_by, batch_id,
    processed_storage_path, thumbnail_storage_path, processed_checksum,
    watermark_variant, watermark_version, destination_hash, processed_at,
    width, height
  ) VALUES (
    _property_id,
    _payload->>'storage_path',
    COALESCE(_payload->>'original_storage_path', _payload->>'storage_path'),
    _payload->>'original_checksum',
    _payload->>'file_name',
    _payload->>'mime_type',
    NULLIF(_payload->>'size_bytes','')::bigint,
    _payload->>'content_hash',
    _pos,
    (_pos = 0 AND NOT _has_cover),
    COALESCE(_payload->>'upload_status', 'ready'),
    COALESCE(_payload->>'processing_status', 'pending'),
    NULLIF(_payload->>'uploaded_by','')::uuid,
    NULLIF(_payload->>'batch_id','')::uuid,
    _payload->>'processed_storage_path',
    _payload->>'thumbnail_storage_path',
    _payload->>'processed_checksum',
    _payload->>'watermark_variant',
    _payload->>'watermark_version',
    _payload->>'destination_hash',
    NULLIF(_payload->>'processed_at','')::timestamptz,
    NULLIF(_payload->>'width','')::int,
    NULLIF(_payload->>'height','')::int
  )
  RETURNING id INTO _id;

  RETURN _id;
END $$;

REVOKE EXECUTE ON FUNCTION public.property_image_register(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_image_register(uuid, jsonb) TO authenticated, service_role;

-- 8. Renumeração após exclusão (mantém 0..N-1 e capa na posição 0).
CREATE OR REPLACE FUNCTION public.property_images_normalize(_property_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cover uuid;
  _total int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));

  WITH ranked AS (
    SELECT id, (row_number() OVER (ORDER BY position, created_at, id) - 1)::int AS pos
      FROM public.property_images WHERE property_id = _property_id
  )
  UPDATE public.property_images pi
     SET position = ranked.pos, updated_at = now()
    FROM ranked
   WHERE pi.id = ranked.id AND pi.position IS DISTINCT FROM ranked.pos;

  SELECT id, count(*) OVER () INTO _cover, _total
    FROM public.property_images
   WHERE property_id = _property_id AND position = 0
   LIMIT 1;

  UPDATE public.property_images
     SET is_cover = false, updated_at = now()
   WHERE property_id = _property_id AND is_cover AND id IS DISTINCT FROM _cover;

  IF _cover IS NOT NULL THEN
    UPDATE public.property_images
       SET is_cover = true, updated_at = now()
     WHERE id = _cover AND NOT is_cover;
  END IF;

  SELECT count(*) INTO _total FROM public.property_images WHERE property_id = _property_id;
  RETURN jsonb_build_object('ok', true, 'total', _total, 'coverId', _cover);
END $$;

REVOKE EXECUTE ON FUNCTION public.property_images_normalize(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_images_normalize(uuid) TO authenticated, service_role;

-- 9. Reordenação: mesma rotina, agora com bloqueio por imóvel.
CREATE OR REPLACE FUNCTION public.reorder_property_images(_property_id uuid, _ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _total int;
  _match int;
  _changed int := 0;
  _cover uuid;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Lista de fotos vazia.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));

  SELECT count(*) INTO _total FROM public.property_images WHERE property_id = _property_id;
  SELECT count(*) INTO _match FROM public.property_images
   WHERE property_id = _property_id AND id = ANY(_ids);

  IF _match <> _total OR _match <> array_length(_ids, 1) THEN
    RAISE EXCEPTION 'Lista de fotos incompleta para este imóvel.';
  END IF;

  _cover := _ids[1];

  WITH ord AS (
    SELECT id, (ordinality - 1)::int AS pos
      FROM unnest(_ids) WITH ORDINALITY AS t(id, ordinality)
  ), upd AS (
    UPDATE public.property_images pi
       SET position = ord.pos, updated_at = now()
      FROM ord
     WHERE pi.id = ord.id
       AND pi.property_id = _property_id
       AND pi.position IS DISTINCT FROM ord.pos
    RETURNING 1
  )
  SELECT count(*)::int INTO _changed FROM upd;

  UPDATE public.property_images
     SET is_cover = false, updated_at = now()
   WHERE property_id = _property_id AND is_cover = true AND id <> _cover;

  UPDATE public.property_images
     SET is_cover = true, updated_at = now()
   WHERE property_id = _property_id AND id = _cover AND is_cover = false;

  RETURN jsonb_build_object('ok', true, 'changed', _changed, 'coverId', _cover);
END $$;

-- 10. Rastreamento da ordem e das métricas de mídia por site.
ALTER TABLE public.property_image_provider_publications
  ADD COLUMN IF NOT EXISTS synced_position integer,
  ADD COLUMN IF NOT EXISTS delivery_file_name text,
  ADD COLUMN IF NOT EXISTS remote_destaque boolean;

ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS gallery_revision integer,
  ADD COLUMN IF NOT EXISTS synced_gallery_revision integer,
  ADD COLUMN IF NOT EXISTS media_expected_count integer,
  ADD COLUMN IF NOT EXISTS media_synced_count integer,
  ADD COLUMN IF NOT EXISTS media_failed_count integer,
  ADD COLUMN IF NOT EXISTS media_status text,
  ADD COLUMN IF NOT EXISTS media_order_guarantee text,
  ADD COLUMN IF NOT EXISTS media_remote_count integer,
  ADD COLUMN IF NOT EXISTS last_media_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_media_verified_at timestamptz;

-- 11. Nova ação de fila exclusiva de mídia.
ALTER TYPE public.property_sync_action ADD VALUE IF NOT EXISTS 'media_sync';

-- 12. Limite global de requisições por site.
CREATE TABLE IF NOT EXISTS public.provider_rate_events (
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS provider_rate_events_idx
  ON public.provider_rate_events (provider, created_at DESC);

GRANT ALL ON public.provider_rate_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.provider_rate_events_id_seq TO service_role;
ALTER TABLE public.provider_rate_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.provider_rate_acquire(
  _provider text,
  _limit int DEFAULT 20,
  _window_seconds int DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _used int;
  _oldest timestamptz;
  _wait_ms int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('provider_rate:' || _provider, 0));

  DELETE FROM public.provider_rate_events
   WHERE created_at < now() - make_interval(secs => _window_seconds * 4);

  SELECT count(*), min(created_at) INTO _used, _oldest
    FROM public.provider_rate_events
   WHERE provider = _provider
     AND created_at > now() - make_interval(secs => _window_seconds);

  IF _used >= _limit THEN
    _wait_ms := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM (_oldest + make_interval(secs => _window_seconds) - now())) * 1000)::int
    );
    RETURN jsonb_build_object('granted', false, 'waitMs', _wait_ms, 'used', _used);
  END IF;

  INSERT INTO public.provider_rate_events (provider) VALUES (_provider);
  RETURN jsonb_build_object('granted', true, 'waitMs', 0, 'used', _used + 1);
END $$;

REVOKE EXECUTE ON FUNCTION public.provider_rate_acquire(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_rate_acquire(text, int, int) TO service_role;