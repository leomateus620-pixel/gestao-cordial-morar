ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS codigo_cordial text,
  ADD COLUMN IF NOT EXISTS codigo_morar text;

CREATE INDEX IF NOT EXISTS properties_codigo_cordial_lower_idx ON public.properties (lower(codigo_cordial));
CREATE INDEX IF NOT EXISTS properties_codigo_morar_lower_idx ON public.properties (lower(codigo_morar));

-- Backfill 1: códigos reais vindos dos vínculos externos por provedor.
UPDATE public.properties p
SET codigo_cordial = pub.external_reference
FROM public.property_provider_publications pub
WHERE pub.property_id = p.id
  AND pub.provider = 'cordial'
  AND p.codigo_cordial IS NULL
  AND pub.external_reference IS NOT NULL
  AND pub.external_reference !~ '^gc-';

UPDATE public.properties p
SET codigo_morar = pub.external_reference
FROM public.property_provider_publications pub
WHERE pub.property_id = p.id
  AND pub.provider = 'morar'
  AND p.codigo_morar IS NULL
  AND pub.external_reference IS NOT NULL
  AND pub.external_reference !~ '^gc-';

-- Backfill 2: imóvel vinculado a um único provedor herda o código genérico legado.
UPDATE public.properties p
SET codigo_cordial = p.codigo
WHERE p.codigo IS NOT NULL
  AND p.codigo_cordial IS NULL
  AND p.codigo_morar IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.property_provider_publications x
    WHERE x.property_id = p.id AND x.provider = 'morar'
  )
  AND (
    p.carteira = 'cordial'
    OR EXISTS (
      SELECT 1 FROM public.property_provider_publications x
      WHERE x.property_id = p.id AND x.provider = 'cordial'
    )
  );

UPDATE public.properties p
SET codigo_morar = p.codigo
WHERE p.codigo IS NOT NULL
  AND p.codigo_morar IS NULL
  AND p.codigo_cordial IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.property_provider_publications x
    WHERE x.property_id = p.id AND x.provider = 'cordial'
  )
  AND (
    p.carteira = 'morar'
    OR EXISTS (
      SELECT 1 FROM public.property_provider_publications x
      WHERE x.property_id = p.id AND x.provider = 'morar'
    )
  );