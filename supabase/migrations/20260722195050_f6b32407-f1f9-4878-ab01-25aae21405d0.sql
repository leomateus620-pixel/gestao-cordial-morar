
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (server) may read/write.

ALTER TABLE public.rental_drive_folders
  ALTER COLUMN owner_user_id DROP NOT NULL,
  ALTER COLUMN google_email DROP NOT NULL;

DROP TABLE IF EXISTS public.google_drive_connections;
