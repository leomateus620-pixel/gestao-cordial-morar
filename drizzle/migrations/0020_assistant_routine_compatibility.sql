-- Preserve the already published phase-3 direct metadata writes. A generation
-- stamp prevents an overlapping disable/re-enable from reviving old work.
ALTER TABLE public.assistant_bot_configs ADD COLUMN activation_generation integer NOT NULL DEFAULT 1 CHECK(activation_generation>0);
ALTER TABLE public.assistant_routines ADD COLUMN bot_generation integer NOT NULL DEFAULT 1 CHECK(bot_generation>0);
ALTER TABLE public.assistant_routine_runs ADD COLUMN bot_generation integer NOT NULL DEFAULT 1 CHECK(bot_generation>0);
UPDATE public.assistant_routines r SET bot_generation=b.activation_generation FROM public.assistant_bot_configs b WHERE b.bot_id=public.assistant_routine_bot(r.template);
UPDATE public.assistant_routine_runs run SET bot_generation=r.bot_generation FROM public.assistant_routines r WHERE r.id=run.routine_id;
CREATE FUNCTION public.assistant_bot_activation_generation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.enabled IS DISTINCT FROM OLD.enabled THEN NEW.activation_generation:=OLD.activation_generation+1; ELSE NEW.activation_generation:=OLD.activation_generation; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assistant_bot_activation_generation BEFORE UPDATE ON public.assistant_bot_configs FOR EACH ROW EXECUTE FUNCTION public.assistant_bot_activation_generation();
CREATE FUNCTION public.assistant_routine_generation_stamp() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE generation integer;
BEGIN
 -- No FOR SHARE here: old clients already hold the routine row on UPDATE.
 -- Reading a prior committed generation is safe; the worker requires the
 -- current generation and never locks this configuration after that row.
 IF auth.uid()=NEW.user_id AND nullif(auth.jwt()->>'client_id','') IS NULL AND nullif(auth.jwt()->>'azp','') IS NULL THEN
  SELECT activation_generation INTO generation FROM public.assistant_bot_configs WHERE bot_id=public.assistant_routine_bot(NEW.template) AND enabled;
  IF generation IS NOT NULL THEN NEW.bot_generation:=generation;
  ELSIF NEW.status<>'paused' THEN RAISE EXCEPTION 'bot_disabled';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assistant_routine_generation_stamp BEFORE INSERT OR UPDATE ON public.assistant_routines FOR EACH ROW EXECUTE FUNCTION public.assistant_routine_generation_stamp();
CREATE FUNCTION public.assistant_routine_direct_allowed(_template text,_status text,_generation integer) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL
  AND nullif(auth.jwt()->>'client_id','') IS NULL AND nullif(auth.jwt()->>'azp','') IS NULL
  AND split_part(public.assistant_current_scope(),':',1) IN('admin','secretaria','corretor')
  AND(public.assistant_routine_bot(_template) NOT IN('time','mercado') OR split_part(public.assistant_current_scope(),':',1)='admin')
  AND(public.assistant_routine_bot(_template)<>'caixa' OR split_part(public.assistant_current_scope(),':',1) IN('admin','secretaria'))
  AND(_status='paused' OR EXISTS(SELECT 1 FROM public.assistant_bot_configs b WHERE b.bot_id=public.assistant_routine_bot(_template) AND b.enabled AND b.activation_generation=_generation))
