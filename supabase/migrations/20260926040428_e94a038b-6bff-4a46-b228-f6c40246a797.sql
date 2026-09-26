-- Cordial's independent publication channel. No backfill, remote calls, queue dispatch or bucket changes.
BEGIN;
CREATE SEQUENCE public.cordial_site_reference_seq;
CREATE TABLE public.cordial_site_publications (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  public_reference text NOT NULL CHECK(length(public_reference) BETWEEN 1 AND 80 AND public_reference !~* '^GC-'),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','withdrawn')),
  cordial_authorized boolean NOT NULL DEFAULT false,
  availability_confirmed boolean NOT NULL DEFAULT false,
  reviewed_content_hash text,
  area_units_confirmed boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cordial_site_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL UNIQUE REFERENCES public.property_images(id) ON DELETE CASCADE,
  approved_signature text NOT NULL,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cordial_site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  content jsonb NOT NULL DEFAULT '{"brand":"Cordial Imóveis","tagline":"Sentir-se em casa!"}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cordial_site_settings(id) VALUES(true);
CREATE TABLE public.cordial_site_pages (
  slug text PRIMARY KEY CHECK(slug ~ '^[a-z0-9-]{1,100}$'),
  kind text NOT NULL DEFAULT 'page' CHECK(kind IN ('page','news','district')),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  summary text NOT NULL DEFAULT '' CHECK(length(summary)<=600),
  body text NOT NULL DEFAULT '' CHECK(length(body)<=50000),
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cordial_site_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  fingerprint text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  message text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('contato','interesse','captacao')),
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  public_reference text,
  operation text CHECK(operation IN ('venda','aluguel')),
  property_type text,
  city text,
  entry_path text NOT NULL,
  campaign jsonb NOT NULL DEFAULT '{}',
  consent_at timestamptz NOT NULL DEFAULT now(),
  privacy_version text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','triaged','closed')),
  attendance_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cordial_site_leads_fingerprint_idx ON public.cordial_site_leads(fingerprint,created_at DESC);
CREATE TABLE public.cordial_site_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity text NOT NULL, entity_id text NOT NULL, action text NOT NULL,
  actor uuid, before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cordial_site_rate_limits (
  bucket text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX cordial_site_rate_expiry_idx ON public.cordial_site_rate_limits(expires_at);
CREATE TABLE public.cordial_site_redirects (
  old_path text PRIMARY KEY CHECK(old_path ~ '^/imovel/[0-9]+/[^?#]*$'),
  publication_id uuid NOT NULL REFERENCES public.cordial_site_publications(public_id) ON DELETE CASCADE,
  confirmed_by uuid REFERENCES auth.users(id), confirmed_at timestamptz NOT NULL DEFAULT now()
);

-- Private records remain private; service_role is used only by the server's allowlisted boundary.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cordial_site_publications','cordial_site_media','cordial_site_settings','cordial_site_pages','cordial_site_leads','cordial_site_audit','cordial_site_rate_limits','cordial_site_redirects'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['cordial_site_publications','cordial_site_media','cordial_site_settings','cordial_site_pages','cordial_site_redirects'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY site_admin_read ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(),''admin''))',t);
  END LOOP;
END $$;
GRANT SELECT ON public.cordial_site_leads TO authenticated;
CREATE POLICY site_leads_read ON public.cordial_site_leads FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria'));
GRANT SELECT ON public.cordial_site_audit TO authenticated;
CREATE POLICY site_audit_read ON public.cordial_site_audit FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT USAGE, SELECT ON SEQUENCE public.cordial_site_reference_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cordial_site_audit_id_seq TO service_role;

CREATE FUNCTION public.cordial_site_content_hash(p public.properties) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT md5(jsonb_build_array(p.descricao_imovel,p.pontos_fortes,p.caracteristicas,p.exibir_endereco_site,p.logradouro,p.numero,p.bairro,p.cidade,p.uf,p.tipo,p.operacao,p.area_util,p.area_total,p.area_construida,p.area_terreno,p.area_privativa_unidade,p.area_total_unidade,p.area_construida_unidade,p.area_terreno_unidade)::text)
$$;
CREATE FUNCTION public.cordial_site_image_signature(i public.property_images) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT md5(jsonb_build_array(i.storage_path,i.processed_storage_path,i.thumbnail_storage_path,i.content_hash,i.processed_checksum,i.processing_status,i.watermark_variant,i.watermark_version,i.updated_at)::text)
$$;
REVOKE ALL ON FUNCTION public.cordial_site_content_hash(public.properties), public.cordial_site_image_signature(public.property_images) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_content_hash(public.properties), public.cordial_site_image_signature(public.property_images) TO service_role;

-- Absence of a channel decision never means approval. A legacy provider failure is irrelevant here.
CREATE VIEW public.cordial_site_eligible WITH(security_invoker=true) AS
SELECT p.id AS property_id, s.public_id, s.public_reference, s.published_at,
  p.operacao,p.tipo, NULLIF(NULLIF(btrim(p.cidade),''),'0') AS cidade,
  NULLIF(NULLIF(btrim(p.bairro),''),'0') AS bairro,p.uf,
  CASE WHEN p.exibir_endereco_site='sim' THEN concat_ws(', ',NULLIF(p.logradouro,''),NULLIF(p.numero,'')) ELSE NULL END AS endereco,
  CASE WHEN p.valor_modo='fixo' AND p.valor>=0 THEN p.valor ELSE NULL END AS valor,p.valor_modo,
  p.dormitorios,p.banheiros,p.suites,p.vagas,
  CASE WHEN s.area_units_confirmed THEN p.area_util ELSE NULL END AS area_util,
  CASE WHEN s.area_units_confirmed THEN p.area_total ELSE NULL END AS area_total,
  CASE WHEN s.area_units_confirmed THEN p.area_construida ELSE NULL END AS area_construida,
  CASE WHEN s.area_units_confirmed THEN p.area_terreno ELSE NULL END AS area_terreno,
  CASE WHEN lower(p.mobiliado::text) IN ('true','sim') THEN true WHEN lower(p.mobiliado::text) IN ('false','nao','não') THEN false ELSE NULL END AS mobiliado,
  p.permuta,p.aceita_financiamento,p.estagio_empreendimento,p.destaque_inicial,
  p.descricao_imovel,p.pontos_fortes,p.caracteristicas
FROM public.properties p JOIN public.cordial_site_publications s ON s.property_id=p.id
WHERE s.state='published' AND s.cordial_authorized IS TRUE AND s.availability_confirmed IS TRUE
 AND s.published_at IS NOT NULL AND s.reviewed_content_hash=public.cordial_site_content_hash(p)
 AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL
 AND p.autorizacao IS DISTINCT FROM false
 AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
 AND p.operacao IN ('venda','aluguel');

CREATE VIEW public.cordial_site_authorized_media WITH(security_invoker=true) AS
SELECT m.id, e.public_id, i.property_id, i.position,
  m.approved_signature AS version,i.width,i.height,
  CASE WHEN i.processing_status='ready' THEN i.processed_storage_path ELSE i.storage_path END AS storage_path
FROM public.cordial_site_media m JOIN public.property_images i ON i.id=m.image_id
JOIN public.cordial_site_eligible e ON e.property_id=i.property_id
WHERE m.approved_signature=public.cordial_site_image_signature(i)
  AND i.processing_status IN ('ready','legacy')
  AND (i.processing_status='legacy' OR (i.processed_storage_path IS NOT NULL AND i.watermark_variant IN ('cordial','morar-cordial')))
  AND i.storage_path !~ '(^https?:|\.\.)'
  -- A partially approved gallery must not silently replace its cover or omit photos.
  AND NOT EXISTS (
    SELECT 1 FROM public.property_images other
    LEFT JOIN public.cordial_site_media approval ON approval.image_id=other.id
    WHERE other.property_id=i.property_id AND (
      approval.approved_signature IS DISTINCT FROM public.cordial_site_image_signature(other)
      OR other.processing_status NOT IN ('ready','legacy')
      OR (other.processing_status='ready' AND (other.processed_storage_path IS NULL OR other.watermark_variant NOT IN ('cordial','morar-cordial')))
      OR other.storage_path ~ '(^https?:|\.\.)'
    )
  );

CREATE VIEW public.cordial_site_documents WITH(security_invoker=true) AS
SELECT e.*, media.photo_count,
  jsonb_build_object('id',e.public_id,'reference',e.public_reference,'operation',e.operacao,'type',e.tipo,
  'city',e.cidade,'district',e.bairro,'state',e.uf,'address',e.endereco,
  'price',e.valor,'priceMode',e.valor_modo,'bedrooms',e.dormitorios,'bathrooms',e.banheiros,'suites',e.suites,'parking',e.vagas,
  'areas',jsonb_build_object('util',e.area_util,'total',e.area_total,'construida',e.area_construida,'terreno',e.area_terreno),
  'furnished',e.mobiliado,'exchange',e.permuta,'financing',e.aceita_financiamento,'stage',e.estagio_empreendimento,
  'featured',e.destaque_inicial IS TRUE,'publishedAt',e.published_at,'description',coalesce(e.descricao_imovel,''),
  'features',coalesce(to_jsonb(e.caracteristicas),'[]'::jsonb),'cover',media.cover,'photoCount',media.photo_count) AS document
FROM public.cordial_site_eligible e CROSS JOIN LATERAL (
  SELECT count(*) AS photo_count,
  (jsonb_agg(jsonb_build_object('id',m.id,'version',m.version,'width',m.width,'height',m.height,'position',m.position) ORDER BY m.position,m.id)->0) AS cover
  FROM public.cordial_site_authorized_media m WHERE m.public_id=e.public_id
) media;
REVOKE ALL ON public.cordial_site_eligible,public.cordial_site_authorized_media,public.cordial_site_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cordial_site_eligible,public.cordial_site_authorized_media,public.cordial_site_documents TO service_role;
CREATE INDEX cordial_site_publication_order_idx ON public.cordial_site_publications(published_at DESC,public_id) WHERE state='published';

CREATE FUNCTION public.cordial_site_search(f jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH filtered AS MATERIALIZED (
 SELECT d.*, CASE f->>'areaTipo' WHEN 'util' THEN d.area_util WHEN 'total' THEN d.area_total WHEN 'terreno' THEN d.area_terreno ELSE d.area_construida END AS selected_area
 FROM public.cordial_site_documents d
 WHERE (f->>'finalidade' IS NULL OR d.operacao=f->>'finalidade')
 AND (f->>'tipo' IS NULL OR d.tipo=f->>'tipo') AND (f->>'cidade' IS NULL OR d.cidade=f->>'cidade')
 AND (f->>'bairro' IS NULL OR d.bairro=f->>'bairro')
 AND (f->>'referencia' IS NULL OR CASE WHEN coalesce(f->>'exata','sim')='sim' THEN lower(d.public_reference)=lower(f->>'referencia') ELSE strpos(lower(d.public_reference),lower(f->>'referencia'))>0 END)
 AND (f->>'q' IS NULL OR strpos(lower(concat_ws(' ',d.tipo,d.cidade,d.bairro)),lower(f->>'q'))>0)
 AND (f->>'valorModo' IS NULL OR d.valor_modo=f->>'valorModo')
 AND (f->>'precoMin' IS NULL OR d.valor >= (f->>'precoMin')::numeric) AND (f->>'precoMax' IS NULL OR d.valor <= (f->>'precoMax')::numeric)
 AND (f->>'dormitorios' IS NULL OR CASE WHEN f->>'contagem'='exata' THEN d.dormitorios=(f->>'dormitorios')::int ELSE d.dormitorios >= (f->>'dormitorios')::int END)
 AND (f->>'banheiros' IS NULL OR CASE WHEN f->>'contagem'='exata' THEN d.banheiros=(f->>'banheiros')::int ELSE d.banheiros >= (f->>'banheiros')::int END)
 AND (f->>'suites' IS NULL OR CASE WHEN f->>'contagem'='exata' THEN d.suites=(f->>'suites')::int ELSE d.suites >= (f->>'suites')::int END)
 AND (f->>'vagas' IS NULL OR CASE WHEN f->>'contagem'='exata' THEN d.vagas=(f->>'vagas')::int ELSE d.vagas >= (f->>'vagas')::int END)
 AND (f->>'mobiliado' IS NULL OR d.mobiliado=(f->>'mobiliado'='sim'))
 AND (f->>'permuta' IS NULL OR d.permuta=(f->>'permuta'='sim'))
 AND (f->>'financiamento' IS NULL OR d.aceita_financiamento=(f->>'financiamento'='sim'))
 AND (f->>'fotos' IS NULL OR (d.photo_count>0)=(f->>'fotos'='sim'))
 AND (f->>'destaque' IS NULL OR (d.destaque_inicial IS TRUE)=(f->>'destaque'='sim'))
 AND (f->>'estagio' IS NULL OR d.estagio_empreendimento=f->>'estagio')
), area_filtered AS MATERIALIZED (
 SELECT * FROM filtered WHERE (f->>'areaMin' IS NULL OR selected_area >= (f->>'areaMin')::numeric)
 AND (f->>'areaMax' IS NULL OR selected_area <= (f->>'areaMax')::numeric)
), paged AS (
 SELECT document - 'description' || jsonb_build_object('description','') AS document FROM area_filtered
 ORDER BY CASE WHEN f->>'ordem'='preco_asc' THEN valor END ASC NULLS LAST,
 CASE WHEN f->>'ordem'='preco_desc' THEN valor END DESC NULLS LAST,
 CASE WHEN f->>'ordem'='area_desc' THEN selected_area END DESC NULLS LAST,
 published_at DESC, public_id
 LIMIT 12 OFFSET (greatest(1,least(10000,coalesce((f->>'pagina')::int,1)))-1)*12
)
SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(document) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM area_filtered),'page',greatest(1,least(10000,coalesce((f->>'pagina')::int,1))),'pageSize',12)
$$;
CREATE FUNCTION public.cordial_site_facets() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('total',(SELECT count(*) FROM cordial_site_eligible),
 'types',coalesce((SELECT jsonb_agg(jsonb_build_object('value',tipo,'count',n) ORDER BY tipo) FROM (SELECT tipo,count(*) n FROM cordial_site_eligible WHERE tipo IS NOT NULL GROUP BY tipo) t),'[]'),
 'cities',coalesce((SELECT jsonb_agg(jsonb_build_object('value',cidade,'count',n) ORDER BY cidade) FROM (SELECT cidade,count(*) n FROM cordial_site_eligible WHERE cidade IS NOT NULL GROUP BY cidade) t),'[]'),
 'districts',coalesce((SELECT jsonb_agg(jsonb_build_object('value',bairro,'city',cidade,'count',n) ORDER BY n DESC,bairro,cidade) FROM (SELECT bairro,cidade,count(*) n FROM cordial_site_eligible WHERE bairro IS NOT NULL AND cidade IS NOT NULL GROUP BY bairro,cidade) t),'[]'),
 'stages',coalesce((SELECT jsonb_agg(estagio_empreendimento ORDER BY estagio_empreendimento) FROM (SELECT DISTINCT estagio_empreendimento FROM cordial_site_eligible WHERE estagio_empreendimento IS NOT NULL) t),'[]'))
