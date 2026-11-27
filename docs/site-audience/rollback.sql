-- Run only with explicit approval to erase all raw audience data and coverage.
-- Revert the application first or keep the collection disabled in both environments.
-- This rollback does not change any existing site, catalog, lead, tag or CRM table.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('cron.unschedule(text)') IS NOT NULL THEN
    IF EXISTS (SELECT FROM cron.job WHERE jobname = 'site-audience-retention') THEN
      PERFORM cron.unschedule('site-audience-retention');
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.site_audience_configure(text,text,text,boolean);
DROP FUNCTION IF EXISTS public.site_audience_collection_status(text,text,text);
DROP FUNCTION IF EXISTS public.site_audience_ingest(text,text,text,text,uuid,uuid,jsonb,text,text,text,text);
DROP FUNCTION IF EXISTS public.site_audience_report(text,text,text,int,text,text);
DROP SCHEMA IF EXISTS site_audience CASCADE;
COMMIT;

-- Keep the migration journal intact. A later rollout needs a new forward migration
-- rather than editing or rerunning a previously recorded version.
