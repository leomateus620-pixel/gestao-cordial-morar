-- Durable PDF generation uses the existing private report snapshot; no new cron or credentials.
ALTER TABLE public.marketing_reports DROP CONSTRAINT marketing_reports_status_check;
ALTER TABLE public.marketing_reports ADD CONSTRAINT marketing_reports_status_check CHECK(status IN ('generating','queued','processing','ready','failed'));
ALTER TABLE public.marketing_reports ADD COLUMN worker_id uuid, ADD COLUMN lease_until timestamptz,
 ADD COLUMN fence integer NOT NULL DEFAULT 0 CHECK(fence>=0), ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX marketing_reports_queue_idx ON public.marketing_reports(next_attempt_at,created_at) WHERE status IN ('queued','processing');
-- Pre-queue interrupted attempts lack the canonical snapshot hash and must be regenerated explicitly.
UPDATE public.marketing_reports SET status='failed',error_code='legacy_generation_interrupted' WHERE status='generating';
--> statement-breakpoint
CREATE FUNCTION public.marketing_report_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.author_id IS DISTINCT FROM OLD.author_id OR NEW.imobiliaria IS DISTINCT FROM OLD.imobiliaria OR NEW.kind IS DISTINCT FROM OLD.kind
 OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
 OR NEW.financial IS DISTINCT FROM OLD.financial OR NEW.row_count IS DISTINCT FROM OLD.row_count OR NEW.version IS DISTINCT FROM OLD.version THEN
 RAISE EXCEPTION 'Report snapshot is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER marketing_report_snapshot_immutable BEFORE UPDATE ON public.marketing_reports FOR EACH ROW EXECUTE FUNCTION public.marketing_report_snapshot_immutable();
