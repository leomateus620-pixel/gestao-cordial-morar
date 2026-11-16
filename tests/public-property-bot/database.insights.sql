-- SYNTHETIC operational events only. Requires0098. Wrap in BEGIN ... ROLLBACK via Lovable.
-- Never changes any real user/profile/role, commercial property, or production credential.
-- Admin authorization uses an existing admin id only inside connection-local JWT settings.
-- Restrictive-profile tests temporarily replace guards inside SAVEPOINTs, then roll them back.
INSERT INTO public_bot.gateway_credentials(key_hash,label,expires_at) VALUES(sha256(convert_to('synthetic-insights-test-256-bits-never-production-0000000098','UTF8')),'synthetic-insights-gateway',now()+interval '1 hour');
DO $$ BEGIN PERFORM set_config('request.headers','{"x-public-bot-key":"synthetic-insights-test-256-bits-never-production-0000000098"}',true); END $$;
CREATE TEMP TABLE insight_test_baseline AS SELECT b.brand,coalesce(d.opens,0) AS opens,coalesce(d.sessions,0) AS sessions,coalesce(d.conversations,0) AS conversations,coalesce(d.messages,0) AS messages,coalesce(d.whatsapp,0) AS whatsapp FROM (VALUES('cordial'),('morar')) b(brand) LEFT JOIN public_bot.insight_daily d ON d.brand=b.brand AND d.local_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
CREATE TEMP TABLE insight_test_catalog AS SELECT public_id FROM public_bot.search_documents WHERE brand='cordial' ORDER BY public_id LIMIT 1;
GRANT SELECT ON insight_test_catalog TO anon;
SET LOCAL ROLE anon;
DO $$ DECLARE r jsonb; d jsonb; doc uuid; day text:=((now() AT TIME ZONE 'America/Sao_Paulo')::date)::text;
 token text:=repeat('a',64); ip text:=repeat('9',64); req uuid:='eeeeeeee-eeee-4eee-8eee-000000000001'; req2 uuid:='eeeeeeee-eeee-4eee-8eee-000000000002';
