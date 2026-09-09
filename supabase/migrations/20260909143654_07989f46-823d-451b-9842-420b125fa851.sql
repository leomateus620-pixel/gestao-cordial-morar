CREATE OR REPLACE FUNCTION public.allocate_provider_code_for_property(
  _property_id uuid,
  _provider imobi_provider
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing text;
  v_floor bigint;
  v_next bigint;
  v_code text;
  v_id uuid;
  v_attempt integer := 0;
BEGIN
  SELECT CASE WHEN _provider::text = 'cordial' THEN p.codigo_cordial ELSE p.codigo_morar END
    INTO v_existing
    FROM public.properties AS p
   WHERE p.id = _property_id;

  IF v_existing ~ '^[0-9]+$' THEN
    RETURN v_existing;
  END IF;

  PERFORM public.release_expired_provider_codes();
  PERFORM pg_advisory_xact_lock(hashtext('provider_code:' || _provider::text));

  SELECT GREATEST(
    COALESCE((
      SELECT max((CASE WHEN _provider::text = 'cordial' THEN p.codigo_cordial ELSE p.codigo_morar END)::bigint)
        FROM public.properties AS p
       WHERE (CASE WHEN _provider::text = 'cordial' THEN p.codigo_cordial ELSE p.codigo_morar END) ~ '^[0-9]+$'
    ), 0),
    COALESCE((
      SELECT max(ppp.external_reference::bigint)
        FROM public.property_provider_publications AS ppp
       WHERE ppp.provider = _provider
         AND ppp.external_reference ~ '^[0-9]+$'
    ), 0)
  ) + 1
  INTO v_floor;

  LOOP
    v_attempt := v_attempt + 1;
    v_id := NULL;

    WITH taken AS (
      SELECT r.code::bigint AS n
        FROM public.provider_code_reservations AS r
       WHERE r.provider = _provider
         AND r.code ~ '^[0-9]+$'
         AND r.status NOT IN ('released', 'expired')
         AND r.code::bigint >= v_floor
    ),
    bounds AS (
      SELECT COALESCE(max(t.n), v_floor - 1) + 1 AS upper_bound FROM taken AS t
    )
    SELECT min(candidate.n)
      INTO v_next
      FROM bounds AS b
      CROSS JOIN LATERAL generate_series(v_floor, GREATEST(b.upper_bound, v_floor)) AS candidate(n)
     WHERE NOT EXISTS (SELECT 1 FROM taken AS t WHERE t.n = candidate.n);

    v_code := COALESCE(v_next, v_floor)::text;

    INSERT INTO public.provider_code_reservations AS target
      (provider, code, property_id, reserved_by, expires_at, status, reserved_at, committed_at)
    VALUES
      (_provider, v_code, _property_id, NULL, now() + interval '30 days', 'committed', now(), now())
    ON CONFLICT ON CONSTRAINT provider_code_reservations_unique
    DO UPDATE SET
      status = 'committed',
      reserved_at = now(),
      committed_at = now(),
      expires_at = EXCLUDED.expires_at,
      property_id = EXCLUDED.property_id
    WHERE target.status IN ('released', 'expired')
    RETURNING target.id INTO v_id;

    EXIT WHEN v_id IS NOT NULL;

    IF v_attempt >= 20 THEN
      RAISE EXCEPTION 'não foi possível alocar um código para %', _provider::text;
    END IF;
  END LOOP;

  IF _provider::text = 'cordial' THEN
    UPDATE public.properties SET codigo_cordial = v_code WHERE id = _property_id;
  ELSE
    UPDATE public.properties SET codigo_morar = v_code WHERE id = _property_id;
  END IF;

  RETURN v_code;
END
$function$;

REVOKE ALL ON FUNCTION public.allocate_provider_code_for_property(uuid, imobi_provider) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_provider_code_for_property(uuid, imobi_provider) TO service_role;