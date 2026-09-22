DROP FUNCTION IF EXISTS public.reorder_property_images(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.reorder_property_images(_property_id uuid, _ids uuid[], _expected_gallery_revision integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _active int;
  _match int;
  _distinct int;
  _changed int := 0;
  _cover uuid;
  _rev int;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Lista de fotos vazia.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));

  IF _expected_gallery_revision IS NOT NULL THEN
    SELECT gallery_revision INTO _rev FROM public.properties WHERE id = _property_id;
    IF _rev IS DISTINCT FROM _expected_gallery_revision THEN
      RAISE EXCEPTION 'galeria_desatualizada: a galeria mudou enquanto você organizava.';
    END IF;
  END IF;

  SELECT count(DISTINCT x) INTO _distinct FROM unnest(_ids) AS x;
  IF _distinct <> array_length(_ids, 1) THEN
    RAISE EXCEPTION 'Lista de fotos com itens repetidos.';
  END IF;

  SELECT count(*) INTO _active FROM public.property_images
   WHERE property_id = _property_id AND NOT coalesce(pending_remote_delete, false);
  SELECT count(*) INTO _match FROM public.property_images
   WHERE property_id = _property_id AND NOT coalesce(pending_remote_delete, false) AND id = ANY(_ids);

  IF _match <> array_length(_ids, 1) THEN
    RAISE EXCEPTION 'Lista contém foto de outro imóvel ou aguardando exclusão.';
  END IF;
  IF _match <> _active THEN
    RAISE EXCEPTION 'Lista de fotos incompleta para este imóvel.';
  END IF;

  _cover := _ids[1];

  WITH ord AS (
    SELECT id, (ordinality - 1)::int AS pos FROM unnest(_ids) WITH ORDINALITY AS t(id, ordinality)
  ), upd AS (
    UPDATE public.property_images pi SET position = ord.pos, updated_at = now()
      FROM ord WHERE pi.id = ord.id AND pi.property_id = _property_id AND pi.position IS DISTINCT FROM ord.pos
    RETURNING 1
  )
  SELECT count(*)::int INTO _changed FROM upd;

  -- Pendentes de exclusão ficam depois das ativas e nunca são capa.
  WITH pend AS (
    SELECT id, (_active + row_number() OVER (ORDER BY position, created_at, id) - 1)::int AS pos
      FROM public.property_images WHERE property_id = _property_id AND coalesce(pending_remote_delete, false)
  )
  UPDATE public.property_images pi SET position = pend.pos, updated_at = now()
    FROM pend WHERE pi.id = pend.id AND pi.position IS DISTINCT FROM pend.pos;

  UPDATE public.property_images SET is_cover = false, updated_at = now()
   WHERE property_id = _property_id AND is_cover = true AND id <> _cover;
  UPDATE public.property_images SET is_cover = true, updated_at = now()
   WHERE property_id = _property_id AND id = _cover AND is_cover = false;

  RETURN jsonb_build_object('ok', true, 'changed', _changed, 'coverId', _cover);
END $function$;

GRANT EXECUTE ON FUNCTION public.reorder_property_images(uuid, uuid[], integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.property_images_normalize(_property_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _cover uuid;
  _total int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));

  WITH ranked AS (
    SELECT id, (row_number() OVER (ORDER BY coalesce(pending_remote_delete, false), position, created_at, id) - 1)::int AS pos
      FROM public.property_images WHERE property_id = _property_id
  )
  UPDATE public.property_images pi SET position = ranked.pos, updated_at = now()
    FROM ranked WHERE pi.id = ranked.id AND pi.position IS DISTINCT FROM ranked.pos;

  SELECT id INTO _cover FROM public.property_images
   WHERE property_id = _property_id AND NOT coalesce(pending_remote_delete, false)
   ORDER BY position LIMIT 1;

  UPDATE public.property_images SET is_cover = false, updated_at = now()
   WHERE property_id = _property_id AND is_cover AND id IS DISTINCT FROM _cover;
  IF _cover IS NOT NULL THEN
    UPDATE public.property_images SET is_cover = true, updated_at = now() WHERE id = _cover AND NOT is_cover;
  END IF;

  SELECT count(*) INTO _total FROM public.property_images
   WHERE property_id = _property_id AND NOT coalesce(pending_remote_delete, false);
  RETURN jsonb_build_object('ok', true, 'total', _total, 'coverId', _cover);
END $function$;