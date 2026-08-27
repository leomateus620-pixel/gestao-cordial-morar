CREATE OR REPLACE VIEW public.properties_catalog
WITH (security_invoker = true) AS
SELECT
  p.*,
  COALESCE(
    (
      SELECT array_agg(DISTINCT ppp.provider::TEXT)
      FROM public.property_provider_publications ppp
      WHERE ppp.property_id = p.id
    ),
    ARRAY[p.carteira::TEXT]
  ) AS providers,
  (
    SELECT array_agg(DISTINCT ppp.status::TEXT)
    FROM public.property_provider_publications ppp
    WHERE ppp.property_id = p.id
  ) AS publication_statuses
FROM public.properties p;

GRANT SELECT ON public.properties_catalog TO authenticated;
GRANT SELECT ON public.properties_catalog TO service_role;