BEGIN
 r:=public.public_bot_gateway('open_session',jsonb_build_object('b','cordial','token_hash',token,'ip_key',ip));
 IF r->'draft'->>'revision'<>'0' THEN RAISE EXCEPTION 'synthetic session collision'; END IF;
 d:=r->'draft';
 IF public.public_bot_gateway('insight_open',jsonb_build_object('b','cordial','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000010')) IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'opening rejected'; END IF;
 IF public.public_bot_gateway('insight_open',jsonb_build_object('b','cordial','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000010')) IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'opening retry rejected'; END IF;
 PERFORM public.public_bot_gateway('insight_open',jsonb_build_object('b','cordial','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000011'));
 IF public.public_bot_gateway('insight_open',jsonb_build_object('b','morar','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000012')) IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'opening crossed brand'; END IF;
 IF public.public_bot_gateway('insight_turn',jsonb_build_object('b','cordial','token_hash',token,'request_id',req,'question','Não deve existir')) IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'unaccepted question persisted'; END IF;
 r:=public.public_bot_gateway('accept_turn',jsonb_build_object('b','cordial','token_hash',token,'ip_key',ip,'local_day',day,'request_id',req,'expected_revision',0,'fingerprint',repeat('b',64)));
 IF r->>'state' IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'legacy accept regressed'; END IF;
 r:=public.public_bot_gateway('accept_turn',jsonb_build_object('b','cordial','token_hash',token,'ip_key',ip,'local_day',day,'request_id',req,'expected_revision',0,'fingerprint',repeat('b',64)));
 IF r->>'state' IS DISTINCT FROM 'busy' THEN RAISE EXCEPTION 'accept retry duplicated'; END IF;
 IF public.public_bot_gateway('insight_turn',jsonb_build_object('b','cordial','token_hash',token,'request_id',req,'question','Meu nome é SENTINEL_PERSON, quero casa. Meu CPF 123.456.789-09, email person@example.com, telefone (55) 99999-1234. <script>PRIVATE_SCRIPT</script> Até 650 mil.')) IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'question capture rejected'; END IF;
 PERFORM public.public_bot_gateway('insight_turn',jsonb_build_object('b','cordial','token_hash',token,'request_id',req,'question','RETRY_MUST_NOT_OVERWRITE'));
 SELECT public_id INTO doc FROM insight_test_catalog;
 IF doc IS NULL THEN RAISE EXCEPTION 'approved public catalog required for card validation'; END IF;
 d:=jsonb_set(jsonb_set(d,'{revision}','1'),'{filters,budget}','{"min":null,"max":{"value":650000,"inclusive":true}}');
 IF public.public_bot_gateway('complete_turn',jsonb_build_object('b','cordial','token_hash',token,'request_id',req,'result',jsonb_build_object('requestId',req,'draft',d,'cards',jsonb_build_array(jsonb_build_object('id',doc)),'answer','Resultado sintético. Contato person@example.com removido.','question',NULL,'exhausted',false,'unavailable',false))) IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'legacy completion regressed'; END IF;
 r:=public.public_bot_gateway('accept_turn',jsonb_build_object('b','cordial','token_hash',token,'ip_key',ip,'local_day',day,'request_id',req,'expected_revision',0,'fingerprint',repeat('b',64)));
 IF r->>'state' IS DISTINCT FROM 'replay' THEN RAISE EXCEPTION 'legacy replay regressed'; END IF;
 r:=public.public_bot_gateway('accept_turn',jsonb_build_object('b','cordial','token_hash',token,'ip_key',ip,'local_day',day,'request_id',req2,'expected_revision',1,'fingerprint',repeat('c',64)));
 IF r->>'state' IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'second turn rejected'; END IF;
 PERFORM public.public_bot_gateway('insight_turn',jsonb_build_object('b','cordial','token_hash',token,'request_id',req2,'question','Pode ser até700mil.'));
 d:=jsonb_set(jsonb_set(d,'{revision}','2'),'{filters,budget,max,value}','700000');
 IF public.public_bot_gateway('complete_turn',jsonb_build_object('b','cordial','token_hash',token,'request_id',req2,'result',jsonb_build_object('requestId',req2,'draft',d,'cards','[]'::jsonb,'answer','Tudo bem! Você procura um imóvel para comprar ou alugar?','question',NULL,'exhausted',false,'unavailable',false))) IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'refinement completion rejected'; END IF;
 IF public.public_bot_gateway('insight_whatsapp',jsonb_build_object('b','cordial','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000020','public_id',NULL,'source','header')) IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'central whatsapp rejected'; END IF;
 PERFORM public.public_bot_gateway('insight_whatsapp',jsonb_build_object('b','cordial','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000020','public_id',NULL,'source','header'));
 IF public.public_bot_gateway('insight_whatsapp',jsonb_build_object('b','cordial','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000021','public_id',doc,'source','card')) IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'verified returned card rejected'; END IF;
 IF public.public_bot_gateway('insight_whatsapp',jsonb_build_object('b','cordial','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000022','public_id','eeeeeeee-eeee-4eee-8eee-ffffffffffff','source','card')) IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'unseen property accepted'; END IF;
 IF public.public_bot_gateway('insight_whatsapp',jsonb_build_object('b','cordial','token_hash',token,'event_id','eeeeeeee-eeee-4eee-8eee-000000000023','public_id',NULL,'source','card')) IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'card without id accepted'; END IF;
 BEGIN PERFORM public.public_bot_gateway('insight_open',jsonb_build_object('b','cordial','token_hash',token,'event_id',gen_random_uuid(),'tenant','morar')); RAISE EXCEPTION 'extra authority accepted'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
 BEGIN PERFORM public.public_bot_gateway('public_bot_insights','{"days":7}'); RAISE EXCEPTION 'gateway reached admin'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
 BEGIN PERFORM public.public_bot_insights(7); RAISE EXCEPTION 'anonymous admin read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ DECLARE c public_bot.insight_conversations; ev public_bot.insight_evolution; base record; actual record;
BEGIN
 SELECT x.* INTO c FROM public_bot.insight_conversations x JOIN public_bot.sessions s ON s.id=x.session_id WHERE s.token_hash=repeat('a',64) AND s.brand='cordial';
 IF c.messages<>2 OR c.whatsapp<>2 OR c.initial_filters->'budget'->'max'->>'value'<>'650000' OR c.latest_filters->'budget'->'max'->>'value'<>'700000' THEN RAISE EXCEPTION 'incorrect session counts or refinement'; END IF;
 IF c.id=c.session_id THEN RAISE EXCEPTION 'analytics ID reused session identity'; END IF;
 SELECT * INTO ev FROM public_bot.insight_evolution WHERE conversation_id=c.id AND event_id='eeeeeeee-eeee-4eee-8eee-000000000001';
 IF ev.question ~ 'SENTINEL_PERSON|123.456|person@example|99999|PRIVATE_SCRIPT|RETRY_MUST' OR ev.answer LIKE '%person@example%' OR ev.state<>'completed' OR ev.outcome<>'results' THEN RAISE EXCEPTION 'question minimization/idempotency failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public_bot.insight_evolution WHERE conversation_id=c.id AND event_id='eeeeeeee-eeee-4eee-8eee-000000000002' AND outcome='answer') THEN RAISE EXCEPTION 'greeting classified as no results'; END IF;
 SELECT * INTO base FROM insight_test_baseline WHERE brand='cordial'; SELECT * INTO actual FROM public_bot.insight_daily WHERE brand='cordial' AND local_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date;
 IF actual.opens-base.opens<>2 OR actual.sessions-base.sessions<>1 OR actual.conversations-base.conversations<>1 OR actual.messages-base.messages<>2 OR actual.whatsapp-base.whatsapp<>2 THEN RAISE EXCEPTION 'aggregate retry double counted'; END IF;
 IF EXISTS(SELECT 1 FROM public_bot.insight_conversations WHERE brand='morar' AND session_id=c.session_id) THEN RAISE EXCEPTION 'brand analytics leak'; END IF;
 IF public_bot.insight_filters('cordial','{"city":"SENTINEL_PRIVATE_LOCATION"}') ? 'city' THEN RAISE EXCEPTION 'unknown free text entered filter summary'; END IF;
