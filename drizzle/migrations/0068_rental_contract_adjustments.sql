CREATE TABLE public.rental_contract_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'desconto' CHECK (tipo IN ('desconto','acrescimo')),
  descricao text NOT NULL CHECK (char_length(btrim(descricao)) BETWEEN 1 AND 60),
  valor numeric(12,2) NOT NULL CHECK (valor > 0 AND valor <= 99999999),
  repassar_proprietario boolean NOT NULL DEFAULT true,
  inicio_competencia text NOT NULL CHECK (inicio_competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fim_competencia text NULL CHECK (fim_competencia IS NULL OR fim_competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_contract_adjustments_contract_idx ON public.rental_contract_adjustments(contract_id) WHERE ativo;
GRANT SELECT, INSERT, UPDATE ON public.rental_contract_adjustments TO authenticated;
GRANT ALL ON public.rental_contract_adjustments TO service_role;
CREATE OR REPLACE FUNCTION public.rental_contract_adjustments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.fim_competencia IS NOT NULL AND NEW.fim_competencia < NEW.inicio_competencia THEN
    RAISE EXCEPTION 'Competência final anterior à inicial.';
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.contract_id := OLD.contract_id; NEW.created_by := OLD.created_by; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rental_contract_adjustments_guard BEFORE INSERT OR UPDATE ON public.rental_contract_adjustments
FOR EACH ROW EXECUTE FUNCTION public.rental_contract_adjustments_guard();
ALTER TABLE public.rental_contract_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY rental_contract_adjustments_select ON public.rental_contract_adjustments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY rental_contract_adjustments_insert ON public.rental_contract_adjustments FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY rental_contract_adjustments_update ON public.rental_contract_adjustments FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY meta_reviewer_block ON public.rental_contract_adjustments AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());