ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS last_payload_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS last_payload_synced_at timestamptz;

-- Retomada da pausa: mantém APENAS a intenção atual (revisão mais alta) por
-- imóvel e destino. Revisões antigas, exclusões e publicações históricas que
-- ficaram esperando não são reproduzidas.
CREATE OR REPLACE FUNCTION public.property_sync_coalesce_resume()
RETURNS TABLE(kept uuid, dropped integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dropped integer := 0;
BEGIN
  WITH ranked AS (
    SELECT id, property_id, provider, action, requested_revision,
           row_number() OVER (
             PARTITION BY property_id, provider
             ORDER BY requested_revision DESC, created_at DESC
           ) AS rn
    FROM public.property_sync_jobs
    WHERE status IN ('pending','retry')
      AND action IN ('publish','update','unpublish','delete')
  ), superseded AS (
    UPDATE public.property_sync_jobs j
       SET status = 'cancelled',
           finished_at = now(),
           last_error_category = 'config',
           last_error_message = 'Substituido pela intencao atual do imovel na retomada do envio.'
      FROM ranked r
     WHERE j.id = r.id AND r.rn > 1
    RETURNING j.id
  )
  SELECT count(*) INTO v_dropped FROM superseded;

  RETURN QUERY
    UPDATE public.property_sync_jobs j
       SET status = 'pending',
           next_run_at = now(),
           attempts = 0,
           locked_at = NULL,
           lock_expires_at = NULL,
           locked_by = NULL
     WHERE j.status IN ('pending','retry')
       AND j.action IN ('publish','update','unpublish','delete')
    RETURNING j.id, v_dropped;
END;
$$;

REVOKE ALL ON FUNCTION public.property_sync_coalesce_resume() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.property_sync_coalesce_resume() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_coalesce_resume() TO service_role;