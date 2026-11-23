CREATE TABLE public.rental_insurers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cnpj text,
  brands public.rental_brand[] NOT NULL DEFAULT ARRAY['cordial','morar']::public.rental_brand[],
  clause_template text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rental_insurers TO authenticated;
GRANT ALL ON public.rental_insurers TO service_role;
ALTER TABLE public.rental_insurers ENABLE ROW LEVEL SECURITY;
CREATE POLICY rental_insurers_select ON public.rental_insurers FOR SELECT TO authenticated USING (true);
CREATE POLICY rental_insurers_admin_insert ON public.rental_insurers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY rental_insurers_admin_update ON public.rental_insurers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY meta_reviewer_block ON public.rental_insurers AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.rental_insurers AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());