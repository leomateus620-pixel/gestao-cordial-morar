CREATE OR REPLACE FUNCTION public.reorder_property_images(_property_id uuid, _ids uuid[])
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
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
  SELECT count(*)::int FROM upd;
$$;

REVOKE ALL ON FUNCTION public.reorder_property_images(uuid, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reorder_property_images(uuid, uuid[]) TO authenticated;