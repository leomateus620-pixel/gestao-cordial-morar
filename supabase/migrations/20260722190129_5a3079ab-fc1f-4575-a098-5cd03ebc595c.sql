-- Create sale_documents table for multiple attachments per sale
CREATE TABLE public.sale_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.real_estate_sales(id) ON DELETE CASCADE,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_documents TO authenticated;
GRANT ALL ON public.sale_documents TO service_role;

ALTER TABLE public.sale_documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX sale_documents_sale_id_idx ON public.sale_documents (sale_id);

-- Policies mirror real_estate_sales access (owner OR admin)
CREATE POLICY "View sale documents"
ON public.sale_documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

CREATE POLICY "Insert sale documents"
ON public.sale_documents FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

CREATE POLICY "Update sale documents"
ON public.sale_documents FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

CREATE POLICY "Delete sale documents"
ON public.sale_documents FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_id
      AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);