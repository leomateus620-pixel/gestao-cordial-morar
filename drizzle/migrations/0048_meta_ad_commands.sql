-- Paused creation is an explicit durable command. No trigger dispatches a Graph mutation.
CREATE UNIQUE INDEX ad_connections_id_agency_uidx ON public.ad_platform_connections(id,imobiliaria);
--> statement-breakpoint
CREATE TABLE public.meta_ad_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connection_id uuid NOT NULL, imobiliaria text NOT NULL CHECK(imobiliaria IN ('cordial','morar')),
 account_id text NOT NULL CHECK(account_id ~ '^[0-9]{1,80}$'), page_id text NOT NULL CHECK(page_id ~ '^[0-9]{1,80}$'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 status text NOT NULL DEFAULT 'rascunho' CHECK(status IN ('rascunho','enviando','pausado_na_meta','ativo','parcial','incerto','falhou')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(connection_id,imobiliaria) REFERENCES public.ad_platform_connections(id,imobiliaria),
 UNIQUE(id,connection_id,imobiliaria)
);
--> statement-breakpoint
CREATE TABLE public.meta_ad_commands (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),draft_id uuid NOT NULL,connection_id uuid NOT NULL,imobiliaria text NOT NULL,
 draft_revision integer NOT NULL, kind text NOT NULL CHECK(kind IN ('create_paused','set_delivery','change_budget')),
 intent_key text NOT NULL UNIQUE, payload jsonb NOT NULL DEFAULT '{}', steps jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','partial','uncertain','failed')),
 actor_id uuid NOT NULL, worker_id uuid, lease_until timestamptz, fence integer NOT NULL DEFAULT 0,
 last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(draft_id,connection_id,imobiliaria) REFERENCES public.meta_ad_drafts(id,connection_id,imobiliaria),
 CHECK(jsonb_typeof(steps)='object'),
 CHECK(jsonb_typeof(payload)='object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX meta_ad_command_running_draft_uidx ON public.meta_ad_commands(draft_id) WHERE state='running';
--> statement-breakpoint
CREATE UNIQUE INDEX meta_ad_command_running_connection_uidx ON public.meta_ad_commands(connection_id) WHERE state='running';
--> statement-breakpoint
CREATE INDEX meta_ad_drafts_scope_idx ON public.meta_ad_drafts(imobiliaria,connection_id,updated_at DESC);
--> statement-breakpoint
CREATE INDEX meta_ad_commands_draft_idx ON public.meta_ad_commands(draft_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE public.meta_ad_command_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,command_id uuid NOT NULL REFERENCES public.meta_ad_commands(id),
 actor_id uuid NOT NULL,stage text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE public.meta_ad_hierarchy (
 connection_id uuid NOT NULL,imobiliaria text NOT NULL,account_id text NOT NULL,
 external_id text NOT NULL CHECK(external_id ~ '^[0-9]{1,80}$'),level text NOT NULL CHECK(level IN ('campaign','adset','ad','creative')),
 parent_external_id text, name text NOT NULL,configured_status text,effective_status text,
 snapshot jsonb NOT NULL DEFAULT '{}',revision_hash text NOT NULL,read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,account_id,level,external_id),
 FOREIGN KEY(connection_id,imobiliaria) REFERENCES public.ad_platform_connections(id,imobiliaria)
);
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['meta_ad_drafts','meta_ad_commands','meta_ad_command_events','meta_ad_hierarchy'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY meta_reviewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),''meta_reviewer'')) WITH CHECK (NOT public.has_role(auth.uid(),''meta_reviewer''))',t);
 END LOOP; END $$;
