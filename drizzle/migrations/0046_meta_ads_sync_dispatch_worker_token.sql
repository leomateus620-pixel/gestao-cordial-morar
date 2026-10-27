CREATE OR REPLACE FUNCTION public.meta_ads_sync_dispatch() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $$
DECLARE tok text;
BEGIN
 SELECT value#>>'{}' INTO tok FROM public.app_settings WHERE key='worker_hook_token';
 IF tok IS NULL OR tok='' THEN RETURN NULL; END IF;
 RETURN net.http_post(url:='https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/ads-sync',headers:=jsonb_build_object('Content-Type','application/json','apikey',tok),body:='{}'::jsonb,timeout_milliseconds:=120000);
END $$;
REVOKE ALL ON FUNCTION public.meta_ads_sync_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_ads_sync_dispatch() TO service_role;