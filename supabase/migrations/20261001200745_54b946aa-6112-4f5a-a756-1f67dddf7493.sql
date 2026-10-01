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
  -- Um destino só conta como retirado quando a confirmação pertence à intenção
  -- de arquivamento (ou a uma nova tentativa de ocultar, nunca a uma publicação).
  SELECT COALESCE(array_agg(p.provider::text ORDER BY p.provider::text), '{}'::text[])
    INTO _pending FROM public.property_provider_publications p
   WHERE p.property_id = _property_id AND p.archive_intent_revision IS NOT NULL
     AND (p.status <> 'unpublished' OR p.desired_availability <> 'hidden'
          OR p.publication_intent_revision < p.archive_intent_revision);
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