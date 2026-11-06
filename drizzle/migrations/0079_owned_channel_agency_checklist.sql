CREATE OR REPLACE FUNCTION public.owned_channel_sync_agency_checklist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.state <> 'published' OR (TG_OP='UPDATE' AND OLD.state='published') THEN RETURN NULL; END IF;
  IF TG_TABLE_NAME = 'morar_site_publications' THEN
    UPDATE agenciamentos SET cadastrado_morar=true, cadastrado_site=COALESCE(cadastrado_cordial,false)
     WHERE property_id=NEW.property_id AND COALESCE(cadastrado_morar,false)=false AND status NOT IN ('cancelado','reprovado');
  ELSE
    UPDATE agenciamentos SET cadastrado_cordial=true, cadastrado_site=COALESCE(cadastrado_morar,false)
     WHERE property_id=NEW.property_id AND COALESCE(cadastrado_cordial,false)=false AND status NOT IN ('cancelado','reprovado');
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS cordial_site_agency_checklist ON public.cordial_site_publications;
CREATE TRIGGER cordial_site_agency_checklist AFTER INSERT OR UPDATE OF state ON public.cordial_site_publications
  FOR EACH ROW EXECUTE FUNCTION public.owned_channel_sync_agency_checklist();
DROP TRIGGER IF EXISTS morar_site_agency_checklist ON public.morar_site_publications;
CREATE TRIGGER morar_site_agency_checklist AFTER INSERT OR UPDATE OF state ON public.morar_site_publications
  FOR EACH ROW EXECUTE FUNCTION public.owned_channel_sync_agency_checklist();