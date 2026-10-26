-- Meta credentials are references/encrypted server values; this migration never reads Vault.
ALTER TABLE public.ad_platform_connections
 ADD COLUMN IF NOT EXISTS credential_mode text NOT NULL DEFAULT 'legacy' CHECK(credential_mode IN ('legacy','oauth','system_user')),
 ADD COLUMN IF NOT EXISTS credential_ref text,
 ADD COLUMN IF NOT EXISTS page_credential_ref text,
 ADD COLUMN IF NOT EXISTS app_secret_ref text,
 ADD COLUMN IF NOT EXISTS encrypted_access_token text,
 ADD COLUMN IF NOT EXISTS encrypted_refresh_token text,
 ADD COLUMN IF NOT EXISTS app_id text,
 ADD COLUMN IF NOT EXISTS page_id text,
 ADD COLUMN IF NOT EXISTS external_account_id text,
 ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS last_diagnosed_at timestamptz;
--> statement-breakpoint

REVOKE ALL ON public.ad_platform_connections FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

DROP INDEX IF EXISTS public.ad_platform_connections_user_platform_idx;
--> statement-breakpoint

CREATE UNIQUE INDEX ad_platform_connections_oauth_identity_idx ON public.ad_platform_connections(user_id,platform,coalesce(imobiliaria,'')) WHERE credential_mode<>'system_user';
--> statement-breakpoint

CREATE UNIQUE INDEX ad_platform_connections_system_identity_idx ON public.ad_platform_connections(platform,imobiliaria,external_account_id) WHERE credential_mode='system_user';
--> statement-breakpoint

ALTER TABLE public.marketing_campaigns
 ADD COLUMN IF NOT EXISTS connection_id uuid REFERENCES public.ad_platform_connections(id),
 ADD COLUMN IF NOT EXISTS ad_account_id uuid REFERENCES public.ad_accounts(id),
 ADD COLUMN IF NOT EXISTS period_insights jsonb;
--> statement-breakpoint

ALTER TABLE public.marketing_daily_metrics
 ADD COLUMN IF NOT EXISTS metric_source text NOT NULL DEFAULT 'manual' CHECK(metric_source IN ('manual','synced')),
 ADD COLUMN IF NOT EXISTS provider_actions jsonb,
 ADD COLUMN IF NOT EXISTS lead_action_type text,
 ADD COLUMN IF NOT EXISTS landing_page_views numeric;
--> statement-breakpoint

UPDATE public.marketing_daily_metrics d SET metric_source='synced'
 FROM public.marketing_campaigns c WHERE c.id=d.campaign_id AND c.platform IS NOT NULL;
--> statement-breakpoint

-- Legacy identities are retained for explicit reconciliation, never assigned to a brand heuristically.
DROP INDEX IF EXISTS public.marketing_campaigns_external_uidx;
--> statement-breakpoint

CREATE UNIQUE INDEX marketing_campaigns_external_identity_uidx ON public.marketing_campaigns
 (imobiliaria,platform,external_account_id,external_campaign_id) WHERE connection_id IS NOT NULL AND external_campaign_id IS NOT NULL;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.ad_campaign_scope_check() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.connection_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM public.ad_platform_connections c JOIN public.ad_accounts a ON a.connection_id=c.id
 WHERE c.id=NEW.connection_id AND c.platform=NEW.platform AND c.imobiliaria=NEW.imobiliaria
 AND a.id=NEW.ad_account_id AND a.external_account_id=NEW.external_account_id) THEN
 RAISE EXCEPTION 'Campaign connection/account/agency mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER ad_campaign_scope_check BEFORE INSERT OR UPDATE ON public.marketing_campaigns FOR EACH ROW EXECUTE FUNCTION public.ad_campaign_scope_check();
--> statement-breakpoint


CREATE TABLE public.ad_oauth_states(nonce_hash text PRIMARY KEY,user_id uuid NOT NULL,platform text NOT NULL CHECK(platform IN ('meta','google')),imobiliaria text,expires_at timestamptz NOT NULL,used_at timestamptz);
--> statement-breakpoint

ALTER TABLE public.ad_oauth_states ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL ON public.ad_oauth_states FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT ALL ON public.ad_oauth_states TO service_role;
--> statement-breakpoint

