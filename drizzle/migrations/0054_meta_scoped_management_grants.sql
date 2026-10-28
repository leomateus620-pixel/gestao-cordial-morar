-- Explicit business decision: Bianca may manage Meta ads in her assigned agencies.
-- Budget visibility here is operational; it does not grant financial reports, CRM finance or credentials.
CREATE TABLE public.marketing_action_grants(
 user_id uuid NOT NULL REFERENCES auth.users(id), imobiliaria text NOT NULL CHECK(imobiliaria IN ('cordial','morar')),
 action text NOT NULL CHECK(action IN ('read_ad_budget','create_draft','send_paused','change_budget','set_delivery')),
 reason text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,imobiliaria,action)
);
ALTER TABLE public.marketing_action_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.marketing_action_grants AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.is_meta_reviewer()) WITH CHECK(NOT public.is_meta_reviewer());
REVOKE ALL ON public.marketing_action_grants FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.marketing_action_grants TO service_role;
INSERT INTO public.marketing_action_grants(user_id,imobiliaria,action,reason)
SELECT u.id,a.agency,action,'Explicit user authorization: Bianca may create, edit and monitor Meta campaigns; no connection administration or financial reporting.'
FROM auth.users u JOIN public.user_agencies a ON a.user_id=u.id
CROSS JOIN unnest(ARRAY['read_ad_budget','create_draft','send_paused','change_budget','set_delivery']) action
WHERE u.id='b06a522f-65b4-4e2a-8bb4-e9e1f0675b75' AND a.agency IN ('cordial','morar')
 AND public.has_role(u.id,'secretaria') AND NOT public.has_role(u.id,'meta_reviewer')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.marketing_actor_can_act(p_actor uuid,p_action text,p_agency text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_actor IS NOT NULL
 AND p_action=ANY(ARRAY['read_metrics','read_ad_budget','read_lead_contacts','manage_leads','create_draft','send_paused','change_budget','set_delivery','generate_report','financial_report','manage_connection','manage_manual'])
 AND (p_agency IS NULL OR p_agency=ANY(ARRAY['cordial','morar']))
 AND CASE WHEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text='meta_reviewer')
 THEN p_action='read_metrics' AND (p_agency IS NULL OR public.has_notification_agency_access(p_actor,p_agency))
 ELSE public.has_role(p_actor,'admin') OR (
   public.has_role(p_actor,'secretaria') AND NOT public.has_role(p_actor,'financeiro')
   AND (p_action=ANY(ARRAY['read_metrics','read_lead_contacts','manage_leads','create_draft','generate_report','manage_manual'])
     OR EXISTS(SELECT 1 FROM public.marketing_action_grants g WHERE g.user_id=p_actor AND g.action=p_action
       AND (p_agency IS NULL OR g.imobiliaria=p_agency) AND public.has_notification_agency_access(p_actor,g.imobiliaria)))
   AND (p_agency IS NULL OR public.has_notification_agency_access(p_actor,p_agency))) END
$$;

--> statement-breakpoint
CREATE FUNCTION public.marketing_action_permissions() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_object_agg(agency,grants) FROM (SELECT agency,jsonb_object_agg(action,public.marketing_can_act(action,agency)) grants
 FROM unnest(ARRAY['cordial','morar']) agency CROSS JOIN unnest(ARRAY['read_metrics','read_ad_budget','read_lead_contacts','manage_leads','create_draft','send_paused','change_budget','set_delivery','generate_report','financial_report','manage_connection','manage_manual']) action GROUP BY agency) s
