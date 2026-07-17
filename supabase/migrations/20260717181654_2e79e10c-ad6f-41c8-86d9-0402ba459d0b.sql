
-- ============ rental_contract_tenants ============
CREATE TABLE public.rental_contract_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.rental_tenants(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, tenant_id)
);
CREATE INDEX idx_rct_contract ON public.rental_contract_tenants(contract_id);
CREATE INDEX idx_rct_tenant ON public.rental_contract_tenants(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_contract_tenants TO authenticated;
GRANT ALL ON public.rental_contract_tenants TO service_role;

ALTER TABLE public.rental_contract_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rct owner all"
  ON public.rental_contract_tenants
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = contract_id
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = contract_id
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

CREATE TRIGGER trg_rct_updated_at
  BEFORE UPDATE ON public.rental_contract_tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ rental_contract_guarantors ============
CREATE TABLE public.rental_contract_guarantors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  guarantor_id uuid REFERENCES public.rental_guarantors(id) ON DELETE SET NULL,
  tipo public.rental_guarantee_type NOT NULL,
  valor_caucao numeric(12,2),
  seguro_seguradora text,
  seguro_apolice text,
  seguro_valor_mensal numeric(12,2),
  is_primary boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rcg_contract ON public.rental_contract_guarantors(contract_id);
CREATE INDEX idx_rcg_guarantor ON public.rental_contract_guarantors(guarantor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_contract_guarantors TO authenticated;
GRANT ALL ON public.rental_contract_guarantors TO service_role;

ALTER TABLE public.rental_contract_guarantors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rcg owner all"
  ON public.rental_contract_guarantors
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = contract_id
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = contract_id
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

CREATE TRIGGER trg_rcg_updated_at
  BEFORE UPDATE ON public.rental_contract_guarantors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Backfill ============
INSERT INTO public.rental_contract_tenants (contract_id, tenant_id, is_primary, position)
SELECT c.id, c.tenant_id, true, 0
FROM public.rental_contracts c
ON CONFLICT (contract_id, tenant_id) DO NOTHING;

INSERT INTO public.rental_contract_guarantors (
  contract_id, guarantor_id, tipo, valor_caucao,
  seguro_seguradora, seguro_apolice, seguro_valor_mensal,
  is_primary, position
)
SELECT
  c.id,
  c.guarantor_id,
  c.garantia_tipo,
  c.valor_caucao,
  c.seguro_seguradora,
  c.seguro_apolice,
  c.seguro_valor_mensal,
  true,
  0
FROM public.rental_contracts c
WHERE c.garantia_tipo IS NOT NULL
  AND c.garantia_tipo <> 'sem_garantia';