CREATE FUNCTION public.ad_oauth_consume(p_nonce_hash text,p_user_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH consumed AS(UPDATE public.ad_oauth_states SET used_at=now() WHERE nonce_hash=p_nonce_hash AND user_id=p_user_id AND used_at IS NULL AND expires_at>now() RETURNING 1) SELECT EXISTS(SELECT 1 FROM consumed)
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.ad_oauth_consume(text,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.ad_oauth_consume(text,uuid) TO service_role;
--> statement-breakpoint


ALTER TABLE public.ad_sync_jobs DROP CONSTRAINT IF EXISTS ad_sync_jobs_status_check;
--> statement-breakpoint

ALTER TABLE public.ad_sync_jobs ADD CONSTRAINT ad_sync_jobs_status_check CHECK(status IN ('queued','running','done','error','partial','cancelled'));
--> statement-breakpoint

ALTER TABLE public.ad_sync_jobs ADD COLUMN IF NOT EXISTS worker_id uuid,ADD COLUMN IF NOT EXISTS lease_until timestamptz,ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN IF NOT EXISTS requested_by uuid,ADD COLUMN IF NOT EXISTS checkpoint jsonb;
--> statement-breakpoint

UPDATE public.ad_sync_jobs SET status='error',error='legacy_interrupted',finished_at=now() WHERE status='running';
--> statement-breakpoint

CREATE UNIQUE INDEX ad_sync_active_uidx ON public.ad_sync_jobs(campaign_id) WHERE status IN ('queued','running');
--> statement-breakpoint

-- One running lease per connection/account, even across separate worker requests.
ALTER TABLE public.ad_sync_jobs ADD COLUMN ad_account_id uuid REFERENCES public.ad_accounts(id);
--> statement-breakpoint

UPDATE public.ad_sync_jobs j SET ad_account_id=c.ad_account_id FROM public.marketing_campaigns c WHERE c.id=j.campaign_id;
--> statement-breakpoint

CREATE UNIQUE INDEX marketing_campaigns_id_account_uidx ON public.marketing_campaigns(id,ad_account_id);
--> statement-breakpoint

ALTER TABLE public.ad_sync_jobs ADD CONSTRAINT ad_sync_jobs_campaign_account_fkey FOREIGN KEY(campaign_id,ad_account_id) REFERENCES public.marketing_campaigns(id,ad_account_id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE public.ad_sync_jobs ADD CONSTRAINT ad_sync_jobs_active_account_check CHECK(status NOT IN ('queued','running') OR ad_account_id IS NOT NULL);
--> statement-breakpoint

ALTER TABLE public.ad_sync_jobs ADD CONSTRAINT ad_sync_jobs_running_lease_check CHECK(status<>'running' OR(worker_id IS NOT NULL AND lease_until IS NOT NULL));
--> statement-breakpoint

CREATE UNIQUE INDEX ad_sync_running_account_uidx ON public.ad_sync_jobs(ad_account_id) WHERE status='running';
--> statement-breakpoint


CREATE FUNCTION public.ad_sync_enqueue(p_campaign_id uuid,p_range_start date,p_range_end date,p_requested_by uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;v_account_id uuid;
BEGIN
 SELECT ad_account_id INTO v_account_id FROM public.marketing_campaigns WHERE id=p_campaign_id AND connection_id IS NOT NULL;
 IF v_account_id IS NULL THEN RAISE EXCEPTION 'Campaign connection/account missing'; END IF;
 IF p_range_start IS NULL OR p_range_end IS NULL OR p_range_start>p_range_end OR p_range_end-p_range_start>366 THEN RAISE EXCEPTION 'Invalid date range'; END IF;
 INSERT INTO public.ad_sync_jobs(campaign_id,ad_account_id,status,range_start,range_end,requested_by)
 VALUES(p_campaign_id,v_account_id,'queued',p_range_start,p_range_end,p_requested_by) ON CONFLICT(campaign_id) WHERE status IN ('queued','running') DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM public.ad_sync_jobs WHERE campaign_id=p_campaign_id AND status IN ('queued','running'); END IF;
 UPDATE public.marketing_campaigns SET sync_status='queued',sync_error=NULL WHERE id=p_campaign_id AND result IS NOT NULL;
 RETURN result;
END $$;
--> statement-breakpoint

CREATE FUNCTION public.ad_sync_claim(p_worker_id uuid,p_limit integer DEFAULT 2) RETURNS SETOF public.ad_sync_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_account record;v_job public.ad_sync_jobs;
BEGIN
 IF p_worker_id IS NULL THEN RAISE EXCEPTION 'Worker identifier required'; END IF;
 WITH exhausted AS(UPDATE public.ad_sync_jobs SET status='error',error='attempts_exhausted',finished_at=now(),worker_id=NULL,lease_until=NULL WHERE attempts>=8 AND status='running' AND lease_until<now() RETURNING campaign_id)
 UPDATE public.marketing_campaigns SET sync_status='error',sync_error='attempts_exhausted' WHERE id IN(SELECT campaign_id FROM exhausted);
 -- Lock the stable account row before choosing a job; SKIP LOCKED excludes a
 -- concurrent claimant. The partial unique index is a second database invariant.
 FOR v_account IN SELECT a.id FROM public.ad_accounts a
 WHERE EXISTS(SELECT 1 FROM public.ad_sync_jobs j WHERE j.ad_account_id=a.id AND j.attempts<8 AND((j.status='queued' AND j.next_attempt_at<=now()) OR(j.status='running' AND j.lease_until<now())))
 AND NOT EXISTS(SELECT 1 FROM public.ad_sync_jobs j WHERE j.ad_account_id=a.id AND j.status='running' AND j.lease_until>=now())
 ORDER BY a.id FOR UPDATE OF a SKIP LOCKED LIMIT greatest(1,least(coalesce(p_limit,2),5)) LOOP
 SELECT * INTO v_job FROM public.ad_sync_jobs j WHERE j.ad_account_id=v_account.id AND j.attempts<8
 AND((j.status='queued' AND j.next_attempt_at<=now()) OR(j.status='running' AND j.lease_until<now()))
 ORDER BY (j.status='running') DESC,j.next_attempt_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF FOUND THEN
 UPDATE public.ad_sync_jobs SET status='running',worker_id=p_worker_id,lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE id=v_job.id RETURNING * INTO v_job;
 RETURN NEXT v_job;
 END IF;
 END LOOP;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.ad_sync_enqueue(uuid,date,date,uuid),public.ad_sync_claim(uuid,integer) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.ad_sync_enqueue(uuid,date,date,uuid),public.ad_sync_claim(uuid,integer) TO service_role;
--> statement-breakpoint


-- A sanitized RPC is the only authenticated read path for campaign and metric data.
REVOKE ALL ON public.marketing_campaigns,public.marketing_daily_metrics,public.ad_sync_jobs,public.ad_accounts FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

CREATE FUNCTION public.marketing_can_operate(p_agency text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'secretaria') AND NOT public.has_role(auth.uid(),'financeiro') AND public.has_notification_agency_access(auth.uid(),p_agency)))
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.marketing_can_operate(text) FROM PUBLIC,anon;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.marketing_can_operate(text) TO authenticated,service_role;
--> statement-breakpoint

-- Full-scope summary; unallocated manual campaign totals never become monthly spend.
CREATE FUNCTION public.marketing_summary_for_period(p_ids uuid[],p_since date,p_until date,p_financial boolean,p_owned_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH scoped AS(SELECT c.*,coalesce(a.currency,CASE WHEN c.platform IS NULL THEN 'BRL' ELSE 'unknown' END) currency
 FROM public.marketing_campaigns c LEFT JOIN public.ad_accounts a ON a.id=c.ad_account_id
 WHERE c.id=ANY(p_ids) AND (NOT p_owned_only OR c.user_id=auth.uid()) AND (p_since IS NULL OR c.data_fim>=p_since) AND (p_until IS NULL OR c.data_inicio<=p_until)),
 measured AS(SELECT c.*,d.days,d.leads,d.clicks,d.impressions,
 CASE WHEN d.days>0 THEN d.spend WHEN c.platform IS NULL AND (p_since IS NULL OR c.data_inicio>=p_since) AND (p_until IS NULL OR c.data_fim<=p_until) THEN c.investimento ELSE NULL END period_spend
 FROM scoped c LEFT JOIN LATERAL(SELECT count(*) days,sum(leads) leads,sum(clicks) clicks,sum(impressions) impressions,sum(CASE WHEN metric_source='synced' THEN spend ELSE investimento END) spend FROM public.marketing_daily_metrics WHERE campaign_id=c.id AND(NOT p_owned_only OR user_id=auth.uid()) AND(p_since IS NULL OR data>=p_since) AND(p_until IS NULL OR data<=p_until)) d ON true)
 SELECT jsonb_build_object('spend',CASE WHEN p_financial AND count(*)>0 AND count(DISTINCT currency)=1 AND min(currency)<>'unknown' AND count(period_spend)=count(*) THEN sum(period_spend) ELSE NULL END,
 'leads',coalesce(sum(leads),0),'clicks',coalesce(sum(clicks),0),'impressions',coalesce(sum(impressions),0),'active_campaigns',count(*) FILTER(WHERE status='Ativa'),
 'currencies',coalesce(jsonb_agg(DISTINCT currency),'[]'::jsonb),'has_data',coalesce(bool_or(days>0 OR(platform IS NULL AND period_spend IS NOT NULL)),false)) FROM measured
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.marketing_summary_for_period(uuid[],date,date,boolean,boolean) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.marketing_summary_for_period(uuid[],date,date,boolean,boolean) TO service_role;
--> statement-breakpoint

CREATE FUNCTION public.marketing_campaigns_safe(p_imobiliaria text DEFAULT NULL,p_since date DEFAULT NULL,p_until date DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 50,p_search text DEFAULT NULL,p_platform text DEFAULT NULL,p_status text DEFAULT NULL,p_campaign_id uuid DEFAULT NULL,p_account_id text DEFAULT NULL,p_current_since date DEFAULT NULL,p_previous_until date DEFAULT NULL,p_owned_only boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; financial boolean:=public.has_role(auth.uid(),'admin');
BEGIN
 IF auth.uid() IS NULL OR NOT (financial OR(public.has_role(auth.uid(),'secretaria') AND NOT public.has_role(auth.uid(),'financeiro'))) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 WITH filtered AS(
 SELECT c.*,a.currency,a.timezone FROM public.marketing_campaigns c LEFT JOIN public.ad_accounts a ON a.id=c.ad_account_id
 WHERE (NOT p_owned_only OR c.user_id=auth.uid()) AND (p_campaign_id IS NULL OR c.id=p_campaign_id) AND public.marketing_can_operate(c.imobiliaria) AND (p_imobiliaria IS NULL OR c.imobiliaria=p_imobiliaria)
 AND (p_since IS NULL OR c.data_fim>=p_since) AND (p_until IS NULL OR c.data_inicio<=p_until)
 AND (p_account_id IS NULL OR c.external_account_id=p_account_id) AND (p_search IS NULL OR c.nome ILIKE '%'||left(p_search,200)||'%') AND (p_platform IS NULL OR c.platform=p_platform OR(p_platform='manual' AND c.platform IS NULL)) AND (p_status IS NULL OR c.status=p_status)),
 paged AS(SELECT * FROM filtered ORDER BY data_inicio DESC,id LIMIT greatest(1,least(p_page_size,100)) OFFSET (greatest(1,p_page)-1)*greatest(1,least(p_page_size,100))),
 rendered AS(SELECT jsonb_build_object('id',c.id,'user_id',c.user_id,'imobiliaria',c.imobiliaria,'nome',c.nome,'canal',c.canal,'objetivo',c.objetivo,'status',c.status,'data_inicio',c.data_inicio,'data_fim',c.data_fim,'responsavel',c.responsavel,'observacoes',c.observacoes,'diagnostico',CASE WHEN financial THEN c.diagnostico ELSE NULL END,'referencia_url',c.referencia_url,'leads_esperados',c.leads_esperados,'created_at',c.created_at,'updated_at',c.updated_at,'platform',c.platform,'external_campaign_id',c.external_campaign_id,'external_account_id',c.external_account_id,'source_url',CASE
 WHEN c.external_campaign_id~'^[0-9]{1,80}$' AND regexp_replace(c.external_account_id,'^act_','')~'^[0-9]{1,80}$' AND c.platform='meta'
 THEN 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act='||regexp_replace(c.external_account_id,'^act_','')||'&selected_campaign_ids='||c.external_campaign_id
 WHEN c.external_campaign_id~'^[0-9]{1,80}$' AND regexp_replace(c.external_account_id,'^act_','')~'^[0-9]{1,80}$' AND c.platform='google'
 THEN 'https://ads.google.com/aw/campaigns?__e='||regexp_replace(c.external_account_id,'^act_','')||'&campaignId='||c.external_campaign_id
 ELSE NULL END,'last_synced_at',c.last_synced_at,'sync_status',c.sync_status,'connection_id',c.connection_id,'ad_account_id',c.ad_account_id,'currency',c.currency,'timezone',c.timezone) || jsonb_build_object('investimento',CASE WHEN financial THEN c.investimento ELSE NULL END,
 'sync_error',CASE WHEN c.sync_error IS NULL THEN NULL ELSE 'Falha de sincronização. Consulte o diagnóstico.' END,
 'period_insights',CASE WHEN c.period_insights->>'since'=coalesce(p_current_since,p_since)::text AND c.period_insights->>'until'=p_until::text THEN CASE WHEN financial THEN c.period_insights ELSE jsonb_build_object('since',c.period_insights->'since','until',c.period_insights->'until','reach',c.period_insights->'reach','frequency',c.period_insights->'frequency','currency',c.period_insights->'currency','timezone',c.period_insights->'timezone','account_id',c.period_insights->'account_id') END ELSE NULL END,
 'daily_metrics',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'campaign_id',d.campaign_id,'user_id',d.user_id,'data',d.data,'leads',d.leads,'clicks',d.clicks,'accesses',d.accesses,'views',d.views,'impressions',d.impressions,'reach',NULL,'frequency',NULL,'ctr',d.ctr,'conversions',d.conversions,'metric_source',d.metric_source,'lead_action_type',d.lead_action_type,'landing_page_views',d.landing_page_views)||jsonb_build_object('investimento',CASE WHEN financial THEN d.investimento ELSE NULL END,'spend',CASE WHEN financial THEN d.spend ELSE NULL END,'cpc',CASE WHEN financial THEN d.cpc ELSE NULL END,'cpm',CASE WHEN financial THEN d.cpm ELSE NULL END) ORDER BY d.data)
 FROM public.marketing_daily_metrics d WHERE d.campaign_id=c.id AND (NOT p_owned_only OR d.user_id=auth.uid()) AND (p_since IS NULL OR d.data>=p_since) AND (p_until IS NULL OR d.data<=p_until)),'[]'::jsonb)) AS value FROM paged c)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(value) FROM rendered),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'financial_visible',financial,
 'summary',jsonb_build_object('current',public.marketing_summary_for_period(ARRAY(SELECT id FROM filtered),coalesce(p_current_since,p_since),p_until,financial,p_owned_only),'previous',CASE WHEN p_previous_until IS NOT NULL THEN public.marketing_summary_for_period(ARRAY(SELECT id FROM filtered),p_since,p_previous_until,financial,p_owned_only) ELSE NULL END)) INTO result;
 RETURN result;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.marketing_campaigns_safe(text,date,date,integer,integer,text,text,text,uuid,text,date,date,boolean) FROM PUBLIC,anon;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.marketing_campaigns_safe(text,date,date,integer,integer,text,text,text,uuid,text,date,date,boolean) TO authenticated;
