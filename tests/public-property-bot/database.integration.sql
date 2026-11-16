-- SYNTHETIC FIXTURES. Run ONLY through Lovable, in BEGIN ... ROLLBACK.
-- This script never writes properties/publications or calls a network provider.
DO $$ BEGIN
 IF has_schema_privilege('public_bot_runtime','public','USAGE') OR has_table_privilege('public_bot_runtime','public.properties','SELECT') OR has_table_privilege('public_bot_runtime','public.clients','SELECT') OR has_function_privilege('public_bot_runtime','public_bot.source(text,uuid[])','EXECUTE') THEN RAISE EXCEPTION 'runtime privilege leak'; END IF;
 IF has_function_privilege('authenticated','public_bot.open_session(text,text,text)','EXECUTE') OR has_function_privilege('anon','public_bot.open_session(text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'anonymous execution leak'; END IF;
 IF EXISTS(SELECT 1 FROM public_bot.search_documents WHERE document ?| ARRAY['address','responsible','property_id','owner','cpf','commission','internal_note']) THEN RAISE EXCEPTION 'projection leak'; END IF;
END $$;
GRANT public_bot_runtime TO postgres;
SET LOCAL ROLE public_bot_runtime;
-- Exercise the real projection after ownership, RLS and grants, not only the backfill as postgres.
SELECT jsonb_array_length(public_bot.candidates('cordial','{}')) AS real_cordial_count,
 jsonb_array_length(public_bot.candidates('morar','{}')) AS real_morar_count,
 jsonb_array_length(public_bot.suggestion_set('cordial')->'suggestions') AS real_suggestions;
RESET ROLE;
CREATE TABLE public_bot.synthetic_test_source(brand text,public_id uuid,document jsonb,cover jsonb,live boolean DEFAULT true,owner text DEFAULT 'SENTINEL_OWNER',cpf text DEFAULT 'SENTINEL_CPF',commission text DEFAULT 'SENTINEL_COMMISSION',internal_note text DEFAULT 'SENTINEL_PRIVATE');
GRANT SELECT ON public_bot.synthetic_test_source TO public_bot_owner;
CREATE OR REPLACE FUNCTION public_bot.source(b text,ids uuid[] DEFAULT NULL) RETURNS TABLE(public_id uuid,document jsonb,cover jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public_bot AS $$ SELECT s.public_id,s.document,s.cover FROM public_bot.synthetic_test_source s WHERE s.brand=b AND s.live AND (ids IS NULL OR s.public_id=ANY(ids)) $$;
INSERT INTO public_bot.synthetic_test_source(brand,public_id,document)
SELECT 'cordial',('eeeeeeee-eeee-4eee-8eee-'||lpad(n::text,12,'0'))::uuid,jsonb_build_object('id',('eeeeeeee-eeee-4eee-8eee-'||lpad(n::text,12,'0'))::uuid,'reference','SYNTHETIC-'||n,'operation','venda','type','Casa sintética','city','Cidade sintética','district','Centro sintético','price',CASE WHEN n=18 THEN 650000 ELSE 900000 END,'priceMode','fixo','bedrooms',2,'bathrooms',2,'suites',1,'parking',NULL,'areas',jsonb_build_object('util',NULL,'total',NULL,'construida',100,'terreno',NULL),'furnished',NULL,'financing',NULL,'exchange',NULL,'stage',NULL,'description','Casa com piscina privativa','features','[]'::jsonb) FROM generate_series(1,20) n;
INSERT INTO public_bot.synthetic_test_source SELECT 'morar',public_id,document,cover,true,owner,cpf,commission,internal_note FROM public_bot.synthetic_test_source WHERE document->>'reference'='SYNTHETIC-1';
INSERT INTO public_bot.search_documents(brand,public_id,source_version,document,cover,operation,city,district,type,price,search_text)
SELECT brand,public_id,md5(document::text),document,cover,document->>'operation',public_bot.norm(document->>'city'),public_bot.norm(document->>'district'),public_bot.norm(document->>'type'),(document->>'price')::numeric,to_tsvector('portuguese',document::text) FROM public_bot.synthetic_test_source;
SET LOCAL ROLE public_bot_runtime;
DO $$ DECLARE r jsonb; f jsonb:='{"type":"Casa sintética","budget":{"min":null,"max":{"value":650000,"inclusive":true}},"bedrooms":{"op":"eq","value":2},"bathrooms":{"op":"gte","value":2}}'; BEGIN
 r:=public_bot.candidates('cordial',f);
 IF jsonb_array_length(r)<>1 OR r->0->'property'->>'reference'<>'SYNTHETIC-18' THEN RAISE EXCEPTION 'full catalog/exact count search failed: %',r; END IF;
 IF jsonb_array_length(public_bot.candidates('morar',f))<>0 THEN RAISE EXCEPTION 'brand leak'; END IF;
 IF r::text LIKE '%SENTINEL_%' THEN RAISE EXCEPTION 'private sentinel leak'; END IF;
 IF public_bot.read_session('cordial',repeat('f',64)) IS NOT NULL THEN RAISE EXCEPTION 'unknown session leak'; END IF;
END $$;
RESET ROLE;
UPDATE public_bot.synthetic_test_source SET document=jsonb_set(document,'{price}','700000') WHERE document->>'reference'='SYNTHETIC-18';
SET LOCAL ROLE public_bot_runtime;
DO $$ BEGIN IF public_bot.resolve('cordial',ARRAY['eeeeeeee-eeee-4eee-8eee-000000000018'::uuid])<>'[]'::jsonb THEN RAISE EXCEPTION 'stale source version served'; END IF; END $$;
RESET ROLE;
UPDATE public_bot.synthetic_test_source SET live=false WHERE document->>'reference'='SYNTHETIC-1';
SET LOCAL ROLE public_bot_runtime;
DO $$ BEGIN IF public_bot.resolve('cordial',ARRAY['eeeeeeee-eeee-4eee-8eee-000000000001'::uuid])<>'[]'::jsonb THEN RAISE EXCEPTION 'withdrawn source served'; END IF; END $$;
SELECT public_bot.open_session('cordial',repeat('a',64),repeat('1',64))->>'id' IS NOT NULL AS session_opened;
SELECT public_bot.open_session('morar',repeat('b',64),repeat('1',64))->>'id' IS NOT NULL AS second_brand_opened;
RESET ROLE;
INSERT INTO public_bot.daily_quotas(ip_key,local_day,accepted) VALUES(repeat('1',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,24);
SET LOCAL ROLE public_bot_runtime;
DO $$ DECLARE r jsonb; d jsonb; result jsonb; req uuid:='ffffffff-ffff-4fff-8fff-000000000001'; BEGIN
 r:=public_bot.accept_turn('cordial',repeat('a',64),repeat('1',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,req,0,repeat('e',64));
 IF r->>'state'<>'accepted' OR r->>'exhausted'<>'true' THEN RAISE EXCEPTION '25th turn was not accepted'; END IF;
 IF NOT public_bot.reserve_cost('cordial',repeat('a',64),req) OR public_bot.reserve_cost('cordial',repeat('a',64),req) THEN RAISE EXCEPTION 'paid execution not idempotent'; END IF;
 IF public_bot.accept_turn('morar',repeat('b',64),repeat('1',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,'ffffffff-ffff-4fff-8fff-000000000002',0,repeat('e',64))->>'state'<>'exhausted' THEN RAISE EXCEPTION 'cross brand quota bypass'; END IF;
 d:=jsonb_set(r->'draft','{revision}','1');
 result:=jsonb_build_object('requestId',req,'draft',d,'answer','Resposta sintética 25 preservada','cards','[]'::jsonb,'question',NULL,'exhausted',true,'unavailable',false);
 IF NOT public_bot.complete_turn('cordial',repeat('a',64),req,result) THEN RAISE EXCEPTION '25th result not durable'; END IF;
 r:=public_bot.accept_turn('cordial',repeat('a',64),repeat('1',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,req,0,repeat('e',64));
 IF r->>'state'<>'replay' OR r->'result'->>'answer'<>'Resposta sintética 25 preservada' THEN RAISE EXCEPTION 'replay failed'; END IF;
 IF public_bot.read_session('morar',repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'session crossed brand'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT accepted FROM public_bot.daily_quotas WHERE ip_key=repeat('1',64))<>25 THEN RAISE EXCEPTION 'replay double debit'; END IF; END $$;
SET LOCAL ROLE public_bot_runtime;
SELECT public_bot.open_session('cordial',repeat('c',64),repeat('2',64))->>'id' IS NOT NULL AS voice_session_opened;
DO $$ DECLARE req uuid:='ffffffff-ffff-4fff-8fff-000000000003'; r jsonb; BEGIN
 r:=public_bot.take_voice('cordial',repeat('c',64),repeat('2',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,req,1000,60);
 IF r->>'state'<>'accepted' THEN RAISE EXCEPTION 'voice reservation failed: %',r; END IF;
 IF public_bot.take_voice('cordial',repeat('c',64),repeat('2',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,req,1000,60)->>'state'<>'busy' THEN RAISE EXCEPTION 'voice duplicate cost'; END IF;
 IF NOT public_bot.finish_voice('cordial',repeat('c',64),req,true) THEN RAISE EXCEPTION 'voice finish failed'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT accepted FROM public_bot.daily_quotas WHERE ip_key=repeat('2',64))<>0 OR (SELECT voices FROM public_bot.daily_quotas WHERE ip_key=repeat('2',64))<>1 THEN RAISE EXCEPTION 'voice debits chat'; END IF; END $$;
SELECT jsonb_build_object('scope','passed','private_sentinels','passed','publication_version','passed','full_catalog','passed','count_operators','passed','25th_26th','passed','cross_brand_quota','passed','idempotency','passed','voice_quota','passed','transaction','ROLLBACK required') AS integration;
-- Exercise retention without changing any commercial records; rollback also restores existing expired rows.
UPDATE public_bot.sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=repeat('a',64) AND brand='cordial';
INSERT INTO public_bot.daily_quotas(ip_key,local_day) VALUES(repeat('4',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date-3);
INSERT INTO public_bot.usage_data(brand,request_id,model,latency,input_tokens,output_tokens,code,created_at)
 VALUES('cordial','ffffffff-ffff-4fff-8fff-000000000009','synthetic',0,0,0,'synthetic',now()-interval '31 days');
SELECT public_bot.cleanup();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public_bot.sessions WHERE token_hash=repeat('a',64) AND brand='cordial') THEN RAISE EXCEPTION 'expired session retained'; END IF;
 IF EXISTS(SELECT 1 FROM public_bot.daily_quotas WHERE ip_key=repeat('4',64)) THEN RAISE EXCEPTION 'expired quota retained'; END IF;
 IF EXISTS(SELECT 1 FROM public_bot.usage_data WHERE request_id='ffffffff-ffff-4fff-8fff-000000000009') THEN RAISE EXCEPTION 'expired usage retained'; END IF;
END $$;
SELECT 'integration and retention passed; synthetic fixtures rolled back' AS verified;
