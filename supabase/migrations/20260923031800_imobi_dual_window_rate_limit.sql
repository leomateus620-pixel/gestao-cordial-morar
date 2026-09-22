-- A mesma reserva no banco limita todas as chamadas da conta, inclusive GETs
-- de conferência e retries. Margem: no máximo 4/s e 18/min (contrato 5/s,
-- 20/min). Nenhum cliente pode obter vaga só porque outra instância não viu
-- a contagem ainda: o advisory lock serializa a decisão e a inserção.
ALTER TABLE public.property_provider_recovery_circuit
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS auth_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_auth_status integer,
  ADD COLUMN IF NOT EXISTS last_auth_error_at timestamptz;

CREATE OR REPLACE FUNCTION public.property_provider_auth_failure(
  _provider text, _status integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _provider NOT IN ('cordial', 'morar') OR _status NOT IN (401, 403) THEN
    RAISE EXCEPTION 'provider_auth_failure_invalid';
  END IF;
  INSERT INTO public.property_provider_recovery_circuit
    (provider, blocked_until, auth_error_count, last_auth_status, last_auth_error_at)
  VALUES (_provider::public.imobi_provider, now() + interval '5 minutes', 1, _status, now())
  ON CONFLICT (provider) DO UPDATE SET
    auth_error_count = public.property_provider_recovery_circuit.auth_error_count + 1,
    blocked_until = now() + make_interval(mins => LEAST(60,
      5 * power(2, LEAST(4, public.property_provider_recovery_circuit.auth_error_count))::integer)),
    last_auth_status = _status,
    last_auth_error_at = now();
END $$;
REVOKE ALL ON FUNCTION public.property_provider_auth_failure(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_provider_auth_failure(text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.property_provider_recovery_success()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'succeeded' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.property_provider_recovery_circuit
       SET next_probe_at = now(), probe_count = 0, last_success_at = now(),
           blocked_until = NULL, auth_error_count = 0
     WHERE provider = NEW.provider;
  END IF;
  RETURN NEW;
END $$;

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
  _wait_ms integer := 0;
BEGIN
  IF _provider NOT IN ('cordial', 'morar') THEN
    RAISE EXCEPTION 'provider_rate_invalid_account';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('provider_rate:' || _provider, 0));
  -- Relógio após a trava para não usar um instante anterior à espera.
  _now := clock_timestamp();
  SELECT blocked_until INTO _blocked_until
    FROM public.property_provider_recovery_circuit
   WHERE provider = _provider::public.imobi_provider;
  IF _blocked_until > _now THEN
    RETURN jsonb_build_object('granted', false, 'blocked', true,
      'waitMs', CEIL(EXTRACT(EPOCH FROM (_blocked_until - _now)) * 1000)::integer);
  END IF;
  DELETE FROM public.provider_rate_events
   WHERE provider = _provider AND created_at < _now - interval '4 minutes';
  SELECT count(*), min(created_at) INTO _minute_count, _minute_oldest
    FROM public.provider_rate_events
   WHERE provider = _provider AND created_at > _now - interval '60 seconds';
  SELECT count(*), min(created_at) INTO _second_count, _second_oldest
    FROM public.provider_rate_events
   WHERE provider = _provider AND created_at > _now - interval '1 second';

  IF _minute_count >= LEAST(18, GREATEST(1, _limit)) THEN
    _wait_ms := GREATEST(_wait_ms, CEIL(EXTRACT(EPOCH FROM
      (_minute_oldest + interval '60 seconds' - _now)) * 1000)::integer);
  END IF;
  IF _second_count >= 4 THEN
    _wait_ms := GREATEST(_wait_ms, CEIL(EXTRACT(EPOCH FROM
      (_second_oldest + interval '1 second' - _now)) * 1000)::integer);
  END IF;
  IF _wait_ms > 0 THEN
    RETURN jsonb_build_object('granted', false, 'waitMs', _wait_ms,
                              'minuteUsed', _minute_count,
                              'secondUsed', _second_count);
  END IF;

  INSERT INTO public.provider_rate_events (provider, created_at)
  VALUES (_provider, _now);
  RETURN jsonb_build_object('granted', true, 'waitMs', 0,
                            'minuteUsed', _minute_count + 1,
                            'secondUsed', _second_count + 1);
END $$;

REVOKE ALL ON FUNCTION public.provider_rate_acquire(text, int, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_rate_acquire(text, int, int)
  TO service_role;