--> statement-breakpoint
GRANT USAGE,SELECT ON SEQUENCE public.meta_ad_command_events_id_seq TO service_role;
--> statement-breakpoint
-- Server role and SQL entry points both enforce reviewer dominance, including combined roles.
CREATE FUNCTION public.meta_ads_assert_actor(p_actor uuid,p_agency text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_actor IS NULL OR p_agency IS NULL OR public.has_role(p_actor,'meta_reviewer') OR NOT public.has_role(p_actor,'admin')
 OR p_agency NOT IN ('cordial','morar') THEN RAISE EXCEPTION 'Meta action forbidden' USING ERRCODE='42501'; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_ad_draft_save(p_id uuid,p_revision integer,p_connection uuid,p_agency text,p_payload jsonb,p_actor uuid) RETURNS public.meta_ad_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.ad_platform_connections; d public.meta_ad_drafts;
BEGIN
 PERFORM public.meta_ads_assert_actor(p_actor,p_agency);
 SELECT * INTO c FROM public.ad_platform_connections WHERE id=p_connection AND imobiliaria=p_agency AND platform='meta' FOR SHARE;
 IF c.id IS NULL OR c.external_account_id IS NULL OR c.page_id IS NULL OR c.page_id<>p_payload->>'pageId' THEN RAISE EXCEPTION 'Connection context mismatch'; END IF;
 IF p_id IS NULL THEN
 INSERT INTO public.meta_ad_drafts(connection_id,imobiliaria,account_id,page_id,payload,created_by)
 VALUES(c.id,p_agency,regexp_replace(c.external_account_id,'^act_',''),c.page_id,p_payload,p_actor) RETURNING * INTO d;
 ELSE
 SELECT * INTO d FROM public.meta_ad_drafts WHERE id=p_id FOR UPDATE;
 IF d.id IS NULL OR d.connection_id<>p_connection OR d.imobiliaria<>p_agency OR d.revision<>p_revision OR (d.status<>'rascunho' AND NOT(d.status='falhou' AND NOT EXISTS(SELECT 1 FROM public.meta_ad_commands mc, LATERAL jsonb_each(mc.steps) s WHERE mc.draft_id=d.id AND (s.value ? 'id' OR s.value->>'state' IN ('done','sending','uncertain'))))) THEN RAISE EXCEPTION 'Draft revision or scope conflict' USING ERRCODE='40001'; END IF;
 UPDATE public.meta_ad_drafts SET payload=p_payload,status='rascunho',revision=revision+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 END IF; RETURN d;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_ad_command_begin(p_draft uuid,p_revision integer,p_kind text,p_payload jsonb,p_intent text,p_actor uuid) RETURNS public.meta_ad_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.meta_ad_drafts;c public.meta_ad_commands;
BEGIN
 SELECT * INTO d FROM public.meta_ad_drafts WHERE id=p_draft FOR UPDATE;
 PERFORM public.meta_ads_assert_actor(p_actor,d.imobiliaria);
 IF d.id IS NULL OR d.revision<>p_revision THEN RAISE EXCEPTION 'Draft revision conflict' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ad_platform_connections con WHERE con.id=d.connection_id AND con.imobiliaria=d.imobiliaria AND con.platform='meta' AND regexp_replace(con.external_account_id,'^act_','')=d.account_id AND con.page_id=d.page_id) THEN RAISE EXCEPTION 'Connection changed'; END IF;
 SELECT * INTO c FROM public.meta_ad_commands WHERE intent_key=p_intent;
 IF c.id IS NOT NULL THEN
 IF c.draft_id<>p_draft OR c.draft_revision<>p_revision OR c.kind<>p_kind OR c.payload<>p_payload THEN RAISE EXCEPTION 'Intent conflict'; END IF;
 RETURN c; END IF;
 IF EXISTS(SELECT 1 FROM public.meta_ad_commands WHERE draft_id=p_draft AND state IN ('pending','running','partial','uncertain')) THEN RAISE EXCEPTION 'Resolve previous command'; END IF;
 IF p_kind='create_paused' AND d.status<>'rascunho' THEN RAISE EXCEPTION 'Duplicate creation forbidden'; END IF;
 IF p_kind<>'create_paused' AND d.status NOT IN ('pausado_na_meta','ativo') THEN RAISE EXCEPTION 'Creation not confirmed'; END IF;
 INSERT INTO public.meta_ad_commands(draft_id,connection_id,imobiliaria,draft_revision,kind,intent_key,payload,actor_id)
 VALUES(d.id,d.connection_id,d.imobiliaria,d.revision,p_kind,p_intent,p_payload,p_actor) RETURNING * INTO c;
 INSERT INTO public.meta_ad_command_events(command_id,actor_id,stage) VALUES(c.id,p_actor,'intent');
 RETURN c;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_ad_command_claim(p_id uuid,p_worker uuid,p_actor uuid) RETURNS SETOF public.meta_ad_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.meta_ad_commands;