--> statement-breakpoint

DROP FUNCTION public.ad_connections_public();
--> statement-breakpoint

CREATE FUNCTION public.ad_connections_public() RETURNS TABLE(id uuid,user_id uuid,imobiliaria text,platform text,account_label text,expires_at timestamptz,scopes text,status text,last_error text,updated_at timestamptz,credential_mode text,app_id text,page_id text,external_account_id text,capabilities jsonb,last_diagnosed_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.id,c.user_id,c.imobiliaria,c.platform,c.account_label,c.expires_at,c.scopes,c.status,
 CASE WHEN c.last_error IS NULL THEN NULL ELSE 'Falha na conexão. Execute o diagnóstico.' END,c.updated_at,c.credential_mode,c.app_id,c.page_id,c.external_account_id,c.capabilities,c.last_diagnosed_at
 FROM public.ad_platform_connections c WHERE public.has_role(auth.uid(),'admin')
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.ad_connections_public() FROM PUBLIC,anon;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.ad_connections_public() TO authenticated;
--> statement-breakpoint


-- Only explicitly mapped forms may create operational CRM records.
CREATE TABLE public.meta_lead_form_mappings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL REFERENCES public.ad_platform_connections(id),app_id text NOT NULL,page_id text NOT NULL,form_id text NOT NULL,
 imobiliaria text NOT NULL CHECK(imobiliaria IN ('cordial','morar')),field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
 finalidade text CHECK(finalidade IN ('compra','aluguel','ambos')),tipo_imovel text CHECK(tipo_imovel IN ('casa','apartamento','kitnet','terreno','sala_comercial','area_rural','sitio_chacara','outro')),
 property_id uuid REFERENCES public.properties(id),broker_id uuid REFERENCES public.profiles(id),created_by uuid NOT NULL,enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,page_id,form_id));
