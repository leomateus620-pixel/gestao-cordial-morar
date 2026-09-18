CREATE TABLE public.property_hotspot_cleanup (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  provider public.imobi_provider NOT NULL,
  external_id text NOT NULL,
  codigo text,
  public_url text,
  publication_status text,
  remote_snapshot jsonb,
  remote_pontos_fortes text,
  local_pontos_fortes text,
  local_internal_text text,
  expected_final text NOT NULL DEFAULT '',
  classification text NOT NULL DEFAULT 'incerto',
  state text NOT NULL DEFAULT 'pendente',
  priority integer NOT NULL DEFAULT 1,
  marked_cleaned_at timestamptz,
  marked_cleaned_by uuid,
  last_checked_at timestamptz,
  check_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_hotspot_cleanup_provider_external_key UNIQUE (provider, external_id),
  CONSTRAINT property_hotspot_cleanup_state_check CHECK (state IN ('pendente', 'limpo_manual', 'reconferido')),
  CONSTRAINT property_hotspot_cleanup_classification_check CHECK (classification IN ('somente_interno', 'misto', 'incerto'))
);

CREATE INDEX property_hotspot_cleanup_queue_idx ON public.property_hotspot_cleanup (state, priority DESC, provider);

GRANT SELECT, UPDATE ON public.property_hotspot_cleanup TO authenticated;
GRANT ALL ON public.property_hotspot_cleanup TO service_role;

ALTER TABLE public.property_hotspot_cleanup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hotspot_cleanup_admin_select" ON public.property_hotspot_cleanup
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "hotspot_cleanup_admin_update" ON public.property_hotspot_cleanup
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER property_hotspot_cleanup_touch
  BEFORE UPDATE ON public.property_hotspot_cleanup
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();