CREATE TABLE public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL CHECK (brand IN ('cordial','morar')),
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox','producao')),
  provider text NOT NULL DEFAULT 'sicredi' CHECK (provider = 'sicredi'),
  apelido text NOT NULL DEFAULT '' CHECK (char_length(apelido) <= 80),
  beneficiario_mascara text CHECK (char_length(beneficiario_mascara) <= 12),
  cooperativa_mascara text CHECK (char_length(cooperativa_mascara) <= 12),
  posto_mascara text CHECK (char_length(posto_mascara) <= 12),
  configurado boolean NOT NULL DEFAULT false,
  autenticado_em timestamptz,
  consulta_ok_em timestamptz,
  ultimo_teste_em timestamptz,
  ultimo_teste_ok boolean,
  ultimo_teste_mensagem text CHECK (char_length(ultimo_teste_mensagem) <= 400),
  emissao_habilitada boolean NOT NULL DEFAULT false,
  liberado_por uuid,
  liberado_em timestamptz,
  encargos jsonb NOT NULL DEFAULT '{"ativo": false}'::jsonb CHECK (jsonb_typeof(encargos) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_accounts_brand_ambiente_key UNIQUE (brand, ambiente),
  CONSTRAINT billing_accounts_release_requires_test CHECK (
    NOT emissao_habilitada
    OR (configurado AND consulta_ok_em IS NOT NULL AND liberado_por IS NOT NULL AND liberado_em IS NOT NULL)
  )
);
COMMENT ON TABLE public.billing_accounts IS 'Sicredi Cobrança account per brand x environment. Credentials live only in server secrets; production issuance stays off until an admin release after a successful connection test.';
GRANT SELECT ON public.billing_accounts TO authenticated;
GRANT ALL ON public.billing_accounts TO service_role;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_accounts_admin_select ON public.billing_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY meta_reviewer_block ON public.billing_accounts AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.billing_accounts AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());

CREATE TABLE public.billing_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('teste_conexao','salvar','liberar','desligar','liberacao_recusada')),
  ok boolean NOT NULL,
  actor uuid,
  mensagem text CHECK (char_length(mensagem) <= 400),
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_account_events_account_idx ON public.billing_account_events (account_id, created_at DESC);
GRANT SELECT ON public.billing_account_events TO authenticated;
GRANT ALL ON public.billing_account_events TO service_role;
ALTER TABLE public.billing_account_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_account_events_admin_select ON public.billing_account_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY meta_reviewer_block ON public.billing_account_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.billing_account_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());

CREATE OR REPLACE FUNCTION public.billing_accounts_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.brand IS DISTINCT FROM OLD.brand OR NEW.ambiente IS DISTINCT FROM OLD.ambiente THEN
    RAISE EXCEPTION 'billing account identity is immutable' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER billing_accounts_touch BEFORE UPDATE ON public.billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.billing_accounts_touch();