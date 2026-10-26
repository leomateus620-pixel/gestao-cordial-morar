CREATE OR REPLACE FUNCTION public.meta_ads_worker_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,cron AS $$
 SELECT coalesce((SELECT active FROM cron.job WHERE jobname='meta-ads-leadgen'),false)
$$;
REVOKE ALL ON FUNCTION public.meta_ads_worker_active() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_ads_worker_active() TO service_role;