CREATE TABLE public.rental_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id),
  brand text NOT NULL CHECK (brand IN ('cordial','morar')),
  competencia text NOT NULL CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  ocorrencia int NOT NULL DEFAULT 1 CHECK (ocorrencia >= 1),
  status text NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','aguardando_recebimento','em_conferencia','aprovado','pago_manual','confirmado','divergente')),
  cobrado_centavos bigint NOT NULL DEFAULT 0 CHECK (cobrado_centavos >= 0),
  recebido_centavos bigint CHECK (recebido_centavos >= 0),
  previsto_centavos bigint NOT NULL DEFAULT 0,
  aprovado_centavos bigint CHECK (aprovado_centavos > 0),
  destino_versao int,
  revision int NOT NULL DEFAULT 1,
  regras_validadas boolean NOT NULL DEFAULT false,
  comprovante_path text,
  referencia_externa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, competencia, ocorrencia),
  CHECK (aprovado_centavos IS NULL OR recebido_centavos IS NULL OR aprovado_centavos <= recebido_centavos)
);
GRANT ALL ON public.rental_payouts TO service_role;
ALTER TABLE public.rental_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.rental_payouts AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.rental_payouts AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());

CREATE TABLE public.rental_payout_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.rental_payouts(id),
  revision int NOT NULL,
  origem text NOT NULL,
  descricao text NOT NULL,
  sinal smallint NOT NULL CHECK (sinal IN (1,-1)),
  valor_centavos bigint NOT NULL CHECK (valor_centavos >= 0),
  destinatario text NOT NULL CHECK (destinatario IN ('proprietario','imobiliaria')),
  regra text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rental_payout_lines TO service_role;
ALTER TABLE public.rental_payout_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.rental_payout_lines AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.rental_payout_lines AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());

CREATE TABLE public.rental_payout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.rental_payouts(id),
  de text, para text NOT NULL,
  motivo text,
  actor uuid,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rental_payout_events TO service_role;
ALTER TABLE public.rental_payout_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.rental_payout_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.rental_payout_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());

ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS rental_contract_id uuid REFERENCES public.rental_contracts(id);
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS rental_kind text CHECK (rental_kind IN ('entrada','saida'));
CREATE UNIQUE INDEX IF NOT EXISTS inspections_rental_entrada_uniq ON public.inspections (rental_contract_id) WHERE rental_kind = 'entrada';