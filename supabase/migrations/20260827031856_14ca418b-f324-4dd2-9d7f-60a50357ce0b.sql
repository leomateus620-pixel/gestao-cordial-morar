-- ============ runs ============
CREATE TABLE public.property_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.imobi_provider NOT NULL,
  mode TEXT NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run','commit','incremental')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','paused','completed','completed_with_errors','failed','cancelled')),
  pages_discovered INTEGER NOT NULL DEFAULT 0,
  pages_processed INTEGER NOT NULL DEFAULT 0,
  properties_discovered INTEGER NOT NULL DEFAULT 0,
  properties_created INTEGER NOT NULL DEFAULT 0,
  properties_linked INTEGER NOT NULL DEFAULT 0,
  properties_updated INTEGER NOT NULL DEFAULT 0,
  properties_ambiguous INTEGER NOT NULL DEFAULT 0,
  properties_ignored INTEGER NOT NULL DEFAULT 0,
  properties_errored INTEGER NOT NULL DEFAULT 0,
  images_discovered INTEGER NOT NULL DEFAULT 0,
  images_imported INTEGER NOT NULL DEFAULT 0,
  images_errored INTEGER NOT NULL DEFAULT 0,
  checkpoint JSONB NOT NULL DEFAULT '{}'::JSONB,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_error_message TEXT,
  requested_by UUID,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.property_import_runs TO authenticated;
GRANT ALL ON public.property_import_runs TO service_role;
ALTER TABLE public.property_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import runs" ON public.property_import_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE UNIQUE INDEX property_import_runs_one_active
  ON public.property_import_runs (provider)
  WHERE status IN ('queued','running','paused');
CREATE INDEX property_import_runs_provider_created ON public.property_import_runs (provider, created_at DESC);
CREATE TRIGGER property_import_runs_touch BEFORE UPDATE ON public.property_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ jobs ============
CREATE TABLE public.property_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.property_import_runs(id) ON DELETE CASCADE,
  provider public.imobi_provider NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('fetch_page','hydrate_property','download_image','finalize')),
  page INTEGER,
  external_property_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  idempotency_key TEXT NOT NULL,
  status public.property_sync_job_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  locked_by TEXT,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  last_error_category TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
GRANT SELECT ON public.property_import_jobs TO authenticated;
GRANT ALL ON public.property_import_jobs TO service_role;
ALTER TABLE public.property_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read import jobs" ON public.property_import_jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE UNIQUE INDEX property_import_jobs_idem ON public.property_import_jobs (run_id, idempotency_key);
CREATE INDEX property_import_jobs_queue ON public.property_import_jobs (status, next_run_at);
CREATE INDEX property_import_jobs_run ON public.property_import_jobs (run_id, status);
CREATE TRIGGER property_import_jobs_touch BEFORE UPDATE ON public.property_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ candidates (staging) ============
CREATE TABLE public.property_import_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.property_import_runs(id) ON DELETE CASCADE,
  provider public.imobi_provider NOT NULL,
  external_property_id TEXT NOT NULL,
  external_reference TEXT,
  remote_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  normalized JSONB NOT NULL DEFAULT '{}'::JSONB,
  remote_hash TEXT,
  match_property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  match_confidence NUMERIC,
  match_reason TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','exact_match','probable_match','ambiguous','ignored','committed','error','external_discovered')),
  resolution TEXT CHECK (resolution IN ('link_only','update_local','create_separate','ignore')),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  images_count INTEGER NOT NULL DEFAULT 0,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.property_import_candidates TO authenticated;
GRANT ALL ON public.property_import_candidates TO service_role;
ALTER TABLE public.property_import_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read import candidates" ON public.property_import_candidates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins resolve import candidates" ON public.property_import_candidates
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE UNIQUE INDEX property_import_candidates_unique
  ON public.property_import_candidates (run_id, provider, external_property_id);
CREATE INDEX property_import_candidates_status ON public.property_import_candidates (run_id, status);
CREATE TRIGGER property_import_candidates_touch BEFORE UPDATE ON public.property_import_candidates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ provider publications: baseline / hashes ============
ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS remote_observed_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_published_hash TEXT,
  ADD COLUMN IF NOT EXISTS local_desired_hash TEXT,
  ADD COLUMN IF NOT EXISTS baseline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS system_managed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS import_run_id UUID REFERENCES public.property_import_runs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS property_provider_publications_external_unique
  ON public.property_provider_publications (provider, external_property_id)
  WHERE external_property_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS property_provider_publications_property_provider_unique
  ON public.property_provider_publications (property_id, provider);

-- ============ properties: arquivamento / retirada ============
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT,
  ADD COLUMN IF NOT EXISTS removal_state TEXT
    CHECK (removal_state IS NULL OR removal_state IN ('pending_removal','removed'));

CREATE INDEX IF NOT EXISTS properties_archived_idx ON public.properties (archived_at);

-- ============ claim de jobs de importação ============
CREATE OR REPLACE FUNCTION public.property_import_claim_jobs(
  _worker TEXT,
  _limit INTEGER DEFAULT 5,
  _lease_seconds INTEGER DEFAULT 120
)
RETURNS SETOF public.property_import_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.property_import_jobs
     SET status = 'retry', locked_at = NULL, lock_expires_at = NULL, locked_by = NULL
   WHERE status = 'processing' AND lock_expires_at IS NOT NULL AND lock_expires_at < now();

  RETURN QUERY
  WITH claimed AS (
    SELECT j.id
      FROM public.property_import_jobs j
      JOIN public.property_import_runs r ON r.id = j.run_id
     WHERE j.status IN ('pending','retry')
       AND j.next_run_at <= now()
       AND r.status IN ('queued','running')
     ORDER BY j.next_run_at
     FOR UPDATE OF j SKIP LOCKED
     LIMIT GREATEST(1, _limit)
  )
  UPDATE public.property_import_jobs j
     SET status = 'processing',
         attempts = j.attempts + 1,
         locked_at = now(),
         lock_expires_at = now() + make_interval(secs => GREATEST(30, _lease_seconds)),
         locked_by = _worker
    FROM claimed c
   WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.property_import_claim_jobs(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.property_import_claim_jobs(TEXT, INTEGER, INTEGER) TO service_role;