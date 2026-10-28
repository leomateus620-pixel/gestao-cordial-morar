-- A single STABLE RPC reads every page under one PostgreSQL snapshot. No PII in output.
CREATE FUNCTION public.marketing_report_snapshot(p_agency text,p_since date,p_until date,p_account text DEFAULT NULL,p_platform text DEFAULT NULL,p_status text DEFAULT NULL,p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; part jsonb; items jsonb:='[]'; n integer:=1; total integer; funnel jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.has_role(auth.uid(),'meta_reviewer') OR NOT public.marketing_can_act('generate_report',p_agency) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 IF p_agency IS NULL OR p_agency NOT IN ('cordial','morar') OR p_since IS NULL OR p_until IS NULL OR p_until<p_since OR p_until-p_since>366 THEN RAISE EXCEPTION 'Invalid scope'; END IF;
 LOOP
  part:=public.marketing_campaigns_safe(p_imobiliaria=>p_agency,p_since=>p_since,p_until=>p_until,p_page=>n,p_page_size=>100,p_search=>p_search,p_platform=>p_platform,p_status=>p_status,p_account_id=>regexp_replace(p_account,'^act_',''));
  total:=(part->>'total')::integer;
  IF total>5000 THEN RAISE EXCEPTION 'Report scope exceeds 5000 campaigns; narrow filters'; END IF;
  items:=items||coalesce(part->'items','[]');
  EXIT WHEN n*100>=total; n:=n+1;
 END LOOP;
 SELECT jsonb_build_object('submissions',count(*),'attendances',count(DISTINCT attendance_id),'linkedSubmissions',count(campaign_id)) INTO funnel
 FROM public.meta_lead_submissions s
 WHERE s.imobiliaria=p_agency AND s.privacy_deleted_at IS NULL
 AND (s.received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_since AND p_until
 AND (p_platform IS NULL OR p_platform='meta')
 AND (p_account IS NULL OR EXISTS(SELECT 1 FROM public.ad_platform_connections c WHERE c.id=s.connection_id AND c.imobiliaria=p_agency AND regexp_replace(c.external_account_id,'^act_','')=regexp_replace(p_account,'^act_','')))
 AND ((p_status IS NULL AND nullif(p_search,'') IS NULL) OR s.campaign_id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(items)));
 RETURN jsonb_build_object('items',items,'total',total,'financial_visible',part->'financial_visible','captured_at',statement_timestamp(),'funnel',funnel);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.marketing_report_snapshot(text,date,date,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_report_snapshot(text,date,date,text,text,text,text) TO authenticated;
--> statement-breakpoint
CREATE TABLE public.marketing_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), author_id uuid NOT NULL REFERENCES auth.users(id),
 imobiliaria text NOT NULL CHECK(imobiliaria IN ('cordial','morar')), kind text NOT NULL CHECK(kind IN ('executive','detailed','funnel')),
 status text NOT NULL DEFAULT 'generating' CHECK(status IN ('generating','ready','failed')),
 scope jsonb NOT NULL, snapshot jsonb NOT NULL, snapshot_hash text NOT NULL, version integer NOT NULL DEFAULT 1,
 financial boolean NOT NULL, row_count integer NOT NULL, storage_path text, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX marketing_reports_scope_idx ON public.marketing_reports(imobiliaria,author_id,created_at DESC);
ALTER TABLE public.marketing_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.marketing_reports AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
REVOKE ALL ON public.marketing_reports FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.marketing_reports TO service_role;
CREATE POLICY marketing_reports_read ON public.marketing_reports FOR SELECT TO authenticated
 USING (author_id=auth.uid() AND NOT public.has_role(auth.uid(),'meta_reviewer') AND public.marketing_can_operate(imobiliaria) AND (NOT financial OR public.has_role(auth.uid(),'admin')));
-- Browser receives no table access: all metadata and download URLs go through authorized handlers.
--> statement-breakpoint
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('marketing-reports','marketing-reports',false,10485760,ARRAY['application/pdf']) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=ARRAY['application/pdf'];
-- No authenticated storage policies. The service creates and signs after current authorization.
