ALTER TABLE public.rental_nfse_emissions
  ADD COLUMN IF NOT EXISTS identificador text,
  ADD COLUMN IF NOT EXISTS http_status int,
  ADD COLUMN IF NOT EXISTS duration_ms int,
  ADD COLUMN IF NOT EXISTS error_codes text[],
  ADD COLUMN IF NOT EXISTS serie_nfse text,
  ADD COLUMN IF NOT EXISTS data_emissao_nfse text,
  ADD COLUMN IF NOT EXISTS situacao_nfse text,
  ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS confirmacao_real_por uuid;

ALTER TABLE public.rental_nfse_emissions DROP CONSTRAINT rental_nfse_emissions_status_check;
ALTER TABLE public.rental_nfse_emissions ADD CONSTRAINT rental_nfse_emissions_status_check
  CHECK (status IN ('teste_ok','emitida','erro','cancelada','processando','incerto'));

CREATE UNIQUE INDEX rental_nfse_real_competencia_uniq
  ON public.rental_nfse_emissions (contract_id, competencia)
  WHERE modo_teste = false AND status IN ('processando','incerto','emitida');

CREATE UNIQUE INDEX rental_nfse_brand_processando_uniq
  ON public.rental_nfse_emissions (brand)
  WHERE status = 'processando';

ALTER TABLE public.nfse_provider_settings ADD CONSTRAINT nfse_provider_settings_endpoint_atende_check
  CHECK (endpoint_url ~ '^https://[a-z0-9-]+\.atende\.net(:[0-9]+)?/');

DROP POLICY IF EXISTS "rental_nfse_insert_admin_fin" ON public.rental_nfse_emissions;
DROP POLICY IF EXISTS "rental_nfse_update_admin_fin" ON public.rental_nfse_emissions;

GRANT ALL ON public.rental_nfse_emissions TO service_role;