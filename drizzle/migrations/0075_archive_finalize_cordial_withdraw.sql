CREATE OR REPLACE FUNCTION public.property_archive_finalize(_property_id uuid, _expected_revision integer DEFAULT NULL::integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $arcfin$
DECLARE
  _property public.properties;
  _pending text[];
  _off boolean := NOT public.imobi_integration_enabled();
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
  IF _off THEN
    PERFORM public.cordial_site_sync_property(_property_id);
    PERFORM public.morar_site_sync_property(_property_id);
    SELECT COALESCE(array_agg(b ORDER BY b), '{}'::text[]) INTO _pending FROM (
      SELECT 'cordial'::text b FROM cordial_site_publications WHERE property_id=_property_id AND state='published'
      UNION ALL
      SELECT 'morar' FROM morar_site_publications WHERE property_id=_property_id AND state='published') x;
  ELSE
    SELECT COALESCE(array_agg(p.provider::text ORDER BY p.provider::text), '{}'::text[])
      INTO _pending FROM public.property_provider_publications p
     WHERE p.property_id = _property_id AND p.archive_intent_revision IS NOT NULL
       AND (p.status <> 'unpublished' OR p.desired_availability <> 'hidden'
            OR p.publication_intent_revision < p.archive_intent_revision);
  END IF;
  IF cardinality(_pending) > 0 THEN
    RETURN jsonb_build_object('status','pending','providers',to_jsonb(_pending));
  END IF;
  UPDATE public.properties SET archived_at = now(), removal_state = 'archived', updated_at = now()
   WHERE id = _property_id;
  -- Arquivar equivale a retirar na Cordial: reativar nunca republica sozinho.
  UPDATE cordial_site_publications SET own_decision='withdraw',decision_revision=_property.revision,decision_at=now(),updated_at=now()
   WHERE property_id=_property_id;
  IF NOT FOUND AND EXISTS(SELECT 1 FROM property_provider_publications pp WHERE pp.property_id=_property_id AND pp.provider='cordial' AND pp.status IN ('published','out_of_sync')) THEN
    INSERT INTO cordial_site_publications(property_id,public_reference,state,own_decision,decision_revision,decision_at)
    VALUES(_property_id,'C-'||lpad(nextval('cordial_site_reference_seq')::text,6,'0'),'withdrawn','withdraw',_property.revision,now())
    ON CONFLICT(property_id) DO NOTHING;
  END IF;
  PERFORM public.cordial_site_sync_property(_property_id);
  INSERT INTO public.property_archive_events(property_id, transition, detail)
  VALUES (_property_id, 'archived', jsonb_build_object('revision', _property.revision, 'imobi', CASE WHEN _off THEN 'off_history' ELSE 'confirmed' END));
  RETURN jsonb_build_object('status','archived');
END $arcfin$;