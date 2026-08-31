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
  v_floor BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.release_expired_provider_codes();
  PERFORM pg_advisory_xact_lock(hashtext('provider_code:' || _provider::TEXT));

  -- Piso = maior código realmente em uso no site da imobiliária.
  -- O campo legado `codigo` é ignorado de propósito: em imóveis importados ele
  -- guarda o ID interno do site, não o código do anúncio.
  SELECT GREATEST(
    COALESCE((
      SELECT max((CASE WHEN _provider::TEXT = 'cordial' THEN p.codigo_cordial ELSE p.codigo_morar END)::BIGINT)
      FROM public.properties p
      WHERE (CASE WHEN _provider::TEXT = 'cordial' THEN p.codigo_cordial ELSE p.codigo_morar END) ~ '^[0-9]+$'
    ), 0),
    COALESCE((
      SELECT max(ppp.external_reference::BIGINT)
      FROM public.property_provider_publications ppp
      WHERE ppp.provider = _provider AND ppp.external_reference ~ '^[0-9]+$'
    ), 0)
  ) + 1 INTO v_floor;

  -- A partir do piso, reaproveita números vagos (reservas expiradas/liberadas)
  -- e pula apenas o que está ativamente reservado ou confirmado.
  WITH taken AS (
    SELECT r.code::BIGINT AS n
    FROM public.provider_code_reservations r
    WHERE r.provider = _provider
      AND r.code ~ '^[0-9]+$'
      AND r.status NOT IN ('released', 'expired')
      AND r.code::BIGINT >= v_floor
  ),
  bounds AS (SELECT COALESCE(max(n), v_floor - 1) + 1 AS upper FROM taken)
  SELECT min(g) INTO v_next
  FROM bounds, generate_series(v_floor, GREATEST(bounds.upper, v_floor)) AS g
  WHERE NOT EXISTS (SELECT 1 FROM taken t WHERE t.n = g);

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