-- Internal fixed team configuration. Role/tool ceilings and base prompts remain in code.
CREATE TABLE public.assistant_bot_configs (
 bot_id text PRIMARY KEY CHECK(bot_id IN('agenda','match','capta','lead','caixa','time','mercado')),
 enabled boolean NOT NULL DEFAULT true,instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=4000),
 suggestions jsonb CHECK(suggestions IS NULL OR(jsonb_typeof(suggestions)='array' AND jsonb_array_length(suggestions)<=5)),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES auth.users(id)
);
INSERT INTO public.assistant_bot_configs(bot_id) SELECT unnest(ARRAY['agenda','match','capta','lead','caixa','time','mercado']);
CREATE TABLE public.assistant_mcp_clients (
 client_id text PRIMARY KEY CHECK(client_id ~ '^[a-zA-Z0-9_.:-]{4,200}$'),name text NOT NULL CHECK(length(name) BETWEEN 2 AND 100),
 approved boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.assistant_bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_mcp_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_bot_configs,public.assistant_mcp_clients FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.assistant_bot_configs,public.assistant_mcp_clients TO authenticated;
GRANT ALL ON public.assistant_bot_configs,public.assistant_mcp_clients TO service_role;
CREATE POLICY assistant_bot_configuration_read ON public.assistant_bot_configs FOR SELECT TO authenticated USING(true);
CREATE POLICY assistant_mcp_clients_admin_read ON public.assistant_mcp_clients FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin') AND nullif(auth.jwt()->>'client_id','') IS NULL AND nullif(auth.jwt()->>'azp','') IS NULL);
ALTER TABLE public.assistant_actions ADD COLUMN origin_client_id text REFERENCES public.assistant_mcp_clients(client_id),ADD COLUMN origin_client_revision integer,ADD COLUMN external_request_id uuid,ADD COLUMN external_request_hash text;
ALTER TABLE public.assistant_actions ADD CONSTRAINT assistant_external_origin_complete CHECK(
 (origin_client_id IS NULL AND origin_client_revision IS NULL AND external_request_id IS NULL AND external_request_hash IS NULL)
 OR(origin_client_id IS NOT NULL AND origin_client_revision IS NOT NULL AND origin_client_revision>0 AND external_request_id IS NOT NULL AND external_request_hash IS NOT NULL AND external_request_hash ~ '^[a-f0-9]{64}$'));
CREATE UNIQUE INDEX assistant_external_request_uidx ON public.assistant_actions(user_id,origin_client_id,external_request_id) WHERE origin_client_id IS NOT NULL;
GRANT SELECT(origin_client_id,origin_client_revision,external_request_id,external_request_hash) ON public.assistant_actions TO authenticated;
CREATE FUNCTION public.assistant_routine_bot(_template text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE _template WHEN 'daily_briefing' THEN 'agenda' WHEN 'agenda_today' THEN 'agenda' WHEN 'stale_attendances' THEN 'lead' WHEN 'expiring_agenciamentos' THEN 'capta' WHEN 'rentals_overdue' THEN 'caixa' WHEN 'new_matches' THEN 'match' WHEN 'broker_ranking' THEN 'time' WHEN 'market_digest' THEN 'mercado' END $$;
CREATE FUNCTION public.assistant_bot_available(_bot_id text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE available boolean; BEGIN SELECT enabled INTO available FROM public.assistant_bot_configs WHERE bot_id=_bot_id; IF NOT FOUND THEN RAISE EXCEPTION 'bot_configuration_unavailable'; END IF; RETURN available; END $$;
REVOKE ALL ON FUNCTION public.assistant_bot_available(text),public.assistant_routine_bot(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_bot_available(text),public.assistant_routine_bot(text) TO authenticated,service_role;
-- Consistent row-lock order: bot -> OAuth client -> action/run -> routine.
-- Creation serializes its per-user quota with an advisory lock before these rows.
CREATE FUNCTION public.assistant_configuration_lock(_bot_id text,_client_id text DEFAULT NULL,_client_revision integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE available boolean; client public.assistant_mcp_clients;
BEGIN
 SELECT enabled INTO available FROM public.assistant_bot_configs WHERE bot_id=_bot_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'bot_configuration_unavailable'; END IF;
 IF NOT available THEN RAISE EXCEPTION 'bot_disabled'; END IF;
 IF _client_id IS NOT NULL THEN
  SELECT * INTO client FROM public.assistant_mcp_clients WHERE client_id=_client_id FOR SHARE;
  IF NOT FOUND OR NOT client.approved OR client.revision IS DISTINCT FROM _client_revision THEN RAISE EXCEPTION 'external_client_unavailable'; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.assistant_configuration_lock(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_configuration_lock(text,text,integer) TO service_role;
CREATE FUNCTION public.assistant_action_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('assistant-pending:'||NEW.user_id::text,0));
 PERFORM public.assistant_configuration_lock(NEW.bot_id,NEW.origin_client_id,NEW.origin_client_revision);
 IF (SELECT count(*) FROM public.assistant_actions WHERE user_id=NEW.user_id AND scope_key=NEW.scope_key AND status='pending' AND expires_at>now())>=100 THEN RAISE EXCEPTION 'pending_action_limit'; END IF;
 IF NEW.origin_client_id IS NOT NULL AND (SELECT count(*) FROM public.assistant_actions WHERE user_id=NEW.user_id AND scope_key=NEW.scope_key AND origin_client_id=NEW.origin_client_id AND status='pending' AND expires_at>now())>=25 THEN RAISE EXCEPTION 'pending_action_limit'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assistant_action_insert_guard BEFORE INSERT ON public.assistant_actions FOR EACH ROW EXECUTE FUNCTION public.assistant_action_insert_guard();
CREATE FUNCTION public.assistant_bot_config_save(_bot_id text,_revision integer,_enabled boolean,_instructions text,_suggestions jsonb,_confirmed boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current public.assistant_bot_configs;
BEGIN
 IF _confirmed IS DISTINCT FROM true OR NOT public.has_role(auth.uid(),'admin') OR auth.uid() IS NULL OR nullif(auth.jwt()->>'client_id','') IS NOT NULL OR nullif(auth.jwt()->>'azp','') IS NOT NULL THEN RAISE EXCEPTION 'personal_admin_required'; END IF;
 IF _instructions IS NULL OR length(_instructions)>4000 OR _enabled IS NULL OR (_suggestions IS NOT NULL AND (jsonb_typeof(_suggestions)<>'array' OR jsonb_array_length(_suggestions)>5)) THEN RAISE EXCEPTION 'invalid_configuration'; END IF;
 IF _suggestions IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(_suggestions) item WHERE jsonb_typeof(item)<>'string' OR length(trim(item#>>'{}')) NOT BETWEEN 3 AND 180) THEN RAISE EXCEPTION 'invalid_configuration'; END IF;
 SELECT * INTO current FROM public.assistant_bot_configs WHERE bot_id=_bot_id FOR UPDATE;
 IF NOT FOUND OR current.revision IS DISTINCT FROM _revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
 UPDATE public.assistant_bot_configs SET enabled=_enabled,instructions=_instructions,suggestions=_suggestions,revision=revision+1,updated_at=now(),updated_by=auth.uid() WHERE bot_id=_bot_id;
 IF NOT _enabled THEN
  UPDATE public.assistant_actions SET status='cancelled',confirmation_proof=NULL,updated_at=now(),revision=revision+1 WHERE bot_id=_bot_id AND status IN('pending','confirmed');
  UPDATE public.assistant_routines SET status='paused',updated_at=now() WHERE public.assistant_routine_bot(template)=_bot_id AND status='active';
 END IF;
 INSERT INTO public.assistant_audit(user_id,bot_id,scope_key,tool,params,result_summary,duration_ms) VALUES(auth.uid(),_bot_id,public.assistant_current_scope(),'configure_bot',jsonb_build_object('revision',current.revision+1),jsonb_build_object('enabled',_enabled),0);
 RETURN current.revision+1;
END $$;
CREATE FUNCTION public.assistant_mcp_client_set(_client_id text,_name text,_approved boolean,_revision integer,_confirmed boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current public.assistant_mcp_clients; next_revision integer;
BEGIN
 IF _confirmed IS DISTINCT FROM true OR NOT public.has_role(auth.uid(),'admin') OR auth.uid() IS NULL OR nullif(auth.jwt()->>'client_id','') IS NOT NULL OR nullif(auth.jwt()->>'azp','') IS NOT NULL THEN RAISE EXCEPTION 'personal_admin_required'; END IF;
 IF _client_id IS NULL OR _client_id !~ '^[a-zA-Z0-9_.:-]{4,200}$' OR _name IS NULL OR length(trim(_name)) NOT BETWEEN 2 AND 100 OR _approved IS NULL THEN RAISE EXCEPTION 'invalid_configuration'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('assistant-client:'||_client_id,0));
 SELECT * INTO current FROM public.assistant_mcp_clients WHERE client_id=_client_id FOR UPDATE;
 IF (FOUND AND current.revision IS DISTINCT FROM _revision) OR (NOT FOUND AND _revision<>0) THEN RAISE EXCEPTION 'stale_revision'; END IF;
 next_revision:=coalesce(current.revision,0)+1;
 INSERT INTO public.assistant_mcp_clients(client_id,name,approved,revision,updated_by) VALUES(_client_id,trim(_name),_approved,next_revision,auth.uid()) ON CONFLICT(client_id) DO UPDATE SET name=EXCLUDED.name,approved=EXCLUDED.approved,revision=EXCLUDED.revision,updated_by=EXCLUDED.updated_by,updated_at=now();
 UPDATE public.assistant_actions SET status='cancelled',confirmation_proof=NULL,updated_at=now(),revision=revision+1 WHERE origin_client_id=_client_id AND status IN('pending','confirmed');
 INSERT INTO public.assistant_audit(user_id,bot_id,scope_key,tool,params,result_summary,duration_ms) VALUES(auth.uid(),'mcp',public.assistant_current_scope(),'configure_mcp_client',jsonb_build_object('clientId',_client_id,'revision',next_revision),jsonb_build_object('approved',_approved),0);
 RETURN next_revision;
END $$;
REVOKE ALL ON FUNCTION public.assistant_bot_config_save(text,integer,boolean,text,jsonb,boolean),public.assistant_mcp_client_set(text,text,boolean,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_bot_config_save(text,integer,boolean,text,jsonb,boolean),public.assistant_mcp_client_set(text,text,boolean,integer,boolean) TO authenticated;
CREATE FUNCTION public.assistant_mcp_client_permission() RETURNS TABLE(client_id text,revision integer,approved boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT nullif(auth.jwt()->>'client_id',''),coalesce(c.revision,0),coalesce(c.approved,false) FROM (SELECT 1) seed LEFT JOIN public.assistant_mcp_clients c ON c.client_id=nullif(auth.jwt()->>'client_id','')
$$;
REVOKE ALL ON FUNCTION public.assistant_mcp_client_permission() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_mcp_client_permission() TO authenticated;
-- A delegated token can read only proposals created by that approved client,
-- even when its owner is an administrator. Personal sessions retain the app's
-- original owner/admin policy. The permission function reads only the caller's
-- signed client_id, never an arbitrary client supplied as a parameter.
DROP POLICY assistant_actions_read ON public.assistant_actions;
CREATE POLICY assistant_actions_read ON public.assistant_actions FOR SELECT TO authenticated USING(
 public.assistant_action_target_access(type,payload) AND (
  (nullif(auth.jwt()->>'client_id','') IS NULL AND nullif(auth.jwt()->>'azp','') IS NULL
   AND ((user_id=auth.uid() AND scope_key=public.assistant_current_scope()) OR(user_id<>auth.uid() AND public.has_role(auth.uid(),'admin'))))
  OR(nullif(auth.jwt()->>'client_id','') IS NOT NULL
   AND (nullif(auth.jwt()->>'azp','') IS NULL OR auth.jwt()->>'azp'=auth.jwt()->>'client_id')
   AND user_id=auth.uid() AND scope_key=public.assistant_current_scope()
   AND origin_client_id=auth.jwt()->>'client_id'
   AND EXISTS(SELECT 1 FROM public.assistant_mcp_client_permission() permission WHERE permission.approved AND permission.client_id=origin_client_id AND permission.revision=origin_client_revision))
 ));
CREATE FUNCTION public.assistant_external_action_prepare(_user_id uuid,_client_id text,_client_revision integer,_request_id uuid,_request_hash text,_action jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.assistant_actions; created uuid;
BEGIN
 IF _request_id IS NULL OR _request_hash IS NULL OR _request_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(_action)<>'object' THEN RAISE EXCEPTION 'invalid_external_request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('assistant-pending:'||_user_id::text,0));
 PERFORM public.assistant_configuration_lock(_action->>'bot_id',_client_id,_client_revision);
 SELECT * INTO prior FROM public.assistant_actions WHERE user_id=_user_id AND origin_client_id=_client_id AND external_request_id=_request_id;
 IF FOUND THEN
  IF prior.external_request_hash<>_request_hash OR prior.origin_client_revision<>_client_revision OR prior.scope_key IS DISTINCT FROM _action->>'scope_key' THEN RAISE EXCEPTION 'external_request_conflict'; END IF;
  RETURN prior.id;
 END IF;
 INSERT INTO public.assistant_actions(id,user_id,conversation_id,bot_id,scope_key,type,payload,expected_state,status,expires_at,origin_client_id,origin_client_revision,external_request_id,external_request_hash)
 VALUES((_action->>'id')::uuid,_user_id,NULL,_action->>'bot_id',_action->>'scope_key',_action->>'type',_action->'payload',coalesce(_action->'expected_state','{}'::jsonb),'pending',now()+interval '15 minutes',_client_id,_client_revision,_request_id,_request_hash) RETURNING id INTO created;
 INSERT INTO public.assistant_audit(user_id,bot_id,scope_key,tool,params,result_summary,duration_ms) VALUES(_user_id,_action->>'bot_id',_action->>'scope_key','prepare_external_action',jsonb_build_object('id',created,'clientId',_client_id,'requestId',_request_id),jsonb_build_object('status','pending'),0);
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.assistant_external_action_prepare(uuid,text,integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_external_action_prepare(uuid,text,integer,uuid,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.assistant_action_authorize(_id uuid,_user_id uuid,_scope_key text,_revision integer,_nonce uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.assistant_actions; v_proof uuid;
BEGIN
 SELECT * INTO a FROM public.assistant_actions WHERE id=_id AND user_id=_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 PERFORM public.assistant_configuration_lock(a.bot_id,a.origin_client_id,a.origin_client_revision);
 UPDATE public.assistant_actions SET confirmation_proof=coalesce(confirmation_proof,_nonce) WHERE id=_id AND user_id=_user_id AND scope_key=_scope_key AND revision=_revision AND status IN('pending','confirmed','executed') RETURNING confirmation_proof INTO v_proof;
 IF v_proof IS NULL THEN RAISE EXCEPTION 'action_unavailable'; END IF; RETURN v_proof;
END $$;
CREATE OR REPLACE FUNCTION public.assistant_action_begin(_id uuid,_revision integer,_proof uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.assistant_actions;
BEGIN
 IF auth.uid() IS NULL OR nullif(auth.jwt()->>'client_id','') IS NOT NULL OR nullif(auth.jwt()->>'azp','') IS NOT NULL THEN RAISE EXCEPTION 'interactive_confirmation_required'; END IF;
 SELECT * INTO a FROM public.assistant_actions WHERE id=_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 PERFORM public.assistant_configuration_lock(a.bot_id,a.origin_client_id,a.origin_client_revision);
 SELECT * INTO a FROM public.assistant_actions WHERE id=_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR _proof IS NULL OR a.confirmation_proof IS DISTINCT FROM _proof OR a.scope_key<>public.assistant_current_scope() THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 IF a.revision<>_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
 IF a.status='executed' THEN RETURN to_jsonb(a)-'confirmation_proof'; END IF;
 IF a.status<>'pending' THEN RAISE EXCEPTION 'action_not_pending'; END IF;
 IF a.expires_at<=now() THEN RAISE EXCEPTION 'action_expired'; END IF;
 UPDATE public.assistant_actions SET status='confirmed',confirmed_at=now(),updated_at=now() WHERE id=a.id RETURNING * INTO a;
 RETURN to_jsonb(a)-'confirmation_proof';
END $$;
-- Invoker business execution calls begin first and retains these shared locks
-- for its entire transaction. No SQL business command or role ceiling changes.
CREATE OR REPLACE FUNCTION public.assistant_routine_claim(p_limit integer DEFAULT 20) RETURNS SETOF public.assistant_routine_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.assistant_bot_configs ORDER BY bot_id FOR SHARE;
 INSERT INTO public.assistant_routine_runs(routine_id,user_id,local_day,scheduled_at,routine_revision)
 SELECT r.id,r.user_id,(now() AT TIME ZONE 'America/Sao_Paulo')::date,r.next_run_at,r.revision FROM public.assistant_routines r JOIN public.assistant_bot_configs b ON b.bot_id=public.assistant_routine_bot(r.template) AND b.enabled
 WHERE r.status='active' AND r.next_run_at<=now() AND(now() AT TIME ZONE 'America/Sao_Paulo')::time>=make_time(r.hour,r.minute,0)
 AND(r.days='every_day' OR(r.days='weekdays' AND EXTRACT(ISODOW FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5) OR(r.days='weekly' AND EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')=coalesce(r.day_of_week,1)))
 ON CONFLICT(routine_id,local_day) DO UPDATE SET routine_revision=EXCLUDED.routine_revision,scheduled_at=EXCLUDED.scheduled_at,status='pending',attempts=0,next_attempt_at=now(),lease_id=NULL,lease_until=NULL,finished_at=NULL,scope_key=NULL,result_refs='[]'::jsonb
 WHERE assistant_routine_runs.routine_revision<>EXCLUDED.routine_revision AND assistant_routine_runs.status<>'completed' AND(assistant_routine_runs.status<>'running' OR assistant_routine_runs.lease_until<now());
 RETURN QUERY WITH selected AS(SELECT run.id FROM public.assistant_routine_runs run JOIN public.assistant_routines r ON r.id=run.routine_id JOIN public.assistant_bot_configs b ON b.bot_id=public.assistant_routine_bot(r.template) AND b.enabled WHERE r.status='active' AND r.revision=run.routine_revision AND run.local_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND run.attempts<3 AND((run.status IN('pending','failed') AND run.next_attempt_at<=now()) OR(run.status='running' AND run.lease_until<now())) ORDER BY run.scheduled_at FOR UPDATE OF run SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),20)) UPDATE public.assistant_routine_runs run SET status='running',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes' FROM selected WHERE run.id=selected.id RETURNING run.*;
END $$;
CREATE OR REPLACE FUNCTION public.assistant_routine_finish(p_run uuid,p_lease uuid,p_scope text,p_refs jsonb,p_next timestamptz,p_seen jsonb DEFAULT '[]'::jsonb,p_cursor uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row public.assistant_routine_runs; routine_status text; routine_revision integer; bot text;
BEGIN
 SELECT public.assistant_routine_bot(r.template) INTO bot FROM public.assistant_routines r JOIN public.assistant_routine_runs run ON run.routine_id=r.id WHERE run.id=p_run;
 IF bot IS NULL THEN RETURN false; END IF;
 PERFORM public.assistant_configuration_lock(bot);
 SELECT * INTO row FROM public.assistant_routine_runs WHERE id=p_run AND lease_id=p_lease AND status='running' AND lease_until>now() FOR UPDATE;
 IF row.id IS NULL THEN RETURN false; END IF;
 SELECT status,revision INTO routine_status,routine_revision FROM public.assistant_routines WHERE id=row.routine_id FOR UPDATE;
 IF NOT FOUND OR routine_status<>'active' OR routine_revision<>row.routine_revision THEN RETURN false; END IF;
 INSERT INTO public.notifications(user_id,tipo,category,titulo,mensagem,link,lida,dedup_key,entity_type,entity_id)
 VALUES(row.user_id,'assistant_routine','system','Seu resumo do Gestão está disponível','Abra o Assistente para consultar as informações permitidas agora.','/assistente?routine='||row.routine_id::text||'&run='||row.id::text,false,'assistant:run:'||row.id::text,'assistant_run',row.id) ON CONFLICT(dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
 INSERT INTO public.assistant_match_seen(user_id,client_id,property_id,scope_key) SELECT row.user_id,(item->>'client_id')::uuid,(item->>'property_id')::uuid,p_scope FROM jsonb_array_elements(p_seen) item ON CONFLICT DO NOTHING;
 UPDATE public.assistant_routine_runs SET status='completed',scope_key=p_scope,result_refs=p_refs,finished_at=now(),lease_id=NULL,lease_until=NULL WHERE id=p_run;
 UPDATE public.assistant_routines SET next_run_at=p_next,client_cursor=p_cursor,updated_at=now() WHERE id=row.routine_id;
 RETURN true;
END $$;
-- Routine writes lock the bot before the routine row. Direct writes cannot
-- bypass this guard; the caller token still identifies the metadata owner.
REVOKE INSERT,UPDATE ON public.assistant_routines FROM authenticated;
DROP POLICY assistant_routines_own ON public.assistant_routines;
CREATE POLICY assistant_routines_read ON public.assistant_routines FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY assistant_routines_delete ON public.assistant_routines FOR DELETE TO authenticated USING(user_id=auth.uid() AND nullif(auth.jwt()->>'client_id','') IS NULL AND nullif(auth.jwt()->>'azp','') IS NULL);
CREATE FUNCTION public.assistant_routine_save_configured(_id uuid,_row jsonb,_create boolean,_confirmed boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous public.assistant_routines; bot text; role text;
BEGIN
 IF auth.uid() IS NULL OR _confirmed IS DISTINCT FROM true OR nullif(auth.jwt()->>'client_id','') IS NOT NULL OR nullif(auth.jwt()->>'azp','') IS NOT NULL THEN RAISE EXCEPTION 'interactive_confirmation_required'; END IF;
 bot:=public.assistant_routine_bot(_row->>'template'); role:=split_part(public.assistant_current_scope(),':',1);
 IF bot IS NULL OR role NOT IN('admin','secretaria','corretor') OR(bot IN('time','mercado') AND role<>'admin') OR(bot='caixa' AND role NOT IN('admin','secretaria')) THEN RAISE EXCEPTION 'routine_not_allowed'; END IF;
 PERFORM public.assistant_configuration_lock(bot);
 PERFORM pg_advisory_xact_lock(hashtextextended('assistant-routine:'||_id::text,0));
 IF _row->>'status' IS NULL OR _row->>'status' NOT IN('active','needs_reauthorization') THEN RAISE EXCEPTION 'invalid_routine'; END IF;
 SELECT * INTO previous FROM public.assistant_routines WHERE id=_id FOR UPDATE;
 IF FOUND THEN
  IF previous.user_id<>auth.uid() THEN RAISE EXCEPTION 'routine_unavailable'; END IF;
  IF _create THEN
   IF ROW(previous.name,previous.template,previous.hour,previous.minute,previous.days,previous.day_of_week) IS DISTINCT FROM ROW(_row->>'name',_row->>'template',(_row->>'hour')::integer,(_row->>'minute')::integer,_row->>'days',nullif(_row->>'day_of_week','')::integer) THEN RAISE EXCEPTION 'external_request_conflict'; END IF;
   RETURN previous.id;
  END IF;
  UPDATE public.assistant_routines SET name=_row->>'name',template=_row->>'template',hour=(_row->>'hour')::integer,minute=(_row->>'minute')::integer,days=_row->>'days',day_of_week=nullif(_row->>'day_of_week','')::integer,status=_row->>'status',next_run_at=(_row->>'next_run_at')::timestamptz,updated_at=now() WHERE id=_id;
 ELSE
  IF NOT _create THEN RAISE EXCEPTION 'routine_unavailable'; END IF;
  INSERT INTO public.assistant_routines(id,user_id,name,template,hour,minute,days,day_of_week,status,next_run_at) VALUES(_id,auth.uid(),_row->>'name',_row->>'template',(_row->>'hour')::integer,(_row->>'minute')::integer,_row->>'days',nullif(_row->>'day_of_week','')::integer,_row->>'status',(_row->>'next_run_at')::timestamptz);
 END IF;
 RETURN _id;
END $$;
CREATE FUNCTION public.assistant_routine_state_configured(_id uuid,_status text,_next timestamptz,_confirmed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous public.assistant_routines; current_template text; bot text; role text;
BEGIN
 IF auth.uid() IS NULL OR _confirmed IS DISTINCT FROM true OR nullif(auth.jwt()->>'client_id','') IS NOT NULL OR nullif(auth.jwt()->>'azp','') IS NOT NULL THEN RAISE EXCEPTION 'interactive_confirmation_required'; END IF;
 SELECT * INTO previous FROM public.assistant_routines WHERE id=_id AND user_id=auth.uid();
 IF NOT FOUND OR _status IS NULL OR _status NOT IN('active','paused') THEN RAISE EXCEPTION 'routine_unavailable'; END IF;
 bot:=public.assistant_routine_bot(previous.template); role:=split_part(public.assistant_current_scope(),':',1);
 IF role NOT IN('admin','secretaria','corretor') OR(bot IN('time','mercado') AND role<>'admin') OR(bot='caixa' AND role NOT IN('admin','secretaria')) THEN RAISE EXCEPTION 'routine_not_allowed'; END IF;
 IF _status='active' THEN PERFORM public.assistant_configuration_lock(bot); END IF;
 SELECT template INTO current_template FROM public.assistant_routines WHERE id=_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR current_template<>previous.template THEN RAISE EXCEPTION 'stale_revision'; END IF;
 UPDATE public.assistant_routines SET status=_status,next_run_at=_next,updated_at=now() WHERE id=_id AND user_id=auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.assistant_routine_save_configured(uuid,jsonb,boolean,boolean),public.assistant_routine_state_configured(uuid,text,timestamptz,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_routine_save_configured(uuid,jsonb,boolean,boolean),public.assistant_routine_state_configured(uuid,text,timestamptz,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
