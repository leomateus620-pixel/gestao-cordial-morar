
-- =========================================================
-- Reports backend: financeiro + marketing tables + indexes
-- =========================================================

-- ---------- financeiro_lancamentos ----------
CREATE TABLE IF NOT EXISTS public.financeiro_lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria text NOT NULL CHECK (imobiliaria IN ('cordial','morar','ambas')),
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
  categoria text NOT NULL,
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  data_competencia date NOT NULL,
  data_pagamento date,
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pago','Pendente','Atrasado','Cancelado')),
  origem text,
  origem_id uuid,
  corretor_id uuid,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_lancamentos TO authenticated;
GRANT ALL ON public.financeiro_lancamentos TO service_role;

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financeiro_select_own_or_admin"
  ON public.financeiro_lancamentos FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "financeiro_insert_own"
  ON public.financeiro_lancamentos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "financeiro_update_own_or_admin"
  ON public.financeiro_lancamentos FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "financeiro_delete_own_or_admin"
  ON public.financeiro_lancamentos FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_financeiro_updated_at
  BEFORE UPDATE ON public.financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_financeiro_user_data ON public.financeiro_lancamentos (user_id, data_competencia DESC);
CREATE INDEX IF NOT EXISTS idx_financeiro_user_status ON public.financeiro_lancamentos (user_id, status);
CREATE INDEX IF NOT EXISTS idx_financeiro_imob_data ON public.financeiro_lancamentos (imobiliaria, data_competencia DESC);
CREATE INDEX IF NOT EXISTS idx_financeiro_user_tipo_data ON public.financeiro_lancamentos (user_id, tipo, data_competencia DESC);

-- ---------- marketing_campaigns ----------
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imobiliaria text NOT NULL CHECK (imobiliaria IN ('cordial','morar','ambas')),
  nome text NOT NULL,
  canal text NOT NULL,
  objetivo text NOT NULL,
  status text NOT NULL DEFAULT 'Ativa',
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  investimento numeric(14,2) NOT NULL DEFAULT 0 CHECK (investimento >= 0),
  responsavel text,
  observacoes text,
  diagnostico text,
  referencia_url text,
  leads_esperados integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_camp_select_own_or_admin"
  ON public.marketing_campaigns FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "mkt_camp_insert_own"
  ON public.marketing_campaigns FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mkt_camp_update_own_or_admin"
  ON public.marketing_campaigns FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "mkt_camp_delete_own_or_admin"
  ON public.marketing_campaigns FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_mkt_camp_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_mkt_camp_user_start ON public.marketing_campaigns (user_id, data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_camp_user_status ON public.marketing_campaigns (user_id, status);
CREATE INDEX IF NOT EXISTS idx_mkt_camp_imob_start ON public.marketing_campaigns (imobiliaria, data_inicio DESC);

-- ---------- marketing_daily_metrics ----------
CREATE TABLE IF NOT EXISTS public.marketing_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data date NOT NULL,
  leads integer NOT NULL DEFAULT 0 CHECK (leads >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  accesses integer NOT NULL DEFAULT 0 CHECK (accesses >= 0),
  views integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  investimento numeric(14,2) NOT NULL DEFAULT 0 CHECK (investimento >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, data)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_daily_metrics TO authenticated;
GRANT ALL ON public.marketing_daily_metrics TO service_role;

ALTER TABLE public.marketing_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_daily_select_own_or_admin"
  ON public.marketing_daily_metrics FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "mkt_daily_insert_own"
  ON public.marketing_daily_metrics FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mkt_daily_update_own_or_admin"
  ON public.marketing_daily_metrics FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "mkt_daily_delete_own_or_admin"
  ON public.marketing_daily_metrics FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_mkt_daily_updated_at
  BEFORE UPDATE ON public.marketing_daily_metrics
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_mkt_daily_campaign_data ON public.marketing_daily_metrics (campaign_id, data);
CREATE INDEX IF NOT EXISTS idx_mkt_daily_user_data ON public.marketing_daily_metrics (user_id, data);

-- ---------- Auxiliary indexes for report queries on existing tables ----------
CREATE INDEX IF NOT EXISTS idx_agenciamentos_imob_created ON public.agenciamentos (imobiliaria, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agenciamentos_createdby_created ON public.agenciamentos (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendances_createdby_created ON public.attendances (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendances_status_created ON public.attendances (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_createdby_created ON public.clients (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_createdby_datainicio ON public.rental_contracts (created_by, data_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_status_datafim ON public.rental_contracts (status, data_fim);
CREATE INDEX IF NOT EXISTS idx_real_estate_sales_user_date_status ON public.real_estate_sales (user_id, sale_date DESC, sale_status);
