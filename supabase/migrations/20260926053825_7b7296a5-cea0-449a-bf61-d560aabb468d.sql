CREATE OR REPLACE FUNCTION public.cordial_site_sync_property(_property_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p properties; s cordial_site_publications; ok boolean; code text;
BEGIN
  SELECT * INTO p FROM properties WHERE id=_property_id;
  SELECT * INTO s FROM cordial_site_publications WHERE property_id=_property_id;
  -- A manual withdrawal by an administrator is never overridden automatically.
  IF s.property_id IS NOT NULL AND s.state='withdrawn' AND s.reviewed_by IS NOT NULL THEN RETURN; END IF;
  ok := p.id IS NOT NULL AND EXISTS(SELECT 1 FROM property_provider_publications pp WHERE pp.property_id=p.id AND pp.provider='cordial' AND pp.status IN ('published','out_of_sync'))
    AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL
    AND p.autorizacao IS DISTINCT FROM false
    AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
    AND p.operacao IN ('venda','aluguel');
  IF NOT ok THEN
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
  ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature,approved_at=now()
  WHERE cordial_site_media.approved_signature IS DISTINCT FROM excluded.approved_signature;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_sync_property(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_sync_property(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cordial_site_sync_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  BEGIN
    PERFORM public.cordial_site_sync_property(CASE WHEN TG_TABLE_NAME='properties' THEN coalesce(NEW.id,OLD.id) ELSE coalesce(NEW.property_id,OLD.property_id) END);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'cordial_site_sync failed: %', SQLSTATE; -- never block the Gestão write
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_sync_trigger() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER cordial_site_sync_properties AFTER UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.cordial_site_sync_trigger();
CREATE TRIGGER cordial_site_sync_images AFTER INSERT OR UPDATE OR DELETE ON public.property_images FOR EACH ROW EXECUTE FUNCTION public.cordial_site_sync_trigger();
CREATE TRIGGER cordial_site_sync_provider AFTER INSERT OR UPDATE OF status ON public.property_provider_publications FOR EACH ROW WHEN (NEW.provider='cordial') EXECUTE FUNCTION public.cordial_site_sync_trigger();

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT property_id FROM public.property_provider_publications WHERE provider='cordial' AND status IN ('published','out_of_sync') LOOP
    PERFORM public.cordial_site_sync_property(r.property_id);
  END LOOP;
END $$;