--> statement-breakpoint

-- Identity is enforced by the index, including concurrent administrative saves.
CREATE UNIQUE INDEX meta_lead_form_identity_uidx ON public.meta_lead_form_mappings(app_id,page_id,form_id) WHERE enabled;
--> statement-breakpoint

CREATE TABLE public.meta_lead_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),app_id text NOT NULL,page_id text NOT NULL,leadgen_id text NOT NULL,form_id text,ad_id text,adset_id text,external_campaign_id text,
 connection_id uuid REFERENCES public.ad_platform_connections(id),imobiliaria text CHECK(imobiliaria IN ('cordial','morar')),campaign_id uuid REFERENCES public.marketing_campaigns(id),meta_created_at timestamptz,received_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL CHECK(status IN ('queued','processing','unassigned','imported','review','failed','quarantined')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),worker_id uuid,lease_until timestamptz,last_error text,
 full_name text,phone text,email text,field_data jsonb,broker_id uuid REFERENCES public.profiles(id),client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,attendance_id uuid REFERENCES public.attendances(id) ON DELETE SET NULL,
 completed_at timestamptz,privacy_deleted_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(app_id,page_id,leadgen_id));
--> statement-breakpoint

CREATE INDEX meta_lead_queue_idx ON public.meta_lead_submissions(next_attempt_at) WHERE status IN ('queued','processing');
--> statement-breakpoint

CREATE INDEX meta_lead_inbox_idx ON public.meta_lead_submissions(imobiliaria,received_at DESC);
--> statement-breakpoint

ALTER TABLE public.meta_lead_form_mappings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE public.meta_lead_submissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL ON public.meta_lead_form_mappings,public.meta_lead_submissions FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT ALL ON public.meta_lead_form_mappings,public.meta_lead_submissions TO service_role;
--> statement-breakpoint

