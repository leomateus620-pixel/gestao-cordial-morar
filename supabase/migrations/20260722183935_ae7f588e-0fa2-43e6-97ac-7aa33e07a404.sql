
CREATE TABLE public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.real_estate_sales(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('entrada','parcela')),
  sequence int NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_payments_select" ON public.sale_payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_payments.sale_id
      AND (
        s.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  )
);

CREATE POLICY "sale_payments_insert" ON public.sale_payments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_payments.sale_id
      AND (
        s.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  )
);

CREATE POLICY "sale_payments_update" ON public.sale_payments FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_payments.sale_id
      AND (
        s.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  )
);

CREATE POLICY "sale_payments_delete" ON public.sale_payments FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.real_estate_sales s
    WHERE s.id = sale_payments.sale_id
      AND (
        s.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  )
);

CREATE INDEX sale_payments_due_idx ON public.sale_payments (due_date) WHERE paid = false;
CREATE INDEX sale_payments_sale_idx ON public.sale_payments (sale_id);

CREATE TRIGGER sale_payments_touch
  BEFORE UPDATE ON public.sale_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
