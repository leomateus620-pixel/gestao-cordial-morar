-- Os valores são provisionados fora do Git no Vault:
--   imobi_worker_origin       HTTPS origin do deploy atual (sem caminho)
--   imobi_worker_hook_secret  mesmo valor de WORKER_HOOK_SECRET no servidor
-- Sem ambos, o cron registra bloqueio de configuração e não envia chave pública.
CREATE TABLE IF NOT EXISTS public.property_worker_dispatch_health (
  hook text PRIMARY KEY,
  last_dispatched_at timestamptz,
  last_request_id bigint,
  last_response_at timestamptz,
  last_http_status integer,
  last_transport_error text,
  last_config_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.property_worker_dispatch_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_worker_dispatch_health FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.property_worker_dispatch_health TO service_role;

CREATE OR REPLACE FUNCTION public.property_worker_dispatch(_hook text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault, net AS $$
DECLARE
  _origin text;
  _secret text;
  _request_id bigint;
  _previous_id bigint;
  _status integer;
  _transport_error text;
BEGIN
  IF _hook NOT IN (
    'property-sync-worker', 'property-media-worker', 'property-image-worker',
    'property-import-worker', 'property-sync-reconcile'
  ) THEN RAISE EXCEPTION 'worker_hook_invalido'; END IF;

  SELECT last_request_id INTO _previous_id
    FROM public.property_worker_dispatch_health WHERE hook = _hook;
  IF _previous_id IS NOT NULL THEN
    SELECT status_code, error_msg INTO _status, _transport_error
      FROM net._http_response WHERE id = _previous_id;
    IF FOUND THEN
      UPDATE public.property_worker_dispatch_health
         SET last_response_at = now(), last_http_status = _status,
             last_transport_error = left(_transport_error, 200), updated_at = now()
       WHERE hook = _hook;
    END IF;
  END IF;

  SELECT decrypted_secret INTO _origin FROM vault.decrypted_secrets
   WHERE name = 'imobi_worker_origin' ORDER BY created_at DESC LIMIT 1;
  SELECT decrypted_secret INTO _secret FROM vault.decrypted_secrets
   WHERE name = 'imobi_worker_hook_secret' ORDER BY created_at DESC LIMIT 1;

  IF _origin IS NULL OR _secret IS NULL
     OR btrim(_origin) !~ '^https://[^/?#]+/?$' THEN
    INSERT INTO public.property_worker_dispatch_health
      (hook, last_config_error, updated_at)
    VALUES (_hook, 'vault_missing_or_invalid', now())
    ON CONFLICT (hook) DO UPDATE
      SET last_config_error = EXCLUDED.last_config_error, updated_at = now();
    RETURN NULL;
  END IF;

  _request_id := net.http_post(
    url := rtrim(_origin, '/') || '/api/public/hooks/' || _hook,
    body := COALESCE(_body, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', _secret),
    timeout_milliseconds := 130000
  );
  INSERT INTO public.property_worker_dispatch_health
    (hook, last_dispatched_at, last_request_id, last_config_error, updated_at)
  VALUES (_hook, now(), _request_id, NULL, now())
  ON CONFLICT (hook) DO UPDATE
    SET last_dispatched_at = EXCLUDED.last_dispatched_at,
        last_request_id = EXCLUDED.last_request_id,
        last_config_error = NULL, updated_at = now();
  RETURN _request_id;
EXCEPTION WHEN OTHERS THEN
  -- Nunca persiste SQLERRM: erros de rede/banco podem conter URL ou cabeçalho.
  INSERT INTO public.property_worker_dispatch_health
    (hook, last_transport_error, updated_at)
  VALUES (_hook, SQLSTATE, now())
  ON CONFLICT (hook) DO UPDATE
    SET last_transport_error = EXCLUDED.last_transport_error, updated_at = now();
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.property_worker_dispatch(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_worker_dispatch(text, jsonb) TO service_role;

-- Substitui apenas os seis cron jobs desta integração. Os jobs legados com
-- chave publicável não autorizam o worker atual e devem sair da escala.
DO $$
DECLARE _job record;
BEGIN
  FOR _job IN SELECT jobid FROM cron.job
    WHERE jobname IN (
      'property-sync-worker', 'property-media-worker', 'property-image-worker',
      'property-image-retry', 'property-import-worker', 'property-sync-reconcile',
       'property-integration-watchdog', 'property-sync-reclaim-stale',
       'property-import-seed-cordial', 'property-import-seed-morar'
    )
  LOOP
    PERFORM cron.unschedule(_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'property-integration-watchdog', '* * * * *',
  $job$SELECT public.property_sync_recover_intents(12)$job$
);
SELECT cron.schedule(
  'property-sync-worker', '* * * * *',
  $job$SELECT public.property_worker_dispatch('property-sync-worker', '{"limit":2}'::jsonb)$job$
);
SELECT cron.schedule(
  'property-media-worker', '* * * * *',
  $job$SELECT public.property_worker_dispatch('property-media-worker', '{"passes":1}'::jsonb)$job$
);
SELECT cron.schedule(
  'property-image-worker', '* * * * *',
  $job$SELECT public.property_worker_dispatch('property-image-worker', '{"limit":2}'::jsonb)$job$
);
SELECT cron.schedule(
  'property-import-worker', '* * * * *',
  $job$SELECT public.property_worker_dispatch('property-import-worker', '{"limit":2,"chain":false}'::jsonb)$job$
);
SELECT cron.schedule(
  'property-sync-reconcile', '17 4 * * *',
  $job$SELECT public.property_worker_dispatch('property-sync-reconcile', '{"limit":30}'::jsonb)$job$
);
