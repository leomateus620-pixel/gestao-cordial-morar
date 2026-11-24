-- Guarda a posição escolhida enquanto o original está a caminho do Storage.
CREATE TABLE public.property_gallery_upload_order (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  ordered_keys uuid[] NOT NULL
);
ALTER TABLE public.property_gallery_upload_order ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_gallery_upload_order FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_gallery_upload_order TO authenticated, service_role;
CREATE POLICY property_gallery_upload_order_edit ON public.property_gallery_upload_order
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.properties WHERE id = property_id)
    AND (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria')
      OR public.has_role(auth.uid(), 'corretor')
    )
  );
CREATE POLICY meta_reviewer_block ON public.property_gallery_upload_order
  AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.property_gallery_upload_order
  AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_atendimentos_viewer());
--> statement-breakpoint
CREATE FUNCTION public.property_gallery_upload_key(_path text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT substring(split_part(_path, '/', 3) FROM
    '^galeria-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-')::uuid
$$;
REVOKE ALL ON FUNCTION public.property_gallery_upload_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_gallery_upload_key(text) TO authenticated, service_role;
--> statement-breakpoint
CREATE FUNCTION public.property_gallery_save_order(
  _property_id uuid, _ids uuid[], _keys uuid[], _expected_gallery_revision integer
)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  _revision integer;
  _old_plan uuid[];
  _plan uuid[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
    public.is_meta_reviewer() OR public.is_atendimentos_viewer() OR NOT (
      public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria')
      OR public.has_role(auth.uid(), 'corretor')
    )
  ) THEN RAISE EXCEPTION 'sem_permissao_para_editar_fotos'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_property_id::text, 0));
  SELECT gallery_revision INTO _revision FROM public.properties
    WHERE id = _property_id AND archived_at IS NULL
      AND coalesce(removal_state, '') NOT IN ('pending_removal', 'pending_archive', 'archived');
  IF NOT FOUND THEN RAISE EXCEPTION 'imovel_indisponivel_para_fotos'; END IF;
  IF _revision IS DISTINCT FROM _expected_gallery_revision THEN
    RAISE EXCEPTION 'galeria_desatualizada';
  END IF;

  IF cardinality(_keys) IS DISTINCT FROM (SELECT count(DISTINCT key)::int FROM unnest(_keys) AS t(key))
    OR _ids IS DISTINCT FROM ARRAY(
      SELECT i.id FROM unnest(_keys) WITH ORDINALITY AS k(key, ordinal)
      JOIN public.property_images i ON i.property_id = _property_id AND NOT coalesce(i.pending_remote_delete, false)
       AND k.key = coalesce(public.property_gallery_upload_key(coalesce(i.original_storage_path, i.storage_path)), i.id)
      ORDER BY k.ordinal
    )
  THEN RAISE EXCEPTION 'Lista de fotos incompleta ou inválida.'; END IF;

  IF cardinality(_ids) > 0 THEN
    PERFORM public.reorder_property_images(_property_id, _ids, _expected_gallery_revision);
  ELSIF EXISTS (
    SELECT 1 FROM public.property_images WHERE property_id = _property_id AND NOT coalesce(pending_remote_delete, false)
  ) THEN
    RAISE EXCEPTION 'Lista de fotos incompleta para este imóvel.';
  END IF;

  SELECT ordered_keys INTO _old_plan FROM public.property_gallery_upload_order WHERE property_id = _property_id;
  IF cardinality(_keys) > cardinality(_ids) THEN _plan := _keys; END IF;
  IF _old_plan IS DISTINCT FROM _plan THEN
    IF _plan IS NULL THEN
      DELETE FROM public.property_gallery_upload_order WHERE property_id = _property_id;
    ELSE
      INSERT INTO public.property_gallery_upload_order (property_id, ordered_keys)
        VALUES (_property_id, _plan)
        ON CONFLICT (property_id) DO UPDATE SET ordered_keys = excluded.ordered_keys;
    END IF;
    UPDATE public.properties SET gallery_revision = gallery_revision + 1 WHERE id = _property_id;
  END IF;
  SELECT gallery_revision INTO _revision FROM public.properties WHERE id = _property_id;
  RETURN _revision;