$$;
REVOKE ALL ON FUNCTION public.marketing_action_permissions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_action_permissions() TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.ad_connections_public() RETURNS TABLE(id uuid,user_id uuid,imobiliaria text,platform text,account_label text,expires_at timestamptz,scopes text,status text,last_error text,updated_at timestamptz,credential_mode text,app_id text,page_id text,external_account_id text,capabilities jsonb,last_diagnosed_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.id,CASE WHEN public.is_meta_reviewer() THEN NULL ELSE c.user_id END,c.imobiliaria,c.platform,CASE WHEN public.is_meta_reviewer() THEN 'Meta Ads' ELSE c.account_label END,c.expires_at,c.scopes,c.status,
 CASE WHEN c.last_error IS NULL THEN NULL ELSE 'Falha na conexão. Execute o diagnóstico.' END,c.updated_at,c.credential_mode,c.app_id,c.page_id,c.external_account_id,c.capabilities,c.last_diagnosed_at
 FROM public.ad_platform_connections c WHERE ((c.platform='meta' AND public.marketing_can_act('read_ad_budget',c.imobiliaria)) OR public.marketing_can_act('manage_connection') OR (public.is_meta_reviewer() AND c.platform='meta' AND public.marketing_can_read(c.imobiliaria)))
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_ads_assert_actor(p_actor uuid,p_agency text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_actor IS NULL OR p_agency IS NULL OR p_agency NOT IN ('cordial','morar')
 OR (auth.uid() IS NOT NULL AND auth.uid()<>p_actor)
 OR NOT public.marketing_actor_can_act(p_actor,'read_ad_budget',p_agency)
 OR NOT public.marketing_actor_can_act(p_actor,'create_draft',p_agency)
 THEN RAISE EXCEPTION 'Meta action forbidden' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION public.meta_ads_assert_action(p_actor uuid,p_agency text,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.meta_ads_assert_actor(p_actor,p_agency);
 IF NOT public.marketing_actor_can_act(p_actor,p_action,p_agency) THEN RAISE EXCEPTION 'Meta action forbidden' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.meta_ads_assert_action(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_ads_assert_action(uuid,text,text) TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_ad_draft_save(p_id uuid,p_revision integer,p_connection uuid,p_agency text,p_payload jsonb,p_actor uuid) RETURNS public.meta_ad_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.ad_platform_connections; d public.meta_ad_drafts;
BEGIN
 PERFORM public.meta_ads_assert_action(p_actor,p_agency,'create_draft');
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
CREATE OR REPLACE FUNCTION public.meta_ad_command_begin(p_draft uuid,p_revision integer,p_kind text,p_payload jsonb,p_intent text,p_actor uuid) RETURNS public.meta_ad_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.meta_ad_drafts;c public.meta_ad_commands;
BEGIN
 SELECT * INTO d FROM public.meta_ad_drafts WHERE id=p_draft FOR UPDATE;
 PERFORM public.meta_ads_assert_action(p_actor,d.imobiliaria,CASE p_kind WHEN 'create_paused' THEN 'send_paused' WHEN 'set_delivery' THEN 'set_delivery' WHEN 'change_budget' THEN 'change_budget' ELSE 'invalid' END);
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
CREATE OR REPLACE FUNCTION public.meta_ad_command_claim(p_id uuid,p_worker uuid,p_actor uuid) RETURNS SETOF public.meta_ad_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.meta_ad_commands;
BEGIN
 SELECT * INTO c FROM public.meta_ad_commands WHERE id=p_id FOR UPDATE;
 PERFORM public.meta_ads_assert_action(p_actor,c.imobiliaria,CASE c.kind WHEN 'create_paused' THEN 'send_paused' WHEN 'set_delivery' THEN 'set_delivery' WHEN 'change_budget' THEN 'change_budget' ELSE 'invalid' END);
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
CREATE OR REPLACE FUNCTION public.meta_ad_command_step(p_id uuid,p_worker uuid,p_fence integer,p_step text,p_result jsonb,p_actor uuid) RETURNS public.meta_ad_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.meta_ad_commands;
BEGIN
 SELECT * INTO c FROM public.meta_ad_commands WHERE id=p_id FOR UPDATE;
 PERFORM public.meta_ads_assert_action(p_actor,c.imobiliaria,CASE c.kind WHEN 'create_paused' THEN 'send_paused' WHEN 'set_delivery' THEN 'set_delivery' WHEN 'change_budget' THEN 'change_budget' ELSE 'invalid' END);
 IF c.worker_id IS DISTINCT FROM p_worker OR c.fence<>p_fence OR c.state<>'running' OR c.lease_until<=now() THEN RAISE EXCEPTION 'Stale command lease'; END IF;
 IF p_step NOT IN ('campaign','adset','creative','ad') OR coalesce(p_result->>'state','') NOT IN ('sending','done','failed','uncertain') THEN RAISE EXCEPTION 'Invalid step'; END IF;
 IF c.steps->p_step->>'state'='done' THEN RAISE EXCEPTION 'Confirmed step immutable'; END IF;
 IF p_result->>'state'='sending' AND c.steps->p_step->>'state' IN ('sending','uncertain') THEN RAISE EXCEPTION 'Cannot repeat uncertain write'; END IF;
 UPDATE public.meta_ad_commands SET steps=jsonb_set(steps,ARRAY[p_step],p_result),updated_at=now() WHERE id=c.id RETURNING * INTO c;
 INSERT INTO public.meta_ad_command_events(command_id,actor_id,stage,detail) VALUES(c.id,p_actor,p_step,jsonb_build_object('state',p_result->>'state','id',p_result->>'id','error',p_result->>'error'));
 RETURN c;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_ad_command_finish(p_id uuid,p_worker uuid,p_fence integer,p_state text,p_error text,p_actor uuid) RETURNS public.meta_ad_commands LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.meta_ad_commands;v_done integer;
BEGIN
 SELECT * INTO c FROM public.meta_ad_commands WHERE id=p_id FOR UPDATE;
 PERFORM public.meta_ads_assert_action(p_actor,c.imobiliaria,CASE c.kind WHEN 'create_paused' THEN 'send_paused' WHEN 'set_delivery' THEN 'set_delivery' WHEN 'change_budget' THEN 'change_budget' ELSE 'invalid' END);
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
CREATE OR REPLACE FUNCTION public.meta_ad_command_reconcile(p_id uuid,p_step text,p_result jsonb,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.meta_ad_commands;
BEGIN
 SELECT * INTO c FROM public.meta_ad_commands WHERE id=p_id FOR UPDATE;
 PERFORM public.meta_ads_assert_action(p_actor,c.imobiliaria,CASE c.kind WHEN 'create_paused' THEN 'send_paused' WHEN 'set_delivery' THEN 'set_delivery' WHEN 'change_budget' THEN 'change_budget' ELSE 'invalid' END);
 IF c.state NOT IN ('uncertain','partial','failed','running') OR (c.state='running' AND c.lease_until>now()) THEN RAISE EXCEPTION 'Command cannot reconcile'; END IF;
 IF p_step NOT IN ('campaign','adset','creative','ad') OR coalesce(c.steps->p_step->>'state','') NOT IN ('sending','uncertain') OR coalesce(p_result->>'state','')<>'done' OR coalesce(p_result->>'id','') !~ '^[0-9]{1,80}$' THEN RAISE EXCEPTION 'Reconciliation invalid'; END IF;
 UPDATE public.meta_ad_commands SET steps=jsonb_set(steps,ARRAY[p_step],p_result),state='partial',worker_id=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=c.id;
 UPDATE public.meta_ad_drafts SET status='parcial',updated_at=now() WHERE id=c.draft_id;
 INSERT INTO public.meta_ad_command_events(command_id,actor_id,stage,detail) VALUES(c.id,p_actor,'reconciled',jsonb_build_object('step',p_step,'id',p_result->>'id'));
END $$;
