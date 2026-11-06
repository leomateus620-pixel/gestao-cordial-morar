ALTER TABLE public.cordial_site_publications ADD COLUMN IF NOT EXISTS decision_source text;
LOCK TABLE public.cordial_site_publications IN SHARE ROW EXCLUSIVE MODE;
UPDATE public.cordial_site_publications SET own_decision='publish', decision_source='legacy_migrated', decision_at=coalesce(decision_at,now()), decision_revision=coalesce(decision_revision,0)
 WHERE own_decision IS NULL AND state='published';
UPDATE public.cordial_site_publications SET decision_source='legacy_withdrawn'
 WHERE own_decision IS NULL AND state='withdrawn' AND decision_source IS NULL;
COMMENT ON COLUMN public.cordial_site_publications.decision_source IS 'Origin of own_decision: legacy_migrated (published set at Imobi OFF migration), legacy_withdrawn, or user';

CREATE OR REPLACE FUNCTION public.cordial_site_sync_property(_property_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p properties; s cordial_site_publications; compatible boolean; legacy boolean; code text;
BEGIN
  SELECT * INTO p FROM properties WHERE id=_property_id;
  SELECT * INTO s FROM cordial_site_publications WHERE property_id=_property_id FOR UPDATE;
  IF s.property_id IS NOT NULL AND s.own_decision='withdraw' THEN
    IF s.state='published' THEN UPDATE cordial_site_publications SET state='withdrawn',updated_at=now() WHERE property_id=_property_id; END IF;
    RETURN;
  END IF;
  legacy := coalesce(s.decision_source,'')='legacy_migrated';
  compatible := p.id IS NOT NULL AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL
    AND p.operacao IN ('venda','aluguel')
    AND CASE WHEN legacy THEN p.autorizacao IS DISTINCT FROM false
              AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
         ELSE p.autorizacao IS TRUE AND lower(btrim(coalesce(p.disponibilidade,''))) IN ('sim','disponivel','disponível') END;
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