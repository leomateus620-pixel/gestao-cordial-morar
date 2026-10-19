-- lovable-cron-fallback-reviewed: bounded image-derivative worker from PR #33 (2 items per run), created inactive; per-minute cadence keeps new public photos ready within ~1 minute.
-- A2: worker dispatch + cron from supabase/migrations/20261018170000_cordial_public_experience.sql.
-- Difference: the HTTPS origin (a public URL, not a secret) comes from app_settings.site_media_worker_origin.
-- Authentication still uses public.internal_worker_headers(). Job created inactive.
CREATE FUNCTION public.site_media_worker_dispatch() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $$
DECLARE origin text; request_id bigint;
BEGIN
 SELECT value#>>'{}' INTO origin FROM public.app_settings WHERE key='site_media_worker_origin';
 IF origin IS NULL OR btrim(origin)!~'^https://[^/?#]+/?$' THEN
  INSERT INTO public_site_media_worker_health(id,last_config_error) VALUES(true,'origin_missing_or_invalid') ON CONFLICT(id) DO UPDATE SET last_config_error=excluded.last_config_error;
  RETURN NULL;
 END IF;
 request_id:=net.http_post(url:=rtrim(btrim(origin),'/')||'/api/public/hooks/site-media-worker',headers:=public.internal_worker_headers(),body:='{}'::jsonb,timeout_milliseconds:=120000);
 INSERT INTO public_site_media_worker_health(id,last_dispatched_at,last_request_id,last_config_error) VALUES(true,now(),request_id,NULL) ON CONFLICT(id) DO UPDATE SET last_dispatched_at=excluded.last_dispatched_at,last_request_id=excluded.last_request_id,last_config_error=NULL;
 RETURN request_id;
EXCEPTION WHEN OTHERS THEN
 INSERT INTO public_site_media_worker_health(id,last_config_error) VALUES(true,SQLSTATE) ON CONFLICT(id) DO UPDATE SET last_config_error=excluded.last_config_error;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.site_media_worker_dispatch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.site_media_worker_dispatch() TO service_role;
DO $$ BEGIN
 IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('public.internal_worker_headers()') IS NOT NULL THEN
  PERFORM cron.schedule('public-site-media-derivatives','* * * * *','SELECT public.site_media_worker_dispatch()');
  PERFORM cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='public-site-media-derivatives'),active:=false);
 END IF;
END $$;