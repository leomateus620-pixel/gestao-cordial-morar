REVOKE ALL ON FUNCTION public.notify_sale_created_admins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_push_delivery_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_push_delivery_health() TO authenticated;