-- Explicit action grants; reviewer restrictions dominate combined roles.
-- No credentials, external writes, cron edits or historical data rewrites.
CREATE OR REPLACE FUNCTION public.marketing_actor_can_act(p_actor uuid,p_action text,p_agency text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_actor IS NOT NULL
 AND p_action=ANY(ARRAY['read_metrics','read_lead_contacts','manage_leads','create_draft','send_paused','change_budget','set_delivery','generate_report','financial_report','manage_connection','manage_manual'])
 AND (p_agency IS NULL OR p_agency=ANY(ARRAY['cordial','morar']))
 AND CASE WHEN EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text='meta_reviewer')
 THEN p_action='read_metrics' AND (p_agency IS NULL OR public.has_notification_agency_access(p_actor,p_agency))
 ELSE public.has_role(p_actor,'admin') OR (
   public.has_role(p_actor,'secretaria') AND NOT public.has_role(p_actor,'financeiro')
   AND p_action=ANY(ARRAY['read_metrics','read_lead_contacts','manage_leads','create_draft','generate_report','manage_manual'])
   AND (p_agency IS NULL OR public.has_notification_agency_access(p_actor,p_agency))) END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.marketing_actor_can_act(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_actor_can_act(uuid,text,text) TO service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.marketing_can_act(p_action text,p_agency text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.marketing_actor_can_act(auth.uid(),p_action,p_agency)
$$;
REVOKE ALL ON FUNCTION public.marketing_can_act(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_can_act(text,text) TO authenticated,service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.marketing_can_operate(p_agency text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.marketing_can_act('manage_manual',p_agency)
$$;
CREATE OR REPLACE FUNCTION public.marketing_can_read(p_agency text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.marketing_can_act('read_metrics',p_agency)
$$;
REVOKE ALL ON FUNCTION public.marketing_can_read(text),public.marketing_can_operate(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_can_read(text),public.marketing_can_operate(text) TO authenticated,service_role;
--> statement-breakpoint
-- Sanitized SECURITY DEFINER RPCs are the sole reviewer data surface. A mixed
-- administrator/reviewer identity cannot fall through a permissive admin policy.
DO $$ DECLARE t record; predicate text;
BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
 LOOP
   predicate:=CASE WHEN t.relname='profiles' THEN 'NOT public.is_meta_reviewer() OR id=auth.uid()'
     WHEN t.relname IN ('user_roles','user_agencies') THEN 'NOT public.is_meta_reviewer() OR user_id=auth.uid()'
     ELSE 'NOT public.is_meta_reviewer()' END;
   EXECUTE format('DROP POLICY IF EXISTS meta_reviewer_block ON public.%I',t.relname);
   EXECUTE format('CREATE POLICY meta_reviewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (NOT public.is_meta_reviewer())',t.relname,predicate);
   IF t.relname IN ('profiles','user_roles','user_agencies') THEN
     EXECUTE format('DROP POLICY IF EXISTS meta_reviewer_delete_block ON public.%I',t.relname);
     EXECUTE format('CREATE POLICY meta_reviewer_delete_block ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_meta_reviewer())',t.relname);
   END IF;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.marketing_campaigns_safe(p_imobiliaria text DEFAULT NULL,p_since date DEFAULT NULL,p_until date DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 50,p_search text DEFAULT NULL,p_platform text DEFAULT NULL,p_status text DEFAULT NULL,p_campaign_id uuid DEFAULT NULL,p_account_id text DEFAULT NULL,p_current_since date DEFAULT NULL,p_previous_until date DEFAULT NULL,p_owned_only boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; financial boolean:=public.marketing_can_act('financial_report'); reviewer boolean:=public.is_meta_reviewer();
BEGIN
 IF NOT public.marketing_can_act('read_metrics') THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 WITH filtered AS(
 SELECT c.*,a.currency,a.timezone FROM public.marketing_campaigns c LEFT JOIN public.ad_accounts a ON a.id=c.ad_account_id
 WHERE (NOT p_owned_only OR c.user_id=auth.uid()) AND (p_campaign_id IS NULL OR c.id=p_campaign_id) AND public.marketing_can_read(c.imobiliaria) AND (NOT reviewer OR c.platform='meta') AND (p_imobiliaria IS NULL OR c.imobiliaria=p_imobiliaria)
 AND (p_since IS NULL OR c.data_fim>=p_since) AND (p_until IS NULL OR c.data_inicio<=p_until)
 AND (p_account_id IS NULL OR c.external_account_id=p_account_id) AND (reviewer OR p_search IS NULL OR c.nome ILIKE '%'||left(p_search,200)||'%') AND (p_platform IS NULL OR c.platform=p_platform OR(p_platform='manual' AND c.platform IS NULL)) AND (p_status IS NULL OR c.status=p_status)),
 paged AS(SELECT * FROM filtered ORDER BY data_inicio DESC,id LIMIT greatest(1,least(p_page_size,100)) OFFSET (greatest(1,p_page)-1)*greatest(1,least(p_page_size,100))),
 rendered AS(SELECT jsonb_build_object('id',c.id,'user_id',CASE WHEN reviewer THEN NULL ELSE c.user_id END,'imobiliaria',c.imobiliaria,'nome',CASE WHEN reviewer THEN 'Campanha Meta · '||right(c.id::text,6) ELSE c.nome END,'canal',c.canal,'objetivo',c.objetivo,'status',c.status,'data_inicio',c.data_inicio,'data_fim',c.data_fim,'responsavel',CASE WHEN reviewer THEN NULL ELSE c.responsavel END,'observacoes',CASE WHEN reviewer THEN NULL ELSE c.observacoes END,'diagnostico',CASE WHEN financial THEN c.diagnostico ELSE NULL END,'referencia_url',CASE WHEN reviewer THEN NULL ELSE c.referencia_url END,'leads_esperados',c.leads_esperados,'created_at',c.created_at,'updated_at',c.updated_at,'platform',c.platform,'external_campaign_id',c.external_campaign_id,'external_account_id',c.external_account_id,'source_url',CASE
 WHEN c.external_campaign_id~'^[0-9]{1,80}$' AND regexp_replace(c.external_account_id,'^act_','')~'^[0-9]{1,80}$' AND c.platform='meta'
 THEN 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act='||regexp_replace(c.external_account_id,'^act_','')||'&selected_campaign_ids='||c.external_campaign_id
 WHEN c.external_campaign_id~'^[0-9]{1,80}$' AND regexp_replace(c.external_account_id,'^act_','')~'^[0-9]{1,80}$' AND c.platform='google'
 THEN 'https://ads.google.com/aw/campaigns?__e='||regexp_replace(c.external_account_id,'^act_','')||'&campaignId='||c.external_campaign_id
 ELSE NULL END,'last_synced_at',c.last_synced_at,'sync_status',c.sync_status,'connection_id',c.connection_id,'ad_account_id',c.ad_account_id,'currency',c.currency,'timezone',c.timezone) || jsonb_build_object('investimento',CASE WHEN financial THEN c.investimento ELSE NULL END,
 'sync_error',CASE WHEN c.sync_error IS NULL THEN NULL ELSE 'Falha de sincronização. Consulte o diagnóstico.' END,
 'period_insights',CASE WHEN c.period_insights->>'since'=coalesce(p_current_since,p_since)::text AND c.period_insights->>'until'=p_until::text THEN CASE WHEN financial THEN c.period_insights ELSE jsonb_build_object('since',c.period_insights->'since','until',c.period_insights->'until','reach',c.period_insights->'reach','frequency',c.period_insights->'frequency','currency',c.period_insights->'currency','timezone',c.period_insights->'timezone','account_id',c.period_insights->'account_id','has_data',c.period_insights->'has_data') END ELSE NULL END,
 'daily_metrics',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'campaign_id',d.campaign_id,'user_id',CASE WHEN reviewer THEN NULL ELSE d.user_id END,'data',d.data,'leads',d.leads,'clicks',d.clicks,'accesses',d.accesses,'views',d.views,'impressions',d.impressions,'reach',NULL,'frequency',NULL,'ctr',d.ctr,'conversions',d.conversions,'metric_source',d.metric_source,'lead_action_type',d.lead_action_type,'landing_page_views',d.landing_page_views)||jsonb_build_object('investimento',CASE WHEN financial THEN d.investimento ELSE NULL END,'spend',CASE WHEN financial THEN d.spend ELSE NULL END,'cpc',CASE WHEN financial THEN d.cpc ELSE NULL END,'cpm',CASE WHEN financial THEN d.cpm ELSE NULL END) ORDER BY d.data)
 FROM public.marketing_daily_metrics d WHERE d.campaign_id=c.id AND (NOT p_owned_only OR d.user_id=auth.uid()) AND (p_since IS NULL OR d.data>=p_since) AND (p_until IS NULL OR d.data<=p_until)),'[]'::jsonb)) AS value FROM paged c)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(value) FROM rendered),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'financial_visible',financial,
 'summary',jsonb_build_object('current',public.marketing_summary_for_period(ARRAY(SELECT id FROM filtered),coalesce(p_current_since,p_since),p_until,financial,p_owned_only),'previous',CASE WHEN p_previous_until IS NOT NULL THEN public.marketing_summary_for_period(ARRAY(SELECT id FROM filtered),p_since,p_previous_until,financial,p_owned_only) ELSE NULL END)) INTO result;
 RETURN result;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.ad_connections_public() RETURNS TABLE(id uuid,user_id uuid,imobiliaria text,platform text,account_label text,expires_at timestamptz,scopes text,status text,last_error text,updated_at timestamptz,credential_mode text,app_id text,page_id text,external_account_id text,capabilities jsonb,last_diagnosed_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.id,CASE WHEN public.is_meta_reviewer() THEN NULL ELSE c.user_id END,c.imobiliaria,c.platform,CASE WHEN public.is_meta_reviewer() THEN 'Meta Ads' ELSE c.account_label END,c.expires_at,c.scopes,c.status,
 CASE WHEN c.last_error IS NULL THEN NULL ELSE 'Falha na conexão. Execute o diagnóstico.' END,c.updated_at,c.credential_mode,c.app_id,c.page_id,c.external_account_id,c.capabilities,c.last_diagnosed_at
 FROM public.ad_platform_connections c WHERE (public.marketing_can_act('manage_connection') OR (public.is_meta_reviewer() AND c.platform='meta' AND public.marketing_can_read(c.imobiliaria)))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_lead_assign(p_id uuid,p_broker_id uuid,p_actor_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;broker_name text;
BEGIN
 IF auth.uid() IS NOT NULL AND auth.uid()<>p_actor_id THEN RAISE EXCEPTION 'Actor mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id FOR UPDATE;
 IF s.attendance_id IS NULL OR s.status NOT IN ('unassigned','imported') THEN RAISE EXCEPTION 'Lead has no attendance'; END IF;
 IF NOT public.marketing_actor_can_act(p_actor_id,'manage_leads',s.imobiliaria) THEN RAISE EXCEPTION 'Actor outside agency'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_broker_id AND role::text='meta_reviewer') OR NOT public.has_role(p_broker_id,'corretor') OR NOT public.has_notification_agency_access(p_broker_id,s.imobiliaria) THEN RAISE EXCEPTION 'Broker outside agency'; END IF;
 SELECT nome INTO broker_name FROM public.profiles WHERE id=p_broker_id;
 -- Never overwrite another assignment; reassign through the existing attendance flow.
 UPDATE public.attendances SET corretor_id=p_broker_id::text,corretor_nome=broker_name WHERE id=s.attendance_id AND imobiliaria=s.imobiliaria AND corretor_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attendance already assigned'; END IF;
 UPDATE public.meta_lead_submissions SET broker_id=p_broker_id,status='imported',updated_at=now() WHERE id=s.id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_lead_resolve(p_id uuid,p_attendance_id uuid,p_actor_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;a public.attendances;
BEGIN
 IF auth.uid() IS NOT NULL AND auth.uid()<>p_actor_id THEN RAISE EXCEPTION 'Actor mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id FOR UPDATE;
 SELECT * INTO a FROM public.attendances WHERE id=p_attendance_id FOR SHARE;
 IF s.id IS NULL OR a.id IS NULL OR s.privacy_deleted_at IS NOT NULL OR s.status<>'review' OR s.attendance_id IS NOT NULL OR s.imobiliaria IS DISTINCT FROM a.imobiliaria THEN RAISE EXCEPTION 'Incompatible attendance'; END IF;
 IF NOT public.marketing_actor_can_act(p_actor_id,'manage_leads',s.imobiliaria) THEN RAISE EXCEPTION 'Actor outside agency'; END IF;
 UPDATE public.meta_lead_submissions SET attendance_id=a.id,client_id=a.cliente_id,broker_id=public._try_uuid(a.corretor_id),status=CASE WHEN a.corretor_id IS NULL THEN 'unassigned' ELSE 'imported' END,last_error=NULL,completed_at=now(),updated_at=now() WHERE id=s.id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.meta_lead_assign(uuid,uuid,uuid),public.meta_lead_resolve(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_lead_assign(uuid,uuid,uuid),public.meta_lead_resolve(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON public.ad_platform_connections,public.marketing_campaigns,public.marketing_daily_metrics,public.ad_accounts,public.ad_sync_jobs,public.meta_lead_submissions,public.meta_lead_form_mappings FROM PUBLIC,anon,authenticated;