-- No raw envelope/body retained: durable queue stores routing identifiers only.
CREATE FUNCTION public.meta_lead_ingest(p_app_id text,p_events jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb;c public.ad_platform_connections;inserted integer:=0;affected integer;v_mapping_count integer;
BEGIN
 IF jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>1000 THEN RAISE EXCEPTION 'Invalid event envelope'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
 c:=NULL;
 SELECT * INTO c FROM public.ad_platform_connections WHERE platform='meta' AND app_id=p_app_id AND page_id=e->>'page_id' AND imobiliaria IN ('cordial','morar') ORDER BY id LIMIT 1;
 -- Ambiguous Page ownership is quarantined; per-form mapping resolves shared Pages.
 IF (SELECT count(*) FROM public.ad_platform_connections WHERE platform='meta' AND app_id=p_app_id AND page_id=e->>'page_id')>1 THEN
 SELECT count(*) INTO v_mapping_count FROM public.meta_lead_form_mappings m JOIN public.ad_platform_connections con ON con.id=m.connection_id
 WHERE m.app_id=p_app_id AND m.page_id=e->>'page_id' AND m.form_id=e->>'form_id' AND m.enabled
 AND con.platform='meta' AND con.app_id=m.app_id AND con.page_id=m.page_id AND con.imobiliaria=m.imobiliaria;
 IF v_mapping_count=1 THEN
 SELECT con.* INTO c FROM public.meta_lead_form_mappings m JOIN public.ad_platform_connections con ON con.id=m.connection_id
 WHERE m.app_id=p_app_id AND m.page_id=e->>'page_id' AND m.form_id=e->>'form_id' AND m.enabled
 AND con.platform='meta' AND con.app_id=m.app_id AND con.page_id=m.page_id AND con.imobiliaria=m.imobiliaria;
 ELSE c:=NULL; END IF;
 END IF;
 INSERT INTO public.meta_lead_submissions(app_id,page_id,leadgen_id,form_id,ad_id,adset_id,external_campaign_id,meta_created_at,connection_id,imobiliaria,status,last_error)
 VALUES(p_app_id,e->>'page_id',e->>'leadgen_id',e->>'form_id',e->>'ad_id',e->>'adset_id',e->>'campaign_id',nullif(e->>'created_time','')::timestamptz,c.id,c.imobiliaria,CASE WHEN c.id IS NULL THEN 'quarantined' ELSE 'queued' END,CASE WHEN c.id IS NULL THEN 'page_unknown_or_ambiguous' ELSE NULL END)
 ON CONFLICT(app_id,page_id,leadgen_id) DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;inserted:=inserted+affected;
 END LOOP;RETURN inserted;
END $$;
--> statement-breakpoint

CREATE FUNCTION public.meta_lead_claim(p_worker_id uuid,p_limit integer DEFAULT 5) RETURNS SETOF public.meta_lead_submissions LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH exhausted AS(UPDATE public.meta_lead_submissions SET status='failed',last_error='attempts_exhausted',worker_id=NULL,lease_until=NULL,updated_at=now() WHERE attempts>=8 AND status='processing' AND lease_until<now() RETURNING id), candidates AS(SELECT id FROM public.meta_lead_submissions WHERE attempts<8 AND ((status='queued' AND next_attempt_at<=now()) OR(status='processing' AND lease_until<now())) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,10)))
 UPDATE public.meta_lead_submissions s SET status='processing',worker_id=p_worker_id,lease_until=now()+interval '5 minutes',attempts=s.attempts+1,updated_at=now() FROM candidates c WHERE s.id=c.id RETURNING s.*
$$;
--> statement-breakpoint

