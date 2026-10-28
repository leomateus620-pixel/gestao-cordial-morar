-- Each asynchronous report is an immutable version. Staged pages are never visible
-- until completed, so an error/empty/partial response cannot erase prior metrics.
CREATE UNIQUE INDEX marketing_campaigns_insight_context_idx ON public.marketing_campaigns(id,connection_id,external_account_id,imobiliaria,external_campaign_id);
CREATE TABLE public.meta_insight_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES public.ad_platform_connections(id),
 account_id text NOT NULL CHECK(account_id ~ '^[0-9]{1,80}$'), imobiliaria text NOT NULL CHECK(imobiliaria IN ('cordial','morar')),
 campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id), external_campaign_id text NOT NULL CHECK(external_campaign_id ~ '^[0-9]{1,80}$'),
 level text NOT NULL CHECK(level IN ('campaign','adset','ad')), grain text NOT NULL CHECK(grain IN ('daily','period')),
 breakdown text NOT NULL DEFAULT 'none' CHECK(breakdown IN ('none','publisher_platform')),
 since date NOT NULL, until date NOT NULL CHECK(until>=since AND until-since<=93),
 requested_by uuid NOT NULL REFERENCES auth.users(id), api_version text NOT NULL CHECK(api_version ~ '^v[0-9]{2,3}\.0$'),
 attribution_requested jsonb NOT NULL DEFAULT '{"use_unified_attribution_setting":true,"action_report_time":"impression"}',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','submitting','polling','collecting','completed','uncertain','failed','expired','cancelled')),
 report_run_id text CHECK(report_run_id ~ '^[0-9]{1,80}$'), progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
 coverage text NOT NULL DEFAULT 'pending' CHECK(coverage IN ('pending','collected_data','collected_empty','partial','error')),
 after_cursor text, cursors text[] NOT NULL DEFAULT '{}', pages integer NOT NULL DEFAULT 0,
 worker_id uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 currency text, timezone text, error_code text, diagnostics jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY(connection_id,account_id) REFERENCES public.ad_accounts(connection_id,external_account_id),
 FOREIGN KEY(campaign_id,connection_id,account_id,imobiliaria,external_campaign_id) REFERENCES public.marketing_campaigns(id,connection_id,external_account_id,imobiliaria,external_campaign_id),
 CHECK((worker_id IS NULL)=(lease_until IS NULL))
);
CREATE UNIQUE INDEX meta_insight_active_scope_idx ON public.meta_insight_jobs(campaign_id,level,grain,breakdown,since,until)
 WHERE status IN ('queued','submitting','polling','collecting','uncertain');
CREATE UNIQUE INDEX meta_insight_account_lease_idx ON public.meta_insight_jobs(connection_id,account_id) WHERE worker_id IS NOT NULL;
CREATE INDEX meta_insight_queue_idx ON public.meta_insight_jobs(next_attempt_at) WHERE status IN ('queued','polling','collecting');
CREATE INDEX meta_insight_snapshot_idx ON public.meta_insight_jobs(campaign_id,level,grain,breakdown,since,until,completed_at DESC) WHERE status='completed';
CREATE TABLE public.meta_entity_insights (
 job_id uuid NOT NULL REFERENCES public.meta_insight_jobs(id) ON DELETE CASCADE,
 entity_id text NOT NULL CHECK(entity_id ~ '^[0-9]{1,80}$'), date_start date NOT NULL,date_stop date NOT NULL,
 breakdown jsonb NOT NULL DEFAULT '{}', metrics jsonb NOT NULL,
 PRIMARY KEY(job_id,entity_id,date_start,date_stop,breakdown), CHECK(date_stop>=date_start)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['meta_insight_jobs','meta_entity_insights'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY meta_reviewer_block ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.is_meta_reviewer()) WITH CHECK(NOT public.is_meta_reviewer())',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_insight_scope_check() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.marketing_campaigns c JOIN public.ad_platform_connections n ON n.id=c.connection_id
  WHERE c.id=NEW.campaign_id AND c.connection_id=NEW.connection_id AND c.external_campaign_id=NEW.external_campaign_id
  AND c.external_account_id=NEW.account_id AND c.imobiliaria=NEW.imobiliaria AND n.imobiliaria=NEW.imobiliaria
  AND n.external_account_id=NEW.account_id AND n.platform='meta') THEN RAISE EXCEPTION 'Insight scope mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER meta_insight_scope_check BEFORE INSERT OR UPDATE ON public.meta_insight_jobs FOR EACH ROW EXECUTE FUNCTION public.meta_insight_scope_check();
