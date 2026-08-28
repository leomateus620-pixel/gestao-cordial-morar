CREATE OR REPLACE FUNCTION public.region_display_label(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(btrim(coalesce(_raw, '')), '\s+', ' ', 'g'),
        '^[Bb]airro\s+', ''
      ),
      '\s+-\s+Loteamento\s+', ' · Loteamento ', 'g'
    ),
  '')
$$;

CREATE OR REPLACE FUNCTION public.region_normalized_key(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(
        translate(
          public.region_display_label(_raw),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
        )
      ),
      '[^a-z0-9]+', ' ', 'g'
    ),
  '')
$$;

CREATE INDEX IF NOT EXISTS idx_ppp_property_provider_status
  ON public.property_provider_publications (property_id, provider, status);

CREATE INDEX IF NOT EXISTS idx_properties_operacao_valor
  ON public.properties (operacao, valor DESC)
  WHERE archived_at IS NULL AND valor IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_property_portfolio_analytics(
  _provider_filter text DEFAULT 'todos',
  _operation_filter text DEFAULT 'todos'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH links AS (
  SELECT
    p.id,
    p.operacao::text                                         AS operacao,
    p.tipo,
    p.valor,
    p.valor_modo::text                                       AS valor_modo,
    p.codigo_cordial,
    p.codigo_morar,
    p.codigo,
    p.updated_at,
    public.region_normalized_key(p.bairro)                   AS region_key,
    public.region_display_label(p.bairro)                    AS region_label,
    EXISTS (SELECT 1 FROM public.property_provider_publications x
             WHERE x.property_id = p.id AND x.provider = 'cordial') AS in_cordial,
    EXISTS (SELECT 1 FROM public.property_provider_publications x
             WHERE x.property_id = p.id AND x.provider = 'morar')   AS in_morar
  FROM public.properties p
  WHERE p.archived_at IS NULL
    AND COALESCE(p.is_draft, false) = false
    AND EXISTS (SELECT 1 FROM public.property_provider_publications x WHERE x.property_id = p.id)
), scoped AS (
  SELECT * FROM links
  WHERE (
      _provider_filter = 'todos'
      OR (_provider_filter = 'cordial' AND in_cordial)
      OR (_provider_filter = 'morar' AND in_morar)
      OR (_provider_filter = 'ambos' AND in_cordial AND in_morar)
    )
    AND (_operation_filter = 'todos' OR operacao = _operation_filter)
), totals AS (
  SELECT
    count(*)::int                                                    AS unique_properties,
    count(*) FILTER (WHERE operacao = 'venda')::int                  AS sale_properties,
    count(*) FILTER (WHERE operacao = 'aluguel')::int                AS rental_properties,
    count(*) FILTER (WHERE in_cordial)::int                          AS cordial_properties,
    count(*) FILTER (WHERE in_morar)::int                            AS morar_properties,
    count(*) FILTER (WHERE in_cordial AND in_morar)::int             AS both_providers,
    count(*) FILTER (WHERE region_key IS NULL)::int                  AS missing_region
  FROM scoped
), regions AS (
  SELECT
    s.region_key                                              AS key,
    min(s.region_label)                                       AS label,
    count(*)::int                                             AS unique_count,
    count(*) FILTER (WHERE s.operacao = 'venda')::int          AS sale_count,
    count(*) FILTER (WHERE s.operacao = 'aluguel')::int        AS rental_count,
    count(*) FILTER (WHERE s.in_cordial)::int                  AS cordial_count,
    count(*) FILTER (WHERE s.in_morar)::int                    AS morar_count,
    count(*) FILTER (WHERE s.in_cordial AND s.in_morar)::int   AS both_count
  FROM scoped s
  WHERE s.region_key IS NOT NULL
  GROUP BY s.region_key
  ORDER BY count(*) DESC, min(s.region_label) ASC
  LIMIT 12
), ranked AS (
  SELECT
    s.*,
    row_number() OVER (PARTITION BY s.operacao ORDER BY s.valor DESC, s.updated_at DESC NULLS LAST, s.id) AS rn
  FROM scoped s
  WHERE s.valor IS NOT NULL AND s.valor > 0 AND COALESCE(s.valor_modo, 'fixo') <> 'consulte'
)
SELECT jsonb_build_object(
  'summary', (SELECT to_jsonb(t) FROM (
      SELECT unique_properties AS "uniqueProperties",
             sale_properties   AS "saleProperties",
             rental_properties AS "rentalProperties",
             cordial_properties AS "cordialProperties",
             morar_properties  AS "morarProperties",
             both_providers    AS "bothProviders",
             missing_region    AS "missingRegion"
      FROM totals) t),
  'regions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'key', r.key,
        'label', r.label,
        'uniqueCount', r.unique_count,
        'percentage', CASE WHEN (SELECT unique_properties FROM totals) > 0
                           THEN round((r.unique_count::numeric * 100) / (SELECT unique_properties FROM totals), 1)
                           ELSE 0 END,
        'saleCount', r.sale_count,
        'rentalCount', r.rental_count,
        'cordialCount', r.cordial_count,
        'morarCount', r.morar_count,
        'bothProvidersCount', r.both_count
      ) ORDER BY r.unique_count DESC, r.label ASC)
      FROM regions r), '[]'::jsonb),
  'topValues', jsonb_build_object(
    'sale', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'rank')::int) FROM (
        SELECT jsonb_build_object(
          'rank', rn, 'id', id, 'valor', valor, 'tipo', tipo,
          'regionLabel', region_label, 'operacao', operacao,
          'codigoCordial', codigo_cordial, 'codigoMorar', codigo_morar, 'codigo', codigo,
          'inCordial', in_cordial, 'inMorar', in_morar
        ) AS x FROM ranked WHERE operacao = 'venda' AND rn <= 5) s), '[]'::jsonb),
    'rental', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'rank')::int) FROM (
        SELECT jsonb_build_object(
          'rank', rn, 'id', id, 'valor', valor, 'tipo', tipo,
          'regionLabel', region_label, 'operacao', operacao,
          'codigoCordial', codigo_cordial, 'codigoMorar', codigo_morar, 'codigo', codigo,
          'inCordial', in_cordial, 'inMorar', in_morar
        ) AS x FROM ranked WHERE operacao = 'aluguel' AND rn <= 5) s), '[]'::jsonb)
  )
);
$$;

GRANT EXECUTE ON FUNCTION public.get_property_portfolio_analytics(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.region_normalized_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.region_display_label(text) TO authenticated;