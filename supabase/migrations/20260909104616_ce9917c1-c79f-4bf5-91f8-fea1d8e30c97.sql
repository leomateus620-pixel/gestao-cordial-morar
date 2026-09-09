CREATE TABLE public.nfse_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL UNIQUE CHECK (brand IN ('cordial','morar')),
  cnpj text NOT NULL DEFAULT '',
  inscricao_municipal text,
  razao_social text,
  cidade_tom text NOT NULL DEFAULT '8847',
  codigo_ibge_municipio text NOT NULL DEFAULT '4317202',
  endpoint_url text NOT NULL DEFAULT 'https://santarosa.atende.net/?pg=rest&service=WNERestServiceNFSe',
  codigo_item_lista_servico text NOT NULL DEFAULT '10.05',
  codigo_nbs text,
  aliquota_iss numeric(7,4) NOT NULL DEFAULT 3.0000,
  situacao_tributaria text NOT NULL DEFAULT '0',
  tributa_municipio_prestador text NOT NULL DEFAULT 'S' CHECK (tributa_municipio_prestador IN ('S','N')),
  ibs_cbs_c_ind_op text NOT NULL DEFAULT '020101',
  ibs_cbs_cst text NOT NULL DEFAULT '011',
  ibs_cbs_c_class_trib text NOT NULL DEFAULT '011004',
  modo_teste boolean NOT NULL DEFAULT true,
  simples_nacional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_provider_settings TO authenticated;
GRANT ALL ON public.nfse_provider_settings TO service_role;
ALTER TABLE public.nfse_provider_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfse_settings_select_admin_fin" ON public.nfse_provider_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "nfse_settings_insert_admin_fin" ON public.nfse_provider_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "nfse_settings_update_admin_fin" ON public.nfse_provider_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "nfse_settings_delete_admin" ON public.nfse_provider_settings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER nfse_provider_settings_touch
  BEFORE UPDATE ON public.nfse_provider_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.nfse_provider_settings (brand) VALUES ('cordial'), ('morar');

CREATE TABLE public.rental_nfse_emissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  brand text NOT NULL,
  competencia date NOT NULL,
  valor numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'erro' CHECK (status IN ('teste_ok','emitida','erro','cancelada')),
  modo_teste boolean NOT NULL DEFAULT true,
  numero_nfse text,
  codigo_verificador text,
  link_pdf text,
  request_xml text,
  response_raw text,
  error_message text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rental_nfse_emissions_contract_idx
  ON public.rental_nfse_emissions (contract_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_nfse_emissions TO authenticated;
GRANT ALL ON public.rental_nfse_emissions TO service_role;
ALTER TABLE public.rental_nfse_emissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_nfse_select_contract_access" ON public.rental_nfse_emissions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_contracts rc WHERE rc.id = contract_id));
CREATE POLICY "rental_nfse_insert_admin_fin" ON public.rental_nfse_emissions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "rental_nfse_update_admin_fin" ON public.rental_nfse_emissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));
CREATE POLICY "rental_nfse_delete_admin" ON public.rental_nfse_emissions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));