--> statement-breakpoint
CREATE FUNCTION public.meta_insight_enqueue(p_campaign uuid,p_actor uuid,p_level text,p_grain text,p_breakdown text,p_since date,p_until date,p_api_version text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.marketing_campaigns; result uuid;
BEGIN
 SELECT * INTO c FROM public.marketing_campaigns WHERE id=p_campaign FOR SHARE;
 IF NOT FOUND OR c.platform<>'meta' OR c.connection_id IS NULL OR c.external_account_id IS NULL
 OR NOT public.marketing_actor_can_act(p_actor,'manage_manual',c.imobiliaria)
 OR (auth.uid() IS NOT NULL AND auth.uid()<>p_actor) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 INSERT INTO public.meta_insight_jobs(connection_id,account_id,imobiliaria,campaign_id,external_campaign_id,level,grain,breakdown,since,until,requested_by,api_version)
 VALUES(c.connection_id,c.external_account_id,c.imobiliaria,c.id,c.external_campaign_id,p_level,p_grain,p_breakdown,p_since,p_until,p_actor,p_api_version)
 ON CONFLICT(campaign_id,level,grain,breakdown,since,until) WHERE status IN ('queued','submitting','polling','collecting','uncertain') DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM public.meta_insight_jobs WHERE campaign_id=c.id AND level=p_level AND grain=p_grain AND breakdown=p_breakdown AND since=p_since AND until=p_until AND status IN ('queued','submitting','polling','collecting','uncertain'); END IF;
 RETURN result;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_insight_claim(p_worker uuid) RETURNS SETOF public.meta_insight_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE account record; job public.meta_insight_jobs;
BEGIN
 IF p_worker IS NULL THEN RAISE EXCEPTION 'Worker required'; END IF;
 -- A lost POST response is NEVER another permission to create a report.
 UPDATE public.meta_insight_jobs SET status='uncertain',coverage='partial',error_code='outcome_uncertain',worker_id=NULL,lease_until=NULL,updated_at=now()
 WHERE status='submitting' AND lease_until<now();
 UPDATE public.meta_insight_jobs SET worker_id=NULL,lease_until=NULL WHERE status IN ('polling','collecting') AND lease_until<now();
 UPDATE public.meta_insight_jobs SET status='expired',coverage='error',error_code='report_poll_window_expired',worker_id=NULL,lease_until=NULL,updated_at=now()
 WHERE status IN ('polling','collecting') AND created_at<now()-interval '24 hours';
 FOR account IN SELECT a.connection_id,a.external_account_id FROM public.ad_accounts a
 WHERE EXISTS(SELECT 1 FROM public.meta_insight_jobs j WHERE j.connection_id=a.connection_id AND j.account_id=a.external_account_id AND j.status IN ('queued','polling','collecting') AND j.next_attempt_at<=now() AND j.worker_id IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.meta_insight_jobs j WHERE j.connection_id=a.connection_id AND j.account_id=a.external_account_id AND j.worker_id IS NOT NULL)
 ORDER BY a.id FOR UPDATE OF a SKIP LOCKED LIMIT 1 LOOP
  SELECT * INTO job FROM public.meta_insight_jobs WHERE connection_id=account.connection_id AND account_id=account.external_account_id
  AND status IN ('queued','polling','collecting') AND next_attempt_at<=now() AND worker_id IS NULL ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF FOUND THEN
   UPDATE public.meta_insight_jobs SET status=CASE WHEN status='queued' THEN 'submitting' ELSE status END,
   worker_id=p_worker,lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() WHERE id=job.id RETURNING * INTO job;
   RETURN NEXT job;
  END IF;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_insight_checkpoint(p_id uuid,p_worker uuid,p_status text,p_report_id text DEFAULT NULL,p_progress integer DEFAULT NULL,p_error text DEFAULT NULL,p_diagnostics jsonb DEFAULT NULL,p_currency text DEFAULT NULL,p_timezone text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.meta_insight_jobs;
BEGIN
 SELECT * INTO j FROM public.meta_insight_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.worker_id IS DISTINCT FROM p_worker OR j.lease_until<=now() THEN RAISE EXCEPTION 'Stale insight lease'; END IF;
 IF p_status NOT IN ('polling','collecting','uncertain','failed','expired') THEN RAISE EXCEPTION 'Invalid checkpoint'; END IF;
 IF p_status IN ('polling','collecting') AND coalesce(p_report_id,j.report_run_id) IS NULL THEN RAISE EXCEPTION 'Report ID required'; END IF;
 IF j.report_run_id IS NOT NULL AND p_report_id IS NOT NULL AND j.report_run_id<>p_report_id THEN RAISE EXCEPTION 'Report ID immutable'; END IF;
 UPDATE public.meta_insight_jobs SET report_run_id=coalesce(report_run_id,p_report_id),status=p_status,
 progress=greatest(progress,least(100,coalesce(p_progress,progress))),error_code=left(p_error,100),diagnostics=p_diagnostics,
 currency=coalesce(p_currency,currency),timezone=coalesce(p_timezone,timezone),
 coverage=CASE WHEN p_status IN ('failed','expired') THEN CASE WHEN pages>0 THEN 'partial' ELSE 'error' END WHEN p_status='uncertain' THEN 'partial' ELSE coverage END,
 worker_id=NULL,lease_until=NULL,next_attempt_at=now()+make_interval(secs=>least(3600,greatest(20,coalesce((p_diagnostics->>'retryAfterSeconds')::double precision,20)))) ,updated_at=now() WHERE id=p_id;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_insight_append(p_id uuid,p_worker uuid,p_expected_after text,p_next_after text,p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.meta_insight_jobs; r jsonb; n integer;
BEGIN
 SELECT * INTO j FROM public.meta_insight_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.worker_id IS DISTINCT FROM p_worker OR j.lease_until<=now() OR j.status<>'collecting' THEN RAISE EXCEPTION 'Stale insight lease'; END IF;
 IF p_rows IS NULL OR j.after_cursor IS DISTINCT FROM p_expected_after OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Invalid page checkpoint'; END IF;
 IF p_next_after IS NOT NULL AND (length(p_next_after)>4096 OR p_next_after=ANY(j.cursors) OR p_next_after IS NOT DISTINCT FROM p_expected_after) THEN RAISE EXCEPTION 'Cyclic cursor'; END IF;
 IF j.pages>=500 THEN RAISE EXCEPTION 'Report page limit reached'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF r->>'campaignId' IS DISTINCT FROM j.external_campaign_id OR (r->>'dateStart')::date<j.since OR (r->>'dateStop')::date>j.until
  OR (j.grain='daily' AND r->>'dateStart'<>r->>'dateStop') OR (j.grain='period' AND ((r->>'dateStart')::date<>j.since OR (r->>'dateStop')::date<>j.until))
  OR (r->>'accountId') IS DISTINCT FROM j.account_id THEN RAISE EXCEPTION 'Insight row outside scope'; END IF;
  IF EXISTS(SELECT 1 FROM public.meta_entity_insights e WHERE e.job_id=j.id AND e.entity_id=r->>'entityId' AND e.date_start=(r->>'dateStart')::date AND e.date_stop=(r->>'dateStop')::date AND e.breakdown=coalesce(r->'breakdown','{}') AND e.metrics<>r) THEN RAISE EXCEPTION 'Inconsistent report page'; END IF;
  INSERT INTO public.meta_entity_insights(job_id,entity_id,date_start,date_stop,breakdown,metrics)
  VALUES(j.id,r->>'entityId',(r->>'dateStart')::date,(r->>'dateStop')::date,coalesce(r->'breakdown','{}'),r)
  ON CONFLICT(job_id,entity_id,date_start,date_stop,breakdown) DO NOTHING;
 END LOOP;
 SELECT count(*) INTO n FROM public.meta_entity_insights WHERE job_id=j.id;
 UPDATE public.meta_insight_jobs SET after_cursor=p_next_after,cursors=CASE WHEN p_next_after IS NULL THEN cursors ELSE array_append(cursors,p_next_after) END,pages=pages+1,
 status=CASE WHEN p_next_after IS NULL THEN 'completed' ELSE 'collecting' END,
 coverage=CASE WHEN p_next_after IS NOT NULL THEN 'partial' WHEN n=0 THEN 'collected_empty' ELSE 'collected_data' END,
 completed_at=CASE WHEN p_next_after IS NULL THEN now() ELSE NULL END,progress=100,
 worker_id=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE id=j.id;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_insight_cancel(p_id uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.meta_insight_jobs;
BEGIN
 SELECT * INTO j FROM public.meta_insight_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.marketing_actor_can_act(p_actor,'manage_manual',j.imobiliaria) OR(auth.uid() IS NOT NULL AND auth.uid()<>p_actor) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 IF j.status='completed' THEN RAISE EXCEPTION 'Completed report immutable'; END IF;
 -- Local cancellation retains the external report ID. No unsupported Graph DELETE.
 UPDATE public.meta_insight_jobs SET status='cancelled',worker_id=NULL,lease_until=NULL,updated_at=now() WHERE id=p_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.meta_insight_enqueue(uuid,uuid,text,text,text,date,date,text),public.meta_insight_claim(uuid),public.meta_insight_checkpoint(uuid,uuid,text,text,integer,text,jsonb,text,text),public.meta_insight_append(uuid,uuid,text,text,jsonb),public.meta_insight_cancel(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_insight_enqueue(uuid,uuid,text,text,text,date,date,text),public.meta_insight_claim(uuid),public.meta_insight_checkpoint(uuid,uuid,text,text,integer,text,jsonb,text,text),public.meta_insight_append(uuid,uuid,text,text,jsonb),public.meta_insight_cancel(uuid,uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.meta_insight_snapshot(p_campaign uuid,p_level text,p_grain text,p_breakdown text,p_since date,p_until date,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.marketing_campaigns; latest public.meta_insight_jobs; saved public.meta_insight_jobs; rows jsonb; n integer; financial boolean;
BEGIN
 SELECT * INTO c FROM public.marketing_campaigns WHERE id=p_campaign;
 IF NOT FOUND OR NOT public.marketing_can_read(c.imobiliaria) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 financial:=public.marketing_can_act('financial_report',c.imobiliaria);
 SELECT * INTO latest FROM public.meta_insight_jobs WHERE campaign_id=p_campaign AND level=p_level AND grain=p_grain AND breakdown=p_breakdown AND since=p_since AND until=p_until ORDER BY created_at DESC,id LIMIT 1;
 SELECT * INTO saved FROM public.meta_insight_jobs WHERE campaign_id=p_campaign AND level=p_level AND grain=p_grain AND breakdown=p_breakdown AND since=p_since AND until=p_until AND status='completed' ORDER BY completed_at DESC,id LIMIT 1;
 SELECT count(*) INTO n FROM public.meta_entity_insights WHERE job_id=saved.id;
 SELECT coalesce(jsonb_agg(CASE WHEN financial THEN metrics ELSE metrics-'spend'||'{"spend":null}'::jsonb END ORDER BY entity_id,date_start,breakdown),'[]') INTO rows
 FROM (SELECT * FROM public.meta_entity_insights WHERE job_id=saved.id ORDER BY entity_id,date_start,breakdown LIMIT greatest(1,least(p_page_size,100)) OFFSET (greatest(1,p_page)-1)*greatest(1,least(p_page_size,100))) p;
 RETURN jsonb_build_object('job',CASE WHEN latest.id IS NULL THEN NULL ELSE jsonb_build_object('id',latest.id,'status',latest.status,'progress',latest.progress,'coverage',latest.coverage,'updatedAt',latest.updated_at,'errorCode',latest.error_code) END,
 'snapshotJobId',saved.id,'snapshotAt',saved.completed_at,'rows',rows,'total',n,'financialVisible',financial,'currency',saved.currency,'timezone',saved.timezone,'apiVersion',saved.api_version,'attributionRequested',saved.attribution_requested);
END $$;
REVOKE ALL ON FUNCTION public.meta_insight_snapshot(uuid,text,text,text,date,date,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.meta_insight_snapshot(uuid,text,text,text,date,date,integer,integer) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.meta_insight_reconcile(p_id uuid,p_actor uuid,p_report_id text,p_currency text,p_timezone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.meta_insight_jobs;
BEGIN
 SELECT * INTO j FROM public.meta_insight_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.marketing_actor_can_act(p_actor,'manage_connection',j.imobiliaria) OR(auth.uid() IS NOT NULL AND auth.uid()<>p_actor) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 IF j.status<>'uncertain' OR j.report_run_id IS NOT NULL OR p_report_id IS NULL OR p_currency IS NULL OR p_currency!~'^[A-Z]{3}$' OR p_timezone IS NULL THEN RAISE EXCEPTION 'Invalid reconciliation'; END IF;
 -- Called only after the server proves the returned report metadata matches the entire scope.
 UPDATE public.meta_insight_jobs SET report_run_id=p_report_id,currency=p_currency,timezone=p_timezone,status='polling',error_code=NULL,worker_id=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now() WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.meta_insight_reconcile(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_insight_reconcile(uuid,uuid,text,text,text) TO service_role;

--> statement-breakpoint
-- Export a fixed completed report in one snapshot. Never iterate the visible page or
-- select "latest" again while rendering; financial permissions are checked afresh.
CREATE FUNCTION public.meta_insight_export_snapshot(p_job uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.meta_insight_jobs; n integer; rows jsonb; financial boolean;
BEGIN
 SELECT * INTO j FROM public.meta_insight_jobs WHERE id=p_job;
 IF NOT FOUND OR j.status<>'completed' OR NOT public.marketing_can_act('generate_report',j.imobiliaria)
 THEN RAISE EXCEPTION 'Sem permissão ou snapshot indisponível' USING ERRCODE='42501'; END IF;
 financial:=public.marketing_can_act('financial_report',j.imobiliaria);
 SELECT count(*) INTO n FROM public.meta_entity_insights WHERE job_id=j.id;
 IF n>5000 THEN RAISE EXCEPTION 'Export limit exceeded'; END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN financial THEN metrics ELSE metrics-'spend'||'{"spend":null}'::jsonb END ORDER BY entity_id,date_start,breakdown),'[]') INTO rows
 FROM public.meta_entity_insights WHERE job_id=j.id;
 RETURN jsonb_build_object('jobId',j.id,'campaignId',j.campaign_id,'imobiliaria',j.imobiliaria,'accountId',j.account_id,
 'level',j.level,'grain',j.grain,'breakdown',j.breakdown,'since',j.since,'until',j.until,'completedAt',j.completed_at,'capturedAt',now(),
 'currency',j.currency,'timezone',j.timezone,'apiVersion',j.api_version,'attributionRequested',j.attribution_requested,
 'financialVisible',financial,'rows',rows,'total',n);
END $$;
REVOKE ALL ON FUNCTION public.meta_insight_export_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.meta_insight_export_snapshot(uuid) TO authenticated;