END $$;
-- Pending/interrupted transitions are verified in a savepoint without altering the main fixture totals.
SAVEPOINT interrupted_turn;
DO $$ DECLARE r jsonb; sid uuid; cid uuid; BEGIN
 r:=public_bot.accept_turn('cordial',repeat('a',64),repeat('9',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,'eeeeeeee-eeee-4eee-8eee-000000000003',2,repeat('d',64));
 IF r->>'state' IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'pending fixture was not accepted'; END IF;
 SELECT s.id,c.id INTO sid,cid FROM public_bot.sessions s JOIN public_bot.insight_conversations c ON c.session_id=s.id WHERE s.token_hash=repeat('a',64) AND s.brand='cordial';
 IF NOT EXISTS(SELECT 1 FROM public_bot.insight_evolution WHERE conversation_id=cid AND event_id='eeeeeeee-eeee-4eee-8eee-000000000003' AND state='pending') THEN RAISE EXCEPTION 'accepted turn missing pending timeline'; END IF;
 UPDATE public_bot.sessions SET lease_until=now()-interval '1 second' WHERE id=sid;
 PERFORM public_bot.cleanup();
 IF NOT EXISTS(SELECT 1 FROM public_bot.insight_evolution WHERE conversation_id=cid AND event_id='eeeeeeee-eeee-4eee-8eee-000000000003' AND state='interrupted') THEN RAISE EXCEPTION 'expired turn missing interrupted timeline'; END IF;
END $$;
ROLLBACK TO SAVEPOINT interrupted_turn;
-- Admin identity is read only. No user, role, profile or auth row is changed.
DO $$ DECLARE aid uuid; BEGIN
 SELECT user_id INTO aid FROM public.user_roles WHERE role='admin' AND public.has_role(user_id,'admin') LIMIT 1;
 IF aid IS NULL THEN RAISE EXCEPTION 'admin fixture unavailable: cannot test authenticated admin reads'; END IF;
 PERFORM set_config('request.jwt.claim.sub',aid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',aid,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; item jsonb; BEGIN
 r:=public.public_bot_insights(7);
 IF jsonb_array_length(r->'brands')<>2 OR r->'period'->>'timezone'<>'America/Sao_Paulo' OR r->>'trackingSince' IS NULL OR jsonb_array_length(r->'brands'->0->'daily')<>7 THEN RAISE EXCEPTION 'dashboard shape wrong'; END IF;
 r:=public.public_bot_conversations('cordial',30,1,25);
 SELECT value INTO item FROM jsonb_array_elements(r->'items') WHERE value->'latestFilters'->'budget'->'max'->>'value'='700000' AND value->>'messages'='2' ORDER BY value->>'lastActivityAt' DESC LIMIT 1;
 IF item IS NULL THEN RAISE EXCEPTION 'admin could not find synthetic conversation'; END IF;
 r:=public.public_bot_conversation('cordial',(item->>'id')::uuid);
 IF jsonb_array_length(r->'evolution')<>4 OR r->>'evolutionTotal'<>'4' OR r->>'evolutionTruncated'<>'false' OR r::text ~ 'token_hash|session_id|fingerprint|SENTINEL_PERSON|person@example' THEN RAISE EXCEPTION 'admin detail wrong or leaked authentication identifiers'; END IF;
 IF public.public_bot_conversation('morar',(item->>'id')::uuid) IS NOT NULL THEN RAISE EXCEPTION 'detail ID crossed brand'; END IF;
 BEGIN PERFORM public.public_bot_insights(365); RAISE EXCEPTION 'invalid period accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.public_bot_conversations('cordial',7,1,26); RAISE EXCEPTION 'unbounded page accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SAVEPOINT non_admin_identity;
DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-ffffffffffff',true); PERFORM set_config('request.jwt.claims','{"sub":"eeeeeeee-eeee-4eee-8eee-ffffffffffff","role":"authenticated"}',true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM public.public_bot_insights(7); RAISE EXCEPTION 'non-admin authenticated read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT non_admin_identity;
-- Deny-dominant guard combination, without changing real account memberships.
SAVEPOINT restricted_meta_guard;
CREATE OR REPLACE FUNCTION public.is_meta_reviewer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT true $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM public.public_bot_insights(7); RAISE EXCEPTION 'meta reviewer + admin bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT restricted_meta_guard;
SAVEPOINT restricted_attendance_guard;
CREATE OR REPLACE FUNCTION public.is_atendimentos_viewer() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT true $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN BEGIN PERFORM public.public_bot_conversations('cordial',7,1,25); RAISE EXCEPTION 'attendance viewer + admin bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT restricted_attendance_guard;
-- Expiration is 30 days after last activity; aggregate window is 90 local calendar days.
INSERT INTO public_bot.insight_conversations(id,session_id,brand,started_at,last_activity_at) VALUES
 ('eeeeeeee-eeee-4eee-8eee-000000000030','eeeeeeee-eeee-4eee-8eee-000000000130','cordial',now()-interval '35 days',now()-interval '31 days'),
 ('eeeeeeee-eeee-4eee-8eee-000000000031','eeeeeeee-eeee-4eee-8eee-000000000131','cordial',now()-interval '31 days',now()-interval '25 days');
INSERT INTO public_bot.insight_evolution(conversation_id,event_id,kind,state) SELECT 'eeeeeeee-eeee-4eee-8eee-000000000031',('ffffffff-ffff-4fff-8fff-'||lpad(n::text,12,'0'))::uuid,'turn','completed' FROM generate_series(1,501) n;
INSERT INTO public_bot.insight_events(session_id,kind,event_id,created_at) VALUES('eeeeeeee-eeee-4eee-8eee-000000000130','open',gen_random_uuid(),now()-interval '31 days');
-- Existing aggregate history is copied only inside this rollback transaction if that day exists.
INSERT INTO public_bot.insight_daily(brand,local_day,opens) VALUES('cordial',(now() AT TIME ZONE 'America/Sao_Paulo')::date-91,1) ON CONFLICT DO NOTHING;
SELECT public_bot.cleanup();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public_bot.insight_conversations WHERE id='eeeeeeee-eeee-4eee-8eee-000000000030') OR EXISTS(SELECT 1 FROM public_bot.insight_events WHERE session_id='eeeeeeee-eeee-4eee-8eee-000000000130') OR EXISTS(SELECT 1 FROM public_bot.insight_daily WHERE local_day<(now() AT TIME ZONE 'America/Sao_Paulo')::date-89) THEN RAISE EXCEPTION 'retention failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public_bot.insight_conversations WHERE id='eeeeeeee-eeee-4eee-8eee-000000000031') THEN RAISE EXCEPTION 'recent activity discarded because session started earlier'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
 r:=public.public_bot_conversation('cordial','eeeeeeee-eeee-4eee-8eee-000000000031');
 IF r->>'evolutionTotal'<>'501' OR r->>'evolutionTruncated'<>'true' OR jsonb_array_length(r->'evolution')<>500 THEN RAISE EXCEPTION 'timeline truncation hidden or missing'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE public_bot_runtime;
DO $$ BEGIN
 BEGIN PERFORM 1 FROM public_bot.insight_conversations; RAISE EXCEPTION 'runtime read internal analytics'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.public_bot_insights(7); RAISE EXCEPTION 'runtime executed admin RPC'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_schema_privilege('public_bot_runtime','public','USAGE') OR pg_has_role('public_bot_runtime','public_bot_insights_reader','MEMBER') OR has_table_privilege('public_bot_insights_reader','public.properties','SELECT') OR has_table_privilege('authenticated','public_bot.insight_conversations','SELECT') OR has_function_privilege('anon','public.public_bot_insights(integer)','EXECUTE') THEN RAISE EXCEPTION 'analytics privilege boundary widened'; END IF;
END $$;
SELECT jsonb_build_object('open_idempotency','passed','legacy_chat','passed','turn_idempotency','passed','turn_states','passed','question_minimization','passed','refinement','passed','whatsapp_idempotency','passed','card_validation','passed','brand_isolation','passed','admin_reads','passed','restricted_roles','passed_with_isolated_guard_stubs','retention','passed','timeline_limit','passed','runtime_boundary','passed','transaction','ROLLBACK required') AS insights_integration;
