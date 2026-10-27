-- lovable-cron-fallback-reviewed: Meta Ads has no push for insights; user explicitly chose 10-minute refresh of campaign metrics.
DO $$ BEGIN
 IF to_regnamespace('cron') IS NULL THEN RAISE EXCEPTION 'pg_cron indisponível'; END IF;
 PERFORM cron.schedule('meta-ads-sync','*/10 * * * *','SELECT public.meta_ads_sync_dispatch()');
 PERFORM cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='meta-ads-sync'),schedule:='*/10 * * * *',active:=true);
END $$;