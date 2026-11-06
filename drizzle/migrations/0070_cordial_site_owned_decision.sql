ALTER TABLE public.cordial_site_publications
  ADD COLUMN IF NOT EXISTS own_decision text CHECK (own_decision IN ('publish','withdraw')),
  ADD COLUMN IF NOT EXISTS decision_revision integer,
  ADD COLUMN IF NOT EXISTS decision_by uuid,
  ADD COLUMN IF NOT EXISTS decision_at timestamptz;

UPDATE public.cordial_site_publications
   SET own_decision = CASE WHEN state='published' THEN 'publish' ELSE 'withdraw' END
 WHERE reviewed_by IS NOT NULL AND own_decision IS NULL;

CREATE OR REPLACE FUNCTION public.cordial_site_sync_property(_property_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p properties; s cordial_site_publications; compatible boolean; wanted boolean; code text;
BEGIN
  SELECT * INTO p FROM properties WHERE id=_property_id;
  SELECT * INTO s FROM cordial_site_publications WHERE property_id=_property_id;
  IF s.property_id IS NOT NULL AND s.own_decision='withdraw' THEN
    IF s.state='published' THEN UPDATE cordial_site_publications SET state='withdrawn',updated_at=now() WHERE property_id=_property_id; END IF;
    RETURN;
  END IF;
  compatible := p.id IS NOT NULL AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL
    AND p.autorizacao IS DISTINCT FROM false
    AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
    AND p.operacao IN ('venda','aluguel');
  wanted := s.own_decision='publish' OR (s.own_decision IS NULL AND EXISTS(
    SELECT 1 FROM property_provider_publications pp WHERE pp.property_id=p.id AND pp.provider='cordial' AND pp.status IN ('published','out_of_sync')));
  IF NOT (compatible AND coalesce(wanted,false)) THEN
    IF s.property_id IS NOT NULL AND s.state='published' THEN
      UPDATE cordial_site_publications SET state='withdrawn',updated_at=now() WHERE property_id=_property_id;
    END IF;
    RETURN;
  END IF;
  code:=NULLIF(btrim(p.codigo_cordial),'');
  IF code IS NULL OR code ~* '^GC-' THEN code:='C-'||lpad(nextval('cordial_site_reference_seq')::text,6,'0'); END IF;
  INSERT INTO cordial_site_publications(property_id,public_reference,state,cordial_authorized,availability_confirmed,reviewed_content_hash,area_units_confirmed,published_at)
  VALUES(p.id,code,'published',true,true,cordial_site_content_hash(p),true,now())
  ON CONFLICT(property_id) DO UPDATE SET state='published',cordial_authorized=true,availability_confirmed=true,
    reviewed_content_hash=excluded.reviewed_content_hash,area_units_confirmed=true,
    published_at=coalesce(cordial_site_publications.published_at,excluded.published_at),updated_at=now()
  WHERE cordial_site_publications.state<>'published' OR cordial_site_publications.reviewed_content_hash IS DISTINCT FROM excluded.reviewed_content_hash;
  INSERT INTO cordial_site_media(image_id,approved_signature)
  SELECT i.id,cordial_site_image_signature(i) FROM property_images i WHERE i.property_id=p.id AND i.processing_status IN ('legacy','ready')
  ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature
  WHERE cordial_site_media.approved_signature IS DISTINCT FROM excluded.approved_signature;
END $function$;

CREATE OR REPLACE FUNCTION public.cordial_site_can_publish(_actor uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $canpub$ SELECT _actor IS NOT NULL AND NOT public.has_role(_actor,'meta_reviewer') AND (public.has_role(_actor,'admin') OR EXISTS(
  SELECT 1 FROM public.user_agencies ua WHERE ua.user_id=_actor AND ua.agency::text='cordial')) $canpub$;

CREATE OR REPLACE FUNCTION public.cordial_site_request_publication(_property_id uuid, _requested_by uuid, _publish boolean, _expected_revision integer DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $reqpub$
DECLARE p properties; s cordial_site_publications; code text;
BEGIN
 IF NOT public.cordial_site_can_publish(_requested_by) THEN RAISE EXCEPTION 'Forbidden Cordial scope'; END IF;
 SELECT * INTO p FROM properties WHERE id=_property_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'notFound',true); END IF;
 IF _expected_revision IS NOT NULL AND p.revision<>_expected_revision THEN
  RETURN jsonb_build_object('ok',false,'conflict',true,'revision',p.revision);
 END IF;
 IF _publish AND (p.archived_at IS NOT NULL OR p.removal_state IS NOT NULL) THEN
  RAISE EXCEPTION 'Imóvel arquivado: reative o cadastro antes de publicar.';
 END IF;
 SELECT * INTO s FROM cordial_site_publications WHERE property_id=p.id FOR UPDATE;
 IF FOUND AND s.own_decision = (CASE WHEN _publish THEN 'publish' ELSE 'withdraw' END) AND s.decision_revision = p.revision THEN
  RETURN jsonb_build_object('ok',true,'state',s.state,'unchanged',true);
 END IF;
 code:=NULLIF(btrim(p.codigo_cordial),'');
 IF code IS NULL OR code ~* '^GC-' THEN code:='C-'||lpad(nextval('cordial_site_reference_seq')::text,6,'0'); END IF;
 INSERT INTO cordial_site_publications(property_id,public_reference,state,cordial_authorized,availability_confirmed,area_units_confirmed,own_decision,decision_revision,decision_by,decision_at)
 VALUES(p.id,code,'withdrawn',p.autorizacao IS TRUE,p.disponibilidade IS NOT NULL,false,(CASE WHEN _publish THEN 'publish' ELSE 'withdraw' END),p.revision,_requested_by,now())
 ON CONFLICT(property_id) DO UPDATE SET own_decision=excluded.own_decision,decision_revision=excluded.decision_revision,decision_by=excluded.decision_by,decision_at=now(),updated_at=now();
 PERFORM public.cordial_site_sync_property(p.id);
 SELECT * INTO s FROM cordial_site_publications WHERE property_id=p.id;
 RETURN jsonb_build_object('ok',true,'state',s.state,'active',s.state='published','publicId',s.public_id,'pendingReview',_publish AND s.state<>'published');
END $reqpub$;

REVOKE ALL ON FUNCTION public.cordial_site_request_publication(uuid,uuid,boolean,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_request_publication(uuid,uuid,boolean,integer) TO service_role;
REVOKE ALL ON FUNCTION public.cordial_site_can_publish(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cordial_site_can_publish(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cordial_site_review_mark_decision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $markdec$
BEGIN
 IF NEW.reviewed_by IS NOT NULL AND auth.uid() IS NOT NULL AND auth.uid()=NEW.reviewed_by
    AND (TG_OP='INSERT' OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.state IS DISTINCT FROM OLD.state) THEN
   NEW.own_decision := CASE WHEN NEW.state='published' THEN 'publish' ELSE 'withdraw' END;
   NEW.decision_by := NEW.reviewed_by;
   NEW.decision_at := now();
 END IF;
 RETURN NEW;
END $markdec$;

DROP TRIGGER IF EXISTS cordial_site_review_mark_decision ON public.cordial_site_publications;
CREATE TRIGGER cordial_site_review_mark_decision BEFORE INSERT OR UPDATE ON public.cordial_site_publications
 FOR EACH ROW EXECUTE FUNCTION public.cordial_site_review_mark_decision();