CREATE OR REPLACE FUNCTION public.property_sync_finish_job(_job_id uuid, _lease_token uuid, _fields jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  cols text;
  updated integer;
BEGIN
  SELECT string_agg(quote_ident(k), ', ')
    INTO cols
    FROM jsonb_object_keys(_fields) AS k
   WHERE EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = 'property_sync_jobs'
        AND c.column_name = k AND c.column_name NOT IN ('id','property_id','provider','action','lease_token')
   );

  IF cols IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'UPDATE public.property_sync_jobs j SET (%s, updated_at, lease_token) = (SELECT %s, now(), NULL::uuid FROM jsonb_populate_record(NULL::public.property_sync_jobs, $1)) WHERE j.id = $2 AND j.lease_token = $3',
    cols, cols
  ) USING _fields, _job_id, _lease_token;

  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END;
$fn$;

REVOKE ALL ON FUNCTION public.property_sync_finish_job(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_sync_finish_job(uuid, uuid, jsonb) TO service_role;