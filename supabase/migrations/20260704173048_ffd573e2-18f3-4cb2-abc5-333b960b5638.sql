
CREATE TABLE public.real_estate_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria TEXT NOT NULL DEFAULT 'cordial',
  property_id UUID,
  property_name TEXT NOT NULL,
  property_address TEXT NOT NULL,
  property_neighborhood TEXT,
  property_city_state TEXT,
  property_type TEXT NOT NULL DEFAULT 'Outro',
  bedrooms INTEGER,
  bathrooms INTEGER,
  area_m2 NUMERIC,
  previous_asking_price NUMERIC,
  buyer_name TEXT NOT NULL,
  buyer_document TEXT,
  buyer_phone TEXT,
  buyer_email TEXT,
  buyer_address TEXT,
  buyer_observations TEXT,
  sale_value NUMERIC NOT NULL CHECK (sale_value >= 0),
  sale_date DATE NOT NULL,
  sale_status TEXT NOT NULL DEFAULT 'concluida',
  document_status TEXT NOT NULL DEFAULT 'contrato_pendente',
  payment_method TEXT,
  payment_details TEXT,
  commission_value NUMERIC,
  commission_percentage NUMERIC,
  responsible_agent TEXT,
  contract_file_path TEXT,
  contract_file_name TEXT,
  supporting_document_file_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_real_estate_sales_user_id ON public.real_estate_sales(user_id);
CREATE INDEX idx_real_estate_sales_sale_date ON public.real_estate_sales(sale_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.real_estate_sales TO authenticated;
GRANT ALL ON public.real_estate_sales TO service_role;

ALTER TABLE public.real_estate_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sales or admins view all"
  ON public.real_estate_sales FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users insert own sales"
  ON public.real_estate_sales FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own sales or admins update all"
  ON public.real_estate_sales FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users delete own sales or admins delete all"
  ON public.real_estate_sales FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_real_estate_sales_updated_at
  BEFORE UPDATE ON public.real_estate_sales
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies for sale-documents bucket (bucket will be created separately)
CREATE POLICY "Users read own sale docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sale-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "Users upload own sale docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sale-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own sale docs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sale-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "Users delete own sale docs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sale-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );
