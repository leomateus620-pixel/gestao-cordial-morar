-- Preserve evidence when positive days disappear instead of freezing or blindly deleting.
CREATE TABLE public.ad_metric_reconciliations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id),
 range_start date NOT NULL,range_end date NOT NULL,response_hash text NOT NULL,missing_dates jsonb NOT NULL,
 prior_metrics jsonb NOT NULL,state text NOT NULL DEFAULT 'observed' CHECK(state IN ('observed','verified','applied')),
 first_seen_at timestamptz NOT NULL DEFAULT now(),verified_at timestamptz,applied_at timestamptz,
 UNIQUE(campaign_id,range_start,range_end,response_hash)
);
ALTER TABLE public.ad_metric_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.ad_metric_reconciliations AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
REVOKE ALL ON public.ad_metric_reconciliations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ad_metric_reconciliations TO service_role;
CREATE INDEX ad_metric_reconciliations_scope_idx ON public.ad_metric_reconciliations(campaign_id,range_start,range_end,first_seen_at);