-- Same Brazilian normalization as duplicate-detection.ts; retain non-Brazilian country codes.
CREATE FUNCTION public.meta_phone_identity(p_phone text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN length(d) IN (12,13) AND left(d,2)='55' THEN 'br:'||substr(d,3) WHEN btrim(p_phone) LIKE '+%' THEN 'international:'||d WHEN length(d) IN (10,11) THEN 'br:'||d ELSE 'unqualified:'||d END FROM (SELECT regexp_replace(p_phone,'[^0-9]','','g') d) n
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.meta_phone_identity(text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.meta_phone_identity(text) TO service_role;
--> statement-breakpoint

-- Contact advisory lock + row lease fence + CRM/link commit in one transaction.
CREATE FUNCTION public.meta_lead_complete(p_id uuid,p_worker_id uuid,p_fields jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;m public.meta_lead_form_mappings;v_name text;v_phone text;v_email text;contact_count integer;v_client uuid;v_attendance uuid;v_actor uuid;broker_name text;v_lock text;
BEGIN
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id FOR UPDATE;
 IF s.id IS NULL OR s.privacy_deleted_at IS NOT NULL OR s.status<>'processing' OR s.worker_id IS DISTINCT FROM p_worker_id OR s.lease_until<now() THEN RAISE EXCEPTION 'Stale lead lease'; END IF;
 v_name:=nullif(left(btrim(p_fields->>'full_name'),300),'');v_phone:=nullif(left(p_fields->>'phone',50),'');v_email:=nullif(left(lower(btrim(p_fields->>'email')),320),'');
 SELECT mapped.* INTO m FROM public.meta_lead_form_mappings mapped JOIN public.ad_platform_connections con ON con.id=mapped.connection_id WHERE mapped.connection_id=s.connection_id AND mapped.app_id=s.app_id AND mapped.page_id=s.page_id AND mapped.form_id=s.form_id AND mapped.enabled AND con.platform='meta' AND con.app_id=mapped.app_id AND con.page_id=mapped.page_id AND con.imobiliaria=mapped.imobiliaria;
 UPDATE public.meta_lead_submissions SET full_name=v_name,phone=v_phone,email=v_email,field_data=p_fields->'field_data',campaign_id=(SELECT id FROM public.marketing_campaigns WHERE connection_id=s.connection_id AND imobiliaria=s.imobiliaria AND external_campaign_id=s.external_campaign_id LIMIT 1),updated_at=now() WHERE id=s.id;
 IF m.id IS NULL OR v_name IS NULL OR (v_phone IS NULL AND v_email IS NULL) OR m.finalidade IS NULL OR m.tipo_imovel IS NULL THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='incomplete_fields_or_mapping',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 IF m.imobiliaria IS DISTINCT FROM s.imobiliaria THEN RAISE EXCEPTION 'Form agency mismatch'; END IF;
 IF m.property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=m.property_id AND(p.carteira=m.imobiliaria OR m.imobiliaria=ANY(p.publish_targets))) THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='property_outside_agency',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 -- Full normalized contact, never the weak last-8-digits helper for an automatic merge.
 FOR v_lock IN SELECT k FROM unnest(ARRAY[CASE WHEN v_phone IS NULL THEN NULL ELSE 'phone:'||public.meta_phone_identity(v_phone) END,CASE WHEN v_email IS NULL THEN NULL ELSE 'email:'||v_email END]) AS keys(k) WHERE k IS NOT NULL ORDER BY k LOOP
 PERFORM pg_advisory_xact_lock(hashtextextended(s.imobiliaria||':'||v_lock,0));
 END LOOP;
 SELECT count(*),(array_agg(id))[1] INTO contact_count,v_client FROM public.clients WHERE brand=s.imobiliaria AND ((v_phone IS NOT NULL AND public.meta_phone_identity(public.clients.phone)=public.meta_phone_identity(v_phone)) OR(v_email IS NOT NULL AND lower(public.clients.email)=v_email));
 IF contact_count=1 AND EXISTS(SELECT 1 FROM public.clients cl WHERE cl.id=v_client AND ((v_phone IS NOT NULL AND nullif(cl.phone,'') IS NOT NULL AND public.meta_phone_identity(cl.phone)<>public.meta_phone_identity(v_phone)) OR(v_email IS NOT NULL AND nullif(cl.email,'') IS NOT NULL AND lower(cl.email)<>v_email))) THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='conflicting_contact_details',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 IF contact_count>1 OR EXISTS(SELECT 1 FROM public.attendances a WHERE a.imobiliaria=s.imobiliaria AND ((v_phone IS NOT NULL AND public.meta_phone_identity(a.telefone)=public.meta_phone_identity(v_phone)) OR(v_email IS NOT NULL AND lower(a.email)=v_email)) AND a.status NOT IN ('fechado','perdido','arquivado')) THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='ambiguous_or_open_contact',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 SELECT user_id INTO v_actor FROM public.ad_platform_connections WHERE id=s.connection_id;
 IF v_actor IS NULL THEN RAISE EXCEPTION 'Integration actor missing'; END IF;
 IF m.broker_id IS NOT NULL THEN
 IF NOT public.has_role(m.broker_id,'corretor') OR NOT public.has_notification_agency_access(m.broker_id,s.imobiliaria) THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='broker_outside_agency',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 SELECT nome INTO broker_name FROM public.profiles WHERE id=m.broker_id;
 END IF;
 INSERT INTO public.attendances(created_by,imobiliaria,cliente_id,cliente_nome,telefone,email,contato_preferencial,origem,fonte_prospeccao,finalidade,tipo_imovel,corretor_id,corretor_nome,imovel_id,imovel_ref,prioridade,status,pipeline_stage,historico_inicial,interesse_descricao)
 VALUES(v_actor,s.imobiliaria,v_client,v_name,coalesce(v_phone,''),v_email,CASE WHEN v_phone IS NULL THEN 'email' ELSE 'ligacao' END,'patrocinio','lead_imobiliaria',m.finalidade,m.tipo_imovel,m.broker_id::text,broker_name,m.property_id,m.property_id::text,'media','novo','primeiro_contato','Integração Meta Lead Ads; submissão '||s.id::text||'. Ator: integração, sem contato externo automático.',nullif(p_fields->>'interest','')) RETURNING id INTO v_attendance;
 UPDATE public.meta_lead_submissions SET attendance_id=v_attendance,client_id=v_client,broker_id=m.broker_id,status=CASE WHEN m.broker_id IS NULL THEN 'unassigned' ELSE 'imported' END,completed_at=now(),worker_id=NULL,lease_until=NULL,last_error=NULL WHERE id=s.id;
 RETURN CASE WHEN m.broker_id IS NULL THEN 'unassigned' ELSE 'imported' END;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.meta_lead_ingest(text,jsonb),public.meta_lead_claim(uuid,integer),public.meta_lead_complete(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.meta_lead_ingest(text,jsonb),public.meta_lead_claim(uuid,integer),public.meta_lead_complete(uuid,uuid,jsonb) TO service_role;
--> statement-breakpoint


-- Activation is separate from structure and follows external endpoint verification.
CREATE FUNCTION public.meta_ads_worker_dispatch() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $$
DECLARE origin text;
BEGIN
 SELECT value#>>'{}' INTO origin FROM public.app_settings WHERE key='site_media_worker_origin';
 IF origin IS NULL OR btrim(origin)!~'^https://[^/?#]+/?$' THEN RETURN NULL; END IF;
 RETURN net.http_post(url:=rtrim(btrim(origin),'/')||'/api/public/hooks/meta-leads',headers:=public.internal_worker_headers(),body:='{}'::jsonb,timeout_milliseconds:=120000);
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.meta_ads_worker_dispatch() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.meta_ads_worker_dispatch() TO service_role;
--> statement-breakpoint

DO $$ BEGIN
 IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('public.internal_worker_headers()') IS NOT NULL THEN
 PERFORM cron.schedule('meta-ads-leadgen','* * * * *','SELECT public.meta_ads_worker_dispatch()');
 PERFORM cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='meta-ads-leadgen'),active:=false);
 END IF;
END $$;
--> statement-breakpoint


CREATE FUNCTION public.meta_lead_mapping_check() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE con public.ad_platform_connections;
BEGIN
 -- Lock the authoritative connection while deriving identity. A supplied app_id
 -- is never trusted, and concurrent identity changes cannot leave a live mapping.
 SELECT * INTO con FROM public.ad_platform_connections WHERE id=NEW.connection_id FOR SHARE;
 IF con.id IS NULL OR con.platform<>'meta' OR con.app_id IS NULL OR con.imobiliaria IS DISTINCT FROM NEW.imobiliaria OR con.page_id IS DISTINCT FROM NEW.page_id THEN RAISE EXCEPTION 'Mapping connection scope mismatch'; END IF;
 NEW.app_id:=con.app_id;
 IF NEW.enabled AND NEW.property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=NEW.property_id AND(p.carteira=NEW.imobiliaria OR NEW.imobiliaria=ANY(p.publish_targets))) THEN RAISE EXCEPTION 'Property outside agency'; END IF;
 IF NEW.enabled AND NEW.broker_id IS NOT NULL AND (NOT public.has_role(NEW.broker_id,'corretor') OR NOT public.has_notification_agency_access(NEW.broker_id,NEW.imobiliaria)) THEN RAISE EXCEPTION 'Broker outside agency'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER meta_lead_mapping_check BEFORE INSERT OR UPDATE ON public.meta_lead_form_mappings FOR EACH ROW EXECUTE FUNCTION public.meta_lead_mapping_check();
--> statement-breakpoint

-- Moving an app/Page/brand requires fresh form validation through the admin API.
-- Existing submissions retain their original identity and cannot use a new mapping.
CREATE FUNCTION public.meta_lead_invalidate_connection_mappings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.app_id IS DISTINCT FROM OLD.app_id OR NEW.page_id IS DISTINCT FROM OLD.page_id OR NEW.imobiliaria IS DISTINCT FROM OLD.imobiliaria THEN
 UPDATE public.meta_lead_form_mappings SET enabled=false,updated_at=now() WHERE connection_id=OLD.id AND enabled;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.meta_lead_invalidate_connection_mappings() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