--> statement-breakpoint
CREATE FUNCTION public.marketing_report_job_allowed(p_actor uuid,p_agency text,p_financial boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.marketing_actor_can_act(p_actor,'generate_report',p_agency)
 AND (NOT p_financial OR public.marketing_actor_can_act(p_actor,'financial_report',p_agency))
$$;
--> statement-breakpoint
CREATE FUNCTION public.marketing_report_enqueue(p_id uuid,p_actor uuid,p_snapshot jsonb,p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_agency text:=p_snapshot#>>'{scope,imobiliaria}';v_total integer;v_financial boolean;v_existing public.marketing_reports;
BEGIN
 IF p_id IS NULL OR p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object' OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
 OR p_snapshot->>'version' IS DISTINCT FROM '1' OR v_agency IS NULL OR v_agency NOT IN ('cordial','morar')
 OR jsonb_typeof(p_snapshot->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(p_snapshot->'financialVisible') IS DISTINCT FROM 'boolean'
 OR p_snapshot->>'total' IS NULL OR (p_snapshot->>'total') !~ '^[0-9]{1,5}$' OR octet_length(p_snapshot::text)>8388608 THEN RAISE EXCEPTION 'Invalid report snapshot'; END IF;
 v_total:=(p_snapshot->>'total')::integer;v_financial:=(p_snapshot->>'financialVisible')::boolean;
 IF v_total>5000 OR jsonb_array_length(p_snapshot->'rows')<>v_total THEN RAISE EXCEPTION 'Incomplete report snapshot'; END IF;
 IF NOT public.marketing_report_job_allowed(p_actor,v_agency,v_financial) THEN RAISE EXCEPTION 'Report not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_existing FROM public.marketing_reports WHERE id=p_id;
 IF v_existing.id IS NOT NULL THEN
 IF v_existing.author_id=p_actor AND v_existing.snapshot_hash=p_hash AND v_existing.snapshot=p_snapshot THEN RETURN v_existing.id; END IF;
 RAISE EXCEPTION 'Report intention conflict'; END IF;
 INSERT INTO public.marketing_reports(id,author_id,imobiliaria,kind,status,scope,snapshot,snapshot_hash,financial,row_count)
 VALUES(p_id,p_actor,v_agency,p_snapshot#>>'{scope,type}','queued',(p_snapshot->'scope')||CASE WHEN p_snapshot ? 'entity' THEN jsonb_build_object('entity',p_snapshot->'entity') ELSE '{}'::jsonb END,p_snapshot,p_hash,v_financial,v_total);
 RETURN p_id;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.marketing_report_claim(p_worker uuid,p_id uuid DEFAULT NULL)
RETURNS SETOF public.marketing_reports LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_worker IS NULL THEN RAISE EXCEPTION 'Worker required'; END IF;
 UPDATE public.marketing_reports SET status='failed',error_code='authorization_revoked',worker_id=NULL,lease_until=NULL
 WHERE status IN ('queued','processing') AND (p_id IS NULL OR id=p_id) AND NOT public.marketing_report_job_allowed(author_id,imobiliaria,financial);
 UPDATE public.marketing_reports SET status='failed',error_code='attempts_exhausted',worker_id=NULL,lease_until=NULL
 WHERE status='processing' AND lease_until<now() AND attempts>=3 AND (p_id IS NULL OR id=p_id);
 RETURN QUERY WITH candidate AS (
 SELECT id FROM public.marketing_reports WHERE attempts<3 AND (p_id IS NULL OR id=p_id)
 AND ((status='queued' AND next_attempt_at<=now()) OR (status='processing' AND lease_until<now()))
 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE public.marketing_reports r SET status='processing',worker_id=p_worker,lease_until=now()+interval '5 minutes',fence=r.fence+1,attempts=r.attempts+1,error_code=NULL
 FROM candidate c WHERE r.id=c.id RETURNING r.*;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.marketing_report_check_lease(p_id uuid,p_worker uuid,p_fence integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.marketing_reports;
BEGIN
 SELECT * INTO r FROM public.marketing_reports WHERE id=p_id FOR UPDATE;
 IF p_fence IS NULL OR p_fence<1 OR r.id IS NULL OR r.status<>'processing' OR r.worker_id IS DISTINCT FROM p_worker OR r.fence<>p_fence OR r.lease_until IS NULL OR r.lease_until<now() THEN RETURN false; END IF;
 IF NOT public.marketing_report_job_allowed(r.author_id,r.imobiliaria,r.financial) THEN
 UPDATE public.marketing_reports SET status='failed',error_code='authorization_revoked',worker_id=NULL,lease_until=NULL WHERE id=r.id; RETURN false; END IF;
 UPDATE public.marketing_reports SET lease_until=now()+interval '5 minutes' WHERE id=r.id;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.marketing_report_commit(p_id uuid,p_worker uuid,p_fence integer,p_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.marketing_reports;expected_path text;
BEGIN
 SELECT * INTO r FROM public.marketing_reports WHERE id=p_id FOR UPDATE;
 IF p_fence IS NULL OR p_fence<1 OR r.id IS NULL OR r.status<>'processing' OR r.worker_id IS DISTINCT FROM p_worker OR r.fence<>p_fence OR r.lease_until IS NULL OR r.lease_until<now() THEN RETURN false; END IF;
 IF NOT public.marketing_report_job_allowed(r.author_id,r.imobiliaria,r.financial) THEN
 UPDATE public.marketing_reports SET status='failed',error_code='authorization_revoked',worker_id=NULL,lease_until=NULL WHERE id=r.id;RETURN false;END IF;
 expected_path:=r.imobiliaria||'/'||r.author_id::text||'/'||r.id::text||'/v'||r.version::text||'-'||left(r.snapshot_hash,16)||'-f'||r.fence::text||'.pdf';
 IF p_path IS DISTINCT FROM expected_path THEN RAISE EXCEPTION 'Invalid private report path'; END IF;
 UPDATE public.marketing_reports SET status='ready',storage_path=p_path,completed_at=now(),worker_id=NULL,lease_until=NULL,error_code=NULL WHERE id=r.id;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.marketing_report_fail(p_id uuid,p_worker uuid,p_fence integer,p_error text,p_retryable boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.marketing_reports;
BEGIN
 SELECT * INTO r FROM public.marketing_reports WHERE id=p_id FOR UPDATE;
 IF p_fence IS NULL OR p_fence<1 OR r.id IS NULL OR r.status<>'processing' OR r.worker_id IS DISTINCT FROM p_worker OR r.fence<>p_fence OR r.lease_until IS NULL OR r.lease_until<now() THEN RETURN false; END IF;
 IF p_error IS NULL OR p_error NOT IN ('snapshot_invalid','generation_failed','file_limit','storage_failed','commit_failed') THEN RAISE EXCEPTION 'Invalid report error'; END IF;
 UPDATE public.marketing_reports SET status=CASE WHEN p_retryable AND attempts<3 THEN 'queued' ELSE 'failed' END,
 error_code=p_error,worker_id=NULL,lease_until=NULL,next_attempt_at=now()+make_interval(secs=>30*(2^attempts)::integer) WHERE id=r.id;
 RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.marketing_report_snapshot_immutable(),public.marketing_report_job_allowed(uuid,text,boolean),public.marketing_report_enqueue(uuid,uuid,jsonb,text),public.marketing_report_claim(uuid,uuid),public.marketing_report_check_lease(uuid,uuid,integer),public.marketing_report_commit(uuid,uuid,integer,text),public.marketing_report_fail(uuid,uuid,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_report_job_allowed(uuid,text,boolean),public.marketing_report_enqueue(uuid,uuid,jsonb,text),public.marketing_report_claim(uuid,uuid),public.marketing_report_check_lease(uuid,uuid,integer),public.marketing_report_commit(uuid,uuid,integer,text),public.marketing_report_fail(uuid,uuid,integer,text,boolean) TO service_role;
