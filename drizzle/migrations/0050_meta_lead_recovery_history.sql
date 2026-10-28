CREATE TABLE public.meta_lead_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),submission_id uuid NOT NULL REFERENCES public.meta_lead_submissions(id),
 imobiliaria text,status text NOT NULL,previous_status text,occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meta_lead_events_submission_idx ON public.meta_lead_events(submission_id,occurred_at);
ALTER TABLE public.meta_lead_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.meta_lead_events AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
REVOKE ALL ON public.meta_lead_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.meta_lead_events TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.meta_lead_record_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.broker_id IS DISTINCT FROM OLD.broker_id THEN
  INSERT INTO public.meta_lead_events(submission_id,imobiliaria,status,previous_status)
   VALUES(NEW.id,NEW.imobiliaria,NEW.status,CASE WHEN TG_OP='UPDATE' THEN OLD.status END);
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.meta_lead_record_transition() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER meta_lead_transition AFTER INSERT OR UPDATE ON public.meta_lead_submissions FOR EACH ROW EXECUTE FUNCTION public.meta_lead_record_transition();
--> statement-breakpoint
CREATE TABLE public.meta_lead_recovery_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mapping_id uuid NOT NULL REFERENCES public.meta_lead_form_mappings(id),
 requested_by uuid NOT NULL REFERENCES auth.users(id),range_start timestamptz NOT NULL,range_end timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','done','failed','cancelled')),
 cursor_after text,cursor_history text[] NOT NULL DEFAULT '{}',processed integer NOT NULL DEFAULT 0,pages integer NOT NULL DEFAULT 0,attempts integer NOT NULL DEFAULT 0,
 worker_id uuid,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(range_end>=range_start AND range_end-range_start<=interval '30 days')
);
CREATE UNIQUE INDEX meta_lead_recovery_active_idx ON public.meta_lead_recovery_jobs(mapping_id,range_start,range_end) WHERE status IN ('queued','processing');
CREATE INDEX meta_lead_recovery_queue_idx ON public.meta_lead_recovery_jobs(next_attempt_at) WHERE status IN ('queued','processing');
ALTER TABLE public.meta_lead_recovery_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.meta_lead_recovery_jobs AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
REVOKE ALL ON public.meta_lead_recovery_jobs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.meta_lead_recovery_jobs TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.meta_lead_recovery_request(p_mapping_id uuid,p_since timestamptz,p_until timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.meta_lead_form_mappings; job uuid;
BEGIN
 SELECT * INTO m FROM public.meta_lead_form_mappings WHERE id=p_mapping_id AND enabled;
 IF m.id IS NULL OR NOT public.marketing_can_act('manage_connection',m.imobiliaria) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 IF p_since IS NULL OR p_until IS NULL OR p_until<p_since OR p_until-p_since>interval '30 days' OR p_until>now()+interval '1 minute' THEN RAISE EXCEPTION 'Invalid recovery range'; END IF;
 INSERT INTO public.meta_lead_recovery_jobs(mapping_id,requested_by,range_start,range_end) VALUES(m.id,auth.uid(),p_since,p_until)
 ON CONFLICT(mapping_id,range_start,range_end) WHERE status IN ('queued','processing') DO UPDATE SET mapping_id=EXCLUDED.mapping_id RETURNING id INTO job;
 RETURN job;
END $$;
REVOKE ALL ON FUNCTION public.meta_lead_recovery_request(uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.meta_lead_recovery_request(uuid,timestamptz,timestamptz) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.meta_lead_recovery_claim(p_worker uuid) RETURNS SETOF public.meta_lead_recovery_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH exhausted AS(UPDATE public.meta_lead_recovery_jobs SET status='failed',error_code='attempts_exhausted',worker_id=NULL,lease_until=NULL WHERE status='processing' AND lease_until<now() AND attempts>=6 RETURNING id),
 candidate AS(SELECT id FROM public.meta_lead_recovery_jobs WHERE attempts<6 AND ((status='queued' AND next_attempt_at<=now()) OR(status='processing' AND lease_until<now())) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE public.meta_lead_recovery_jobs j SET status='processing',worker_id=p_worker,lease_until=now()+interval '2 minutes',attempts=j.attempts+1,updated_at=now() FROM candidate c WHERE j.id=c.id RETURNING j.*
$$;
REVOKE ALL ON FUNCTION public.meta_lead_recovery_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_lead_recovery_claim(uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.meta_lead_recovery_commit(p_job uuid,p_worker uuid,p_events jsonb,p_after text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.meta_lead_recovery_jobs;m public.meta_lead_form_mappings;event jsonb;
BEGIN
 SELECT * INTO j FROM public.meta_lead_recovery_jobs WHERE id=p_job FOR UPDATE;
 IF j.id IS NULL OR j.status<>'processing' OR j.worker_id IS DISTINCT FROM p_worker OR j.lease_until<now() THEN RAISE EXCEPTION 'Stale recovery lease'; END IF;
 SELECT * INTO m FROM public.meta_lead_form_mappings WHERE id=j.mapping_id AND enabled;
 IF m.id IS NULL OR NOT public.marketing_actor_can_act(j.requested_by,'manage_connection',m.imobiliaria) THEN RAISE EXCEPTION 'Scope revoked' USING ERRCODE='42501'; END IF;
 IF p_events IS NULL OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>100 OR length(p_after)>4096 OR (p_after IS NOT NULL AND md5(p_after)=ANY(j.cursor_history)) OR j.pages>=1000 THEN RAISE EXCEPTION 'Invalid recovery page'; END IF;
 FOR event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  IF event->>'page_id' IS DISTINCT FROM m.page_id OR event->>'form_id' IS DISTINCT FROM m.form_id OR event->>'created_time' IS NULL OR event->>'leadgen_id' IS NULL OR event->>'leadgen_id' !~ '^[0-9]{1,80}$' OR (event->>'created_time')::timestamptz NOT BETWEEN j.range_start AND j.range_end THEN RAISE EXCEPTION 'Recovery context mismatch'; END IF;
 END LOOP;
 -- Same ingest identity as webhook; deleted tombstones cannot be resurrected.
 PERFORM public.meta_lead_ingest(m.app_id,p_events);
 UPDATE public.meta_lead_recovery_jobs SET cursor_after=p_after,cursor_history=CASE WHEN p_after IS NULL THEN cursor_history ELSE array_append(cursor_history,md5(p_after)) END,processed=processed+jsonb_array_length(p_events),pages=pages+1,
  status=CASE WHEN p_after IS NULL THEN 'done' ELSE 'queued' END,worker_id=NULL,lease_until=NULL,attempts=0,next_attempt_at=now()+interval '10 seconds',updated_at=now() WHERE id=j.id;
END $$;
REVOKE ALL ON FUNCTION public.meta_lead_recovery_commit(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_lead_recovery_commit(uuid,uuid,jsonb,text) TO service_role;