$$;
REVOKE ALL ON FUNCTION public.cordial_site_search(jsonb),public.cordial_site_facets() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_search(jsonb),public.cordial_site_facets() TO service_role;

CREATE FUNCTION public.cordial_site_audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO cordial_site_audit(entity,entity_id,action,actor,before_value,after_value)
 VALUES(TG_TABLE_NAME,coalesce(to_jsonb(NEW)->>'property_id',to_jsonb(NEW)->>'slug',to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id','settings'),TG_OP,auth.uid(),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_audit_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER site_publication_audit AFTER INSERT OR UPDATE OR DELETE ON public.cordial_site_publications FOR EACH ROW EXECUTE FUNCTION public.cordial_site_audit_change();
CREATE TRIGGER site_settings_audit AFTER UPDATE ON public.cordial_site_settings FOR EACH ROW EXECUTE FUNCTION public.cordial_site_audit_change();
CREATE TRIGGER site_pages_audit AFTER INSERT OR UPDATE OR DELETE ON public.cordial_site_pages FOR EACH ROW EXECUTE FUNCTION public.cordial_site_audit_change();

-- Operator approval is atomic, explicit, and never changes provider publications.
CREATE FUNCTION public.cordial_site_review(_property_id uuid,_publish boolean,_authorize boolean DEFAULT false,_available boolean DEFAULT false,_review_content boolean DEFAULT false,_review_media boolean DEFAULT false,_areas_m2 boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p properties; result uuid; code text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO STRICT p FROM properties WHERE id=_property_id FOR SHARE;
 IF _publish AND (NOT _authorize OR NOT _available OR NOT _review_content OR p.autorizacao IS FALSE OR p.is_draft OR p.archived_at IS NOT NULL OR p.removal_state IS NOT NULL OR p.exibir_imovel IS NOT TRUE OR (p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) NOT IN ('sim','disponivel','disponível'))) THEN RAISE EXCEPTION 'Publication requires explicit authorization and a compatible property'; END IF;
 code:=NULLIF(btrim(p.codigo_cordial),'');
 IF code IS NULL OR code ~* '^GC-' THEN code:='C-'||lpad(nextval('cordial_site_reference_seq')::text,6,'0'); END IF;
 INSERT INTO cordial_site_publications(property_id,public_reference,state,cordial_authorized,availability_confirmed,reviewed_content_hash,area_units_confirmed,published_at,reviewed_by)
 VALUES(p.id,code,CASE WHEN _publish THEN 'published' ELSE 'withdrawn' END,_authorize,_available,CASE WHEN _review_content THEN cordial_site_content_hash(p) END,_areas_m2,CASE WHEN _publish THEN now() END,auth.uid())
 ON CONFLICT(property_id) DO UPDATE SET state=excluded.state,cordial_authorized=excluded.cordial_authorized,availability_confirmed=excluded.availability_confirmed,reviewed_content_hash=excluded.reviewed_content_hash,area_units_confirmed=excluded.area_units_confirmed,published_at=coalesce(cordial_site_publications.published_at,excluded.published_at),reviewed_by=auth.uid(),updated_at=now()
 RETURNING public_id INTO result;
 IF _review_media AND _publish THEN
   INSERT INTO cordial_site_media(image_id,approved_signature,approved_by)
   SELECT i.id,cordial_site_image_signature(i),auth.uid() FROM property_images i WHERE i.property_id=p.id AND i.processing_status IN ('legacy','ready')
   ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature,approved_by=auth.uid(),approved_at=now();
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_review(uuid,boolean,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cordial_site_review(uuid,boolean,boolean,boolean,boolean,boolean,boolean) TO authenticated;

CREATE FUNCTION public.cordial_site_take_rate(_bucket text,_limit int,_seconds int) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE n int;
BEGIN
 DELETE FROM cordial_site_rate_limits WHERE expires_at<now()-interval '1 day';
 INSERT INTO cordial_site_rate_limits(bucket,hits,expires_at) VALUES(_bucket,1,now()+make_interval(secs=>_seconds))
 ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN cordial_site_rate_limits.expires_at<now() THEN 1 ELSE cordial_site_rate_limits.hits+1 END,
 expires_at=CASE WHEN cordial_site_rate_limits.expires_at<now() THEN excluded.expires_at ELSE cordial_site_rate_limits.expires_at END RETURNING hits INTO n;
 RETURN n<=_limit;
END $$;
CREATE FUNCTION public.cordial_site_submit_lead(_lead jsonb,_fingerprint text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE listing cordial_site_eligible; previous_id uuid; new_id uuid; privacy text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(_fingerprint,0));
 SELECT id INTO previous_id FROM cordial_site_leads WHERE request_id=(_lead->>'requestId')::uuid OR (fingerprint=_fingerprint AND created_at>now()-interval '10 minutes') LIMIT 1;
 IF previous_id IS NOT NULL THEN RETURN 'received'; END IF;
 SELECT content->>'privacy' INTO privacy FROM cordial_site_settings WHERE id=true;
 IF coalesce(privacy,'')='' THEN RAISE EXCEPTION 'Privacy policy not configured'; END IF;
 IF _lead->>'propertyId' IS NOT NULL THEN
  SELECT * INTO listing FROM cordial_site_eligible WHERE public_id=(_lead->>'propertyId')::uuid;
  IF listing.public_id IS NULL THEN RAISE EXCEPTION 'Property unavailable'; END IF;
 END IF;
 INSERT INTO cordial_site_leads(request_id,fingerprint,name,phone,email,message,kind,property_id,public_reference,operation,property_type,city,entry_path,campaign,privacy_version)
 VALUES((_lead->>'requestId')::uuid,_fingerprint,_lead->>'name',_lead->>'phone',NULLIF(_lead->>'email',''),_lead->>'message',_lead->>'kind',listing.property_id,listing.public_reference,coalesce(listing.operacao,_lead->>'operation'),coalesce(listing.tipo,_lead->>'propertyType'),coalesce(listing.cidade,_lead->>'city'),_lead->>'entryPath',coalesce(_lead->'campaign','{}'),md5(privacy)) RETURNING id INTO new_id;
 RETURN 'received';
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_take_rate(text,int,int),public.cordial_site_submit_lead(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_take_rate(text,int,int),public.cordial_site_submit_lead(jsonb,text) TO service_role;

CREATE FUNCTION public.cordial_site_save_content(_kind text,_key text,_content jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _kind='settings' THEN
  UPDATE cordial_site_settings SET content=_content,updated_at=now() WHERE id=true;
 ELSIF _kind='page' THEN
  INSERT INTO cordial_site_pages(slug,kind,title,summary,body,published,published_at)
  VALUES(_key,_content->>'kind',_content->>'title',coalesce(_content->>'summary',''),coalesce(_content->>'body',''),coalesce((_content->>'published')::boolean,false),CASE WHEN (_content->>'published')::boolean THEN now() END)
  ON CONFLICT(slug) DO UPDATE SET kind=excluded.kind,title=excluded.title,summary=excluded.summary,body=excluded.body,published=excluded.published,published_at=coalesce(cordial_site_pages.published_at,excluded.published_at),updated_at=now();
 ELSE RAISE EXCEPTION 'Invalid content kind'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_save_content(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cordial_site_save_content(text,text,jsonb) TO authenticated;

-- Commercial triage is explicit. No incomplete attendance is created by a public page.
CREATE FUNCTION public.cordial_site_triage(_lead_id uuid,_operation text,_type text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l cordial_site_leads; result uuid; p properties;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria')) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _operation NOT IN ('compra','aluguel','ambos') OR _type NOT IN ('casa','apartamento','terreno','sala_comercial','area_rural','sitio_chacara','outro') THEN RAISE EXCEPTION 'Choose purpose and property type'; END IF;
 SELECT * INTO STRICT l FROM cordial_site_leads WHERE id=_lead_id FOR UPDATE;
 IF l.attendance_id IS NOT NULL THEN RETURN l.attendance_id; END IF;
 IF l.property_id IS NOT NULL THEN SELECT * INTO p FROM properties WHERE id=l.property_id; END IF;
 INSERT INTO attendances(created_by,imobiliaria,cliente_nome,telefone,email,contato_preferencial,origem,fonte_prospeccao,finalidade,tipo_imovel,status,pipeline_stage,prioridade,imovel_id,imovel_ref,imovel_codigo,imovel_descricao,imovel_bairro,imovel_cidade,imovel_tipo,imovel_valor,interesse_descricao,historico_inicial)
 VALUES(auth.uid(),'cordial',l.name,l.phone,l.email,'whatsapp','site','lead_imobiliaria',_operation,_type,'novo','primeiro_contato','media',p.id,p.id::text,l.public_reference,CASE WHEN p.id IS NOT NULL THEN concat_ws(' - ',p.tipo,p.bairro,p.cidade) END,p.bairro,p.cidade,p.tipo,p.valor,l.message,'Contato recebido pelo site próprio; origem: '||l.entry_path)
 RETURNING id INTO result;
 UPDATE cordial_site_leads SET attendance_id=result,status='triaged' WHERE id=l.id;
 INSERT INTO cordial_site_audit(entity,entity_id,action,actor,after_value) VALUES('cordial_site_leads',l.id::text,'triage',auth.uid(),jsonb_build_object('attendance_id',result));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_triage(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cordial_site_triage(uuid,text,text) TO authenticated;
COMMIT;