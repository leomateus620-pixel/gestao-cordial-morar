-- Google conversions are a fractional attributed metric, not CRM leads.
-- Keep Meta's historical conversion/lead contract and existing lease/reconciliation behavior.
CREATE OR REPLACE FUNCTION public.ad_sync_commit(p_job_id uuid,p_worker_id uuid,p_metrics jsonb,p_campaign jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.ad_sync_jobs;c public.marketing_campaigns;d jsonb;
BEGIN
 SELECT * INTO j FROM public.ad_sync_jobs WHERE id=p_job_id FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.worker_id IS DISTINCT FROM p_worker_id OR j.lease_until<now() THEN RAISE EXCEPTION 'Stale sync lease'; END IF;
 SELECT * INTO c FROM public.marketing_campaigns WHERE id=j.campaign_id FOR UPDATE;
 IF c.connection_id IS NULL THEN RAISE EXCEPTION 'Campaign connection missing'; END IF;
 IF jsonb_typeof(p_metrics)<>'array' OR jsonb_array_length(p_metrics)>367 THEN RAISE EXCEPTION 'Invalid metric range'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketing_daily_metrics WHERE campaign_id=c.id AND data BETWEEN j.range_start AND j.range_end AND metric_source='manual') THEN RAISE EXCEPTION 'Manual metrics require explicit reconciliation'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(p_metrics) LOOP
 IF c.platform='google' AND (NOT (d ? 'conversions') OR d->>'conversions' IS NULL) THEN RAISE EXCEPTION 'Google conversions missing from metrics payload'; END IF;
 IF (d->>'date')::date NOT BETWEEN j.range_start AND j.range_end THEN RAISE EXCEPTION 'Metric outside job range'; END IF;
 IF EXISTS(SELECT 1 FROM public.marketing_daily_metrics WHERE campaign_id=c.id AND data=(d->>'date')::date AND metric_source='manual') THEN RAISE EXCEPTION 'Manual metrics require explicit reconciliation'; END IF;
 INSERT INTO public.marketing_daily_metrics(campaign_id,user_id,data,leads,clicks,accesses,views,investimento,impressions,reach,frequency,spend,cpc,cpm,ctr,conversions,metric_source,provider_actions,lead_action_type,landing_page_views)
 VALUES(c.id,c.user_id,(d->>'date')::date,coalesce((d->>'leads')::integer,0),coalesce((d->>'clicks')::integer,0),0,0,coalesce((d->>'spend')::numeric,0),(d->>'impressions')::numeric,(d->>'reach')::numeric,(d->>'frequency')::numeric,(d->>'spend')::numeric,(d->>'cpc')::numeric,(d->>'cpm')::numeric,(d->>'ctr')::numeric,CASE WHEN c.platform='google' THEN (d->>'conversions')::numeric ELSE (d->>'leads')::numeric END,'synced',d->'provider_actions',d->>'lead_action_type',(d->>'landing_page_views')::numeric)
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

-- Worker checks this before sending Google payloads so old databases cannot silently
-- store fractional conversions in the integer lead field.
CREATE OR REPLACE FUNCTION public.ad_google_metrics_contract_version() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT 1 $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.ad_google_metrics_contract_version() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.ad_google_metrics_contract_version() TO service_role;
