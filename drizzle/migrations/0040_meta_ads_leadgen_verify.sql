DO $$ BEGIN
 IF to_regclass('public.meta_lead_submissions') IS NULL OR to_regprocedure('public.meta_lead_ingest(text,jsonb)') IS NULL THEN
  RAISE EXCEPTION '0039_meta_ads_leadgen not applied';
 END IF;
END $$;