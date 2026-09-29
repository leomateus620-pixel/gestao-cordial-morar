CREATE OR REPLACE FUNCTION public.property_create_stuck_alerts()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _count integer := 0;
BEGIN
  WITH stuck AS (
    SELECT p.id, p.property_id, p.provider::text AS provider, p.create_first_requested_at,
           pr.codigo::text AS codigo, pr.tipo::text AS tipo
      FROM public.property_provider_publications p
      JOIN public.properties pr ON pr.id = p.property_id
     WHERE p.external_property_id IS NULL
       AND p.enabled
       AND p.desired_availability = 'visible'
       AND p.create_first_requested_at IS NOT NULL
       AND p.create_first_requested_at < now() - interval '20 minutes'
       AND p.create_first_requested_at > now() - interval '7 days'
  ), admins AS (
    SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin'
  ), ins AS (
    INSERT INTO public.notifications
      (user_id, tipo, titulo, mensagem, link, lida, category, entity_type, entity_id, dedup_key, metadata)
    SELECT a.user_id, 'imobi_create_stuck',
           'Imóvel ainda não está no ar na ' || initcap(s.provider),
           COALESCE('Código ' || s.codigo || ' · ', '') || COALESCE(initcap(s.tipo), 'Imóvel') ||
             ' — pedido de criação há mais de 20 minutos sem confirmação do site.',
           '/imoveis/' || s.property_id, false, 'system', 'property', s.property_id,
           'imobi-create-stuck:' || s.id || ':' || extract(epoch from s.create_first_requested_at)::bigint || ':' || a.user_id,
           jsonb_build_object('provider', s.provider, 'publication_id', s.id)
      FROM stuck s CROSS JOIN admins a
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM ins;
  RETURN _count;
END $$;
REVOKE ALL ON FUNCTION public.property_create_stuck_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_create_stuck_alerts() TO service_role;