$$;
REVOKE ALL ON FUNCTION public.assistant_routine_direct_allowed(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_routine_direct_allowed(text,text,integer) TO authenticated,service_role;
GRANT INSERT,UPDATE ON public.assistant_routines TO authenticated;
CREATE POLICY assistant_routines_insert_compat ON public.assistant_routines FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND status<>'paused' AND public.assistant_routine_direct_allowed(template,status,bot_generation));
CREATE POLICY assistant_routines_update_compat ON public.assistant_routines FOR UPDATE TO authenticated USING(user_id=auth.uid() AND nullif(auth.jwt()->>'client_id','') IS NULL AND nullif(auth.jwt()->>'azp','') IS NULL) WITH CHECK(user_id=auth.uid() AND public.assistant_routine_direct_allowed(template,status,bot_generation));
CREATE OR REPLACE FUNCTION public.assistant_routine_claim(p_limit integer DEFAULT 20) RETURNS SETOF public.assistant_routine_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.assistant_bot_configs ORDER BY bot_id FOR SHARE;
 -- A generation lost to a configuration race becomes visibly paused. Only an
 -- explicit personal save/resume can stamp a current generation again.
 UPDATE public.assistant_routines r SET status='paused',updated_at=now() FROM public.assistant_bot_configs b WHERE b.bot_id=public.assistant_routine_bot(r.template) AND r.status='active' AND (NOT b.enabled OR r.bot_generation<>b.activation_generation);
 INSERT INTO public.assistant_routine_runs(routine_id,user_id,local_day,scheduled_at,routine_revision,bot_generation)
 SELECT r.id,r.user_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,r.next_run_at,r.revision,r.bot_generation FROM public.assistant_routines r JOIN public.assistant_bot_configs b ON b.bot_id=public.assistant_routine_bot(r.template) AND b.enabled AND b.activation_generation=r.bot_generation
 WHERE r.status='active' AND r.next_run_at<=now() AND(now() AT TIME ZONE 'America/Sao_Paulo')::time>=make_time(r.hour,r.minute,0)
 AND(r.days='every_day' OR(r.days='weekdays' AND EXTRACT(ISODOW FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5) OR(r.days='weekly' AND EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')=coalesce(r.day_of_week,1)))
 ON CONFLICT(routine_id,local_day) DO UPDATE SET routine_revision=EXCLUDED.routine_revision,bot_generation=EXCLUDED.bot_generation,scheduled_at=EXCLUDED.scheduled_at,status='pending',attempts=0,next_attempt_at=now(),lease_id=NULL,lease_until=NULL,finished_at=NULL,scope_key=NULL,result_refs='[]'::jsonb
 WHERE (assistant_routine_runs.routine_revision<>EXCLUDED.routine_revision OR assistant_routine_runs.bot_generation<>EXCLUDED.bot_generation) AND assistant_routine_runs.status<>'completed' AND(assistant_routine_runs.status<>'running' OR assistant_routine_runs.lease_until<now());
 RETURN QUERY WITH selected AS(SELECT run.id FROM public.assistant_routine_runs run JOIN public.assistant_routines r ON r.id=run.routine_id JOIN public.assistant_bot_configs b ON b.bot_id=public.assistant_routine_bot(r.template) AND b.enabled AND b.activation_generation=r.bot_generation AND run.bot_generation=r.bot_generation WHERE r.status='active' AND r.revision=run.routine_revision AND run.local_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND run.attempts<3 AND((run.status IN('pending','failed') AND run.next_attempt_at<=now()) OR(run.status='running' AND run.lease_until<now())) ORDER BY run.scheduled_at FOR UPDATE OF run SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),20)) UPDATE public.assistant_routine_runs run SET status='running',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes' FROM selected WHERE run.id=selected.id RETURNING run.*;
END $$;
CREATE OR REPLACE FUNCTION public.assistant_routine_finish(p_run uuid,p_lease uuid,p_scope text,p_refs jsonb,p_next timestamptz,p_seen jsonb DEFAULT '[]'::jsonb,p_cursor uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row public.assistant_routine_runs; routine_status text; routine_revision integer; routine_generation integer; current_generation integer; bot text;
BEGIN
 SELECT public.assistant_routine_bot(r.template) INTO bot FROM public.assistant_routines r JOIN public.assistant_routine_runs run ON run.routine_id=r.id WHERE run.id=p_run;
 IF bot IS NULL THEN RETURN false; END IF;
 PERFORM public.assistant_configuration_lock(bot);
 SELECT activation_generation INTO current_generation FROM public.assistant_bot_configs WHERE bot_id=bot;
 SELECT * INTO row FROM public.assistant_routine_runs WHERE id=p_run AND lease_id=p_lease AND status='running' AND lease_until>now() FOR UPDATE;
 IF row.id IS NULL THEN RETURN false; END IF;
 SELECT status,revision,bot_generation INTO routine_status,routine_revision,routine_generation FROM public.assistant_routines WHERE id=row.routine_id FOR UPDATE;
 IF NOT FOUND OR routine_status<>'active' OR routine_revision<>row.routine_revision OR routine_generation<>current_generation OR row.bot_generation<>current_generation THEN RETURN false; END IF;
 INSERT INTO public.notifications(user_id,tipo,category,titulo,mensagem,link,lida,dedup_key,entity_type,entity_id)
 VALUES(row.user_id,'assistant_routine','system','Seu resumo do Gestão está disponível','Abra o Assistente para consultar as informações permitidas agora.','/assistente?routine='||row.routine_id::text||'&run='||row.id::text,false,'assistant:run:'||row.id::text,'assistant_run',row.id) ON CONFLICT(dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
 INSERT INTO public.assistant_match_seen(user_id,client_id,property_id,scope_key) SELECT row.user_id,(item->>'client_id')::uuid,(item->>'property_id')::uuid,p_scope FROM jsonb_array_elements(p_seen) item ON CONFLICT DO NOTHING;
 UPDATE public.assistant_routine_runs SET status='completed',scope_key=p_scope,result_refs=p_refs,finished_at=now(),lease_id=NULL,lease_until=NULL WHERE id=p_run;
 UPDATE public.assistant_routines SET next_run_at=p_next,client_cursor=p_cursor,updated_at=now() WHERE id=row.routine_id;
 RETURN true;
END $$;
NOTIFY pgrst,'reload schema';