END $$;
REVOKE ALL ON FUNCTION public.property_gallery_save_order(uuid, uuid[], uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_gallery_save_order(uuid, uuid[], uuid[], integer) TO authenticated, service_role;
--> statement-breakpoint
-- O upload confirmado pelo navegador e o recuperado pelo worker passam pela
-- mesma reserva. Só a nova foto muda de lugar entre as fotos já publicáveis.
CREATE FUNCTION public.property_gallery_place_upload()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _plan uuid[];
  _key uuid := public.property_gallery_upload_key(NEW.storage_path);
  _old_key uuid;
  _anchor uuid;
  _ids uuid[];
  _active_keys uuid[];
  _position int;
BEGIN
  IF _key IS NULL AND NEW.replacement_for IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.property_id::text, 0));
  SELECT ordered_keys INTO _plan FROM public.property_gallery_upload_order
    WHERE property_id = NEW.property_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.replacement_for IS NOT NULL THEN
    -- Novas trocas herdam a chave da foto. O caso abaixo cobre reservas antigas.
    IF NEW.status <> 'registered' OR _key IS NOT NULL THEN RETURN NEW; END IF;
    SELECT coalesce(public.property_gallery_upload_key(coalesce(original_storage_path, storage_path)), id) INTO _old_key
      FROM public.property_images WHERE id = NEW.replacement_for;
    -- A substituição já assume o lugar da antiga na RPC atômica existente.
    _plan := array_replace(_plan, coalesce(_old_key, NEW.replacement_for), coalesce(_key, NEW.image_id));
  ELSIF _key = ANY(_plan) THEN
    IF NEW.status = 'registered' THEN
      SELECT i.id INTO _anchor FROM unnest(_plan) WITH ORDINALITY AS k(key, ordinal)
        JOIN public.property_images i ON i.property_id = NEW.property_id
          AND NOT coalesce(i.pending_remote_delete, false)
          AND k.key = coalesce(public.property_gallery_upload_key(coalesce(i.original_storage_path, i.storage_path)), i.id)
        WHERE k.ordinal > array_position(_plan, _key)
        ORDER BY k.ordinal LIMIT 1;
      SELECT array_agg(id ORDER BY position, id) INTO _ids
        FROM public.property_images WHERE property_id = NEW.property_id
          AND NOT coalesce(pending_remote_delete, false) AND id <> NEW.image_id;
      _position := array_position(_ids, _anchor);
      _ids := CASE WHEN _position IS NULL THEN coalesce(_ids, '{}'::uuid[]) || NEW.image_id
        ELSE _ids[:_position - 1] || NEW.image_id || _ids[_position:] END;
      PERFORM public.reorder_property_images(NEW.property_id, _ids, NULL);
    ELSE
      _plan := array_remove(_plan, _key);
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  SELECT coalesce(array_agg(coalesce(public.property_gallery_upload_key(coalesce(original_storage_path, storage_path)), id)), '{}')
    INTO _active_keys FROM public.property_images
    WHERE property_id = NEW.property_id AND NOT coalesce(pending_remote_delete, false);
  IF _plan <@ _active_keys THEN
    DELETE FROM public.property_gallery_upload_order WHERE property_id = NEW.property_id;
  ELSE
    UPDATE public.property_gallery_upload_order SET ordered_keys = _plan WHERE property_id = NEW.property_id;
  END IF;
  UPDATE public.properties SET gallery_revision = gallery_revision + 1 WHERE id = NEW.property_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.property_gallery_place_upload() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER property_gallery_place_upload
  AFTER UPDATE OF status ON public.property_image_upload_reservations FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('registered', 'duplicated', 'blocked'))
  EXECUTE FUNCTION public.property_gallery_place_upload();