BEGIN
 SELECT * INTO c FROM public.meta_ad_commands WHERE id=p_id FOR UPDATE;
 PERFORM public.meta_ads_assert_actor(p_actor,c.imobiliaria);
 IF c.id IS NULL OR c.state IN ('done','uncertain') OR (c.state='running' AND c.lease_until>now()) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(c.steps) s WHERE s.value->>'state' IN ('sending','uncertain')) THEN
 UPDATE public.meta_ad_commands SET state='uncertain',last_error='outcome_uncertain',worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=c.id;
 UPDATE public.meta_ad_drafts SET status='incerto',updated_at=now() WHERE id=c.draft_id;
 RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.meta_ad_commands other WHERE other.connection_id=c.connection_id AND other.id<>c.id AND other.state='running') THEN RETURN; END IF;
 UPDATE public.meta_ad_commands SET state='running',worker_id=p_worker,lease_until=now()+interval '4 minutes',fence=fence+1,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 UPDATE public.meta_ad_drafts SET status='enviando',updated_at=now() WHERE id=c.draft_id;
 RETURN NEXT c;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_ad_command_step(p_id uuid,p_worker uuid,p_fence integer,p_step text,p_result jsonb,p_actor uuid) RETURNS public.meta_ad_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.meta_ad_commands;
BEGIN
 SELECT * INTO c FROM public.meta_ad_commands WHERE id=p_id FOR UPDATE;
 PERFORM public.meta_ads_assert_actor(p_actor,c.imobiliaria);
 IF c.worker_id IS DISTINCT FROM p_worker OR c.fence<>p_fence OR c.state<>'running' OR c.lease_until<=now() THEN RAISE EXCEPTION 'Stale command lease'; END IF;
 IF p_step NOT IN ('campaign','adset','creative','ad') OR coalesce(p_result->>'state','') NOT IN ('sending','done','failed','uncertain') THEN RAISE EXCEPTION 'Invalid step'; END IF;
 IF c.steps->p_step->>'state'='done' THEN RAISE EXCEPTION 'Confirmed step immutable'; END IF;
 IF p_result->>'state'='sending' AND c.steps->p_step->>'state' IN ('sending','uncertain') THEN RAISE EXCEPTION 'Cannot repeat uncertain write'; END IF;
 UPDATE public.meta_ad_commands SET steps=jsonb_set(steps,ARRAY[p_step],p_result),updated_at=now() WHERE id=c.id RETURNING * INTO c;
 INSERT INTO public.meta_ad_command_events(command_id,actor_id,stage,detail) VALUES(c.id,p_actor,p_step,jsonb_build_object('state',p_result->>'state','id',p_result->>'id','error',p_result->>'error'));
 RETURN c;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_ad_command_finish(p_id uuid,p_worker uuid,p_fence integer,p_state text,p_error text,p_actor uuid) RETURNS public.meta_ad_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.meta_ad_commands;v_done integer;
