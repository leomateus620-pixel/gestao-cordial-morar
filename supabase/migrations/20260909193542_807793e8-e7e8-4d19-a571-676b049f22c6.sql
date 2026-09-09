DROP FUNCTION IF EXISTS public.reorder_property_images(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.reorder_property_images(_property_id uuid, _ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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

  SELECT count(*) INTO _total FROM public.property_images WHERE property_id = _property_id;
  SELECT count(*) INTO _match
    FROM public.property_images
   WHERE property_id = _property_id
     AND id = ANY(_ids);

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

  -- Capa segue sempre a posição 0 (índice único: zera antes de marcar).
  UPDATE public.property_images
     SET is_cover = false, updated_at = now()
   WHERE property_id = _property_id
     AND is_cover = true
     AND id <> _cover;

  UPDATE public.property_images
     SET is_cover = true, updated_at = now()
   WHERE property_id = _property_id
     AND id = _cover
     AND is_cover = false;

  RETURN jsonb_build_object('ok', true, 'changed', _changed, 'coverId', _cover);
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_property_images(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_property_images(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_property_images(uuid, uuid[]) TO service_role;