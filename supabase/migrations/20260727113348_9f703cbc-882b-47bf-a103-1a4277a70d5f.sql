-- ============================================================
-- TASK 1: fix Agenciamentos broker visibility
-- ============================================================
DROP POLICY IF EXISTS "agenciamentos_select_own_admin_or_secretaria" ON public.agenciamentos;
DROP POLICY IF EXISTS "agenciamentos_update_own_admin_or_secretaria" ON public.agenciamentos;

CREATE POLICY "agenciamentos_select_own_or_assigned"
  ON public.agenciamentos FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR corretor_id = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );

CREATE POLICY "agenciamentos_update_own_or_assigned"
  ON public.agenciamentos FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR corretor_id = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR corretor_id = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );

-- ============================================================
-- TASK 3/4: Sale commission plan
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sale_commission_plan (
  sale_id UUID PRIMARY KEY REFERENCES public.real_estate_sales(id) ON DELETE CASCADE,
  metodo TEXT NOT NULL DEFAULT 'pix',
  timing TEXT NOT NULL DEFAULT 'assinatura',
  data_pagamento DATE,
  parcelado BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sale_commission_plan_metodo_check CHECK (
    metodo IN ('pix','transferencia','boleto','dinheiro','cheque','desconto_repasse','outro')
  ),
  CONSTRAINT sale_commission_plan_timing_check CHECK (
    timing IN ('assinatura','entrada','primeira_parcela','conclusao','data_especifica','parcelado','outro')
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_commission_plan TO authenticated;
GRANT ALL ON public.sale_commission_plan TO service_role;

ALTER TABLE public.sale_commission_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_commission_plan_select"
  ON public.sale_commission_plan FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_commission_plan.sale_id
      AND (s.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'secretaria'::public.app_role))
  ));
CREATE POLICY "sale_commission_plan_insert"
  ON public.sale_commission_plan FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_commission_plan.sale_id
      AND (s.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'secretaria'::public.app_role))
  ));
CREATE POLICY "sale_commission_plan_update"
  ON public.sale_commission_plan FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_commission_plan.sale_id
      AND (s.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'secretaria'::public.app_role))
  ));
CREATE POLICY "sale_commission_plan_delete"
  ON public.sale_commission_plan FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_commission_plan.sale_id
      AND (s.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'secretaria'::public.app_role))
  ));

DROP TRIGGER IF EXISTS sale_commission_plan_touch ON public.sale_commission_plan;
CREATE TRIGGER sale_commission_plan_touch
  BEFORE UPDATE ON public.sale_commission_plan
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.sale_commission_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.real_estate_sales(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  due_date DATE NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sale_commission_installments_sale_idx
  ON public.sale_commission_installments(sale_id);
CREATE INDEX IF NOT EXISTS sale_commission_installments_due_idx
  ON public.sale_commission_installments(due_date) WHERE paid = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_commission_installments TO authenticated;
GRANT ALL ON public.sale_commission_installments TO service_role;

ALTER TABLE public.sale_commission_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_commission_installments_select"
  ON public.sale_commission_installments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_commission_installments.sale_id
      AND (s.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'secretaria'::public.app_role))
  ));
CREATE POLICY "sale_commission_installments_insert"
  ON public.sale_commission_installments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_commission_installments.sale_id
      AND (s.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'secretaria'::public.app_role))
  ));
CREATE POLICY "sale_commission_installments_update"
  ON public.sale_commission_installments FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_commission_installments.sale_id
      AND (s.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'secretaria'::public.app_role))
  ));
CREATE POLICY "sale_commission_installments_delete"
  ON public.sale_commission_installments FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_commission_installments.sale_id
      AND (s.user_id = auth.uid()
           OR public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'secretaria'::public.app_role))
  ));

DROP TRIGGER IF EXISTS sale_commission_installments_touch ON public.sale_commission_installments;
CREATE TRIGGER sale_commission_installments_touch
  BEFORE UPDATE ON public.sale_commission_installments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();