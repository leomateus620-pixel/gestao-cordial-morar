CREATE TABLE public.internal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_documents TO authenticated;
GRANT ALL ON public.internal_documents TO service_role;

ALTER TABLE public.internal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view internal documents"
  ON public.internal_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert internal documents"
  ON public.internal_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND uploaded_by = auth.uid());

CREATE POLICY "Admins can update internal documents"
  ON public.internal_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete internal documents"
  ON public.internal_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER internal_documents_touch_updated_at
  BEFORE UPDATE ON public.internal_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX internal_documents_created_at_idx ON public.internal_documents (created_at DESC);

CREATE POLICY "Admins can read internal document files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'internal-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload internal document files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'internal-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update internal document files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'internal-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete internal document files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'internal-documents' AND public.has_role(auth.uid(), 'admin'));