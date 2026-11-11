CREATE OR REPLACE FUNCTION public.cordial_site_resolve_legacy(_imobi_id text)
RETURNS TABLE(public_id uuid, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.public_id,
         CASE WHEN e.public_id IS NOT NULL THEN 'eligible' ELSE 'withdrawn' END
  FROM public.property_provider_publications pub
  JOIN public.cordial_site_publications p ON p.property_id = pub.property_id
  LEFT JOIN public.cordial_site_eligible e ON e.public_id = p.public_id
  WHERE pub.provider = 'cordial' AND pub.external_property_id = _imobi_id
  ORDER BY (e.public_id IS NOT NULL) DESC
  LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.morar_site_resolve_legacy(_imobi_id text)
RETURNS TABLE(public_id uuid, state text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.public_id,
         CASE WHEN e.public_id IS NOT NULL THEN 'eligible' ELSE 'withdrawn' END
  FROM public.property_provider_publications pub
  JOIN public.morar_site_publications p ON p.property_id = pub.property_id
  LEFT JOIN public.morar_site_eligible e ON e.public_id = p.public_id
  WHERE pub.provider = 'morar' AND pub.external_property_id = _imobi_id
  ORDER BY (e.public_id IS NOT NULL) DESC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.cordial_site_resolve_legacy(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.morar_site_resolve_legacy(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_resolve_legacy(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.morar_site_resolve_legacy(text) TO service_role;
ALTER TABLE public.cordial_site_redirects DROP CONSTRAINT IF EXISTS cordial_site_redirects_old_path_check;
ALTER TABLE public.cordial_site_redirects ADD CONSTRAINT cordial_site_redirects_old_path_check CHECK (old_path ~ '^/imovel/[0-9]+(/[^?#]*)?$') NOT VALID;
ALTER TABLE public.morar_site_redirects DROP CONSTRAINT IF EXISTS morar_site_redirects_old_path_check;
ALTER TABLE public.morar_site_redirects ADD CONSTRAINT morar_site_redirects_old_path_check CHECK (old_path ~ '^/imovel/[0-9]+(/[^?#]*)?$') NOT VALID;