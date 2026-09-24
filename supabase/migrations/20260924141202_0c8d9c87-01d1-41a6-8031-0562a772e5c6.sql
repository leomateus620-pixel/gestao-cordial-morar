ALTER TABLE public.property_provider_recovery_circuit
  ADD COLUMN IF NOT EXISTS rate_limited_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_rate_limit_at timestamptz;

CREATE OR REPLACE FUNCTION public.property_provider_rate_limited(
  _provider text, _retry_after_seconds integer
) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _until timestamptz;
BEGIN
  IF _provider NOT IN ('cordial', 'morar') THEN
    RAISE EXCEPTION 'provider_rate_invalid_account';
  END IF;
  _until := clock_timestamp() + make_interval(secs => LEAST(3600, GREATEST(15, COALESCE(_retry_after_seconds, 30))));
  INSERT INTO public.property_provider_recovery_circuit
    (provider, rate_limited_until, last_rate_limit_at)
  VALUES (_provider::public.imobi_provider, _until, clock_timestamp())
  ON CONFLICT (provider) DO UPDATE SET
    rate_limited_until = GREATEST(
      COALESCE(public.property_provider_recovery_circuit.rate_limited_until, '-infinity'::timestamptz),
      EXCLUDED.rate_limited_until
    ),
    last_rate_limit_at = EXCLUDED.last_rate_limit_at;
  RETURN _until;
END $$;
REVOKE ALL ON FUNCTION public.property_provider_rate_limited(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_provider_rate_limited(text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.provider_rate_status()
RETURNS TABLE(provider public.imobi_provider, rate_limited_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.provider,
         CASE WHEN c.rate_limited_until > clock_timestamp() THEN c.rate_limited_until ELSE NULL END
    FROM public.property_provider_recovery_circuit c
   WHERE c.provider IN ('cordial', 'morar');
$$;
REVOKE ALL ON FUNCTION public.provider_rate_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_rate_status() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provider_rate_acquire(
  _provider text, _limit int DEFAULT 18, _window_seconds int DEFAULT 60
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _now timestamptz := clock_timestamp();
  _minute_count integer;
  _second_count integer;
  _minute_oldest timestamptz;
  _second_oldest timestamptz;
  _blocked_until timestamptz;
  _rate_limited_until timestamptz;
  _wait_ms integer := 0;
BEGIN
  IF _provider NOT IN ('cordial', 'morar') THEN RAISE EXCEPTION 'provider_rate_invalid_account'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('provider_rate:' || _provider, 0));
  _now := clock_timestamp();
  SELECT c.blocked_until, c.rate_limited_until
    INTO _blocked_until, _rate_limited_until
    FROM public.property_provider_recovery_circuit c
   WHERE c.provider = _provider::public.imobi_provider;
  IF _blocked_until > _now THEN
    RETURN jsonb_build_object('granted', false, 'blocked', true,
      'waitMs', CEIL(EXTRACT(EPOCH FROM (_blocked_until - _now)) * 1000)::integer);
  END IF;
  IF _rate_limited_until > _now THEN
    RETURN jsonb_build_object('granted', false, 'rateLimited', true,
      'waitMs', CEIL(EXTRACT(EPOCH FROM (_rate_limited_until - _now)) * 1000)::integer);
  END IF;
  DELETE FROM public.provider_rate_events
   WHERE provider = _provider AND created_at < _now - interval '4 minutes';
  SELECT count(*), min(created_at) INTO _minute_count, _minute_oldest
    FROM public.provider_rate_events WHERE provider = _provider AND created_at > _now - interval '60 seconds';
  SELECT count(*), min(created_at) INTO _second_count, _second_oldest
    FROM public.provider_rate_events WHERE provider = _provider AND created_at > _now - interval '1 second';
  IF _minute_count >= LEAST(18, GREATEST(1, _limit)) THEN
    _wait_ms := GREATEST(_wait_ms, CEIL(EXTRACT(EPOCH FROM (_minute_oldest + interval '60 seconds' - _now)) * 1000)::integer);
  END IF;
  IF _second_count >= 4 THEN
    _wait_ms := GREATEST(_wait_ms, CEIL(EXTRACT(EPOCH FROM (_second_oldest + interval '1 second' - _now)) * 1000)::integer);
  END IF;
  IF _wait_ms > 0 THEN
    RETURN jsonb_build_object('granted', false, 'waitMs', _wait_ms,
                              'minuteUsed', _minute_count, 'secondUsed', _second_count);
  END IF;
  INSERT INTO public.provider_rate_events (provider, created_at) VALUES (_provider, _now);
  RETURN jsonb_build_object('granted', true, 'waitMs', 0,
                            'minuteUsed', _minute_count + 1, 'secondUsed', _second_count + 1);
END $$;
REVOKE ALL ON FUNCTION public.provider_rate_acquire(text, int, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_rate_acquire(text, int, int) TO service_role;

ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS media_read_unreliable_streak integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.property_media_record_read_outcome(
  _property_id uuid, _provider public.imobi_provider, _unreliable boolean
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _streak integer;
BEGIN
  UPDATE public.property_provider_publications
     SET media_read_unreliable_streak = CASE
       WHEN _unreliable THEN media_read_unreliable_streak + 1 ELSE 0 END,
         updated_at = now()
   WHERE property_id = _property_id AND provider = _provider
   RETURNING media_read_unreliable_streak INTO _streak;
  RETURN COALESCE(_streak, 0);
END $$;
REVOKE ALL ON FUNCTION public.property_media_record_read_outcome(uuid, public.imobi_provider, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_media_record_read_outcome(uuid, public.imobi_provider, boolean)
  TO service_role;