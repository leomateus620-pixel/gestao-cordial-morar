REVOKE ALL ON FUNCTION public.provider_rate_status() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provider_rate_status() TO service_role;