BEGIN
 SELECT * INTO c FROM public.meta_ad_commands WHERE id=p_id FOR UPDATE;
 PERFORM public.meta_ads_assert_actor(p_actor,c.imobiliaria);
 IF c.worker_id IS DISTINCT FROM p_worker OR c.fence<>p_fence OR c.state<>'running' OR c.lease_until<=now() THEN RAISE EXCEPTION 'Stale command lease'; END IF;
 IF p_state NOT IN ('done','partial','uncertain','failed') THEN RAISE EXCEPTION 'Invalid state'; END IF;
 SELECT count(*) INTO v_done FROM jsonb_each(c.steps) s WHERE s.value->>'state'='done';
 IF p_state='done' AND v_done<>(CASE WHEN c.kind='create_paused' THEN 4 WHEN c.kind='set_delivery' THEN 3 ELSE 1 END) THEN RAISE EXCEPTION 'Incomplete command'; END IF;
 UPDATE public.meta_ad_commands SET state=p_state,last_error=p_error,worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 UPDATE public.meta_ad_drafts SET status=CASE WHEN p_state='done' THEN CASE WHEN c.kind='set_delivery' AND c.payload->>'status'='ACTIVE' THEN 'ativo' WHEN c.kind='change_budget' THEN coalesce(c.payload->>'previous_status','pausado_na_meta') ELSE 'pausado_na_meta' END WHEN p_state='uncertain' THEN 'incerto' WHEN p_state='partial' THEN 'parcial' WHEN c.kind<>'create_paused' AND v_done=0 THEN coalesce(c.payload->>'previous_status','pausado_na_meta') ELSE 'falhou' END,
 payload=CASE WHEN p_state='done' AND c.kind='change_budget' THEN jsonb_set(payload,'{budget,amountMinor}',c.payload->'amountMinor') ELSE payload END,
 revision=revision+CASE WHEN p_state='done' THEN 1 ELSE 0 END,updated_at=now() WHERE id=c.draft_id;
 INSERT INTO public.meta_ad_command_events(command_id,actor_id,stage,detail) VALUES(c.id,p_actor,'result',jsonb_build_object('state',p_state,'error',p_error));
 RETURN c;
END $$;
--> statement-breakpoint
-- A reconciliation can only bind a Graph object proven by the backend; absence never authorizes another POST.
CREATE FUNCTION public.meta_ad_command_reconcile(p_id uuid,p_step text,p_result jsonb,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.meta_ad_commands;
BEGIN
 SELECT * INTO c FROM public.meta_ad_commands WHERE id=p_id FOR UPDATE;
 PERFORM public.meta_ads_assert_actor(p_actor,c.imobiliaria);
 IF c.state NOT IN ('uncertain','partial','failed','running') OR (c.state='running' AND c.lease_until>now()) THEN RAISE EXCEPTION 'Command cannot reconcile'; END IF;
 IF p_step NOT IN ('campaign','adset','creative','ad') OR coalesce(c.steps->p_step->>'state','') NOT IN ('sending','uncertain') OR coalesce(p_result->>'state','')<>'done' OR coalesce(p_result->>'id','') !~ '^[0-9]{1,80}$' THEN RAISE EXCEPTION 'Reconciliation invalid'; END IF;
 UPDATE public.meta_ad_commands SET steps=jsonb_set(steps,ARRAY[p_step],p_result),state='partial',worker_id=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=c.id;
 UPDATE public.meta_ad_drafts SET status='parcial',updated_at=now() WHERE id=c.draft_id;
 INSERT INTO public.meta_ad_command_events(command_id,actor_id,stage,detail) VALUES(c.id,p_actor,'reconciled',jsonb_build_object('step',p_step,'id',p_result->>'id'));
END $$;
--> statement-breakpoint
DO $$ DECLARE f regprocedure; BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname IN ('meta_ads_assert_actor','meta_ad_draft_save','meta_ad_command_begin','meta_ad_command_claim','meta_ad_command_step','meta_ad_command_finish','meta_ad_command_reconcile') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP; END $$;
