
-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.rental_property_type AS ENUM ('casa','apartamento','sala_comercial','terreno','kitnet','outro');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.rental_property_status AS ENUM ('disponivel','alugado','manutencao','reservado','inativo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.rental_contract_status AS ENUM ('ativo','pendente_assinatura','vencido','encerrado','cancelado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.rental_payment_status AS ENUM ('em_dia','vence_hoje','atrasado','pago','pendente');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.rental_brand AS ENUM ('cordial','morar','ambas');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- rental_properties
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rental_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  apelido TEXT NOT NULL,
  tipo public.rental_property_type NOT NULL DEFAULT 'apartamento',
  logradouro TEXT NOT NULL DEFAULT '',
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  quartos INT,
  banheiros INT,
  vagas INT,
  area_m2 NUMERIC,
  valor_sugerido NUMERIC,
  status public.rental_property_status NOT NULL DEFAULT 'disponivel',
  observacoes TEXT,
  brand public.rental_brand NOT NULL DEFAULT 'cordial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_properties TO authenticated;
GRANT ALL ON public.rental_properties TO service_role;
ALTER TABLE public.rental_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_properties_select" ON public.rental_properties FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rental_properties_insert" ON public.rental_properties FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "rental_properties_update" ON public.rental_properties FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rental_properties_delete" ON public.rental_properties FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_rental_properties_updated
  BEFORE UPDATE ON public.rental_properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_rental_properties_created_by ON public.rental_properties(created_by);

-- ============================================================
-- rental_tenants
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rental_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT,
  data_nascimento DATE,
  endereco TEXT,
  profissao TEXT,
  renda_aproximada NUMERIC,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_tenants TO authenticated;
GRANT ALL ON public.rental_tenants TO service_role;
ALTER TABLE public.rental_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_tenants_select" ON public.rental_tenants FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rental_tenants_insert" ON public.rental_tenants FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "rental_tenants_update" ON public.rental_tenants FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rental_tenants_delete" ON public.rental_tenants FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_rental_tenants_updated
  BEFORE UPDATE ON public.rental_tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_rental_tenants_created_by ON public.rental_tenants(created_by);

-- ============================================================
-- rental_guarantors
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rental_guarantors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  profissao TEXT,
  vinculo TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_guarantors TO authenticated;
GRANT ALL ON public.rental_guarantors TO service_role;
ALTER TABLE public.rental_guarantors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_guarantors_select" ON public.rental_guarantors FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rental_guarantors_insert" ON public.rental_guarantors FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "rental_guarantors_update" ON public.rental_guarantors FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rental_guarantors_delete" ON public.rental_guarantors FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_rental_guarantors_updated
  BEFORE UPDATE ON public.rental_guarantors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- rental_contracts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rental_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.rental_properties(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES public.rental_tenants(id) ON DELETE RESTRICT,
  guarantor_id UUID REFERENCES public.rental_guarantors(id) ON DELETE SET NULL,
  valor_mensal NUMERIC NOT NULL,
  valor_caucao NUMERIC,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  dia_vencimento INT NOT NULL DEFAULT 10,
  status public.rental_contract_status NOT NULL DEFAULT 'pendente_assinatura',
  payment_status public.rental_payment_status NOT NULL DEFAULT 'pendente',
  proximo_vencimento DATE,
  data_encerramento DATE,
  observacoes TEXT,
  brand public.rental_brand NOT NULL DEFAULT 'cordial',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_contracts TO authenticated;
GRANT ALL ON public.rental_contracts TO service_role;
ALTER TABLE public.rental_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_contracts_select" ON public.rental_contracts FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rental_contracts_insert" ON public.rental_contracts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "rental_contracts_update" ON public.rental_contracts FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "rental_contracts_delete" ON public.rental_contracts FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_rental_contracts_updated
  BEFORE UPDATE ON public.rental_contracts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_rental_contracts_property ON public.rental_contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_tenant ON public.rental_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rental_contracts_created_by ON public.rental_contracts(created_by);

-- One active/pending contract per property
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rental_contracts_active_property
  ON public.rental_contracts(property_id)
  WHERE status IN ('ativo','pendente_assinatura');

-- ============================================================
-- Validation trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.rental_contracts_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.valor_mensal IS NULL OR NEW.valor_mensal <= 0 THEN
    RAISE EXCEPTION 'O valor do aluguel deve ser maior que zero.';
  END IF;
  IF NEW.data_fim <= NEW.data_inicio THEN
    RAISE EXCEPTION 'A data de fim deve ser posterior à data de início.';
  END IF;
  IF NEW.dia_vencimento < 1 OR NEW.dia_vencimento > 31 THEN
    RAISE EXCEPTION 'Dia de vencimento inválido.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rental_contracts_validate() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_rental_contracts_validate
  BEFORE INSERT OR UPDATE ON public.rental_contracts
  FOR EACH ROW EXECUTE FUNCTION public.rental_contracts_validate();

-- ============================================================
-- Property status sync trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.rental_contracts_sync_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.status = 'ativo' THEN
      UPDATE public.rental_properties
        SET status = 'alugado'
        WHERE id = NEW.property_id;
    ELSIF NEW.status IN ('encerrado','cancelado','vencido') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.rental_contracts
        WHERE property_id = NEW.property_id
          AND id <> NEW.id
          AND status IN ('ativo','pendente_assinatura')
      ) THEN
        UPDATE public.rental_properties
          SET status = 'disponivel'
          WHERE id = NEW.property_id
            AND status = 'alugado';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rental_contracts_sync_property() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_rental_contracts_sync_property
  AFTER INSERT OR UPDATE ON public.rental_contracts
  FOR EACH ROW EXECUTE FUNCTION public.rental_contracts_sync_property();
