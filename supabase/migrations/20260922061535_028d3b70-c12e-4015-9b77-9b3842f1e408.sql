ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS characteristic_codes jsonb,
  ADD COLUMN IF NOT EXISTS characteristic_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS characteristic_sync_incomplete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_field_verification jsonb;

ALTER TABLE public.property_sync_jobs
  ADD COLUMN IF NOT EXISTS changed_fields text[];