CREATE TABLE IF NOT EXISTS public.ad_platform_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 imobiliaria text,
 platform text NOT NULL CHECK (platform IN ('meta','google')),
 account_label text,
 access_token text,
 refresh_token text,
 expires_at timestamptz,
 scopes text,
 status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','expired','error')),
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ad_platform_connections TO service_role;
ALTER TABLE public.ad_platform_connections ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS ad_platform_connections_user_platform_idx ON public.ad_platform_connections (user_id, platform, coalesce(imobiliaria,''));

CREATE TABLE IF NOT EXISTS public.ad_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connection_id uuid NOT NULL REFERENCES public.ad_platform_connections(id) ON DELETE CASCADE,
 platform text NOT NULL,
 external_account_id text NOT NULL,
 name text,
 currency text,
 timezone text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (connection_id, external_account_id)
);
GRANT SELECT ON public.ad_accounts TO authenticated;
GRANT ALL ON public.ad_accounts TO service_role;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_accounts_select ON public.ad_accounts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.ad_platform_connections c WHERE c.id = connection_id AND (c.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE OR REPLACE FUNCTION public.ad_connections_public()
RETURNS TABLE (id uuid, user_id uuid, imobiliaria text, platform text, account_label text, expires_at timestamptz, scopes text, status text, last_error text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT c.id, c.user_id, c.imobiliaria, c.platform, c.account_label, c.expires_at, c.scopes, c.status, c.last_error, c.updated_at
 FROM public.ad_platform_connections c
 WHERE c.user_id = auth.uid() OR public.has_role(auth.uid(),'admin')
$$;
REVOKE ALL ON FUNCTION public.ad_connections_public() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ad_connections_public() TO authenticated;

ALTER TABLE public.marketing_campaigns
 ADD COLUMN IF NOT EXISTS platform text,
 ADD COLUMN IF NOT EXISTS external_campaign_id text,
 ADD COLUMN IF NOT EXISTS external_account_id text,
 ADD COLUMN IF NOT EXISTS source_url text,
 ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
 ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'manual',
 ADD COLUMN IF NOT EXISTS sync_error text;
CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaigns_external_uidx ON public.marketing_campaigns (user_id, platform, external_campaign_id) WHERE external_campaign_id IS NOT NULL;

ALTER TABLE public.marketing_daily_metrics
 ADD COLUMN IF NOT EXISTS impressions numeric,
 ADD COLUMN IF NOT EXISTS reach numeric,
 ADD COLUMN IF NOT EXISTS frequency numeric,
 ADD COLUMN IF NOT EXISTS spend numeric,
 ADD COLUMN IF NOT EXISTS cpc numeric,
 ADD COLUMN IF NOT EXISTS cpm numeric,
 ADD COLUMN IF NOT EXISTS ctr numeric,
 ADD COLUMN IF NOT EXISTS conversions numeric;

CREATE TABLE IF NOT EXISTS public.ad_sync_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','error')),
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 error text,
 range_start date,
 range_end date
);
GRANT SELECT ON public.ad_sync_jobs TO authenticated;
GRANT ALL ON public.ad_sync_jobs TO service_role;
ALTER TABLE public.ad_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_sync_jobs_select ON public.ad_sync_jobs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.marketing_campaigns m WHERE m.id = campaign_id AND (m.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE INDEX IF NOT EXISTS ad_sync_jobs_campaign_idx ON public.ad_sync_jobs (campaign_id, started_at DESC);