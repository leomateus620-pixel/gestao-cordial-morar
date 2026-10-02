ALTER TABLE public.rental_nfse_emissions DROP CONSTRAINT rental_nfse_emissions_status_check;
ALTER TABLE public.rental_nfse_emissions ADD CONSTRAINT rental_nfse_emissions_status_check
  CHECK (status IN ('teste_ok','emitida','erro','cancelada','processando','incerto','nao_emitida'));

ALTER TABLE public.rental_nfse_emissions
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_reason text;

CREATE TABLE public.rental_nfse_emission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emission_id uuid REFERENCES public.rental_nfse_emissions(id) ON DELETE SET NULL,
  from_status text,
  to_status text NOT NULL,
  actor uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('usuario','sistema')),
  reason text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_nfse_emission_events_emission_idx ON public.rental_nfse_emission_events (emission_id, created_at);

GRANT SELECT ON public.rental_nfse_emission_events TO authenticated;
GRANT ALL ON public.rental_nfse_emission_events TO service_role;
ALTER TABLE public.rental_nfse_emission_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rental_nfse_events_select_admin" ON public.rental_nfse_emission_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));