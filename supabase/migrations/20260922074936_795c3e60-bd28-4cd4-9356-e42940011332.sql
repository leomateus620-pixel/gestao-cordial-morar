ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS confirmed_field_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS remote_field_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS remote_snapshot_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_revision integer,
  ADD COLUMN IF NOT EXISTS echo_payload_hash text,
  ADD COLUMN IF NOT EXISTS echo_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS conflict_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remote_read_state text;

CREATE TABLE IF NOT EXISTS public.property_field_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  provider public.imobi_provider NOT NULL,
  publication_id uuid REFERENCES public.property_provider_publications(id) ON DELETE CASCADE,
  field text NOT NULL,
  scope text NOT NULL DEFAULT 'field',
  confirmed_value jsonb,
  local_value jsonb,
  remote_value jsonb,
  applied_value jsonb,
  classification text NOT NULL,
  resolution text NOT NULL DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  detected_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.property_field_conflicts TO authenticated;
GRANT ALL ON public.property_field_conflicts TO service_role;

ALTER TABLE public.property_field_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conflitos_leitura_autenticada"
  ON public.property_field_conflicts FOR SELECT TO authenticated USING (true);

CREATE POLICY "conflitos_resolucao_admin"
  ON public.property_field_conflicts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'));

CREATE UNIQUE INDEX IF NOT EXISTS property_field_conflicts_pending_idx
  ON public.property_field_conflicts (property_id, provider, field, scope)
  WHERE resolution = 'pending';

CREATE INDEX IF NOT EXISTS property_field_conflicts_property_idx
  ON public.property_field_conflicts (property_id, provider);

CREATE OR REPLACE FUNCTION public.property_field_conflicts_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_field_conflicts_touch_trg ON public.property_field_conflicts;
CREATE TRIGGER property_field_conflicts_touch_trg
  BEFORE UPDATE ON public.property_field_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.property_field_conflicts_touch();