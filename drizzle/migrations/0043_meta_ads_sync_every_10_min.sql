DO $$ BEGIN
 IF to_regnamespace('cron') IS NOT NULL AND EXISTS (SELECT 1 FROM cron.job WHERE jobname='meta-ads-sync') THEN
  PERFORM cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='meta-ads-sync'),schedule:='*/10 * * * *',active:=true);
 END IF;
END $$;