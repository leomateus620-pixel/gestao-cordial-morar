-- A1: adapted from supabase/migrations/20261018170000_cordial_public_experience.sql (PR #33).
-- Excludes site_media_worker_dispatch() and the cron job (A2, vault-dependent). Outer BEGIN/COMMIT removed.
-- Bucket public-site-derivatives created beforehand by the storage tool; verified private here.

CREATE TABLE public.cordial_site_responsibles (
  profile_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 100),
  display_role text NOT NULL DEFAULT 'Atendimento comercial' CHECK(length(display_role)<=100),
  whatsapp text NOT NULL CHECK(whatsapp ~ '^[0-9]{10,15}$'),
  photo_url text CHECK(photo_url IS NULL OR (photo_url LIKE 'https://%' AND length(photo_url)<=1000 AND photo_url!~'[?#@]' AND photo_url!~'/storage/v1/object/(sign|authenticated)/')),
  active boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cordial_site_responsibles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cordial_site_responsibles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cordial_site_responsibles TO authenticated;
GRANT ALL ON public.cordial_site_responsibles TO service_role;
CREATE POLICY cordial_site_responsibles_admin ON public.cordial_site_responsibles FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER site_responsibles_audit AFTER INSERT OR UPDATE OR DELETE ON public.cordial_site_responsibles FOR EACH ROW EXECUTE FUNCTION public.cordial_site_audit_change();
CREATE FUNCTION public.cordial_site_save_responsible(_profile_id uuid,_name text,_role text,_whatsapp text,_photo text,_active boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF NOT (public.has_role(_profile_id,'corretor') OR public.has_role(_profile_id,'admin') OR public.has_role(_profile_id,'secretaria')) THEN RAISE EXCEPTION 'invalid_responsible'; END IF;
 INSERT INTO cordial_site_responsibles(profile_id,display_name,display_role,whatsapp,photo_url,active,reviewed_by)
 VALUES(_profile_id,btrim(_name),btrim(_role),_whatsapp,nullif(btrim(_photo),''),_active,auth.uid())
 ON CONFLICT(profile_id) DO UPDATE SET display_name=excluded.display_name,display_role=excluded.display_role,whatsapp=excluded.whatsapp,photo_url=excluded.photo_url,active=excluded.active,reviewed_by=excluded.reviewed_by,updated_at=now();
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_save_responsible(uuid,text,text,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cordial_site_save_responsible(uuid,text,text,text,text,boolean) TO authenticated;
CREATE FUNCTION public.cordial_site_public_responsible(_property_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((
  SELECT jsonb_build_object('kind','person','name',r.display_name,'role',r.display_role,'whatsapp',r.whatsapp,'photoUrl',r.photo_url)
  FROM public.properties p JOIN cordial_site_responsibles r ON r.profile_id=p.corretor_id
  JOIN auth.users u ON u.id=r.profile_id
  WHERE p.id=_property_id AND r.active AND r.reviewed_by IS NOT NULL
  AND (public.has_role(r.profile_id,'corretor') OR public.has_role(r.profile_id,'admin') OR public.has_role(r.profile_id,'secretaria'))
  AND (nullif(to_jsonb(u)->>'banned_until','') IS NULL OR (to_jsonb(u)->>'banned_until')::timestamptz<now())
 ),(
  SELECT jsonb_build_object('kind','team','name','Equipe Cordial','role','Atendimento Cordial','whatsapp',content->>'whatsapp','photoUrl',NULL)
  FROM cordial_site_settings WHERE id AND content->>'whatsapp' ~ '^[0-9]{10,15}$'
 ))
$$;
REVOKE ALL ON FUNCTION public.cordial_site_public_responsible(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_public_responsible(uuid) TO service_role;

CREATE FUNCTION public.cordial_site_decode_public_text(_text text) RETURNS text
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
CREATE FUNCTION public.cordial_site_normalize_public_text(_text text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT lower(regexp_replace(btrim(translate(translate(translate(regexp_replace(public.cordial_site_decode_public_text(_text),'<[^>]*>',' ','g'),
  'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
  'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'),
  U&'\0300\0301\0302\0303\0308\030A\0327',''),U&'\00A0\2002\2003\2009\202F\3000','      ')),'[[:space:]]+',' ','g'))
$$;
CREATE FUNCTION public.cordial_site_has_hidden_address(p public.properties,_text text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT btrim(coalesce(p.logradouro,'')) NOT IN ('','0')
  AND (public.cordial_site_normalize_public_text(_text) IS NULL
   OR public.cordial_site_normalize_public_text(p.logradouro) IS NULL
   OR strpos(public.cordial_site_normalize_public_text(_text),public.cordial_site_normalize_public_text(p.logradouro))>0
   OR strpos(replace(public.cordial_site_normalize_public_text(_text),' ',''),replace(public.cordial_site_normalize_public_text(p.logradouro),' ',''))>0)
$$;
CREATE FUNCTION public.cordial_site_public_features(p public.properties) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(array_agg(feature ORDER BY ordinal),'{}'::text[])
 FROM unnest(p.caracteristicas) WITH ORDINALITY AS f(feature,ordinal)
 WHERE NOT public.cordial_site_has_hidden_address(p,feature)
$$;
REVOKE ALL ON FUNCTION public.cordial_site_decode_public_text(text),public.cordial_site_normalize_public_text(text),public.cordial_site_has_hidden_address(public.properties,text),public.cordial_site_public_features(public.properties) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_decode_public_text(text),public.cordial_site_normalize_public_text(text),public.cordial_site_has_hidden_address(public.properties,text),public.cordial_site_public_features(public.properties) TO service_role;

CREATE OR REPLACE VIEW public.cordial_site_eligible WITH(security_invoker=true) AS
SELECT p.id AS property_id, s.public_id, s.public_reference, s.published_at,
  p.operacao,p.tipo, NULLIF(NULLIF(btrim(p.cidade),''),'0') AS cidade,
  NULLIF(NULLIF(btrim(p.bairro),''),'0') AS bairro,p.uf,
  NULL::text AS endereco,
  CASE WHEN p.valor_modo='fixo' AND p.valor>=0 THEN p.valor ELSE NULL END AS valor,p.valor_modo,
  p.dormitorios,p.banheiros,p.suites,p.vagas,
  CASE WHEN s.area_units_confirmed THEN p.area_util ELSE NULL END AS area_util,
  CASE WHEN s.area_units_confirmed THEN p.area_total ELSE NULL END AS area_total,
  CASE WHEN s.area_units_confirmed THEN p.area_construida ELSE NULL END AS area_construida,
  CASE WHEN s.area_units_confirmed THEN p.area_terreno ELSE NULL END AS area_terreno,
  CASE WHEN lower(p.mobiliado::text) IN ('true','sim') THEN true WHEN lower(p.mobiliado::text) IN ('false','nao','não') THEN false ELSE NULL END AS mobiliado,
  p.permuta,p.aceita_financiamento,p.estagio_empreendimento,p.destaque_inicial,
  CASE WHEN public.cordial_site_has_hidden_address(p,p.descricao_imovel) THEN '' ELSE p.descricao_imovel END AS descricao_imovel,
  CASE WHEN public.cordial_site_has_hidden_address(p,p.pontos_fortes) THEN NULL ELSE p.pontos_fortes END AS pontos_fortes,
  public.cordial_site_public_features(p) AS caracteristicas
FROM public.properties p JOIN public.cordial_site_publications s ON s.property_id=p.id
WHERE s.state='published' AND s.cordial_authorized IS TRUE AND s.availability_confirmed IS TRUE
 AND s.published_at IS NOT NULL AND s.reviewed_content_hash=public.cordial_site_content_hash(p)
 AND p.is_draft IS FALSE AND p.exibir_imovel IS TRUE AND p.archived_at IS NULL AND p.removal_state IS NULL
 AND p.autorizacao IS DISTINCT FROM false
 AND (p.disponibilidade IS NULL OR lower(btrim(p.disponibilidade)) IN ('sim','disponivel','disponível'))
 AND p.operacao IN ('venda','aluguel');

DO $migration$ DECLARE ns text; BEGIN
 FOREACH ns IN ARRAY ARRAY['cordial_site','morar_site'] LOOP
 IF to_regclass('public.'||ns||'_eligible') IS NULL THEN CONTINUE; END IF;
 EXECUTE format($template$CREATE OR REPLACE FUNCTION public.%1$s_filtered(f jsonb DEFAULT '{}') RETURNS SETOF public.%1$s_eligible LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $fn$
WITH filtered AS MATERIALIZED (
 SELECT d.*, CASE f->>'areaTipo' WHEN 'util' THEN d.area_util WHEN 'total' THEN d.area_total WHEN 'terreno' THEN d.area_terreno ELSE d.area_construida END AS selected_area
 FROM public.%1$s_eligible d
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
   EXISTS(SELECT 1 FROM public.%1$s_authorized_media m WHERE m.public_id=d.public_id)=(f->>'fotos'='sim') END
 AND (f->>'destaque' IS NULL OR (d.destaque_inicial IS TRUE)=(f->>'destaque'='sim'))
 AND (f->>'estagio' IS NULL OR d.estagio_empreendimento=f->>'estagio')
), area_filtered AS MATERIALIZED (
 SELECT * FROM filtered WHERE (f->>'areaMin' IS NULL OR selected_area >= (f->>'areaMin')::numeric)
 AND (f->>'areaMax' IS NULL OR selected_area <= (f->>'areaMax')::numeric)
) SELECT property_id,public_id,public_reference,published_at,operacao,tipo,cidade,bairro,uf,endereco,valor,valor_modo,dormitorios,banheiros,suites,vagas,area_util,area_total,area_construida,area_terreno,mobiliado,permuta,aceita_financiamento,estagio_empreendimento,destaque_inicial,descricao_imovel,pontos_fortes,caracteristicas FROM area_filtered
$fn$;$template$,ns);
 EXECUTE format($template$CREATE OR REPLACE FUNCTION public.%1$s_search(f jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $fn$
WITH area_filtered AS MATERIALIZED (SELECT d.*,CASE f->>'areaTipo' WHEN 'util' THEN d.area_util WHEN 'total' THEN d.area_total WHEN 'terreno' THEN d.area_terreno ELSE d.area_construida END selected_area FROM public.%1$s_filtered(f) d), paged AS MATERIALIZED (
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
 FROM paged p JOIN public.%1$s_documents d ON d.public_id=p.public_id
)
SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(document ORDER BY result_order) FROM page_documents),'[]'::jsonb),'total',(SELECT count(*) FROM area_filtered),'page',greatest(1,least(10000,coalesce((f->>'pagina')::int,1))),'pageSize',12)
$fn$;$template$,ns);
 EXECUTE format($template$CREATE OR REPLACE FUNCTION public.%1$s_filtered_facets(f jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $fn$ WITH selected AS MATERIALIZED(SELECT * FROM public.%1$s_filtered(f))
 SELECT jsonb_build_object('total',(SELECT count(*) FROM selected),
 'types',coalesce((SELECT jsonb_agg(jsonb_build_object('value',tipo,'count',n) ORDER BY tipo) FROM (SELECT tipo,count(*) n FROM selected WHERE tipo IS NOT NULL GROUP BY tipo) t),'[]'),
 'cities',coalesce((SELECT jsonb_agg(jsonb_build_object('value',cidade,'count',n) ORDER BY cidade) FROM (SELECT cidade,count(*) n FROM selected WHERE cidade IS NOT NULL GROUP BY cidade) t),'[]'),
 'districts',coalesce((SELECT jsonb_agg(jsonb_build_object('value',bairro,'city',cidade,'count',n) ORDER BY n DESC,bairro,cidade) FROM (SELECT bairro,cidade,count(*) n FROM selected WHERE bairro IS NOT NULL AND cidade IS NOT NULL GROUP BY bairro,cidade) t),'[]'),
 'stages',coalesce((SELECT jsonb_agg(estagio_empreendimento ORDER BY estagio_empreendimento) FROM (SELECT DISTINCT estagio_empreendimento FROM selected WHERE estagio_empreendimento IS NOT NULL) t),'[]'))
$fn$;
$template$,ns);
 EXECUTE format($template$CREATE OR REPLACE FUNCTION public.%1$s_count(f jsonb DEFAULT '{}') RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $fn$ SELECT count(*) FROM public.%1$s_filtered(f) $fn$;$template$,ns);
 EXECUTE format('REVOKE ALL ON FUNCTION public.%1$s_filtered(jsonb),public.%1$s_count(jsonb),public.%1$s_filtered_facets(jsonb) FROM PUBLIC,anon,authenticated',ns);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.%1$s_filtered(jsonb),public.%1$s_count(jsonb),public.%1$s_filtered_facets(jsonb) TO service_role',ns);
 END LOOP; END $migration$;

CREATE OR REPLACE VIEW public.cordial_site_documents WITH(security_invoker=true) AS
SELECT e.*, media.photo_count,
  jsonb_build_object('id',e.public_id,'reference',e.public_reference,'operation',e.operacao,'type',e.tipo,
  'city',e.cidade,'district',e.bairro,'state',e.uf,'address',e.endereco,
  'price',e.valor,'priceMode',e.valor_modo,'bedrooms',e.dormitorios,'bathrooms',e.banheiros,'suites',e.suites,'parking',e.vagas,
  'areas',jsonb_build_object('util',e.area_util,'total',e.area_total,'construida',e.area_construida,'terreno',e.area_terreno),
  'furnished',e.mobiliado,'exchange',e.permuta,'financing',e.aceita_financiamento,'stage',e.estagio_empreendimento,
  'featured',e.destaque_inicial IS TRUE,'publishedAt',e.published_at,'description',coalesce(e.descricao_imovel,''),
  'features',coalesce(to_jsonb(e.caracteristicas),'[]'::jsonb),'cover',media.cover,'photoCount',media.photo_count,'responsible',public.cordial_site_public_responsible(e.property_id)) AS document
FROM public.cordial_site_eligible e CROSS JOIN LATERAL (
  SELECT count(*) AS photo_count,
  (jsonb_agg(jsonb_build_object('id',m.id,'version',m.version,'width',m.width,'height',m.height,'position',m.position) ORDER BY m.position,m.id)->0) AS cover
  FROM public.cordial_site_authorized_media m WHERE m.public_id=e.public_id
) media;

CREATE TABLE public.public_site_derivatives (
 key text PRIMARY KEY CHECK(key ~ '^(cordial|morar)/[a-f0-9-]{36}/[a-f0-9]{32}/(480-jpeg-q80|960-jpeg-q80|1920-jpeg-q88)-purejs-v2[.]jpg$'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','failed')),
 checksum text CHECK(checksum IS NULL OR checksum ~ '^[a-f0-9]{64}$'),
 lease uuid,
 lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.public_site_derivatives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_site_derivatives FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.public_site_derivatives TO service_role;
CREATE FUNCTION public.public_site_claim_derivative(_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public_site_derivatives; token uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public_site_derivatives(key) VALUES(_key) ON CONFLICT(key) DO NOTHING;
 SELECT * INTO current_row FROM public_site_derivatives WHERE key=_key FOR UPDATE;
 IF current_row.state='ready' OR (current_row.state='pending' AND current_row.lease_until>now()) THEN RETURN NULL; END IF;
 UPDATE public_site_derivatives SET state='pending',lease=token,lease_until=now()+interval '90 seconds',updated_at=now() WHERE key=_key;
 RETURN token;
END $$;
CREATE FUNCTION public.public_site_finish_derivative(_key text,_lease uuid,_checksum text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public_site_derivatives SET state='ready',checksum=_checksum,lease_until=NULL,updated_at=now()
 WHERE key=_key AND lease=_lease AND state='pending' AND lease_until>now();
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.public_site_claim_derivative(text),public.public_site_finish_derivative(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.public_site_claim_derivative(text),public.public_site_finish_derivative(text,uuid,text) TO service_role;
DO $$ BEGIN
 IF to_regclass('storage.buckets') IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='public-site-derivatives') THEN RAISE EXCEPTION 'derivative_bucket_missing'; END IF;
   IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='public-site-derivatives' AND public) THEN RAISE EXCEPTION 'derivative_bucket_must_be_private'; END IF;
 END IF;
END $$;
DO $jobs$ DECLARE ns text; definitions text[]:='{}'; BEGIN
 FOREACH ns IN ARRAY ARRAY['cordial_site','morar_site'] LOOP
  IF to_regclass('public.'||ns||'_authorized_media') IS NULL THEN CONTINUE; END IF;
  definitions:=array_append(definitions,format($sql$
   SELECT %1$L::text AS brand,m.id,m.version,s.size,
     CASE WHEN m.position=0 AND e.destaque_inicial IS TRUE AND s.size='full' THEN 0
          WHEN m.position=0 AND s.size='card' THEN 1 WHEN m.position=0 AND s.size='thumb' THEN 2
          WHEN m.position=0 THEN 3 ELSE 10+m.position END AS priority
   FROM public.%2$I m JOIN public.%3$I e ON e.public_id=m.public_id
   CROSS JOIN (VALUES('thumb','480-jpeg-q80'),('card','960-jpeg-q80'),('full','1920-jpeg-q88')) s(size,spec)
   LEFT JOIN public.public_site_derivatives d ON d.key=%1$L||'/'||m.id||'/'||m.version||'/'||s.spec||'-purejs-v2.jpg'
   WHERE d.key IS NULL OR d.state='failed' OR (d.state='pending' AND coalesce(d.lease_until,'-infinity')<now())
  $sql$,replace(ns,'_site',''),ns||'_authorized_media',ns||'_eligible'));
 END LOOP;
 EXECUTE 'CREATE VIEW public.public_site_derivative_candidates WITH(security_invoker=true) AS '||array_to_string(definitions,' UNION ALL ');
END $jobs$;
REVOKE ALL ON public.public_site_derivative_candidates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.public_site_derivative_candidates TO service_role;
CREATE TABLE public.public_site_media_worker_health(id boolean PRIMARY KEY DEFAULT true CHECK(id),last_dispatched_at timestamptz,last_request_id bigint,last_config_error text);
ALTER TABLE public.public_site_media_worker_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_site_media_worker_health FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.public_site_media_worker_health TO service_role;
CREATE OR REPLACE FUNCTION public.cordial_site_save_content(_kind text,_key text,_content jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ids jsonb; existing_ids jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _kind='settings' THEN
  ids:=coalesce(_content->'featuredPropertyIds','[]'::jsonb);
  IF jsonb_typeof(ids)<>'array' OR jsonb_array_length(ids)>9 THEN RAISE EXCEPTION 'invalid_featured_selection'; END IF;
  SELECT coalesce(content->'featuredPropertyIds','[]'::jsonb) INTO existing_ids FROM cordial_site_settings WHERE id=true FOR UPDATE;
  IF (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements_text(ids)) THEN RAISE EXCEPTION 'duplicate_featured_selection'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(ids) item(value) WHERE NOT existing_ids @> jsonb_build_array(value) AND NOT EXISTS(SELECT 1 FROM cordial_site_eligible e WHERE e.public_id::text=item.value)) THEN RAISE EXCEPTION 'invalid_featured_property'; END IF;
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