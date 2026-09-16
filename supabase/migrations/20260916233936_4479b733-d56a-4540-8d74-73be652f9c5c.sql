-- Anexos (fotos e links) dos compromissos da agenda
CREATE TABLE IF NOT EXISTS public.agenda_event_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'foto' CHECK (kind IN ('foto','link')),
  file_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  url text,
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_event_attachments_event_idx
  ON public.agenda_event_attachments(event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_event_attachments TO authenticated;
GRANT ALL ON public.agenda_event_attachments TO service_role;

ALTER TABLE public.agenda_event_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agenda_attachments_select ON public.agenda_event_attachments;
CREATE POLICY agenda_attachments_select
ON public.agenda_event_attachments FOR SELECT TO authenticated
USING (public.agenda_can_access(event_id));

DROP POLICY IF EXISTS agenda_attachments_insert ON public.agenda_event_attachments;
CREATE POLICY agenda_attachments_insert
ON public.agenda_event_attachments FOR INSERT TO authenticated
WITH CHECK (public.agenda_can_edit(event_id));

DROP POLICY IF EXISTS agenda_attachments_update ON public.agenda_event_attachments;
CREATE POLICY agenda_attachments_update
ON public.agenda_event_attachments FOR UPDATE TO authenticated
USING (public.agenda_can_edit(event_id))
WITH CHECK (public.agenda_can_edit(event_id));

DROP POLICY IF EXISTS agenda_attachments_delete ON public.agenda_event_attachments;
CREATE POLICY agenda_attachments_delete
ON public.agenda_event_attachments FOR DELETE TO authenticated
USING (public.agenda_can_edit(event_id));

-- Arquivos no Storage: primeira pasta = id do compromisso
DROP POLICY IF EXISTS agenda_attachments_objects_select ON storage.objects;
CREATE POLICY agenda_attachments_objects_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'agenda-attachments'
  AND public._try_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.agenda_can_access(public._try_uuid((storage.foldername(name))[1]))
);

DROP POLICY IF EXISTS agenda_attachments_objects_insert ON storage.objects;
CREATE POLICY agenda_attachments_objects_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'agenda-attachments'
  AND public._try_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.agenda_can_edit(public._try_uuid((storage.foldername(name))[1]))
);

DROP POLICY IF EXISTS agenda_attachments_objects_delete ON storage.objects;
CREATE POLICY agenda_attachments_objects_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'agenda-attachments'
  AND public._try_uuid((storage.foldername(name))[1]) IS NOT NULL
  AND public.agenda_can_edit(public._try_uuid((storage.foldername(name))[1]))
);