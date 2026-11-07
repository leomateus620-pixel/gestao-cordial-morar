ALTER TABLE public.cordial_site_publications ADD COLUMN IF NOT EXISTS admin_release_at timestamptz, ADD COLUMN IF NOT EXISTS admin_release_by uuid, ADD COLUMN IF NOT EXISTS admin_release_reason text;
ALTER TABLE public.morar_site_publications ADD COLUMN IF NOT EXISTS admin_release_at timestamptz, ADD COLUMN IF NOT EXISTS admin_release_by uuid, ADD COLUMN IF NOT EXISTS admin_release_reason text;

CREATE OR REPLACE FUNCTION public.cordial_site_sync_property(_property_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p properties; s cordial_site_publications; compatible boolean; legacy boolean; released boolean; code text;
BEGIN
  SELECT * INTO p FROM properties WHERE id=_property_id;
  SELECT * INTO s FROM cordial_site_publications WHERE property_id=_property_id FOR UPDATE;
  IF s.property_id IS NOT NULL AND s.own_decision='withdraw' THEN
    IF s.state='published' THEN UPDATE cordial_site_publications SET state='withdrawn',updated_at=now() WHERE property_id=_property_id; END IF;
    RETURN;
  END IF;
  legacy := coalesce(s.decision_source,'')='legacy_migrated';
  released := s.admin_release_at IS NOT NULL;
  compatible := p.id IS NOT NULL AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL
    AND p.operacao IN ('venda','aluguel')
    AND CASE WHEN legacy THEN p.autorizacao IS DISTINCT FROM false
              AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
         WHEN released THEN p.autorizacao IS DISTINCT FROM false
              AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
              AND (s.published_at IS NOT NULL OR public.owned_gallery_ready(p.id,'cordial'))
         ELSE p.autorizacao IS TRUE AND lower(btrim(coalesce(p.disponibilidade,''))) IN ('sim','disponivel','disponível')
              AND (p.source IS DISTINCT FROM 'gestao_cordial' OR p.registration_completed_at IS NOT NULL)
              AND (s.published_at IS NOT NULL OR public.owned_gallery_ready(p.id,'cordial')) END;
  IF NOT (compatible AND s.own_decision IS NOT DISTINCT FROM 'publish') THEN
    IF s.property_id IS NOT NULL AND s.state='published' THEN
      UPDATE cordial_site_publications SET state='withdrawn',updated_at=now() WHERE property_id=_property_id;
    END IF;
    RETURN;
  END IF;
  code:=NULLIF(btrim(p.codigo_cordial),'');
  IF code IS NULL OR code ~* '^GC-' THEN code:='C-'||lpad(nextval('cordial_site_reference_seq')::text,6,'0'); END IF;
  UPDATE cordial_site_publications SET state='published',
    reviewed_content_hash=cordial_site_content_hash(p),
    published_at=coalesce(published_at,now()),updated_at=now()
  WHERE property_id=p.id AND (state<>'published' OR reviewed_content_hash IS DISTINCT FROM cordial_site_content_hash(p));
  INSERT INTO cordial_site_media(image_id,approved_signature)
  SELECT i.id,cordial_site_image_signature(i) FROM property_images i WHERE i.property_id=p.id AND i.processing_status IN ('legacy','ready')
  ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature
  WHERE cordial_site_media.approved_signature IS DISTINCT FROM excluded.approved_signature;
END $function$;

CREATE OR REPLACE FUNCTION public.morar_site_sync_property(_property_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p properties; s morar_site_publications; compatible boolean; approved boolean; released boolean;
BEGIN
 SELECT * INTO s FROM morar_site_publications WHERE property_id=_property_id FOR UPDATE;
 IF NOT FOUND OR s.manual_withdrawn THEN RETURN; END IF;
 SELECT * INTO p FROM properties WHERE id=_property_id;
 IF NOT FOUND THEN RETURN; END IF;
 IF p.removal_state IS NOT NULL OR p.archived_at IS NOT NULL THEN
  UPDATE morar_site_publications SET state='withdrawn',manual_withdrawn=true,updated_at=now(),decision_revision=p.revision WHERE property_id=p.id;
  RETURN;
 END IF;
 released := s.admin_release_at IS NOT NULL;
 compatible:=p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.autorizacao IS DISTINCT FROM false
  AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
  AND p.operacao IN ('venda','aluguel') AND (released OR p.source IS DISTINCT FROM 'gestao_cordial' OR p.registration_completed_at IS NOT NULL)
  AND (p.source IS DISTINCT FROM 'gestao_cordial' OR s.published_at IS NOT NULL OR public.owned_gallery_ready(p.id,'morar'));
 IF s.decision_source='registration' THEN
  s.morar_authorized:=s.morar_authorized OR p.autorizacao IS TRUE;
  s.availability_confirmed:=s.availability_confirmed OR (p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'));
 END IF;
 approved:=compatible AND ((s.morar_authorized AND s.availability_confirmed) OR released);
 UPDATE morar_site_publications SET state=CASE WHEN approved THEN 'published' ELSE 'draft' END,
  morar_authorized=s.morar_authorized,availability_confirmed=s.availability_confirmed,
  reviewed_content_hash=morar_site_content_hash(p),published_at=CASE WHEN approved THEN coalesce(s.published_at,now()) ELSE s.published_at END,
  decision_revision=p.revision,updated_at=now()
 WHERE property_id=p.id AND (state IS DISTINCT FROM CASE WHEN approved THEN 'published' ELSE 'draft' END OR reviewed_content_hash IS DISTINCT FROM morar_site_content_hash(p) OR morar_authorized IS DISTINCT FROM s.morar_authorized OR availability_confirmed IS DISTINCT FROM s.availability_confirmed);
 INSERT INTO morar_site_media(image_id,approved_signature,approved_by)
 SELECT i.id,morar_site_image_signature(i),s.reviewed_by FROM property_images i
 WHERE i.property_id=p.id AND i.processing_status='ready' AND i.processed_storage_path IS NOT NULL
  AND i.watermark_variant IN ('morar','morar-cordial') AND coalesce((to_jsonb(i)->>'pending_remote_delete')::boolean,false) IS FALSE
 ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature,approved_by=excluded.approved_by,approved_at=now()
 WHERE morar_site_media.approved_signature IS DISTINCT FROM excluded.approved_signature;
END $function$;

CREATE OR REPLACE FUNCTION public.owned_admin_release_apply(_ids uuid[], _by uuid, _reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p properties; code text; nc int:=0; nm int:=0; skipped int:=0;
BEGIN
 IF NOT public.has_role(_by,'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
 FOR p IN SELECT * FROM properties WHERE id = ANY(_ids) FOR UPDATE LOOP
  IF p.archived_at IS NOT NULL OR p.removal_state IS NOT NULL OR p.exibir_imovel IS NOT TRUE
     OR EXISTS(SELECT 1 FROM cordial_site_publications c WHERE c.property_id=p.id AND (c.state='withdrawn' OR c.own_decision='withdraw'))
     OR EXISTS(SELECT 1 FROM morar_site_publications m WHERE m.property_id=p.id AND (m.state='withdrawn' OR m.manual_withdrawn)) THEN
   skipped:=skipped+1; CONTINUE;
  END IF;
  IF 'cordial' = ANY(p.publish_targets) THEN
   code:=NULLIF(btrim(p.codigo_cordial),'');
   IF code IS NULL OR code ~* '^GC-' THEN code:='C-'||lpad(nextval('cordial_site_reference_seq')::text,6,'0'); END IF;
   INSERT INTO cordial_site_publications(property_id,public_reference,state,own_decision,decision_revision,decision_by,decision_at,decision_source,admin_release_at,admin_release_by,admin_release_reason)
   VALUES(p.id,code,'draft','publish',p.revision,_by,now(),'admin_release',now(),_by,_reason)
   ON CONFLICT(property_id) DO NOTHING;
   PERFORM public.cordial_site_sync_property(p.id); nc:=nc+1;
  END IF;
  IF 'morar' = ANY(p.publish_targets) THEN
   code:=NULLIF(btrim(p.codigo_morar),'');
   IF code IS NULL OR code ~* '^GC-' THEN code:='M-'||lpad(nextval('morar_site_reference_seq')::text,6,'0'); END IF;
   INSERT INTO morar_site_publications(property_id,public_reference,state,reviewed_by,decision_source,decision_revision,admin_release_at,admin_release_by,admin_release_reason)
   VALUES(p.id,code,'draft',_by,'admin_release',p.revision,now(),_by,_reason)
   ON CONFLICT(property_id) DO NOTHING;
   PERFORM public.morar_site_sync_property(p.id); nm:=nm+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('cordial',nc,'morar',nm,'skipped',skipped);
END $function$;
REVOKE ALL ON FUNCTION public.owned_admin_release_apply(uuid[],uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owned_admin_release_apply(uuid[],uuid,text) TO service_role;