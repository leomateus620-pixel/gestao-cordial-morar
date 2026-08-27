-- 1) Reserva atômica de código por provedor -------------------------------
CREATE TABLE IF NOT EXISTS public.provider_code_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider public.imobi_provider NOT NULL,
  code TEXT NOT NULL,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  reserved_by UUID,
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_code_reservations_unique
  ON public.provider_code_reservations (provider, code);
CREATE INDEX IF NOT EXISTS provider_code_reservations_status_idx
  ON public.provider_code_reservations (status, expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_code_reservations TO authenticated;
GRANT ALL ON public.provider_code_reservations TO service_role;

ALTER TABLE public.provider_code_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcr_select" ON public.provider_code_reservations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcr_insert" ON public.provider_code_reservations
  FOR INSERT TO authenticated WITH CHECK (reserved_by = auth.uid());
CREATE POLICY "pcr_update" ON public.provider_code_reservations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS provider_code_reservations_touch ON public.provider_code_reservations;
CREATE TRIGGER provider_code_reservations_touch
  BEFORE UPDATE ON public.provider_code_reservations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.release_expired_provider_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.provider_code_reservations
     SET status = 'expired'
   WHERE status = 'reserved' AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.reserve_provider_code(
  _provider public.imobi_provider,
  _property_id UUID DEFAULT NULL,
  _ttl_minutes INTEGER DEFAULT 120
)
RETURNS TABLE(code TEXT, reservation_id UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next BIGINT;
  v_code TEXT;
  v_id UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.release_expired_provider_codes();
  -- Serializa a geração por provedor: dois cadastros simultâneos nunca colidem.
  PERFORM pg_advisory_xact_lock(hashtext('provider_code:' || _provider::TEXT));

  SELECT GREATEST(
    COALESCE((
      SELECT max((p.codigo)::BIGINT)
      FROM public.properties p
      WHERE p.codigo ~ '^[0-9]+$'
        AND (
          p.carteira::TEXT = _provider::TEXT
          OR EXISTS (
            SELECT 1 FROM public.property_provider_publications ppp
            WHERE ppp.property_id = p.id AND ppp.provider = _provider
          )
        )
    ), 0),
    COALESCE((
      SELECT max((ppp.external_reference)::BIGINT)
      FROM public.property_provider_publications ppp
      WHERE ppp.provider = _provider AND ppp.external_reference ~ '^[0-9]+$'
    ), 0),
    COALESCE((
      SELECT max((r.code)::BIGINT)
      FROM public.provider_code_reservations r
      WHERE r.provider = _provider AND r.code ~ '^[0-9]+$' AND r.status <> 'expired'
    ), 0)
  ) + 1 INTO v_next;

  v_code := v_next::TEXT;
  v_expires := now() + make_interval(mins => GREATEST(5, COALESCE(_ttl_minutes, 120)));

  INSERT INTO public.provider_code_reservations
    (provider, code, property_id, reserved_by, expires_at)
  VALUES (_provider, v_code, _property_id, auth.uid(), v_expires)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_code, v_id, v_expires;
END $$;

GRANT EXECUTE ON FUNCTION public.reserve_provider_code(public.imobi_provider, UUID, INTEGER) TO authenticated;

-- 2) Fotos: estado de upload, metadados e capa única -----------------------
ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS upload_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS alt_text TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER;

-- Mantém no máximo uma capa por imóvel.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY property_id ORDER BY position, created_at) AS rn
  FROM public.property_images WHERE is_cover
)
UPDATE public.property_images pi SET is_cover = false
FROM ranked WHERE pi.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS property_images_single_cover
  ON public.property_images (property_id) WHERE is_cover;

CREATE INDEX IF NOT EXISTS pipp_publication_status_idx
  ON public.property_image_provider_publications (publication_id, status);

-- 3) Índices de filtro e busca do catálogo ---------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS properties_operacao_idx ON public.properties (operacao) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_cidade_idx ON public.properties (cidade) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_bairro_idx ON public.properties (bairro) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_tipo_idx ON public.properties (tipo) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_valor_idx ON public.properties (valor) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_dormitorios_idx ON public.properties (dormitorios) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_area_principal_idx ON public.properties (area_principal) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS properties_codigo_trgm ON public.properties USING gin (codigo gin_trgm_ops);
CREATE INDEX IF NOT EXISTS properties_localizacao_trgm ON public.properties USING gin (localizacao_exibida gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ppp_property_provider_idx ON public.property_provider_publications (provider, property_id);