ALTER TABLE public.property_image_provider_publications
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_class text;

CREATE INDEX IF NOT EXISTS property_image_pub_retry_idx
  ON public.property_image_provider_publications (next_retry_at)
  WHERE status = 'error' AND next_retry_at IS NOT NULL;