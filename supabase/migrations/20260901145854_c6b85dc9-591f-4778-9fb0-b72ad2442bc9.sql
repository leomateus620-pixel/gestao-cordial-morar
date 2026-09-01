CREATE TABLE public.property_drive_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/jpeg',
  size_bytes bigint,
  checksum text,
  position integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_drive_photos TO authenticated;
GRANT ALL ON public.property_drive_photos TO service_role;

ALTER TABLE public.property_drive_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fotos verticais visíveis para quem vê o imóvel"
  ON public.property_drive_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_drive_photos.property_id));

CREATE POLICY "Fotos verticais podem ser anexadas por quem edita o imóvel"
  ON public.property_drive_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_drive_photos.property_id));

CREATE POLICY "Fotos verticais podem ser atualizadas por quem edita o imóvel"
  ON public.property_drive_photos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_drive_photos.property_id));

CREATE POLICY "Fotos verticais podem ser removidas por quem edita o imóvel"
  ON public.property_drive_photos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_drive_photos.property_id));

CREATE INDEX property_drive_photos_property_idx ON public.property_drive_photos (property_id, position);

CREATE TRIGGER property_drive_photos_touch
  BEFORE UPDATE ON public.property_drive_photos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.property_drive_files
  ADD COLUMN drive_photo_id uuid REFERENCES public.property_drive_photos(id) ON DELETE CASCADE;

CREATE INDEX property_drive_files_drive_photo_idx ON public.property_drive_files (drive_photo_id);