CREATE TRIGGER meta_lead_invalidate_connection_mappings BEFORE UPDATE OF app_id,page_id,imobiliaria ON public.ad_platform_connections FOR EACH ROW EXECUTE FUNCTION public.meta_lead_invalidate_connection_mappings();
--> statement-breakpoint

CREATE FUNCTION public.meta_lead_retry(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;c public.ad_platform_connections;n integer;
BEGIN
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.privacy_deleted_at IS NOT NULL OR s.attendance_id IS NOT NULL OR s.status NOT IN ('failed','review','quarantined') THEN RAISE EXCEPTION 'Lead cannot be retried'; END IF;
 SELECT count(*) INTO n FROM public.ad_platform_connections WHERE platform='meta' AND app_id=s.app_id AND page_id=s.page_id;
 IF n=1 THEN SELECT * INTO c FROM public.ad_platform_connections WHERE platform='meta' AND app_id=s.app_id AND page_id=s.page_id;
 ELSE
 SELECT count(*) INTO n FROM public.meta_lead_form_mappings m JOIN public.ad_platform_connections con ON con.id=m.connection_id WHERE m.app_id=s.app_id AND m.page_id=s.page_id AND m.form_id=s.form_id AND m.enabled AND con.platform='meta' AND con.app_id=m.app_id AND con.page_id=m.page_id AND con.imobiliaria=m.imobiliaria;
 IF n=1 THEN SELECT con.* INTO c FROM public.meta_lead_form_mappings m JOIN public.ad_platform_connections con ON con.id=m.connection_id WHERE m.app_id=s.app_id AND m.page_id=s.page_id AND m.form_id=s.form_id AND m.enabled AND con.platform='meta' AND con.app_id=m.app_id AND con.page_id=m.page_id AND con.imobiliaria=m.imobiliaria; END IF;
 END IF;
 IF c.id IS NULL OR c.imobiliaria NOT IN ('cordial','morar') THEN RAISE EXCEPTION 'Unknown or ambiguous page'; END IF;
 UPDATE public.meta_lead_submissions SET connection_id=c.id,imobiliaria=c.imobiliaria,status='queued',attempts=0,next_attempt_at=now(),worker_id=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=s.id;
END $$;
--> statement-breakpoint

CREATE FUNCTION public.meta_lead_assign(p_id uuid,p_broker_id uuid,p_actor_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;broker_name text;
BEGIN
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id FOR UPDATE;
 IF s.attendance_id IS NULL OR s.status NOT IN ('unassigned','imported') THEN RAISE EXCEPTION 'Lead has no attendance'; END IF;
 IF NOT(public.has_role(p_actor_id,'admin') OR(public.has_role(p_actor_id,'secretaria') AND NOT public.has_role(p_actor_id,'financeiro') AND public.has_notification_agency_access(p_actor_id,s.imobiliaria))) THEN RAISE EXCEPTION 'Actor outside agency'; END IF;
 IF NOT public.has_role(p_broker_id,'corretor') OR NOT public.has_notification_agency_access(p_broker_id,s.imobiliaria) THEN RAISE EXCEPTION 'Broker outside agency'; END IF;
 SELECT nome INTO broker_name FROM public.profiles WHERE id=p_broker_id;
 -- Never overwrite another assignment; reassign through the existing attendance flow.
 UPDATE public.attendances SET corretor_id=p_broker_id::text,corretor_nome=broker_name WHERE id=s.attendance_id AND imobiliaria=s.imobiliaria AND corretor_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Attendance already assigned'; END IF;
 UPDATE public.meta_lead_submissions SET broker_id=p_broker_id,status='imported',updated_at=now() WHERE id=s.id;
END $$;
--> statement-breakpoint

CREATE FUNCTION public.meta_lead_resolve(p_id uuid,p_attendance_id uuid,p_actor_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;a public.attendances;
BEGIN
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id FOR UPDATE;
 SELECT * INTO a FROM public.attendances WHERE id=p_attendance_id FOR SHARE;
 IF s.id IS NULL OR a.id IS NULL OR s.privacy_deleted_at IS NOT NULL OR s.status<>'review' OR s.attendance_id IS NOT NULL OR s.imobiliaria IS DISTINCT FROM a.imobiliaria THEN RAISE EXCEPTION 'Incompatible attendance'; END IF;
 IF NOT(public.has_role(p_actor_id,'admin') OR(public.has_role(p_actor_id,'secretaria') AND NOT public.has_role(p_actor_id,'financeiro') AND public.has_notification_agency_access(p_actor_id,s.imobiliaria))) THEN RAISE EXCEPTION 'Actor outside agency'; END IF;
 UPDATE public.meta_lead_submissions SET attendance_id=a.id,client_id=a.cliente_id,broker_id=public._try_uuid(a.corretor_id),status=CASE WHEN a.corretor_id IS NULL THEN 'unassigned' ELSE 'imported' END,last_error=NULL,completed_at=now(),updated_at=now() WHERE id=s.id;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.meta_lead_retry(uuid),public.meta_lead_assign(uuid,uuid,uuid),public.meta_lead_resolve(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.meta_lead_retry(uuid),public.meta_lead_assign(uuid,uuid,uuid),public.meta_lead_resolve(uuid,uuid,uuid) TO service_role;
--> statement-breakpoint


CREATE FUNCTION public.ad_sync_commit(p_job_id uuid,p_worker_id uuid,p_metrics jsonb,p_campaign jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.ad_sync_jobs;c public.marketing_campaigns;d jsonb;
BEGIN
 SELECT * INTO j FROM public.ad_sync_jobs WHERE id=p_job_id FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.worker_id IS DISTINCT FROM p_worker_id OR j.lease_until<now() THEN RAISE EXCEPTION 'Stale sync lease'; END IF;
 SELECT * INTO c FROM public.marketing_campaigns WHERE id=j.campaign_id FOR UPDATE;
 IF c.connection_id IS NULL THEN RAISE EXCEPTION 'Campaign connection missing'; END IF;
 IF jsonb_typeof(p_metrics)<>'array' OR jsonb_array_length(p_metrics)>367 THEN RAISE EXCEPTION 'Invalid metric range'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketing_daily_metrics WHERE campaign_id=c.id AND data BETWEEN j.range_start AND j.range_end AND metric_source='manual') THEN RAISE EXCEPTION 'Manual metrics require explicit reconciliation'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(p_metrics) LOOP
 IF (d->>'date')::date NOT BETWEEN j.range_start AND j.range_end THEN RAISE EXCEPTION 'Metric outside job range'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketing_daily_metrics WHERE campaign_id=c.id AND data=(d->>'date')::date AND metric_source='manual') THEN RAISE EXCEPTION 'Manual metrics require explicit reconciliation'; END IF;
 INSERT INTO public.marketing_daily_metrics(campaign_id,user_id,data,leads,clicks,accesses,views,investimento,impressions,reach,frequency,spend,cpc,cpm,ctr,conversions,metric_source,provider_actions,lead_action_type,landing_page_views)
 VALUES(c.id,c.user_id,(d->>'date')::date,coalesce((d->>'leads')::integer,0),coalesce((d->>'clicks')::integer,0),0,0,coalesce((d->>'spend')::numeric,0),(d->>'impressions')::numeric,(d->>'reach')::numeric,(d->>'frequency')::numeric,(d->>'spend')::numeric,(d->>'cpc')::numeric,(d->>'cpm')::numeric,(d->>'ctr')::numeric,(d->>'leads')::numeric,'synced',d->'provider_actions',d->>'lead_action_type',(d->>'landing_page_views')::numeric)
 ON CONFLICT(campaign_id,data) DO UPDATE SET leads=excluded.leads,clicks=excluded.clicks,investimento=excluded.investimento,impressions=excluded.impressions,reach=excluded.reach,frequency=excluded.frequency,spend=excluded.spend,cpc=excluded.cpc,cpm=excluded.cpm,ctr=excluded.ctr,conversions=excluded.conversions,provider_actions=excluded.provider_actions,lead_action_type=excluded.lead_action_type,landing_page_views=excluded.landing_page_views;
 END LOOP;
 DELETE FROM public.marketing_daily_metrics d WHERE d.campaign_id=c.id AND d.metric_source='synced' AND d.data BETWEEN j.range_start AND j.range_end AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_metrics) m WHERE (m->>'date')::date=d.data);
 UPDATE public.marketing_campaigns SET nome=coalesce(nullif(p_campaign->>'nome',''),nome),status=coalesce(nullif(p_campaign->>'status',''),status),period_insights=p_campaign->'period_insights',last_synced_at=now(),sync_status='synced',sync_error=NULL,investimento=coalesce((SELECT sum(spend) FROM public.marketing_daily_metrics WHERE campaign_id=c.id),0) WHERE id=c.id;
 UPDATE public.ad_sync_jobs SET status='done',finished_at=now(),error=NULL,worker_id=NULL,lease_until=NULL WHERE id=j.id;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.ad_sync_commit(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.ad_sync_commit(uuid,uuid,jsonb,jsonb) TO service_role;
--> statement-breakpoint


CREATE FUNCTION public.meta_ads_sync_dispatch() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $$
DECLARE origin text;
BEGIN
 SELECT value#>>'{}' INTO origin FROM public.app_settings WHERE key='site_media_worker_origin';
 IF origin IS NULL OR btrim(origin)!~'^https://[^/?#]+/?$' THEN RETURN NULL; END IF;
 RETURN net.http_post(url:=rtrim(btrim(origin),'/')||'/api/public/hooks/ads-sync',headers:=public.internal_worker_headers(),body:='{}'::jsonb,timeout_milliseconds:=120000);
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.meta_ads_sync_dispatch() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.meta_ads_sync_dispatch() TO service_role;
--> statement-breakpoint

DO $$ BEGIN
 IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('public.internal_worker_headers()') IS NOT NULL THEN
 PERFORM cron.schedule('meta-ads-sync','*/5 * * * *','SELECT public.meta_ads_sync_dispatch()');
 PERFORM cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='meta-ads-sync'),active:=false);
 END IF;
