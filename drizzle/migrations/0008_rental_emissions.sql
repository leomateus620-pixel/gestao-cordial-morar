CREATE TYPE public.rental_emission_type AS ENUM ('nfse', 'recibo', 'boleto');
CREATE TABLE public.rental_emissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
 tipo public.rental_emission_type NOT NULL,
 competencia text NOT NULL CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 status text NOT NULL DEFAULT 'emitido' CHECK (status IN ('emitindo','emitido','erro')),
 file_path text,
 file_name text,
 external_url text,
 copy_value text,
 numero text,
 valores jsonb NOT NULL DEFAULT '{}'::jsonb,
 provider text,
 nfse_emission_id uuid REFERENCES public.rental_nfse_emissions(id) ON DELETE SET NULL,
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_emissions TO authenticated;
GRANT ALL ON public.rental_emissions TO service_role;
ALTER TABLE public.rental_emissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY rental_emissions_select ON public.rental_emissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY rental_emissions_insert ON public.rental_emissions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY rental_emissions_update ON public.rental_emissions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')))) WITH CHECK (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY rental_emissions_delete ON public.rental_emissions FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE INDEX rental_emissions_latest_idx ON public.rental_emissions (contract_id, tipo, competencia, created_at DESC);