-- ============ Vídeos do imóvel (Etapa 8) ============
CREATE TABLE IF NOT EXISTS public.property_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  checksum text,
  position integer NOT NULL DEFAULT 0,
  upload_status text NOT NULL DEFAULT 'ready',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_videos TO authenticated;
GRANT ALL ON public.property_videos TO service_role;
ALTER TABLE public.property_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vídeos visíveis para quem vê o imóvel"
  ON public.property_videos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id));
CREATE POLICY "Vídeos podem ser anexados por quem edita o imóvel"
  ON public.property_videos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id));
CREATE POLICY "Vídeos podem ser atualizados por quem edita o imóvel"
  ON public.property_videos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id));
CREATE POLICY "Vídeos podem ser removidos por quem edita o imóvel"
  ON public.property_videos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id));

CREATE INDEX IF NOT EXISTS property_videos_property_idx ON public.property_videos (property_id, position);

DROP TRIGGER IF EXISTS property_videos_touch ON public.property_videos;
CREATE TRIGGER property_videos_touch BEFORE UPDATE ON public.property_videos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Pasta do imóvel no Drive ============
CREATE TABLE IF NOT EXISTS public.property_drive_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE,
  root_folder_id text NOT NULL,
  property_folder_id text,
  property_folder_url text,
  horizontal_folder_id text,
  vertical_folder_id text,
  videos_folder_id text,
  folder_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.property_drive_folders TO authenticated;
GRANT ALL ON public.property_drive_folders TO service_role;
ALTER TABLE public.property_drive_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pasta visível para quem vê o imóvel"
  ON public.property_drive_folders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id));

DROP TRIGGER IF EXISTS property_drive_folders_touch ON public.property_drive_folders;
CREATE TRIGGER property_drive_folders_touch BEFORE UPDATE ON public.property_drive_folders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Arquivos enviados ao Drive ============
CREATE TABLE IF NOT EXISTS public.property_drive_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  image_id uuid REFERENCES public.property_images(id) ON DELETE SET NULL,
  video_id uuid REFERENCES public.property_videos(id) ON DELETE SET NULL,
  category text NOT NULL,
  drive_file_id text,
  drive_file_name text,
  source_checksum text,
  size_bytes bigint,
  mime_type text,
  sync_status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_message text,
  uploaded_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.property_drive_files TO authenticated;
GRANT ALL ON public.property_drive_files TO service_role;
ALTER TABLE public.property_drive_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Arquivos do Drive visíveis para quem vê o imóvel"
  ON public.property_drive_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id));

CREATE UNIQUE INDEX IF NOT EXISTS property_drive_files_image_idx
  ON public.property_drive_files (image_id) WHERE image_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS property_drive_files_video_idx
  ON public.property_drive_files (video_id) WHERE video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS property_drive_files_status_idx
  ON public.property_drive_files (property_id, sync_status);

DROP TRIGGER IF EXISTS property_drive_files_touch ON public.property_drive_files;
CREATE TRIGGER property_drive_files_touch BEFORE UPDATE ON public.property_drive_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Fila de sincronização ============
CREATE TABLE IF NOT EXISTS public.property_drive_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.property_drive_jobs TO service_role;
ALTER TABLE public.property_drive_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins acompanham a fila do Drive"
  ON public.property_drive_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS property_drive_jobs_active_idx
  ON public.property_drive_jobs (property_id)
  WHERE status IN ('pending', 'processing', 'retry');
CREATE INDEX IF NOT EXISTS property_drive_jobs_claim_idx
  ON public.property_drive_jobs (status, run_after);

DROP TRIGGER IF EXISTS property_drive_jobs_touch ON public.property_drive_jobs;
CREATE TRIGGER property_drive_jobs_touch BEFORE UPDATE ON public.property_drive_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.property_drive_claim_jobs(_worker text, _limit integer DEFAULT 2, _lease_seconds integer DEFAULT 240)
RETURNS SETOF public.property_drive_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT id FROM public.property_drive_jobs
     WHERE status IN ('pending', 'retry')
       AND run_after <= now()
       AND (lease_expires_at IS NULL OR lease_expires_at < now())
     ORDER BY run_after ASC
     LIMIT GREATEST(1, LEAST(_limit, 5))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.property_drive_jobs j
     SET status = 'processing',
         attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = _worker,
         lease_expires_at = now() + make_interval(secs => GREATEST(60, _lease_seconds))
    FROM picked
   WHERE j.id = picked.id
  RETURNING j.*;
$$;

REVOKE ALL ON FUNCTION public.property_drive_claim_jobs(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_drive_claim_jobs(text, integer, integer) TO service_role;