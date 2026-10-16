-- A reviewed edit replaces an unfinished occurrence at its new due time.
-- Completed occurrences remain unique per routine and Brasília day. A running
-- lease is never stolen; its stale revision cannot commit a notification.
CREATE OR REPLACE FUNCTION public.assistant_routine_claim(p_limit integer DEFAULT 20)
RETURNS SETOF public.assistant_routine_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.assistant_routine_runs(routine_id,user_id,local_day,scheduled_at,routine_revision)
 SELECT id,user_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,next_run_at,revision
 FROM public.assistant_routines
 WHERE status='active' AND next_run_at<=now()
   AND (now() AT TIME ZONE 'America/Sao_Paulo')::time>=make_time(hour,minute,0)
   AND (days='every_day'
     OR (days='weekdays' AND EXTRACT(ISODOW FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5)
     OR (days='weekly' AND EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')=COALESCE(day_of_week,1)))
 ON CONFLICT(routine_id,local_day) DO UPDATE SET
   routine_revision=EXCLUDED.routine_revision,scheduled_at=EXCLUDED.scheduled_at,
   status='pending',attempts=0,next_attempt_at=now(),lease_id=NULL,lease_until=NULL,
   finished_at=NULL,scope_key=NULL,result_refs='[]'::jsonb
 WHERE assistant_routine_runs.routine_revision<>EXCLUDED.routine_revision
   AND assistant_routine_runs.status<>'completed'
   AND (assistant_routine_runs.status<>'running' OR assistant_routine_runs.lease_until<now());
 RETURN QUERY
 WITH selected AS (
   SELECT run.id FROM public.assistant_routine_runs run
   JOIN public.assistant_routines r ON r.id=run.routine_id
   WHERE r.status='active' AND r.revision=run.routine_revision
     AND run.local_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND run.attempts<3
     AND ((run.status IN('pending','failed') AND run.next_attempt_at<=now())
       OR (run.status='running' AND run.lease_until<now()))
   ORDER BY run.scheduled_at FOR UPDATE OF run SKIP LOCKED
   LIMIT LEAST(GREATEST(p_limit,1),20)
 )
 UPDATE public.assistant_routine_runs run
 SET status='running',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes'
 FROM selected WHERE run.id=selected.id RETURNING run.*;
END $$;
REVOKE ALL ON FUNCTION public.assistant_routine_claim(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_routine_claim(integer) TO service_role;
-- Serialize completion with pause/edit so a paused routine cannot commit a new notification.
CREATE OR REPLACE FUNCTION public.assistant_routine_finish(p_run uuid,p_lease uuid,p_scope text,p_refs jsonb,p_next timestamptz,p_seen jsonb DEFAULT '[]'::jsonb,p_cursor uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row public.assistant_routine_runs; routine_status text; routine_revision integer;
BEGIN
 SELECT * INTO row FROM public.assistant_routine_runs WHERE id=p_run AND lease_id=p_lease AND status='running' AND lease_until>now() FOR UPDATE;
 IF row.id IS NULL THEN RETURN false; END IF;
 SELECT status,revision INTO routine_status,routine_revision FROM public.assistant_routines WHERE id=row.routine_id FOR UPDATE;
 IF NOT FOUND OR routine_status<>'active' OR routine_revision<>row.routine_revision THEN RETURN false; END IF;
 INSERT INTO public.notifications(user_id,tipo,category,titulo,mensagem,link,lida,dedup_key,entity_type,entity_id)
 VALUES(row.user_id,'assistant_routine','system','Seu resumo do Gestão está disponível','Abra o Assistente para consultar as informações permitidas agora.','/assistente?routine='||row.routine_id::text||'&run='||row.id::text,false,'assistant:run:'||row.id::text,'assistant_run',row.id)
 ON CONFLICT(dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
 INSERT INTO public.assistant_match_seen(user_id,client_id,property_id,scope_key) SELECT row.user_id,(item->>'client_id')::uuid,(item->>'property_id')::uuid,p_scope FROM jsonb_array_elements(p_seen) item ON CONFLICT DO NOTHING;
 UPDATE public.assistant_routine_runs SET status='completed',scope_key=p_scope,result_refs=p_refs,finished_at=now(),lease_id=NULL,lease_until=NULL WHERE id=p_run;
 UPDATE public.assistant_routines SET next_run_at=p_next,client_cursor=p_cursor,updated_at=now() WHERE id=row.routine_id;
 RETURN true;
END $$;
NOTIFY pgrst,'reload schema';
