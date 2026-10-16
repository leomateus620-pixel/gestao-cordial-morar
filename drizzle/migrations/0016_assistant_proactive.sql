-- Additive only. Worker credentials and bookkeeping never grant business-table access.
CREATE FUNCTION public.assistant_memory_valid(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT COALESCE(jsonb_typeof(v)='object' AND (v-'tone'-'focusNeighborhoods'-'preferredStart'-'preferredEnd')='{}'::jsonb
 AND v->>'tone' IN('curto','acolhedor','formal') AND v->>'preferredStart' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND v->>'preferredEnd' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND v->>'preferredStart'<v->>'preferredEnd'
 AND CASE WHEN jsonb_typeof(v->'focusNeighborhoods')='array' THEN jsonb_array_length(v->'focusNeighborhoods')<=10 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'focusNeighborhoods') item WHERE jsonb_typeof(item)<>'string' OR length(item#>>'{}') NOT BETWEEN 2 AND 60 OR (item#>>'{}') ~* '[@0-9]|(rua|avenida|cpf|telefone|propriet[aá]rio)') ELSE false END,false)
$$;
CREATE TABLE public.assistant_memory(user_id uuid PRIMARY KEY REFERENCES auth.users(id),preferences jsonb NOT NULL CHECK(public.assistant_memory_valid(preferences)),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.assistant_routines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),name text NOT NULL CHECK(length(name) BETWEEN 3 AND 80),template text NOT NULL CHECK(template IN('daily_briefing','agenda_today','stale_attendances','expiring_agenciamentos','rentals_overdue','new_matches','broker_ranking','market_digest')),hour integer NOT NULL DEFAULT 8 CHECK(hour BETWEEN 0 AND 23),minute integer NOT NULL DEFAULT 0 CHECK(minute BETWEEN 0 AND 59),days text NOT NULL DEFAULT 'every_day' CHECK(days IN('every_day','weekdays','weekly')),day_of_week integer CHECK(day_of_week BETWEEN 0 AND 6),status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','needs_reauthorization')),next_run_at timestamptz NOT NULL,client_cursor uuid,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,user_id));
CREATE INDEX assistant_routine_due_idx ON public.assistant_routines(next_run_at) WHERE status='active';
CREATE TABLE public.assistant_routine_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),routine_id uuid NOT NULL,user_id uuid NOT NULL,local_day date NOT NULL,scheduled_at timestamptz NOT NULL,routine_revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','running','completed','failed','needs_reauthorization','cancelled')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),lease_id uuid,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),scope_key text,finished_at timestamptz,result_refs jsonb NOT NULL DEFAULT '[]'::jsonb,CHECK(jsonb_typeof(result_refs)='array'),FOREIGN KEY(routine_id,user_id) REFERENCES public.assistant_routines(id,user_id) ON DELETE CASCADE,UNIQUE(routine_id,local_day));
CREATE TABLE public.assistant_delegations(user_id uuid PRIMARY KEY REFERENCES auth.users(id),client_id text NOT NULL,status text NOT NULL CHECK(status IN('connected','revoked','needs_reauthorization')),secret_id uuid,lease_id uuid,lease_until timestamptz,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.assistant_oauth_states(state_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),verifier_secret_id uuid NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes');
CREATE TABLE public.assistant_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),bot_id text NOT NULL,conversation_id uuid,model text NOT NULL,prompt_tokens integer CHECK(prompt_tokens>=0),completion_tokens integer CHECK(completion_tokens>=0),cached_tokens integer CHECK(cached_tokens>=0),duration_ms integer NOT NULL DEFAULT 0 CHECK(duration_ms>=0),estimated_cost_usd numeric CHECK(estimated_cost_usd>=0),rate_version text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX assistant_usage_user_idx ON public.assistant_usage(user_id,created_at DESC);
ALTER TABLE public.assistant_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_routine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_memory,public.assistant_routines,public.assistant_routine_runs,public.assistant_delegations,public.assistant_oauth_states,public.assistant_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.assistant_memory,public.assistant_routines TO authenticated;
GRANT SELECT ON public.assistant_routine_runs,public.assistant_usage TO authenticated;
GRANT SELECT(user_id,client_id,status,updated_at) ON public.assistant_delegations TO authenticated;
GRANT ALL ON public.assistant_memory,public.assistant_routines,public.assistant_routine_runs,public.assistant_delegations,public.assistant_oauth_states,public.assistant_usage TO service_role;
CREATE POLICY assistant_memory_own ON public.assistant_memory FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY assistant_routines_own ON public.assistant_routines FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY assistant_runs_own ON public.assistant_routine_runs FOR SELECT TO authenticated USING(user_id=auth.uid() AND(scope_key IS NULL OR scope_key=public.assistant_current_scope()));
CREATE POLICY assistant_delegations_own ON public.assistant_delegations FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY assistant_usage_read ON public.assistant_usage FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
-- PKCE secrets are encrypted in Vault. Only internal server functions touch them.
CREATE FUNCTION public.assistant_oauth_start(p_user uuid,p_state_hash text,p_verifier text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE secret uuid; old_secret uuid;
BEGIN
 FOR old_secret IN DELETE FROM public.assistant_oauth_states WHERE expires_at<now() RETURNING verifier_secret_id LOOP DELETE FROM vault.secrets WHERE id=old_secret; END LOOP;
 SELECT vault.create_secret(p_verifier) INTO secret;
 INSERT INTO public.assistant_oauth_states(state_hash,user_id,verifier_secret_id) VALUES(p_state_hash,p_user,secret);
END $$;
CREATE FUNCTION public.assistant_oauth_consume(p_state_hash text) RETURNS TABLE(user_id uuid,verifier text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row public.assistant_oauth_states;
BEGIN
 DELETE FROM public.assistant_oauth_states WHERE state_hash=p_state_hash AND expires_at>now() RETURNING * INTO row;
 IF row.user_id IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT row.user_id,s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.id=row.verifier_secret_id;
 DELETE FROM vault.secrets WHERE id=row.verifier_secret_id;
END $$;
CREATE FUNCTION public.assistant_delegation_put(p_user uuid,p_client text,p_refresh text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 SELECT secret_id INTO sid FROM public.assistant_delegations WHERE user_id=p_user FOR UPDATE;
 IF sid IS NULL THEN SELECT vault.create_secret(p_refresh) INTO sid; ELSE PERFORM vault.update_secret(sid,p_refresh); END IF;
 INSERT INTO public.assistant_delegations(user_id,client_id,status,secret_id) VALUES(p_user,p_client,'connected',sid) ON CONFLICT(user_id) DO UPDATE SET client_id=p_client,status='connected',secret_id=sid,lease_id=NULL,lease_until=NULL,updated_at=now();
END $$;
CREATE FUNCTION public.assistant_delegation_acquire(p_user uuid,p_lease uuid) RETURNS TABLE(refresh_token text,client_id text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.assistant_delegations SET status='needs_reauthorization',lease_id=NULL,lease_until=NULL WHERE user_id=p_user AND lease_until<now();
 RETURN QUERY WITH claimed AS(UPDATE public.assistant_delegations SET lease_id=p_lease,lease_until=now()+interval '3 minutes' WHERE user_id=p_user AND status='connected' AND lease_until IS NULL RETURNING secret_id,assistant_delegations.client_id)
 SELECT s.decrypted_secret,c.client_id FROM claimed c JOIN vault.decrypted_secrets s ON s.id=c.secret_id;
END $$;
CREATE FUNCTION public.assistant_delegation_rotate(p_user uuid,p_lease uuid,p_refresh text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN SELECT secret_id INTO sid FROM public.assistant_delegations WHERE user_id=p_user AND lease_id=p_lease AND lease_until>now() AND status='connected' FOR UPDATE;
 IF sid IS NULL THEN RETURN false; END IF;
 IF p_refresh IS NOT NULL THEN PERFORM vault.update_secret(sid,p_refresh); END IF;
 UPDATE public.assistant_delegations SET lease_id=NULL,lease_until=NULL,updated_at=now() WHERE user_id=p_user AND lease_id=p_lease;
 RETURN true;
END $$;
CREATE FUNCTION public.assistant_delegation_revoke() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 SELECT secret_id INTO sid FROM public.assistant_delegations WHERE user_id=auth.uid() FOR UPDATE;
 UPDATE public.assistant_delegations SET status='revoked',secret_id=NULL,lease_id=NULL,lease_until=NULL,updated_at=now() WHERE user_id=auth.uid();
 IF sid IS NOT NULL THEN DELETE FROM vault.secrets WHERE id=sid; END IF;
 UPDATE public.assistant_routines SET status='needs_reauthorization',updated_at=now() WHERE user_id=auth.uid() AND status='active';
END $$;
CREATE FUNCTION public.assistant_routine_claim(p_limit integer DEFAULT 5) RETURNS SETOF public.assistant_routine_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.assistant_routine_runs(routine_id,user_id,local_day,scheduled_at,routine_revision)
 SELECT id,user_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,next_run_at,revision FROM public.assistant_routines WHERE status='active' AND next_run_at<=now() AND (now() AT TIME ZONE 'America/Sao_Paulo')::time>=make_time(hour,minute,0) AND(days='every_day' OR(days='weekdays' AND EXTRACT(ISODOW FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5) OR(days='weekly' AND EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')=COALESCE(day_of_week,1)))
 ON CONFLICT(routine_id,local_day) DO NOTHING;
 RETURN QUERY WITH selected AS(SELECT run.id FROM public.assistant_routine_runs run JOIN public.assistant_routines r ON r.id=run.routine_id WHERE r.status='active' AND run.local_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND run.attempts<3 AND ((run.status IN('pending','failed') AND run.next_attempt_at<=now()) OR(run.status='running' AND run.lease_until<now())) ORDER BY run.scheduled_at FOR UPDATE OF run SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),20))
 UPDATE public.assistant_routine_runs run SET status='running',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes' FROM selected WHERE run.id=selected.id RETURNING run.*;
END $$;
CREATE FUNCTION public.assistant_routine_finish(p_run uuid,p_lease uuid,p_scope text,p_refs jsonb,p_next timestamptz,p_seen jsonb DEFAULT '[]'::jsonb,p_cursor uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row public.assistant_routine_runs;
BEGIN
 SELECT * INTO row FROM public.assistant_routine_runs WHERE id=p_run AND lease_id=p_lease AND status='running' AND lease_until>now() FOR UPDATE;
 IF row.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.assistant_routines WHERE id=row.routine_id AND status='active' AND revision=row.routine_revision) THEN RETURN false; END IF;
 INSERT INTO public.notifications(user_id,tipo,category,titulo,mensagem,link,lida,dedup_key,entity_type,entity_id)
 VALUES(row.user_id,'assistant_routine','system','Seu resumo do Gestão está disponível','Abra o Assistente para consultar as informações permitidas agora.','/assistente?routine='||row.routine_id::text||'&run='||row.id::text,false,'assistant:run:'||row.id::text,'assistant_run',row.id)
 ON CONFLICT(dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
 INSERT INTO public.assistant_match_seen(user_id,client_id,property_id,scope_key) SELECT row.user_id,(item->>'client_id')::uuid,(item->>'property_id')::uuid,p_scope FROM jsonb_array_elements(p_seen) item ON CONFLICT DO NOTHING;
 UPDATE public.assistant_routine_runs SET status='completed',scope_key=p_scope,result_refs=p_refs,finished_at=now(),lease_id=NULL,lease_until=NULL WHERE id=p_run;
 UPDATE public.assistant_routines SET next_run_at=p_next,client_cursor=p_cursor,updated_at=now() WHERE id=row.routine_id;
 RETURN true;
END $$;
CREATE TABLE public.assistant_match_seen(user_id uuid NOT NULL REFERENCES auth.users(id),client_id uuid NOT NULL,property_id uuid NOT NULL,scope_key text NOT NULL,seen_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,client_id,property_id,scope_key));
ALTER TABLE public.assistant_match_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_match_seen FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.assistant_match_seen TO authenticated;
GRANT ALL ON public.assistant_match_seen TO service_role;
CREATE POLICY assistant_match_seen_own ON public.assistant_match_seen FOR SELECT TO authenticated USING(user_id=auth.uid() AND scope_key=public.assistant_current_scope());
-- No scheduler is enabled by this migration. Deployment must publish the route first.
CREATE FUNCTION public.assistant_routine_dispatch() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE origin text; request_id bigint;
BEGIN
 SELECT decrypted_secret INTO origin FROM vault.decrypted_secrets WHERE name='assistant_worker_origin' LIMIT 1;
 IF origin IS NULL OR origin !~ '^https://[^/?#]+/?$' THEN RETURN NULL; END IF;
 SELECT net.http_post(url:=rtrim(origin,'/')||'/api/public/hooks/assistant-briefing-worker',headers:=public.internal_worker_headers(),body:='{}'::jsonb,timeout_milliseconds:=120000) INTO request_id;
 RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.assistant_oauth_start(uuid,text,text),public.assistant_oauth_consume(text),public.assistant_delegation_put(uuid,text,text),public.assistant_delegation_acquire(uuid,uuid),public.assistant_delegation_rotate(uuid,uuid,text),public.assistant_routine_claim(integer),public.assistant_routine_finish(uuid,uuid,text,jsonb,timestamptz,jsonb,uuid),public.assistant_routine_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_oauth_start(uuid,text,text),public.assistant_oauth_consume(text),public.assistant_delegation_put(uuid,text,text),public.assistant_delegation_acquire(uuid,uuid),public.assistant_delegation_rotate(uuid,uuid,text),public.assistant_routine_claim(integer),public.assistant_routine_finish(uuid,uuid,text,jsonb,timestamptz,jsonb,uuid),public.assistant_routine_dispatch() TO service_role;
REVOKE ALL ON FUNCTION public.assistant_delegation_revoke() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_delegation_revoke() TO authenticated;
-- Explicit post-publication activation only; neither function is called by this migration.
CREATE FUNCTION public.assistant_routine_scheduler_status() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE enabled boolean;
BEGIN
 IF to_regclass('cron.job') IS NULL THEN RETURN false; END IF;
 EXECUTE 'SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname=''assistant-routines'' AND active)' INTO enabled;
 RETURN enabled;
END $$;
CREATE FUNCTION public.assistant_routine_scheduler_set(p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job record; origin text;
BEGIN
 IF to_regclass('cron.job') IS NULL THEN RAISE EXCEPTION 'cron_not_configured'; END IF;
 FOR job IN EXECUTE 'SELECT jobid FROM cron.job WHERE jobname=''assistant-routines''' LOOP PERFORM cron.unschedule(job.jobid); END LOOP;
 IF p_enabled THEN
  SELECT decrypted_secret INTO origin FROM vault.decrypted_secrets WHERE name='assistant_worker_origin' LIMIT 1;
  IF origin IS NULL OR origin !~ '^https://[^/?#]+/?$' THEN RAISE EXCEPTION 'worker_origin_not_configured'; END IF;
  PERFORM cron.schedule('assistant-routines','* * * * *','SELECT public.assistant_routine_dispatch()');
 END IF;
END $$;
CREATE FUNCTION public.assistant_oauth_client_secret() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='assistant_oauth_client_secret' LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.assistant_routine_scheduler_status(),public.assistant_routine_scheduler_set(boolean),public.assistant_oauth_client_secret() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_routine_scheduler_status(),public.assistant_routine_scheduler_set(boolean),public.assistant_oauth_client_secret() TO service_role;

CREATE FUNCTION public.assistant_routine_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF ROW(NEW.name,NEW.template,NEW.hour,NEW.minute,NEW.days,NEW.day_of_week,NEW.status) IS DISTINCT FROM ROW(OLD.name,OLD.template,OLD.hour,OLD.minute,OLD.days,OLD.day_of_week,OLD.status) THEN NEW.revision=OLD.revision+1; END IF; RETURN NEW; END $$;
CREATE TRIGGER assistant_routine_revision BEFORE UPDATE ON public.assistant_routines FOR EACH ROW EXECUTE FUNCTION public.assistant_routine_revision();
NOTIFY pgrst,'reload schema';
