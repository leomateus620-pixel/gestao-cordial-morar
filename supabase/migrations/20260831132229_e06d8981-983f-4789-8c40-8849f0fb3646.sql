CREATE OR REPLACE FUNCTION public.reserve_provider_code(
  _provider imobi_provider,
  _property_id uuid DEFAULT NULL::uuid,
  _ttl_minutes integer DEFAULT 120
)
RETURNS TABLE(code text, reservation_id uuid, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_next BIGINT;
  v_code TEXT;
  v_id UUID;
  v_expires TIMESTAMPTZ;
  v_floor BIGINT := 1;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.release_expired_provider_codes();
  PERFORM pg_advisory_xact_lock(hashtext('provider_code:' || _provider::TEXT));

  -- Menor número livre da imobiliária. O campo legado `codigo` é ignorado de
  -- propósito: em imóveis importados ele guarda o ID interno do site, não o
  -- código do anúncio.
  WITH occupied AS (
    SELECT (CASE WHEN _provider::TEXT = 'cordial' THEN p.codigo_cordial ELSE p.codigo_morar END)::BIGINT AS n
    FROM public.properties p
    WHERE (CASE WHEN _provider::TEXT = 'cordial' THEN p.codigo_cordial ELSE p.codigo_morar END) ~ '^[0-9]+$'
    UNION
    SELECT ppp.external_reference::BIGINT
    FROM public.property_provider_publications ppp
    WHERE ppp.provider = _provider AND ppp.external_reference ~ '^[0-9]+$'
    UNION
    SELECT r.code::BIGINT
    FROM public.provider_code_reservations r
    WHERE r.provider = _provider
      AND r.code ~ '^[0-9]+$'
      AND r.status NOT IN ('released', 'expired')
  ),
  bounds AS (
    SELECT COALESCE(max(n), v_floor - 1) + 1 AS upper FROM occupied
  ),
  candidates AS (
    SELECT g FROM bounds, generate_series(v_floor, GREATEST(bounds.upper, v_floor)) AS g
  )
  SELECT min(c.g) INTO v_next
  FROM candidates c
  WHERE NOT EXISTS (SELECT 1 FROM occupied o WHERE o.n = c.g);

  IF v_next IS NULL THEN
    v_next := v_floor;
  END IF;

  v_code := v_next::TEXT;
  v_expires := now() + make_interval(mins => GREATEST(5, COALESCE(_ttl_minutes, 120)));

  INSERT INTO public.provider_code_reservations
    (provider, code, property_id, reserved_by, expires_at)
  VALUES (_provider, v_code, _property_id, auth.uid(), v_expires)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_code, v_id, v_expires;
END
$function$;