REVOKE ALL ON FUNCTION public.reserve_provider_code(public.imobi_provider, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_provider_code(public.imobi_provider, UUID, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_expired_provider_codes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_provider_codes() TO service_role;