END $$;
--> statement-breakpoint


CREATE FUNCTION public.ad_sync_fail(p_job_id uuid,p_worker_id uuid,p_status text,p_error text,p_next_attempt_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.ad_sync_jobs;
BEGIN
 IF p_status NOT IN ('queued','error','partial') THEN RAISE EXCEPTION 'Invalid failure state'; END IF;
 SELECT * INTO j FROM public.ad_sync_jobs WHERE id=p_job_id FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.worker_id IS DISTINCT FROM p_worker_id OR j.lease_until<now() THEN RAISE EXCEPTION 'Stale sync lease'; END IF;
 UPDATE public.ad_sync_jobs SET status=p_status,error=left(p_error,100),next_attempt_at=coalesce(p_next_attempt_at,now()+interval '5 minutes'),finished_at=CASE WHEN p_status='queued' THEN NULL ELSE now() END,worker_id=NULL,lease_until=NULL WHERE id=j.id;
 UPDATE public.marketing_campaigns SET sync_status=CASE WHEN p_status='partial' THEN 'partial' WHEN p_status='queued' THEN 'queued' ELSE 'error' END,sync_error=left(p_error,100) WHERE id=j.campaign_id;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.ad_sync_fail(uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.ad_sync_fail(uuid,uuid,text,text,timestamptz) TO service_role;
--> statement-breakpoint


-- Privacy erasure retains only external dedup/routing identifiers (a tombstone).
CREATE FUNCTION public.meta_lead_erase_crm() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_id uuid:=(to_jsonb(OLD)->>'id')::uuid;
BEGIN
 UPDATE public.meta_lead_submissions s SET full_name=NULL,phone=NULL,email=NULL,field_data=NULL,broker_id=NULL,privacy_deleted_at=now(),last_error='privacy_deleted',status='failed',worker_id=NULL,lease_until=NULL,updated_at=now()
 WHERE (TG_TABLE_NAME='clients' AND (s.client_id=old_id OR EXISTS(
 SELECT 1 FROM public.attendances a WHERE a.id=s.attendance_id AND(a.cliente_id=old_id OR a.cliente_convertido_id=old_id))))
 OR(TG_TABLE_NAME='attendances' AND s.attendance_id=old_id);
 RETURN OLD;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.meta_lead_erase_crm() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

CREATE TRIGGER meta_lead_erase_client BEFORE DELETE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.meta_lead_erase_crm();
--> statement-breakpoint

CREATE TRIGGER meta_lead_erase_attendance BEFORE DELETE ON public.attendances FOR EACH ROW EXECUTE FUNCTION public.meta_lead_erase_crm();
