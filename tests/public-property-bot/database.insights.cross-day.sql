-- SYNTHETIC cross-day metadata only. Execute via Lovable inside BEGIN ... ROLLBACK.
-- No server clock, commercial row, real account, existing session, or publication is changed.
-- Represents a session first observed yesterday, then returned today. This is not an actual
-- wall-clock midnight rollover test: previous-day analytics rows are explicit synthetic fixtures.
DO $$ DECLARE aid uuid; BEGIN
 SELECT user_id INTO aid FROM public.user_roles WHERE role='admin' AND public.has_role(user_id,'admin') LIMIT 1;
 IF aid IS NULL THEN RAISE EXCEPTION 'authorized admin identity unavailable'; END IF;
 PERFORM set_config('request.jwt.claim.sub',aid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',aid,'role','authenticated')::text,true);
END $$;
CREATE TEMP TABLE insight_cross_day_baseline AS SELECT public.public_bot_insights(1) AS today,public.public_bot_insights(7) AS week;
DO $$ DECLARE opened jsonb; sid uuid; cid uuid; r jsonb; d date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; yesterday timestamptz; BEFORE_ROW jsonb; AFTER_ROW jsonb;
BEGIN
 yesterday:=((d-1)::timestamp+interval '12 hours') AT TIME ZONE 'America/Sao_Paulo';
 opened:=public_bot.open_session('cordial',repeat('d',64),repeat('e',64)); sid:=(opened->>'id')::uuid;
 IF opened->'draft'->>'revision'<>'0' THEN RAISE EXCEPTION 'synthetic session collision'; END IF;
 INSERT INTO public_bot.insight_conversations(session_id,brand,started_at,last_activity_at,first_turn_at,messages) VALUES(sid,'cordial',yesterday,yesterday,yesterday,1) RETURNING id INTO cid;
 INSERT INTO public_bot.insight_events(session_id,kind,event_id,created_at) VALUES(sid,'turn','eeeeeeee-eeee-4eee-8eee-000000000201',yesterday);
 INSERT INTO public_bot.insight_evolution(conversation_id,event_id,kind,at,state,question,answer,revision,filters,result_count,outcome) VALUES(cid,'eeeeeeee-eeee-4eee-8eee-000000000201','turn',yesterday,'completed','Pergunta sintética do dia anterior','Resposta sintética do dia anterior',1,'{}',0,'answer');
 INSERT INTO public_bot.insight_daily(brand,local_day,opens,sessions,conversations,messages) VALUES('cordial',d-1,1,1,1,1) ON CONFLICT(brand,local_day) DO UPDATE SET opens=insight_daily.opens+1,sessions=insight_daily.sessions+1,conversations=insight_daily.conversations+1,messages=insight_daily.messages+1;
 IF NOT public_bot.insight_open('cordial',repeat('d',64),'eeeeeeee-eeee-4eee-8eee-000000000202') THEN RAISE EXCEPTION 'return opening rejected'; END IF;
 PERFORM public_bot.insight_open('cordial',repeat('d',64),'eeeeeeee-eeee-4eee-8eee-000000000202');
 r:=public_bot.accept_turn('cordial',repeat('d',64),repeat('e',64),d,'eeeeeeee-eeee-4eee-8eee-000000000203',0,repeat('f',64));
 IF r->>'state' IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'return turn rejected'; END IF;
 SELECT v INTO BEFORE_ROW FROM insight_cross_day_baseline b CROSS JOIN LATERAL jsonb_array_elements(b.today->'brands') v WHERE v->>'brand'='cordial';
 SELECT v INTO AFTER_ROW FROM jsonb_array_elements(public.public_bot_insights(1)->'brands') v WHERE v->>'brand'='cordial';
 IF (AFTER_ROW->>'opens')::bigint-(BEFORE_ROW->>'opens')::bigint<>1 OR (AFTER_ROW->>'messages')::bigint-(BEFORE_ROW->>'messages')::bigint<>1 OR AFTER_ROW->>'sessions' IS DISTINCT FROM BEFORE_ROW->>'sessions' OR AFTER_ROW->>'conversations' IS DISTINCT FROM BEFORE_ROW->>'conversations' THEN RAISE EXCEPTION 'same returning session counted as new today'; END IF;
 SELECT v INTO BEFORE_ROW FROM insight_cross_day_baseline b CROSS JOIN LATERAL jsonb_array_elements(b.week->'brands') v WHERE v->>'brand'='cordial';
 SELECT v INTO AFTER_ROW FROM jsonb_array_elements(public.public_bot_insights(7)->'brands') v WHERE v->>'brand'='cordial';
 IF (AFTER_ROW->>'opens')::bigint-(BEFORE_ROW->>'opens')::bigint<>2 OR (AFTER_ROW->>'messages')::bigint-(BEFORE_ROW->>'messages')::bigint<>2 OR (AFTER_ROW->>'sessions')::bigint-(BEFORE_ROW->>'sessions')::bigint<>1 OR (AFTER_ROW->>'conversations')::bigint-(BEFORE_ROW->>'conversations')::bigint<>1 THEN RAISE EXCEPTION 'weekly totals duplicated returning session'; END IF;
 IF public.public_bot_conversation('cordial',cid)->>'messages'<>'2' THEN RAISE EXCEPTION 'conversation continuity was reset across day'; END IF;
 -- A future aggregate fixture must not leak into today or the bounded past window.
 INSERT INTO public_bot.insight_daily(brand,local_day,opens) VALUES('cordial',d+1,98765) ON CONFLICT(brand,local_day) DO UPDATE SET opens=insight_daily.opens+98765;
 IF (SELECT v FROM jsonb_array_elements(public.public_bot_insights(7)->'brands') v WHERE v->>'brand'='cordial') IS DISTINCT FROM AFTER_ROW THEN RAISE EXCEPTION 'future day leaked into period'; END IF;
END $$;
CREATE TEMP TABLE insight_cross_day_timezone AS SELECT public.public_bot_insights(30)-'trackingSince' AS value;
SET LOCAL TIME ZONE 'Pacific/Honolulu';
DO $$ DECLARE r jsonb; BEGIN
 r:=public.public_bot_insights(30)-'trackingSince';
 IF r IS DISTINCT FROM (SELECT value FROM insight_cross_day_timezone) THEN RAISE EXCEPTION 'connection timezone changed reporting days'; END IF;
 IF r->'period'->>'to' IS DISTINCT FROM ((now() AT TIME ZONE 'America/Sao_Paulo')::date)::text OR r->'period'->>'from' IS DISTINCT FROM ((now() AT TIME ZONE 'America/Sao_Paulo')::date-29)::text THEN RAISE EXCEPTION 'reporting window not based on São Paulo'; END IF;
END $$;
SELECT jsonb_build_object('return_same_session','passed','new_day_open_and_message','passed','weekly_distinct_session_start','passed','conversation_continuity','passed','future_day_exclusion','passed','sql_timezone_independence','passed','fixtures','synthetic_previous_day_metadata','transaction','ROLLBACK required') AS insights_cross_day;
