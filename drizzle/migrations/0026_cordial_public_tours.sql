-- C: from supabase/migrations/20261018172000_cordial_public_tours.sql (PR #33). Outer BEGIN/COMMIT removed.
-- Only a specifically declared, reviewed 2:1 panorama can become a tour. Legacy tour_virtual URLs are not adopted.
CREATE TABLE public.cordial_site_tours (
 property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
 media_id uuid NOT NULL UNIQUE REFERENCES public.cordial_site_media(id) ON DELETE CASCADE,
 signature text NOT NULL CHECK(signature~'^[a-f0-9]{32}$'),
 type text NOT NULL DEFAULT 'equirectangular' CHECK(type='equirectangular'),
 measured_width integer NOT NULL CHECK(measured_width>0),
 measured_height integer NOT NULL CHECK(measured_height>0 AND measured_width=2*measured_height),
 approved boolean NOT NULL DEFAULT false,
 reviewed_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cordial_site_tours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cordial_site_tours FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cordial_site_tours TO authenticated;
GRANT ALL ON public.cordial_site_tours TO service_role;
CREATE POLICY cordial_tours_admin ON public.cordial_site_tours FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER site_tours_audit AFTER INSERT OR UPDATE OR DELETE ON public.cordial_site_tours FOR EACH ROW EXECUTE FUNCTION public.cordial_site_audit_change();
CREATE FUNCTION public.cordial_site_save_tour(_media_id uuid,_signature text,_approve boolean,_declared_equirectangular boolean,_width integer,_height integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m cordial_site_authorized_media;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _approve IS NOT TRUE THEN UPDATE cordial_site_tours SET approved=false,updated_at=now() WHERE media_id=_media_id; RETURN FOUND; END IF;
 IF _declared_equirectangular IS NOT TRUE OR _width IS NULL OR _height IS NULL OR _width<=0 OR _height<=0 OR _width<>2*_height THEN RAISE EXCEPTION 'invalid_panorama_declaration'; END IF;
 SELECT * INTO m FROM cordial_site_authorized_media WHERE id=_media_id AND version=_signature;
 IF NOT FOUND OR m.width IS NULL OR m.height IS NULL OR m.width<>2*m.height OR _width>m.width THEN RAISE EXCEPTION 'panorama_not_authorized'; END IF;
 INSERT INTO cordial_site_tours(property_id,media_id,signature,measured_width,measured_height,approved,reviewed_by)
 VALUES(m.property_id,m.id,m.version,_width,_height,true,auth.uid())
 ON CONFLICT(property_id) DO UPDATE SET media_id=excluded.media_id,signature=excluded.signature,measured_width=excluded.measured_width,measured_height=excluded.measured_height,approved=true,reviewed_by=excluded.reviewed_by,updated_at=now();
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_save_tour(uuid,text,boolean,boolean,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cordial_site_save_tour(uuid,text,boolean,boolean,integer,integer) TO authenticated;
CREATE VIEW public.cordial_site_authorized_tours WITH(security_invoker=true) AS
 SELECT m.public_id,m.id,m.version,m.width,m.height,m.position FROM public.cordial_site_tours t
 JOIN public.cordial_site_authorized_media m ON m.id=t.media_id AND m.version=t.signature
 WHERE t.approved AND t.type='equirectangular' AND m.width=2*m.height;
REVOKE ALL ON public.cordial_site_authorized_tours FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cordial_site_authorized_tours TO service_role;
CREATE OR REPLACE VIEW public.cordial_site_documents WITH(security_invoker=true) AS
SELECT e.*, media.photo_count,
  jsonb_build_object('id',e.public_id,'reference',e.public_reference,'operation',e.operacao,'type',e.tipo,
  'city',e.cidade,'district',e.bairro,'state',e.uf,'address',e.endereco,
  'price',e.valor,'priceMode',e.valor_modo,'bedrooms',e.dormitorios,'bathrooms',e.banheiros,'suites',e.suites,'parking',e.vagas,
  'areas',jsonb_build_object('util',e.area_util,'total',e.area_total,'construida',e.area_construida,'terreno',e.area_terreno),
  'furnished',e.mobiliado,'exchange',e.permuta,'financing',e.aceita_financiamento,'stage',e.estagio_empreendimento,
  'featured',e.destaque_inicial IS TRUE,'publishedAt',e.published_at,'description',coalesce(e.descricao_imovel,''),
  'features',coalesce(to_jsonb(e.caracteristicas),'[]'::jsonb),'cover',media.cover,'photoCount',media.photo_count,'responsible',public.cordial_site_public_responsible(e.property_id),'hasTour',EXISTS(SELECT 1 FROM public.cordial_site_authorized_tours tour WHERE tour.public_id=e.public_id)) AS document
FROM public.cordial_site_eligible e CROSS JOIN LATERAL (
  SELECT count(*) AS photo_count,
  (jsonb_agg(jsonb_build_object('id',m.id,'version',m.version,'width',m.width,'height',m.height,'position',m.position) ORDER BY m.position,m.id)->0) AS cover
  FROM public.cordial_site_authorized_media m WHERE m.public_id=e.public_id
) media;