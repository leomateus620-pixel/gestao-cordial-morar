ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS registration_completed_at timestamptz;
CREATE SEQUENCE public.morar_site_reference_seq;
CREATE TABLE public.morar_site_publications (
  property_id uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  public_reference text NOT NULL CHECK(length(public_reference) BETWEEN 1 AND 80 AND public_reference !~* '^GC-'),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','withdrawn')),
  morar_authorized boolean NOT NULL DEFAULT false,
  availability_confirmed boolean NOT NULL DEFAULT false,
  reviewed_content_hash text,
  area_units_confirmed boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  manual_withdrawn boolean NOT NULL DEFAULT false,
  decision_source text NOT NULL DEFAULT 'manual' CHECK(decision_source IN ('manual','registration','activation')),
  decision_revision integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.morar_site_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL UNIQUE REFERENCES public.property_images(id) ON DELETE CASCADE,
  approved_signature text NOT NULL,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.morar_site_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  content jsonb NOT NULL DEFAULT '{"brand":"Morar Imóveis","tagline":""}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.morar_site_settings(id) VALUES(true);
CREATE TABLE public.morar_site_pages (
  slug text PRIMARY KEY CHECK(slug ~ '^[a-z0-9-]{1,100}$'),
  kind text NOT NULL DEFAULT 'page' CHECK(kind IN ('page','news','district')),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  summary text NOT NULL DEFAULT '' CHECK(length(summary)<=600),
  body text NOT NULL DEFAULT '' CHECK(length(body)<=50000),
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.morar_site_leads (
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
CREATE INDEX morar_site_leads_fingerprint_idx ON public.morar_site_leads(fingerprint,created_at DESC);
CREATE TABLE public.morar_site_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity text NOT NULL, entity_id text NOT NULL, action text NOT NULL,
  actor uuid, before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.morar_site_rate_limits (
  bucket text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX morar_site_rate_expiry_idx ON public.morar_site_rate_limits(expires_at);
CREATE TABLE public.morar_site_redirects (
  old_path text PRIMARY KEY CHECK(old_path ~ '^/imovel/[0-9]+/[^?#]*$'),
  publication_id uuid NOT NULL REFERENCES public.morar_site_publications(public_id) ON DELETE CASCADE,
  confirmed_by uuid REFERENCES auth.users(id), confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.morar_site_activation_batches (
  id uuid PRIMARY KEY,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  result jsonb NOT NULL,
  reviewed_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['morar_site_publications','morar_site_media','morar_site_settings','morar_site_pages','morar_site_leads','morar_site_audit','morar_site_rate_limits','morar_site_redirects','morar_site_activation_batches'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['morar_site_publications','morar_site_media','morar_site_settings','morar_site_pages','morar_site_redirects','morar_site_activation_batches'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY site_admin_read ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(),''admin''))',t);
  END LOOP;
END $$;
GRANT SELECT ON public.morar_site_leads TO authenticated;
CREATE POLICY site_leads_read ON public.morar_site_leads FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'secretaria') AND EXISTS(SELECT 1 FROM public.user_agencies ua WHERE ua.user_id=auth.uid() AND ua.agency::text='morar')));
GRANT SELECT ON public.morar_site_audit TO authenticated;
CREATE POLICY site_audit_read ON public.morar_site_audit FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
GRANT USAGE, SELECT ON SEQUENCE public.morar_site_reference_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.morar_site_audit_id_seq TO service_role;

CREATE FUNCTION public.morar_site_can_publish(_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _actor IS NOT NULL AND (public.has_role(_actor,'admin') OR EXISTS(
  SELECT 1 FROM public.user_agencies ua WHERE ua.user_id=_actor AND ua.agency::text='morar'))
$$;
REVOKE ALL ON FUNCTION public.morar_site_can_publish(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.morar_site_can_publish(uuid) TO authenticated,service_role;

CREATE FUNCTION public.morar_site_area_m2(_value numeric,_unit text,_confirmed boolean) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN _value IS NULL OR _value<0 THEN NULL
  WHEN lower(btrim(coalesce(_unit,''))) IN ('m2','m²','metros quadrados') THEN _value
  WHEN lower(btrim(coalesce(_unit,''))) IN ('ha','hectare','hectares') THEN _value*10000
  WHEN coalesce(btrim(_unit),'')='' AND _confirmed IS TRUE THEN _value
  ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.morar_site_area_m2(numeric,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_area_m2(numeric,text,boolean) TO service_role;

CREATE FUNCTION public.morar_site_content_hash(p public.properties) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT md5(jsonb_build_array(p.descricao_imovel,p.pontos_fortes,p.caracteristicas,p.exibir_endereco_site,p.logradouro,p.numero,p.bairro,p.cidade,p.uf,p.tipo,p.operacao,p.area_util,p.area_total,p.area_construida,p.area_terreno,p.area_privativa_unidade,p.area_total_unidade,p.area_construida_unidade,p.area_terreno_unidade)::text)
$$;
CREATE FUNCTION public.morar_site_image_signature(i public.property_images) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT md5(jsonb_build_array(i.storage_path,i.processed_storage_path,i.thumbnail_storage_path,i.content_hash,i.processed_checksum,i.processing_status,i.watermark_variant,i.watermark_version,i.updated_at)::text)
$$;
REVOKE ALL ON FUNCTION public.morar_site_content_hash(public.properties), public.morar_site_image_signature(public.property_images) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_content_hash(public.properties), public.morar_site_image_signature(public.property_images) TO service_role;

CREATE FUNCTION public.morar_site_decode_public_text(_text text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE result text:=coalesce(_text,''); entity text; token text; replacement text;
 codepoint integer; digit integer; i integer;
BEGIN
 FOR entity IN SELECT DISTINCT m[1] FROM regexp_matches(result,'(&[#A-Za-z][#A-Za-z0-9]*;)','g') m LOOP
  token:=substr(entity,2,length(entity)-2); replacement:=NULL;
  IF token ~ '^#[xX][0-9A-Fa-f]{1,6}$' THEN
   codepoint:=0;
   FOR i IN 3..length(token) LOOP
    digit:=strpos('0123456789abcdef',lower(substr(token,i,1)))-1;
    codepoint:=codepoint*16+digit;
   END LOOP;
  ELSIF token ~ '^#[0-9]{1,7}$' THEN
   codepoint:=substr(token,2)::integer;
  ELSIF left(token,1)='#' THEN RETURN NULL;
  ELSE
   replacement:=CASE lower(token)
    WHEN 'nbsp' THEN ' ' WHEN 'ensp' THEN ' ' WHEN 'emsp' THEN ' ' WHEN 'thinsp' THEN ' '
    WHEN 'amp' THEN '&' WHEN 'lt' THEN '<' WHEN 'gt' THEN '>' WHEN 'quot' THEN '"' WHEN 'apos' THEN ''''
    WHEN 'sup1' THEN '¹' WHEN 'sup2' THEN '²' WHEN 'sup3' THEN '³'
    WHEN 'aacute' THEN 'á' WHEN 'agrave' THEN 'à' WHEN 'acirc' THEN 'â' WHEN 'atilde' THEN 'ã' WHEN 'auml' THEN 'ä' WHEN 'aring' THEN 'å'
    WHEN 'eacute' THEN 'é' WHEN 'egrave' THEN 'è' WHEN 'ecirc' THEN 'ê' WHEN 'euml' THEN 'ë'
    WHEN 'iacute' THEN 'í' WHEN 'igrave' THEN 'ì' WHEN 'icirc' THEN 'î' WHEN 'iuml' THEN 'ï'
    WHEN 'oacute' THEN 'ó' WHEN 'ograve' THEN 'ò' WHEN 'ocirc' THEN 'ô' WHEN 'otilde' THEN 'õ' WHEN 'ouml' THEN 'ö'
    WHEN 'uacute' THEN 'ú' WHEN 'ugrave' THEN 'ù' WHEN 'ucirc' THEN 'û' WHEN 'uuml' THEN 'ü'
    WHEN 'ccedil' THEN 'ç' WHEN 'ntilde' THEN 'ñ' ELSE NULL END;
   IF replacement IS NULL THEN RETURN NULL; END IF;
  END IF;
  IF replacement IS NULL THEN
   IF codepoint NOT BETWEEN 1 AND 1114111 OR codepoint BETWEEN 55296 AND 57343
    OR codepoint BETWEEN 127 AND 159 OR (codepoint<32 AND codepoint NOT IN (9,10,13)) THEN RETURN NULL; END IF;
   replacement:=chr(codepoint);
   IF codepoint NOT IN (9,10,13,160,178,179,185,768,769,770,771,776,778,807,8194,8195,8201,8239,12288)
    AND codepoint NOT BETWEEN 32 AND 126
    AND strpos('ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',replacement)=0 THEN RETURN NULL; END IF;
  END IF;
  result:=replace(result,entity,replacement);
 END LOOP;
 IF result ~ '&[#A-Za-z]' THEN RETURN NULL; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.morar_site_normalize_public_text(_text text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT lower(regexp_replace(btrim(translate(translate(translate(regexp_replace(public.morar_site_decode_public_text(_text),'<[^>]*>',' ','g'),
  'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
  'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'),
  U&'\0300\0301\0302\0303\0308\030A\0327',''),U&'\00A0\2002\2003\2009\202F\3000','      ')),'[[:space:]]+',' ','g'))
$$;
CREATE FUNCTION public.morar_site_has_hidden_address(p public.properties,_text text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT p.exibir_endereco_site IS DISTINCT FROM 'sim'
  AND btrim(coalesce(p.logradouro,'')) NOT IN ('','0')
  AND (public.morar_site_normalize_public_text(_text) IS NULL
   OR public.morar_site_normalize_public_text(p.logradouro) IS NULL
   OR strpos(public.morar_site_normalize_public_text(_text),public.morar_site_normalize_public_text(p.logradouro))>0
   OR strpos(replace(public.morar_site_normalize_public_text(_text),' ',''),replace(public.morar_site_normalize_public_text(p.logradouro),' ',''))>0)
$$;
CREATE FUNCTION public.morar_site_public_features(p public.properties) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(array_agg(feature ORDER BY ordinal),'{}'::text[])
 FROM unnest(p.caracteristicas) WITH ORDINALITY AS f(feature,ordinal)
 WHERE NOT public.morar_site_has_hidden_address(p,feature)
$$;
REVOKE ALL ON FUNCTION public.morar_site_decode_public_text(text),public.morar_site_normalize_public_text(text),public.morar_site_has_hidden_address(public.properties,text),public.morar_site_public_features(public.properties) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_decode_public_text(text),public.morar_site_normalize_public_text(text),public.morar_site_has_hidden_address(public.properties,text),public.morar_site_public_features(public.properties) TO service_role;

CREATE VIEW public.morar_site_eligible WITH(security_invoker=true) AS
SELECT p.id AS property_id, s.public_id, s.public_reference, s.published_at,
  p.operacao,p.tipo, NULLIF(NULLIF(btrim(p.cidade),''),'0') AS cidade,
  NULLIF(NULLIF(btrim(p.bairro),''),'0') AS bairro,p.uf,
  CASE WHEN p.exibir_endereco_site='sim' THEN concat_ws(', ',NULLIF(p.logradouro,''),NULLIF(p.numero,'')) ELSE NULL END AS endereco,
  CASE WHEN p.valor_modo='fixo' AND p.valor>=0 THEN p.valor ELSE NULL END AS valor,p.valor_modo,
  p.dormitorios,p.banheiros,p.suites,p.vagas,
  public.morar_site_area_m2(p.area_util,NULL,s.area_units_confirmed) AS area_util,
  public.morar_site_area_m2(p.area_total,p.area_total_unidade,s.area_units_confirmed) AS area_total,
  public.morar_site_area_m2(p.area_construida,p.area_construida_unidade,s.area_units_confirmed) AS area_construida,
  public.morar_site_area_m2(p.area_terreno,p.area_terreno_unidade,s.area_units_confirmed) AS area_terreno,
  CASE WHEN lower(p.mobiliado::text) IN ('true','sim') THEN true WHEN lower(p.mobiliado::text) IN ('false','nao','não') THEN false ELSE NULL END AS mobiliado,
  p.permuta,p.aceita_financiamento,p.estagio_empreendimento,p.destaque_inicial,
  CASE WHEN public.morar_site_has_hidden_address(p,p.descricao_imovel) THEN '' ELSE p.descricao_imovel END AS descricao_imovel,
  CASE WHEN public.morar_site_has_hidden_address(p,p.pontos_fortes) THEN NULL ELSE p.pontos_fortes END AS pontos_fortes,
  public.morar_site_public_features(p) AS caracteristicas
FROM public.properties p JOIN public.morar_site_publications s ON s.property_id=p.id
WHERE s.state='published' AND s.morar_authorized IS TRUE AND s.availability_confirmed IS TRUE
 AND s.manual_withdrawn IS FALSE
 AND s.published_at IS NOT NULL AND s.reviewed_content_hash=public.morar_site_content_hash(p)
 AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL
 AND (p.source IS DISTINCT FROM 'gestao_cordial' OR p.registration_completed_at IS NOT NULL)
 AND p.autorizacao IS DISTINCT FROM false
 AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
 AND p.operacao IN ('venda','aluguel');

CREATE VIEW public.morar_site_authorized_media WITH(security_invoker=true) AS
SELECT m.id, e.public_id, i.property_id, i.position,
  m.approved_signature AS version,i.width,i.height,
  CASE WHEN i.processing_status='ready' THEN i.processed_storage_path ELSE i.storage_path END AS storage_path
FROM public.morar_site_media m JOIN public.property_images i ON i.id=m.image_id
JOIN public.morar_site_eligible e ON e.property_id=i.property_id
WHERE m.approved_signature=public.morar_site_image_signature(i)
  AND i.processing_status IN ('ready','legacy')
  AND coalesce((to_jsonb(i)->>'pending_remote_delete')::boolean,false) IS FALSE
  AND (i.processing_status='legacy' OR (i.processed_storage_path IS NOT NULL AND i.watermark_variant IN ('morar','morar-cordial')))
  AND i.storage_path !~ '(^https?:|\.\.)'
  AND NOT EXISTS (
    SELECT 1 FROM public.property_images other
    LEFT JOIN public.morar_site_media approval ON approval.image_id=other.id
    WHERE other.property_id=i.property_id AND coalesce((to_jsonb(other)->>'pending_remote_delete')::boolean,false) IS FALSE AND (
      approval.approved_signature IS DISTINCT FROM public.morar_site_image_signature(other)
      OR other.processing_status NOT IN ('ready','legacy')
      OR (other.processing_status='ready' AND (other.processed_storage_path IS NULL OR other.watermark_variant NOT IN ('morar','morar-cordial')))
      OR other.storage_path ~ '(^https?:|\.\.)'
    )
  )
  AND EXISTS(SELECT 1 FROM public.property_images cover WHERE cover.property_id=i.property_id AND cover.position=0 AND coalesce((to_jsonb(cover)->>'pending_remote_delete')::boolean,false) IS FALSE)
  AND NOT EXISTS(SELECT 1 FROM public.property_images duplicate WHERE duplicate.property_id=i.property_id AND coalesce((to_jsonb(duplicate)->>'pending_remote_delete')::boolean,false) IS FALSE GROUP BY duplicate.position HAVING count(*)>1);

CREATE VIEW public.morar_site_documents WITH(security_invoker=true) AS
SELECT e.*, media.photo_count,
  jsonb_build_object('id',e.public_id,'reference',e.public_reference,'operation',e.operacao,'type',e.tipo,
  'city',e.cidade,'district',e.bairro,'state',e.uf,'address',e.endereco,
  'price',e.valor,'priceMode',e.valor_modo,'bedrooms',e.dormitorios,'bathrooms',e.banheiros,'suites',e.suites,'parking',e.vagas,
  'areas',jsonb_build_object('util',e.area_util,'total',e.area_total,'construida',e.area_construida,'terreno',e.area_terreno),
  'furnished',e.mobiliado,'exchange',e.permuta,'financing',e.aceita_financiamento,'stage',e.estagio_empreendimento,
  'featured',e.destaque_inicial IS TRUE,'publishedAt',e.published_at,'description',coalesce(e.descricao_imovel,''),
  'features',coalesce(to_jsonb(e.caracteristicas),'[]'::jsonb),'cover',media.cover,'photoCount',media.photo_count) AS document
FROM public.morar_site_eligible e CROSS JOIN LATERAL (
  SELECT count(*) AS photo_count,
  (jsonb_agg(jsonb_build_object('id',m.id,'version',m.version,'width',m.width,'height',m.height,'position',m.position) ORDER BY m.position,m.id)->0) AS cover
  FROM public.morar_site_authorized_media m WHERE m.public_id=e.public_id
) media;
REVOKE ALL ON public.morar_site_eligible,public.morar_site_authorized_media,public.morar_site_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.morar_site_eligible,public.morar_site_authorized_media,public.morar_site_documents TO service_role;
CREATE INDEX morar_site_publication_order_idx ON public.morar_site_publications(published_at DESC,public_id) WHERE state='published';

CREATE FUNCTION public.morar_site_search(f jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH filtered AS MATERIALIZED (
 SELECT d.*, CASE f->>'areaTipo' WHEN 'util' THEN d.area_util WHEN 'total' THEN d.area_total WHEN 'terreno' THEN d.area_terreno ELSE d.area_construida END AS selected_area
 FROM public.morar_site_eligible d
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
 AND CASE WHEN f->>'fotos' IS NULL THEN true ELSE
   EXISTS(SELECT 1 FROM public.morar_site_authorized_media m WHERE m.public_id=d.public_id)=(f->>'fotos'='sim') END
 AND (f->>'destaque' IS NULL OR (d.destaque_inicial IS TRUE)=(f->>'destaque'='sim'))
 AND (f->>'estagio' IS NULL OR d.estagio_empreendimento=f->>'estagio')
), area_filtered AS MATERIALIZED (
 SELECT * FROM filtered WHERE (f->>'areaMin' IS NULL OR selected_area >= (f->>'areaMin')::numeric)
 AND (f->>'areaMax' IS NULL OR selected_area <= (f->>'areaMax')::numeric)
), paged AS MATERIALIZED (
 SELECT public_id,row_number() OVER (ORDER BY
 CASE WHEN f->>'ordem'='preco_asc' THEN valor END ASC NULLS LAST,
 CASE WHEN f->>'ordem'='preco_desc' THEN valor END DESC NULLS LAST,
 CASE WHEN f->>'ordem'='area_desc' THEN selected_area END DESC NULLS LAST,
 published_at DESC, public_id) AS result_order FROM area_filtered
 ORDER BY CASE WHEN f->>'ordem'='preco_asc' THEN valor END ASC NULLS LAST,
 CASE WHEN f->>'ordem'='preco_desc' THEN valor END DESC NULLS LAST,
 CASE WHEN f->>'ordem'='area_desc' THEN selected_area END DESC NULLS LAST,
 published_at DESC, public_id
 LIMIT 12 OFFSET (greatest(1,least(10000,coalesce((f->>'pagina')::int,1)))-1)*12
), page_documents AS (
 SELECT p.result_order,d.document - 'description' || jsonb_build_object('description','') AS document
 FROM paged p JOIN public.morar_site_documents d ON d.public_id=p.public_id
)
SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(document ORDER BY result_order) FROM page_documents),'[]'::jsonb),'total',(SELECT count(*) FROM area_filtered),'page',greatest(1,least(10000,coalesce((f->>'pagina')::int,1))),'pageSize',12)
$$;
CREATE FUNCTION public.morar_site_facets() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('total',(SELECT count(*) FROM morar_site_eligible),
 'types',coalesce((SELECT jsonb_agg(jsonb_build_object('value',tipo,'count',n) ORDER BY tipo) FROM (SELECT tipo,count(*) n FROM morar_site_eligible WHERE tipo IS NOT NULL GROUP BY tipo) t),'[]'),
 'cities',coalesce((SELECT jsonb_agg(jsonb_build_object('value',cidade,'count',n) ORDER BY cidade) FROM (SELECT cidade,count(*) n FROM morar_site_eligible WHERE cidade IS NOT NULL GROUP BY cidade) t),'[]'),
 'districts',coalesce((SELECT jsonb_agg(jsonb_build_object('value',bairro,'city',cidade,'count',n) ORDER BY n DESC,bairro,cidade) FROM (SELECT bairro,cidade,count(*) n FROM morar_site_eligible WHERE bairro IS NOT NULL AND cidade IS NOT NULL GROUP BY bairro,cidade) t),'[]'),
 'stages',coalesce((SELECT jsonb_agg(estagio_empreendimento ORDER BY estagio_empreendimento) FROM (SELECT DISTINCT estagio_empreendimento FROM morar_site_eligible WHERE estagio_empreendimento IS NOT NULL) t),'[]'))
$$;
REVOKE ALL ON FUNCTION public.morar_site_search(jsonb),public.morar_site_facets() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_search(jsonb),public.morar_site_facets() TO service_role;

CREATE FUNCTION public.morar_site_audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO morar_site_audit(entity,entity_id,action,actor,before_value,after_value)
 VALUES(TG_TABLE_NAME,coalesce(to_jsonb(NEW)->>'property_id',to_jsonb(NEW)->>'slug',to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id','settings'),TG_OP,coalesce(auth.uid(),nullif(current_setting('morar_site.actor',true),'')::uuid),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_audit_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER site_publication_audit AFTER INSERT OR UPDATE OR DELETE ON public.morar_site_publications FOR EACH ROW EXECUTE FUNCTION public.morar_site_audit_change();
CREATE TRIGGER site_settings_audit AFTER UPDATE ON public.morar_site_settings FOR EACH ROW EXECUTE FUNCTION public.morar_site_audit_change();
CREATE TRIGGER site_pages_audit AFTER INSERT OR UPDATE OR DELETE ON public.morar_site_pages FOR EACH ROW EXECUTE FUNCTION public.morar_site_audit_change();
CREATE TRIGGER site_media_audit AFTER INSERT OR UPDATE OR DELETE ON public.morar_site_media FOR EACH ROW EXECUTE FUNCTION public.morar_site_audit_change();

CREATE FUNCTION public.morar_site_review(_property_id uuid,_publish boolean,_authorize boolean DEFAULT false,_available boolean DEFAULT false,_review_content boolean DEFAULT false,_review_media boolean DEFAULT false,_areas_m2 boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p properties; result uuid; code text;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO STRICT p FROM properties WHERE id=_property_id FOR SHARE;
 IF _publish AND (_authorize IS NOT TRUE OR _available IS NOT TRUE OR _review_content IS NOT TRUE OR p.autorizacao IS FALSE OR p.is_draft IS DISTINCT FROM false OR p.archived_at IS NOT NULL OR p.removal_state IS NOT NULL OR p.exibir_imovel IS NOT TRUE OR p.operacao IS NULL OR p.operacao NOT IN ('venda','aluguel') OR (p.source='gestao_cordial' AND p.registration_completed_at IS NULL) OR (p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) NOT IN ('sim','disponivel','disponível'))) THEN RAISE EXCEPTION 'Publication requires explicit authorization and a compatible completed property'; END IF;
 code:=NULLIF(btrim(p.codigo_morar),'');
 IF code IS NULL OR code ~* '^GC-' THEN code:='M-'||lpad(nextval('morar_site_reference_seq')::text,6,'0'); END IF;
 INSERT INTO morar_site_publications(property_id,public_reference,state,morar_authorized,availability_confirmed,reviewed_content_hash,area_units_confirmed,published_at,reviewed_by)
 VALUES(p.id,code,CASE WHEN _publish THEN 'published' ELSE 'withdrawn' END,_authorize,_available,CASE WHEN _review_content THEN morar_site_content_hash(p) END,_areas_m2,CASE WHEN _publish THEN now() END,auth.uid())
 ON CONFLICT(property_id) DO UPDATE SET state=excluded.state,morar_authorized=excluded.morar_authorized,availability_confirmed=excluded.availability_confirmed,reviewed_content_hash=excluded.reviewed_content_hash,area_units_confirmed=excluded.area_units_confirmed,published_at=coalesce(morar_site_publications.published_at,excluded.published_at),reviewed_by=auth.uid(),updated_at=now()
 RETURNING public_id INTO result;
 UPDATE morar_site_publications SET manual_withdrawn=NOT _publish,decision_source='manual',decision_revision=p.revision WHERE property_id=p.id;
 IF _review_media AND _publish THEN
   INSERT INTO morar_site_media(image_id,approved_signature,approved_by)
   SELECT i.id,morar_site_image_signature(i),auth.uid() FROM property_images i WHERE i.property_id=p.id AND coalesce((to_jsonb(i)->>'pending_remote_delete')::boolean,false) IS FALSE AND (i.processing_status='legacy' OR (i.processing_status='ready' AND i.processed_storage_path IS NOT NULL AND i.watermark_variant IN ('morar','morar-cordial')))
   ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature,approved_by=auth.uid(),approved_at=now();
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_review(uuid,boolean,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.morar_site_review(uuid,boolean,boolean,boolean,boolean,boolean,boolean) TO authenticated;

CREATE FUNCTION public.morar_site_take_rate(_bucket text,_limit int,_seconds int) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE n int;
BEGIN
 DELETE FROM morar_site_rate_limits WHERE expires_at<now()-interval '1 day';
 INSERT INTO morar_site_rate_limits(bucket,hits,expires_at) VALUES(_bucket,1,now()+make_interval(secs=>_seconds))
 ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN morar_site_rate_limits.expires_at<now() THEN 1 ELSE morar_site_rate_limits.hits+1 END,
 expires_at=CASE WHEN morar_site_rate_limits.expires_at<now() THEN excluded.expires_at ELSE morar_site_rate_limits.expires_at END RETURNING hits INTO n;
 RETURN n<=_limit;
END $$;
CREATE FUNCTION public.morar_site_submit_lead(_lead jsonb,_fingerprint text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE listing morar_site_eligible; previous_id uuid; new_id uuid; privacy text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(_fingerprint,0));
 SELECT id INTO previous_id FROM morar_site_leads WHERE request_id=(_lead->>'requestId')::uuid OR (fingerprint=_fingerprint AND created_at>now()-interval '10 minutes') LIMIT 1;
 IF previous_id IS NOT NULL THEN RETURN 'received'; END IF;
 SELECT content->>'privacy' INTO privacy FROM morar_site_settings WHERE id=true;
 IF coalesce(privacy,'')='' THEN RAISE EXCEPTION 'Privacy policy not configured'; END IF;
 IF _lead->>'propertyId' IS NOT NULL THEN
  SELECT * INTO listing FROM morar_site_eligible WHERE public_id=(_lead->>'propertyId')::uuid;
  IF listing.public_id IS NULL THEN RAISE EXCEPTION 'Property unavailable'; END IF;
 END IF;
 INSERT INTO morar_site_leads(request_id,fingerprint,name,phone,email,message,kind,property_id,public_reference,operation,property_type,city,entry_path,campaign,privacy_version)
 VALUES((_lead->>'requestId')::uuid,_fingerprint,_lead->>'name',_lead->>'phone',NULLIF(_lead->>'email',''),_lead->>'message',_lead->>'kind',listing.property_id,listing.public_reference,coalesce(listing.operacao,_lead->>'operation'),coalesce(listing.tipo,_lead->>'propertyType'),coalesce(listing.cidade,_lead->>'city'),_lead->>'entryPath',coalesce(_lead->'campaign','{}'),md5(privacy)) RETURNING id INTO new_id;
 RETURN 'received';
END $$;
REVOKE ALL ON FUNCTION public.morar_site_take_rate(text,int,int),public.morar_site_submit_lead(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_take_rate(text,int,int),public.morar_site_submit_lead(jsonb,text) TO service_role;

CREATE FUNCTION public.morar_site_save_content(_kind text,_key text,_content jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _kind='settings' THEN
  UPDATE morar_site_settings SET content=_content,updated_at=now() WHERE id=true;
 ELSIF _kind='page' THEN
  INSERT INTO morar_site_pages(slug,kind,title,summary,body,published,published_at)
  VALUES(_key,_content->>'kind',_content->>'title',coalesce(_content->>'summary',''),coalesce(_content->>'body',''),coalesce((_content->>'published')::boolean,false),CASE WHEN (_content->>'published')::boolean THEN now() END)
  ON CONFLICT(slug) DO UPDATE SET kind=excluded.kind,title=excluded.title,summary=excluded.summary,body=excluded.body,published=excluded.published,published_at=coalesce(morar_site_pages.published_at,excluded.published_at),updated_at=now();
 ELSE RAISE EXCEPTION 'Invalid content kind'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_save_content(text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.morar_site_save_content(text,text,jsonb) TO authenticated;

CREATE FUNCTION public.morar_site_triage(_lead_id uuid,_operation text,_type text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l morar_site_leads; result uuid; p properties;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'secretaria') AND public.morar_site_can_publish(auth.uid()))) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _operation NOT IN ('compra','aluguel','ambos') OR _type NOT IN ('casa','apartamento','terreno','sala_comercial','area_rural','sitio_chacara','outro') THEN RAISE EXCEPTION 'Choose purpose and property type'; END IF;
 SELECT * INTO STRICT l FROM morar_site_leads WHERE id=_lead_id FOR UPDATE;
 IF l.attendance_id IS NOT NULL THEN RETURN l.attendance_id; END IF;
 IF l.property_id IS NOT NULL THEN SELECT * INTO p FROM properties WHERE id=l.property_id; END IF;
 INSERT INTO attendances(created_by,imobiliaria,cliente_nome,telefone,email,contato_preferencial,origem,fonte_prospeccao,finalidade,tipo_imovel,status,pipeline_stage,prioridade,imovel_id,imovel_ref,imovel_codigo,imovel_descricao,imovel_bairro,imovel_cidade,imovel_tipo,imovel_valor,interesse_descricao,historico_inicial)
 VALUES(auth.uid(),'morar',l.name,l.phone,l.email,'whatsapp','site','lead_imobiliaria',_operation,_type,'novo','primeiro_contato','media',p.id,p.id::text,l.public_reference,CASE WHEN p.id IS NOT NULL THEN concat_ws(' - ',p.tipo,p.bairro,p.cidade) END,p.bairro,p.cidade,p.tipo,p.valor,l.message,'Contato recebido pelo site próprio; origem: '||l.entry_path)
 RETURNING id INTO result;
 UPDATE morar_site_leads SET attendance_id=result,status='triaged' WHERE id=l.id;
 INSERT INTO morar_site_audit(entity,entity_id,action,actor,after_value) VALUES('morar_site_leads',l.id::text,'triage',auth.uid(),jsonb_build_object('attendance_id',result));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_triage(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.morar_site_triage(uuid,text,text) TO authenticated;

CREATE FUNCTION public.morar_site_request_publication(
 _property_id uuid,_requested_by uuid,_publish boolean,_expected_revision integer DEFAULT NULL,
 _review_media boolean DEFAULT true,_areas_m2 boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p properties; result uuid; active boolean; code text; pending boolean;
BEGIN
 IF NOT public.morar_site_can_publish(_requested_by) THEN RAISE EXCEPTION 'Forbidden Morar scope'; END IF;
 SELECT * INTO p FROM properties WHERE id=_property_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'notFound',true); END IF;
 IF _expected_revision IS NOT NULL AND p.revision<>_expected_revision THEN
  RETURN jsonb_build_object('ok',false,'conflict',true,'revision',p.revision);
 END IF;
 IF _publish AND (p.autorizacao IS FALSE OR p.exibir_imovel IS NOT TRUE OR p.archived_at IS NOT NULL OR p.removal_state IS NOT NULL OR p.operacao IS NULL OR p.operacao NOT IN ('venda','aluguel') OR (p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) NOT IN ('sim','disponivel','disponível')) OR (p.is_draft IS DISTINCT FROM false AND p.source IS DISTINCT FROM 'gestao_cordial')) THEN
  RAISE EXCEPTION 'Morar publication blocked by canonical property state';
 END IF;
 PERFORM set_config('morar_site.actor',_requested_by::text,true);
 pending:=p.autorizacao IS NOT TRUE OR p.disponibilidade IS NULL;
 active:=_publish AND NOT pending AND p.is_draft IS FALSE AND (p.source IS DISTINCT FROM 'gestao_cordial' OR p.registration_completed_at IS NOT NULL);
 code:=NULLIF(btrim(p.codigo_morar),'');
 IF code IS NULL OR code ~* '^GC-' THEN code:='M-'||lpad(nextval('morar_site_reference_seq')::text,6,'0'); END IF;
 INSERT INTO morar_site_publications(property_id,public_reference,state,morar_authorized,availability_confirmed,reviewed_content_hash,area_units_confirmed,published_at,reviewed_by,manual_withdrawn,decision_source,decision_revision)
 VALUES(p.id,code,CASE WHEN NOT _publish THEN 'withdrawn' WHEN active THEN 'published' ELSE 'draft' END,p.autorizacao IS TRUE,p.disponibilidade IS NOT NULL,morar_site_content_hash(p),_areas_m2,CASE WHEN active THEN now() END,_requested_by,NOT _publish,'registration',p.revision)
 ON CONFLICT(property_id) DO UPDATE SET state=excluded.state,morar_authorized=excluded.morar_authorized,availability_confirmed=excluded.availability_confirmed,reviewed_content_hash=excluded.reviewed_content_hash,area_units_confirmed=excluded.area_units_confirmed,published_at=coalesce(morar_site_publications.published_at,excluded.published_at),reviewed_by=excluded.reviewed_by,manual_withdrawn=excluded.manual_withdrawn,decision_source=excluded.decision_source,decision_revision=excluded.decision_revision,updated_at=now()
 RETURNING public_id INTO result;
 IF _review_media AND _publish THEN
  INSERT INTO morar_site_media(image_id,approved_signature,approved_by)
  SELECT i.id,morar_site_image_signature(i),_requested_by FROM property_images i WHERE i.property_id=p.id AND coalesce((to_jsonb(i)->>'pending_remote_delete')::boolean,false) IS FALSE AND (i.processing_status='legacy' OR (i.processing_status='ready' AND i.processed_storage_path IS NOT NULL AND i.watermark_variant IN ('morar','morar-cordial')))
  ON CONFLICT(image_id) DO UPDATE SET approved_signature=excluded.approved_signature,approved_by=excluded.approved_by,approved_at=now();
 END IF;
 RETURN jsonb_build_object('ok',true,'publicId',result,'state',CASE WHEN NOT _publish THEN 'withdrawn' WHEN active THEN 'published' ELSE 'draft' END,'active',active,'pendingReview',_publish AND pending,'reason',CASE WHEN _publish AND p.autorizacao IS NOT TRUE THEN 'authorization_review' WHEN _publish AND p.disponibilidade IS NULL THEN 'availability_review' WHEN _publish AND NOT active THEN 'registration_pending' END);
END $$;
REVOKE ALL ON FUNCTION public.morar_site_request_publication(uuid,uuid,boolean,integer,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_request_publication(uuid,uuid,boolean,integer,boolean,boolean) TO service_role;

CREATE FUNCTION public.morar_site_sync_property(_property_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p properties; s morar_site_publications; compatible boolean; approved boolean;
BEGIN
 SELECT * INTO s FROM morar_site_publications WHERE property_id=_property_id FOR UPDATE;
 IF NOT FOUND OR s.manual_withdrawn THEN RETURN; END IF;
 SELECT * INTO p FROM properties WHERE id=_property_id;
 IF NOT FOUND THEN RETURN; END IF;
 IF p.removal_state IS NOT NULL OR p.archived_at IS NOT NULL THEN
  UPDATE morar_site_publications SET state='withdrawn',manual_withdrawn=true,updated_at=now(),decision_revision=p.revision WHERE property_id=p.id;
  RETURN;
 END IF;
 compatible:=p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.autorizacao IS DISTINCT FROM false
  AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
  AND p.operacao IN ('venda','aluguel') AND (p.source IS DISTINCT FROM 'gestao_cordial' OR p.registration_completed_at IS NOT NULL);
 IF s.decision_source='registration' THEN
  s.morar_authorized:=s.morar_authorized OR p.autorizacao IS TRUE;
  s.availability_confirmed:=s.availability_confirmed OR (p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'));
 END IF;
 approved:=compatible AND s.morar_authorized AND s.availability_confirmed;
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
END $$;
REVOKE ALL ON FUNCTION public.morar_site_sync_property(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_sync_property(uuid) TO service_role;

CREATE FUNCTION public.morar_site_sync_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_property_id uuid;
BEGIN
 target_property_id:=coalesce(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='properties' THEN 'id' ELSE 'property_id' END,to_jsonb(OLD)->>CASE WHEN TG_TABLE_NAME='properties' THEN 'id' ELSE 'property_id' END)::uuid;
 IF TG_TABLE_NAME='properties' AND TG_OP='UPDATE' THEN
  IF jsonb_build_array(NEW.area_util,NEW.area_total,NEW.area_construida,NEW.area_terreno,NEW.area_total_unidade,NEW.area_construida_unidade,NEW.area_terreno_unidade)
   IS DISTINCT FROM jsonb_build_array(OLD.area_util,OLD.area_total,OLD.area_construida,OLD.area_terreno,OLD.area_total_unidade,OLD.area_construida_unidade,OLD.area_terreno_unidade) THEN
   UPDATE morar_site_publications SET area_units_confirmed=false WHERE morar_site_publications.property_id=target_property_id AND decision_source<>'registration';
  END IF;
 END IF;
 PERFORM morar_site_sync_property(target_property_id);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_sync_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER morar_site_sync_properties AFTER UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.morar_site_sync_trigger();
CREATE TRIGGER morar_site_sync_images AFTER INSERT OR UPDATE OR DELETE ON public.property_images FOR EACH ROW EXECUTE FUNCTION public.morar_site_sync_trigger();

CREATE VIEW public.morar_site_admin_catalog WITH(security_invoker=true) AS
 SELECT p.id,p.codigo_morar,p.tipo,p.cidade,p.bairro,p.carteira,p.operacao,p.autorizacao,p.exibir_imovel,p.is_draft,p.disponibilidade,p.archived_at,p.removal_state,p.source,p.registration_completed_at
 FROM public.properties p WHERE public.has_role(auth.uid(),'admin') AND (
 EXISTS(SELECT 1 FROM public.morar_site_publications s WHERE s.property_id=p.id)
 OR EXISTS(SELECT 1 FROM public.property_provider_publications pp WHERE pp.property_id=p.id AND pp.provider::text='morar' AND pp.enabled IS TRUE AND pp.desired_availability='visible'));
REVOKE ALL ON public.morar_site_admin_catalog FROM PUBLIC,anon;
GRANT SELECT ON public.morar_site_admin_catalog TO authenticated,service_role;

CREATE FUNCTION public.morar_site_admin_public_list() RETURNS TABLE(public_id uuid,public_reference text,tipo text,cidade text,bairro text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public_id,public_reference,tipo,cidade,bairro FROM morar_site_eligible WHERE public.has_role(auth.uid(),'admin')
$$;
REVOKE ALL ON FUNCTION public.morar_site_admin_public_list() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.morar_site_admin_public_list() TO authenticated,service_role;
CREATE VIEW public.morar_site_admin_public_catalog WITH(security_barrier=true) AS SELECT * FROM public.morar_site_admin_public_list();
REVOKE ALL ON public.morar_site_admin_public_catalog FROM PUBLIC,anon;
GRANT SELECT ON public.morar_site_admin_public_catalog TO authenticated,service_role;

CREATE FUNCTION public.morar_site_snapshot_hash(p public.properties) RETURNS text
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT md5(jsonb_build_array(p.id,p.revision,morar_site_content_hash(p),p.valor,p.valor_modo,p.autorizacao,p.disponibilidade,p.is_draft,p.exibir_imovel,p.archived_at,p.removal_state,p.source,p.registration_completed_at,
  (SELECT jsonb_agg(jsonb_build_array(pp.id,pp.enabled,pp.desired_availability,pp.publication_intent_revision) ORDER BY pp.id) FROM property_provider_publications pp WHERE pp.property_id=p.id AND pp.provider::text='morar'),
  (SELECT jsonb_agg(jsonb_build_array(i.id,morar_site_image_signature(i),i.position,coalesce((to_jsonb(i)->>'pending_remote_delete')::boolean,false)) ORDER BY i.id) FROM property_images i WHERE i.property_id=p.id),
  (SELECT jsonb_build_array(s.state,s.manual_withdrawn,s.morar_authorized,s.availability_confirmed,s.updated_at) FROM morar_site_publications s WHERE s.property_id=p.id))::text)
$$;
REVOKE ALL ON FUNCTION public.morar_site_snapshot_hash(public.properties) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_snapshot_hash(public.properties) TO service_role;

CREATE FUNCTION public.morar_site_inventory(_cursor uuid DEFAULT NULL,_limit integer DEFAULT 100) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _limit IS NULL OR _limit<1 OR _limit>500 THEN RAISE EXCEPTION 'Inventory limit must be between 1 and 500'; END IF;
 WITH catalog AS (
  SELECT p.*,p AS property_row,(EXISTS(SELECT 1 FROM property_provider_publications pp WHERE pp.property_id=p.id AND pp.provider::text='morar' AND pp.enabled IS TRUE AND pp.desired_availability='visible') OR EXISTS(SELECT 1 FROM morar_site_publications s WHERE s.property_id=p.id AND s.manual_withdrawn IS FALSE AND s.state IN ('draft','published'))) AS candidate
  FROM properties p WHERE EXISTS(SELECT 1 FROM property_provider_publications pp WHERE pp.property_id=p.id AND pp.provider::text='morar')
   OR EXISTS(SELECT 1 FROM morar_site_publications s WHERE s.property_id=p.id) OR p.carteira='morar'
 ), items AS (
  SELECT id,jsonb_build_object('propertyId',id,'revision',revision,'snapshotHash',morar_site_snapshot_hash(property_row),'candidate',candidate,'reference',codigo_morar,'source',source,
   'requiresAuthorizationReview',autorizacao IS NOT TRUE,'requiresAvailabilityReview',disponibilidade IS NULL,
   'blockers',to_jsonb(array_remove(ARRAY[
    CASE WHEN NOT candidate THEN 'no_active_morar_intent' END,
    CASE WHEN is_draft IS DISTINCT FROM false THEN 'draft' END,
    CASE WHEN exibir_imovel IS NOT TRUE THEN 'hidden' END,
    CASE WHEN autorizacao IS FALSE THEN 'authorization_denied' END,
    CASE WHEN archived_at IS NOT NULL OR removal_state IS NOT NULL THEN 'retired' END,
    CASE WHEN disponibilidade IS NOT NULL AND lower(btrim(disponibilidade)) NOT IN ('sim','disponivel','disponível') THEN 'unavailable' END,
    CASE WHEN operacao IS NULL OR operacao NOT IN ('venda','aluguel') THEN 'invalid_operation' END,
    CASE WHEN source='gestao_cordial' AND registration_completed_at IS NULL THEN 'registration_incomplete' END
    ,CASE WHEN EXISTS(SELECT 1 FROM morar_site_publications s WHERE s.property_id=catalog.id AND s.manual_withdrawn IS TRUE) THEN 'manual_withdrawal' END
   ],NULL))) AS item FROM catalog WHERE _cursor IS NULL OR id>_cursor ORDER BY id LIMIT _limit
 ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(item ORDER BY id) FROM items),'[]'::jsonb),'nextCursor',(SELECT id FROM items ORDER BY id DESC LIMIT 1),'total',(SELECT count(*) FROM catalog)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_inventory(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.morar_site_inventory(uuid,integer) TO authenticated;

CREATE FUNCTION public.morar_site_review_batch(_batch_id uuid,_items jsonb,_dry_run boolean DEFAULT true,_confirm_authorization boolean DEFAULT false,_confirm_availability boolean DEFAULT false,_review_media boolean DEFAULT false,_areas_m2 boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row jsonb; p properties; approved_id uuid; results jsonb:='[]'; problems text[]; request_hash text; previous morar_site_activation_batches; has_errors boolean:=false;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _items IS NULL OR jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)<1 OR jsonb_array_length(_items)>500 THEN RAISE EXCEPTION 'A reviewed batch requires 1 to 500 snapshot items'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_items) x GROUP BY x->>'propertyId' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate property in activation batch'; END IF;
 request_hash:=md5(jsonb_build_array(_items,_confirm_authorization,_confirm_availability,_review_media,_areas_m2)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_batch_id::text,0));
 SELECT * INTO previous FROM morar_site_activation_batches WHERE id=_batch_id;
 IF FOUND THEN
  IF previous.snapshot_hash<>request_hash THEN RAISE EXCEPTION 'Batch identifier already used for a different snapshot'; END IF;
  RETURN previous.result || jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM properties WHERE id IN(SELECT (x->>'propertyId')::uuid FROM jsonb_array_elements(_items) x) ORDER BY id FOR UPDATE;
 FOR row IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'propertyId' LOOP
  SELECT * INTO p FROM properties WHERE id=(row->>'propertyId')::uuid;
  problems:=ARRAY[]::text[];
  IF NOT FOUND THEN problems:=array_append(problems,'missing');
  ELSE
   IF row->>'snapshotHash' IS DISTINCT FROM morar_site_snapshot_hash(p) OR (row->>'revision')::integer IS DISTINCT FROM p.revision THEN problems:=array_append(problems,'snapshot_changed'); END IF;
   IF NOT EXISTS(SELECT 1 FROM property_provider_publications pp WHERE pp.property_id=p.id AND pp.provider::text='morar' AND pp.enabled IS TRUE AND pp.desired_availability='visible') AND NOT EXISTS(SELECT 1 FROM morar_site_publications s WHERE s.property_id=p.id AND s.manual_withdrawn IS FALSE AND s.state IN ('draft','published')) THEN problems:=array_append(problems,'no_active_morar_intent'); END IF;
   IF EXISTS(SELECT 1 FROM morar_site_publications s WHERE s.property_id=p.id AND s.manual_withdrawn IS TRUE) THEN problems:=array_append(problems,'manual_withdrawal'); END IF;
   IF p.is_draft IS DISTINCT FROM false OR p.exibir_imovel IS NOT TRUE OR p.autorizacao IS FALSE OR p.archived_at IS NOT NULL OR p.removal_state IS NOT NULL OR p.operacao IS NULL OR p.operacao NOT IN ('venda','aluguel') OR (p.source='gestao_cordial' AND p.registration_completed_at IS NULL) OR (p.disponibilidade IS NOT NULL AND lower(btrim(p.disponibilidade)) NOT IN ('sim','disponivel','disponível')) THEN problems:=array_append(problems,'canonical_block'); END IF;
   IF p.autorizacao IS NOT TRUE AND _confirm_authorization IS NOT TRUE THEN problems:=array_append(problems,'authorization_review_required'); END IF;
   IF p.disponibilidade IS NULL AND _confirm_availability IS NOT TRUE THEN problems:=array_append(problems,'availability_review_required'); END IF;
  END IF;
  has_errors:=has_errors OR cardinality(problems)>0;
  results:=results||jsonb_build_array(jsonb_build_object('propertyId',row->>'propertyId','ready',cardinality(problems)=0,'blockers',to_jsonb(problems)));
 END LOOP;
 IF _dry_run IS DISTINCT FROM false THEN RETURN jsonb_build_object('dryRun',true,'ready',NOT has_errors,'items',results,'writes',0,'snapshotHash',request_hash); END IF;
 IF has_errors THEN RAISE EXCEPTION 'Activation blocked: snapshot changed, incompatible property, or explicit confirmations missing'; END IF;
 results:='[]';
 FOR row IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'propertyId' LOOP
  approved_id:=morar_site_review((row->>'propertyId')::uuid,true,true,true,true,_review_media,_areas_m2);
  UPDATE morar_site_publications SET decision_source='activation',decision_revision=(row->>'revision')::integer WHERE property_id=(row->>'propertyId')::uuid;
  results:=results||jsonb_build_array(jsonb_build_object('propertyId',row->>'propertyId','publicId',approved_id));
 END LOOP;
 results:=jsonb_build_object('dryRun',false,'applied',jsonb_array_length(_items),'items',results,'snapshotHash',request_hash,'replayed',false);
 INSERT INTO morar_site_activation_batches(id,snapshot,snapshot_hash,result,reviewed_by) VALUES(_batch_id,_items,request_hash,results,auth.uid());
 INSERT INTO morar_site_audit(entity,entity_id,action,actor,after_value) VALUES('morar_site_activation_batches',_batch_id::text,'reviewed_activation',auth.uid(),jsonb_build_object('count',jsonb_array_length(_items),'snapshot_hash',request_hash,'confirm_authorization',_confirm_authorization,'confirm_availability',_confirm_availability,'review_media',_review_media,'areas_m2',_areas_m2));
 RETURN results;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_review_batch(uuid,jsonb,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.morar_site_review_batch(uuid,jsonb,boolean,boolean,boolean,boolean,boolean) TO authenticated;

CREATE FUNCTION public.property_effective_watermark_targets(_property_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(array_agg(DISTINCT t.target ORDER BY t.target),'{}'::text[]) FROM (
  SELECT unnest(p.publish_targets) AS target FROM properties p WHERE p.id=_property_id
  UNION ALL
  SELECT 'morar' WHERE EXISTS(SELECT 1 FROM morar_site_publications s WHERE s.property_id=_property_id
   AND s.morar_authorized IS TRUE AND s.manual_withdrawn IS FALSE AND s.state IN ('draft','published'))
 ) t WHERE t.target IN ('cordial','morar')
$$;
REVOKE ALL ON FUNCTION public.property_effective_watermark_targets(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.property_effective_watermark_targets(uuid) TO service_role;

CREATE FUNCTION public.morar_site_refresh_watermark_intent(_property_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_hash text; p properties;
BEGIN
 SELECT * INTO p FROM properties WHERE id=_property_id;
 IF NOT FOUND OR p.removal_state IS NOT NULL OR p.archived_at IS NOT NULL THEN RETURN; END IF;
 IF cardinality(property_effective_watermark_targets(p.id))=0 THEN RETURN; END IF;
 next_hash:=property_expected_watermark_hash(property_effective_watermark_targets(p.id));
 UPDATE property_images i SET desired_destination_hash=next_hash,
  processing_status=CASE WHEN i.destination_hash IS NOT DISTINCT FROM next_hash THEN i.processing_status WHEN i.original_storage_path IS NULL THEN 'failed_permanent' ELSE 'pending' END,
  processing_error_code=CASE WHEN i.destination_hash IS NOT DISTINCT FROM next_hash THEN i.processing_error_code WHEN i.original_storage_path IS NULL THEN 'original_ausente' ELSE NULL END,
  processing_error_message=CASE WHEN i.destination_hash IS NOT DISTINCT FROM next_hash THEN i.processing_error_message WHEN i.original_storage_path IS NULL THEN 'Original ausente: revisão necessária para a marca do destino.' ELSE NULL END
 WHERE i.property_id=p.id AND NOT coalesce(i.pending_remote_delete,false)
  AND i.desired_destination_hash IS NOT NULL AND i.desired_destination_hash IS DISTINCT FROM next_hash
  AND NOT EXISTS(SELECT 1 FROM public.property_image_legacy_review r WHERE r.image_id=i.id AND r.review_status='open');
END $$;
REVOKE ALL ON FUNCTION public.morar_site_refresh_watermark_intent(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_refresh_watermark_intent(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.property_image_set_desired_watermark() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.processing_status='legacy' AND NEW.desired_destination_hash IS NULL THEN RETURN NEW; END IF;
 NEW.desired_destination_hash:=property_expected_watermark_hash(property_effective_watermark_targets(NEW.property_id));
 IF NOT coalesce(NEW.pending_remote_delete,false) AND NEW.destination_hash IS DISTINCT FROM NEW.desired_destination_hash THEN NEW.processing_status:='pending'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.property_image_set_desired_watermark() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS property_image_desired_watermark_on_insert ON public.property_images;
CREATE TRIGGER property_image_desired_watermark_on_insert BEFORE INSERT ON public.property_images FOR EACH ROW EXECUTE FUNCTION public.property_image_set_desired_watermark();

CREATE OR REPLACE FUNCTION public.property_targets_mark_images_pending() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.publish_targets IS DISTINCT FROM OLD.publish_targets THEN PERFORM morar_site_refresh_watermark_intent(NEW.id); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.property_targets_mark_images_pending() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS property_targets_mark_images_pending ON public.properties;
CREATE TRIGGER property_targets_mark_images_pending AFTER UPDATE OF publish_targets ON public.properties FOR EACH ROW EXECUTE FUNCTION public.property_targets_mark_images_pending();

CREATE FUNCTION public.morar_site_publication_watermark_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM morar_site_refresh_watermark_intent(coalesce(NEW.property_id,OLD.property_id));
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_publication_watermark_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER morar_site_watermark_intent AFTER INSERT OR UPDATE OR DELETE ON public.morar_site_publications FOR EACH ROW EXECUTE FUNCTION public.morar_site_publication_watermark_trigger();
