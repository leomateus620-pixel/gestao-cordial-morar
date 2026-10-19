-- Activates the A2 job after verifying the published endpoint (401 without credential, derivatives produced with internal credential).
DO $$ BEGIN
 PERFORM cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='public-site-media-derivatives'),active:=true);
END $$;