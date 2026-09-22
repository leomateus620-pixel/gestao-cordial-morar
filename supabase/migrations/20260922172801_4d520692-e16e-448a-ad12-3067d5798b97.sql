CREATE OR REPLACE FUNCTION public.property_media_finish_job(
  _job_id uuid, _lease_token uuid, _fields jsonb, _property_id uuid,
  _provider imobi_provider, _processed_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _owned boolean; _followup jsonb;
BEGIN
  IF _lease_token IS NULL THEN
    UPDATE public.property_sync_jobs SET
      status = COALESCE(_fields->>'status', status),
      finished_at = CASE WHEN _fields ? 'finished_at' THEN (_fields->>'finished_at')::timestamptz ELSE finished_at END,
      last_error_category = NULLIF(_fields->>'last_error_category', ''),
      last_error_message = NULLIF(_fields->>'last_error_message', ''),
      locked_at = NULL, lock_expires_at = NULL, locked_by = NULL, lease_token = NULL
    WHERE id = _job_id AND status = 'processing' AND lease_token IS NULL;
    _owned := FOUND;
  ELSE
    SELECT public.property_sync_finish_job(_job_id, _lease_token, _fields) INTO _owned;
  END IF;
  -- Sem posse, nenhum efeito de acompanhamento: rotina antiga não reagenda nada.
  IF NOT COALESCE(_owned, false) THEN
    RETURN jsonb_build_object('owned', false, 'followup', NULL);
  END IF;
  _followup := public.property_media_finish(_property_id, _provider, _processed_revision);
  RETURN jsonb_build_object('owned', true, 'followup', _followup);
END $function$;
REVOKE ALL ON FUNCTION public.property_media_finish_job(uuid, uuid, jsonb, uuid, imobi_provider, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_media_finish_job(uuid, uuid, jsonb, uuid, imobi_provider, integer) TO service_role;