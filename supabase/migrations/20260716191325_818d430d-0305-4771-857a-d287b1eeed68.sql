
CREATE TABLE public.rental_contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rental_contract_documents_contract_idx ON public.rental_contract_documents(contract_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_contract_documents TO authenticated;
GRANT ALL ON public.rental_contract_documents TO service_role;

ALTER TABLE public.rental_contract_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_docs_select" ON public.rental_contract_documents
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rental_contracts c
  WHERE c.id = contract_id
    AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
));

CREATE POLICY "rental_docs_insert" ON public.rental_contract_documents
FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = contract_id
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

CREATE POLICY "rental_docs_delete" ON public.rental_contract_documents
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rental_contracts c
  WHERE c.id = contract_id
    AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
));

-- Storage policies for the rental-documents bucket.
-- Path convention: <contract_id>/<uuid>-<filename>
CREATE POLICY "rental_docs_storage_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'rental-documents'
  AND EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id::text = split_part(name, '/', 1)
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

CREATE POLICY "rental_docs_storage_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'rental-documents'
  AND EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id::text = split_part(name, '/', 1)
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

CREATE POLICY "rental_docs_storage_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'rental-documents'
  AND EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id::text = split_part(name, '/', 1)
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);
