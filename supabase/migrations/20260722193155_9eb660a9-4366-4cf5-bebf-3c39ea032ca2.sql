
-- 1) Google Drive per-user connection (tokens stay backend-only)
CREATE TABLE IF NOT EXISTS public.google_drive_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.google_drive_connections TO authenticated;
GRANT ALL ON public.google_drive_connections TO service_role;
ALTER TABLE public.google_drive_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gdrive_conn_owner_select" ON public.google_drive_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- writes go through supabaseAdmin (service_role); no INSERT/UPDATE/DELETE policies for authenticated.

CREATE TRIGGER gdrive_conn_touch_updated_at
  BEFORE UPDATE ON public.google_drive_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Drive folder per rental contract
CREATE TABLE IF NOT EXISTS public.rental_drive_folders (
  contract_id uuid PRIMARY KEY REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  folder_id text NOT NULL,
  folder_name text NOT NULL,
  folder_url text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  google_email text NOT NULL,
  sync_enabled boolean NOT NULL DEFAULT true,
  sync_status text NOT NULL DEFAULT 'synced',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_drive_folders_status_chk CHECK (
    sync_status IN ('pending','syncing','synced','failed','disabled')
  )
);
GRANT SELECT ON public.rental_drive_folders TO authenticated;
GRANT ALL ON public.rental_drive_folders TO service_role;
ALTER TABLE public.rental_drive_folders ENABLE ROW LEVEL SECURITY;
-- Anyone who can see the contract can see the folder metadata; writes via service_role.
CREATE POLICY "rental_drive_folders_read" ON public.rental_drive_folders
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id)
  );

CREATE TRIGGER rental_drive_folders_touch_updated_at
  BEFORE UPDATE ON public.rental_drive_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Drive sync columns on rental_contract_documents
ALTER TABLE public.rental_contract_documents
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_web_view_url text,
  ADD COLUMN IF NOT EXISTS drive_mime_type text,
  ADD COLUMN IF NOT EXISTS drive_sync_status text NOT NULL DEFAULT 'not_enabled',
  ADD COLUMN IF NOT EXISTS drive_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS drive_last_error text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rental_docs_drive_status_chk'
  ) THEN
    ALTER TABLE public.rental_contract_documents
      ADD CONSTRAINT rental_docs_drive_status_chk CHECK (
        drive_sync_status IN (
          'not_enabled','pending','syncing','synced','failed','deleted','drive_only','cloud_only'
        )
      );
  END IF;
END $$;

-- 4) Drive audit log
CREATE TABLE IF NOT EXISTS public.rental_drive_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.rental_contracts(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.rental_contract_documents(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  result text NOT NULL,
  destination text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rental_drive_audit_log TO authenticated;
GRANT ALL ON public.rental_drive_audit_log TO service_role;
ALTER TABLE public.rental_drive_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_drive_audit_admins" ON public.rental_drive_audit_log
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS rental_drive_audit_contract_idx
  ON public.rental_drive_audit_log (contract_id, created_at DESC);
