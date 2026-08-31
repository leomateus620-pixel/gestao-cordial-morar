CREATE OR REPLACE FUNCTION public.release_expired_provider_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.provider_code_reservations
     SET status = 'expired'
   WHERE status = 'reserved'
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Reservas sem imóvel vinculado que ficaram penduradas voltam para a fila.
  UPDATE public.provider_code_reservations
     SET status = 'released'
   WHERE status = 'reserved'
     AND property_id IS NULL
     AND reserved_at < now() - interval '30 minutes';

  RETURN v_count;
END $$;

SELECT cron.unschedule('release-provider-codes')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-provider-codes');

SELECT cron.schedule(
  'release-provider-codes',
  '*/5 * * * *',
  $$SELECT public.release_expired_provider_codes();$$
);