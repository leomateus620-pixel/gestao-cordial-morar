CREATE OR REPLACE FUNCTION public.reserve_provider_code(_provider imobi_provider, _property_id uuid DEFAULT NULL::uuid, _ttl_minutes integer DEFAULT 120)
 RETURNS TABLE(code text, reservation_id uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
-- meta_reviewer_entry_guard_v1
IF public.is_meta_reviewer() THEN
 RAISE EXCEPTION 'Acesso interno indisponível para avaliação Meta.' USING ERRCODE='42501';
END IF;

DECLARE
  v_next bigint;
  v_code text;
  v_id uuid;
  v_expires timestamptz;
  v_floor bigint;
  v_attempt integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.release_expired_provider_codes();
  PERFORM pg_advisory_xact_lock(hashtext('provider_code:' || _provider::text));

  v_expires := now() + make_interval(mins => GREATEST(5, COALESCE(_ttl_minutes, 120)));

  -- Só a repetição para o mesmo imóvel reaproveita a reserva; cadastros novos
  -- simultâneos do mesmo usuário recebem códigos distintos.
  SELECT r.id, r.code
    INTO v_id, v_code
    FROM public.provider_code_reservations AS r
   WHERE r.provider = _provider
     AND r.status = 'reserved'
     AND r.reserved_by = auth.uid()
     AND _property_id IS NOT NULL AND r.property_id = _property_id
   ORDER BY r.reserved_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_id IS NOT NULL THEN
    UPDATE public.provider_code_reservations AS r
       SET expires_at = v_expires,
           reserved_at = now()
     WHERE r.id = v_id;

    RETURN QUERY SELECT v_code, v_id, v_expires;
    RETURN;
  END IF;

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
      SELECT COALESCE(max(t.n), v_floor - 1) + 1 AS upper_bound
        FROM taken AS t
    )
    SELECT min(candidate.n)
      INTO v_next
      FROM bounds AS b
      CROSS JOIN LATERAL generate_series(v_floor, GREATEST(b.upper_bound, v_floor)) AS candidate(n)
     WHERE NOT EXISTS (
       SELECT 1 FROM taken AS t WHERE t.n = candidate.n
     );

    v_code := COALESCE(v_next, v_floor)::text;

    INSERT INTO public.provider_code_reservations AS target
      (provider, code, property_id, reserved_by, expires_at, status, reserved_at)
    VALUES
      (_provider, v_code, _property_id, auth.uid(), v_expires, 'reserved', now())
    ON CONFLICT ON CONSTRAINT provider_code_reservations_unique
    DO UPDATE SET
      status = 'reserved',
      reserved_by = auth.uid(),
      reserved_at = now(),
      expires_at = EXCLUDED.expires_at,
      property_id = EXCLUDED.property_id,
      committed_at = NULL
    WHERE target.status IN ('released', 'expired')
    RETURNING target.id INTO v_id;

    EXIT WHEN v_id IS NOT NULL;

    IF v_attempt >= 20 THEN
      RAISE EXCEPTION 'não foi possível reservar um código para %', _provider::text;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_code, v_id, v_expires;
END;
END;
$function$;