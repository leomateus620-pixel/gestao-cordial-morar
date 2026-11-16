-- SYNTHETIC, rollback-only integration test. Execute through the Lovable connector.
-- The caller MUST wrap this file in BEGIN ... ROLLBACK; it does not touch commercial tables.
-- Requires migration 0096 (or concatenate 0096 inside the same rollback rehearsal).
GRANT public_bot_runtime TO postgres;
CREATE TABLE public_bot.synthetic_suggestion_source(brand text,public_id uuid,document jsonb,live boolean NOT NULL DEFAULT true,owner text DEFAULT 'SENTINEL_PRIVATE_OWNER');
GRANT SELECT ON public_bot.synthetic_suggestion_source TO public_bot_owner;
CREATE OR REPLACE FUNCTION public_bot.source(b text,ids uuid[] DEFAULT NULL) RETURNS TABLE(public_id uuid,document jsonb,cover jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public_bot AS $$ SELECT s.public_id,s.document,NULL::jsonb FROM public_bot.synthetic_suggestion_source s WHERE s.brand=b AND s.live AND (ids IS NULL OR s.public_id=ANY(ids)) $$;
-- Isolate only the derived bot index and aggregates; ROLLBACK restores all existing rows.
DELETE FROM public_bot.search_documents;
DELETE FROM public_bot.suggestion_sets;
DELETE FROM public_bot.suggestion_contributions;
DELETE FROM public_bot.suggestion_stats;
UPDATE public_bot.configuration_data SET trends=false;
INSERT INTO public_bot.synthetic_suggestion_source(brand,public_id,document,live)
SELECT 'cordial',('dddddddd-dddd-4ddd-8ddd-'||lpad(n::text,12,'0'))::uuid,
 jsonb_build_object('id',('dddddddd-dddd-4ddd-8ddd-'||lpad(n::text,12,'0'))::uuid,'reference','SYNTHETIC-SUGGESTION-'||n,'operation',CASE WHEN n=44 THEN 'aluguel' ELSE 'venda' END,'type',CASE WHEN n<40 THEN 'Lote sintético' WHEN n IN (40,41) THEN 'Apartamento sintético' ELSE 'Casa sintética' END,'city','Cidade sintética','district',CASE WHEN n%2=0 THEN 'Centro sintético' ELSE 'Jardim sintético' END,'price',CASE WHEN n=44 THEN 1500 ELSE 200000+n*10000 END,'priceMode','fixo','bedrooms',2,'bathrooms',2,'suites',NULL,'parking',NULL,'areas',jsonb_build_object('util',NULL,'total',NULL,'construida',100,'terreno',NULL),'furnished',NULL,'financing',NULL,'exchange',NULL,'stage',NULL,'description',CASE WHEN n=42 THEN 'Casa com piscina privativa e churrasqueira no condomínio.' ELSE 'Imóvel sintético para o teste.' END,'features','[]'::jsonb),n>=31
FROM generate_series(1,44) n;
INSERT INTO public_bot.synthetic_suggestion_source(brand,public_id,document)
VALUES('morar','dddddddd-dddd-4ddd-8ddd-000000000100','{"id":"dddddddd-dddd-4ddd-8ddd-000000000100","reference":"SYNTHETIC-MORAR","operation":"venda","type":"Chácara sintética Morar","city":"Cidade Morar sintética","district":"Bairro Morar sintético","price":300000,"priceMode":"fixo","bedrooms":3,"bathrooms":2,"suites":null,"parking":null,"areas":{"util":null,"total":null,"construida":100,"terreno":null},"furnished":null,"financing":null,"exchange":null,"stage":null,"description":"Imóvel sintético exclusivo da Morar.","features":[]}');
INSERT INTO public_bot.search_documents(brand,public_id,source_version,document,cover,operation,city,district,type,price,search_text)
SELECT brand,public_id,md5(document::text),document,NULL,document->>'operation',public_bot.norm(document->>'city'),public_bot.norm(document->>'district'),public_bot.norm(document->>'type'),(document->>'price')::numeric,to_tsvector('portuguese',document::text) FROM public_bot.synthetic_suggestion_source;
INSERT INTO public_bot.search_features(brand,public_id,name,scope,state,evidence,source_version)
SELECT d.brand,d.public_id,n,s,public_bot.feature(d.document,n,s)->>'state',public_bot.feature(d.document,n,s)->>'evidence',d.source_version
FROM public_bot.search_documents d CROSS JOIN unnest(ARRAY['piscina','churrasqueira','sala','cozinha']) n CROSS JOIN unnest(ARRAY['private','condominium']) s;
SET LOCAL ROLE public_bot_runtime;
DO $$ DECLARE r jsonb; r2 jsonb; item jsonb; BEGIN
 r:=public_bot.candidates('cordial','{"type":"Lote sintético"}');
 IF jsonb_array_length(r)<>9 OR r->0->'property'->>'reference'<>'SYNTHETIC-SUGGESTION-31' THEN RAISE EXCEPTION '30 stale rows hid valid later results'; END IF;
 r:=public_bot.suggestion_set('cordial'); r2:=public_bot.suggestion_set('cordial');
 IF r IS DISTINCT FROM r2 OR jsonb_array_length(r->'suggestions')<>4 THEN RAISE EXCEPTION 'suggestions changed during the same window'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(r->'suggestions') LOOP
  IF jsonb_array_length(public_bot.candidates('cordial',item->'patch'))=0 THEN RAISE EXCEPTION 'unsearchable suggestion served'; END IF;
  IF item->>'label' LIKE '%SENTINEL_%' OR item->>'label' LIKE '%Morar%' THEN RAISE EXCEPTION 'suggestion privacy/brand leak'; END IF;
  IF item->>'label' ~ '[0-9],[0-9]{3}' THEN RAISE EXCEPTION 'BRL grouping uses comma'; END IF;
 END LOOP;
 r:=public_bot.suggestion_set('morar');
 IF r::text LIKE '%Cidade sintética%' OR r::text LIKE '%Casa sintética%' THEN RAISE EXCEPTION 'Morar received Cordial criteria'; END IF;
END $$;
RESET ROLE;
-- No consent still leaves the complete catalog-based search usable and records nothing.
DO $$ DECLARE sess jsonb; item jsonb; ev jsonb; BEGIN
 sess:=public_bot.open_session('cordial',repeat('8',64),repeat('9',64));
 item:=public_bot.suggestion_set('cordial')->'suggestions'->0;
 ev:=jsonb_build_object('eventId','cccccccc-cccc-4ccc-8ccc-000000000001','kind','search','category',split_part(item->>'id',':',1),'suggestionId',item->>'id','consent',false);
 IF public_bot.event('cordial',repeat('8',64),ev) THEN RAISE EXCEPTION 'nonconsented contribution accepted'; END IF;
 IF EXISTS(SELECT 1 FROM public_bot.suggestion_stats) OR EXISTS(SELECT 1 FROM public_bot.suggestion_contributions) THEN RAISE EXCEPTION 'nonconsented event persisted'; END IF;
 IF jsonb_array_length(public_bot.suggestion_set('cordial')->'suggestions')=0 THEN RAISE EXCEPTION 'consent denial disabled suggestions'; END IF;
END $$;
-- Threshold, aggregation and deduplication use normalized IDs only, never free text.
UPDATE public_bot.configuration_data SET trends=true WHERE brand='cordial';
DO $$
DECLARE base jsonb; after_four jsonb; after_five jsonb; base_type text; target jsonb; token text; event_id uuid; ev jsonb; i integer; actual integer;
BEGIN
 base:=public_bot.suggestion_set('cordial');
 SELECT v->>'id' INTO base_type FROM jsonb_array_elements(base->'suggestions') v WHERE v->>'id' LIKE 'type:%' LIMIT 1;
 SELECT v INTO target FROM public_bot.suggestion_sets sets CROSS JOIN LATERAL jsonb_array_elements(sets.suggestions) v WHERE sets.brand='cordial' AND sets.hour=date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND v->>'id' LIKE 'type:%' AND v->>'id'<>base_type AND jsonb_array_length(public_bot.candidates('cordial',v->'patch'))>0 LIMIT 1;
 IF target IS NULL THEN RAISE EXCEPTION 'synthetic fixture needs a second valid type'; END IF;
 FOR i IN 1..4 LOOP
  token:=repeat(i::text,64); event_id:=('cccccccc-cccc-4ccc-8ccc-'||lpad(i::text,12,'0'))::uuid;
  PERFORM public_bot.open_session('cordial',token,token);
  ev:=jsonb_build_object('eventId',event_id,'kind','search','category','type','suggestionId',target->>'id','consent',true);
  IF NOT public_bot.event('cordial',token,ev) THEN RAISE EXCEPTION 'consented normalized contribution rejected'; END IF;
  IF NOT public_bot.event('cordial',token,ev) THEN RAISE EXCEPTION 'idempotent normalized event retry rejected'; END IF;
  -- A new event UUID does not let the same person dominate the same suggestion/hour/kind.
  ev:=jsonb_set(ev,'{eventId}',to_jsonb(gen_random_uuid()));
  PERFORM public_bot.event('cordial',token,ev);
 END LOOP;
 SELECT sum(searches) INTO actual FROM public_bot.suggestion_stats WHERE brand='cordial' AND suggestion_id=target->>'id';
 IF actual<>4 OR (SELECT count(DISTINCT session_id) FROM public_bot.suggestion_contributions WHERE suggestion_id=target->>'id')<>4 THEN RAISE EXCEPTION 'events not deduplicated'; END IF;
 DELETE FROM public_bot.suggestion_sets WHERE brand='cordial';
 after_four:=public_bot.suggestion_set('cordial');
 IF (SELECT v->>'id' FROM jsonb_array_elements(after_four->'suggestions') v WHERE v->>'id' LIKE 'type:%' LIMIT 1) IS DISTINCT FROM base_type THEN RAISE EXCEPTION 'trend promoted below five distinct sessions'; END IF;
 token:=repeat('5',64); PERFORM public_bot.open_session('cordial',token,token);
 ev:=jsonb_build_object('eventId',gen_random_uuid(),'kind','search','category','type','suggestionId',target->>'id','consent',true);
 IF NOT public_bot.event('cordial',token,ev) THEN RAISE EXCEPTION 'fifth contribution rejected'; END IF;
 DELETE FROM public_bot.suggestion_sets WHERE brand='cordial';
 after_five:=public_bot.suggestion_set('cordial');
 IF (SELECT v->>'id' FROM jsonb_array_elements(after_five->'suggestions') v WHERE v->>'id' LIKE 'type:%' LIMIT 1) IS DISTINCT FROM target->>'id' THEN RAISE EXCEPTION 'five-session trend did not promote the compatible type'; END IF;
 IF public_bot.event('morar',token,ev) THEN RAISE EXCEPTION 'session event crossed brand'; END IF;
 IF public_bot.event('cordial',token,ev||'{"text":"SENTINEL_PRIVATE_TEXT"}'::jsonb) THEN RAISE EXCEPTION 'free text event accepted'; END IF;
END $$;
-- A different SQL timezone must not rotate or duplicate the current hourly composition.
CREATE TEMP TABLE public_bot_hour_evidence AS SELECT public_bot.suggestion_set('cordial') AS value;
SET LOCAL TIME ZONE 'Asia/Kolkata';
DO $$ BEGIN IF public_bot.suggestion_set('cordial') IS DISTINCT FROM (SELECT value FROM public_bot_hour_evidence) THEN RAISE EXCEPTION 'SQL timezone changed the hour key'; END IF; END $$;
SET LOCAL TIME ZONE 'UTC';
-- An old-hour cached set is not reused. Criteria with zero current matches are filtered on every read.
UPDATE public_bot.suggestion_sets SET hour=hour-interval '2 hours';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public_bot.suggestion_set('cordial')->'suggestions')) THEN RAISE EXCEPTION 'hourly rotation lost valid catalog'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public_bot.suggestion_sets WHERE brand='cordial' AND hour=date_trunc('hour',now())) THEN RAISE EXCEPTION 'hourly set was not rebuilt'; END IF;
END $$;
UPDATE public_bot.synthetic_suggestion_source SET live=false WHERE brand='cordial';
DO $$ BEGIN
 IF public_bot.suggestion_set('cordial')->'suggestions'<>'[]'::jsonb THEN RAISE EXCEPTION 'withdrawn catalog survived suggestion cache'; END IF;
 IF jsonb_array_length(public_bot.suggestion_set('morar')->'suggestions')=0 THEN RAISE EXCEPTION 'Cordial withdrawal affected Morar'; END IF;
END $$;
DELETE FROM public_bot.search_documents WHERE brand='cordial';
DO $$ BEGIN IF public_bot.suggestion_set('cordial')->'suggestions'<>'[]'::jsonb THEN RAISE EXCEPTION 'empty catalog invented suggestions'; END IF; END $$;
-- Report durable-test results; the caller rolls back all fixture rows and function replacements.
SELECT jsonb_build_object('stale_first_30','passed','hourly_stability','passed','hourly_rebuild','passed','timezone_independence','passed','consent_denied','passed','deduplication','passed','five_session_threshold','passed','withdrawal_revalidation','passed','empty_catalog','passed','brand_isolation','passed','currency_pt_br','passed','transaction','ROLLBACK required') AS suggestions_integration;
