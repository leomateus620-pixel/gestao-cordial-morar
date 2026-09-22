ALTER TABLE public.property_image_provider_publications
  ADD COLUMN IF NOT EXISTS desired_state text NOT NULL DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS pending_delete_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS replacement_of_image_id uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification jsonb,
  ADD COLUMN IF NOT EXISTS last_op text,
  ADD COLUMN IF NOT EXISTS last_op_state text;

ALTER TABLE public.property_provider_publications
  ADD COLUMN IF NOT EXISTS media_rebuild_state jsonb;

ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS pending_remote_delete boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS pipp_desired_absent_idx
  ON public.property_image_provider_publications (publication_id)
  WHERE desired_state = 'absent' AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.property_media_finish_job(
  _job_id uuid,
  _lease_token uuid,
  _fields jsonb,
  _property_id uuid,
  _provider imobi_provider,
  _processed_revision integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _owned boolean;
  _followup jsonb;
BEGIN
  -- Encerra o trabalho atual (com verificação de posse) e só depois agenda o
  -- acompanhamento: como o job já não está mais em `processing`, o pedido da
  -- revisão seguinte é realmente enfileirado em vez de ficar apenas marcado.
  IF _lease_token IS NULL THEN
    UPDATE public.property_sync_jobs SET
      status = COALESCE(_fields->>'status', status),
      finished_at = CASE WHEN _fields ? 'finished_at' THEN (_fields->>'finished_at')::timestamptz ELSE finished_at END,
      last_error_category = NULLIF(_fields->>'last_error_category', ''),
      last_error_message = NULLIF(_fields->>'last_error_message', ''),
      locked_at = NULL,
      lock_expires_at = NULL,
      locked_by = NULL,
      lease_token = NULL
    WHERE id = _job_id;
    _owned := true;
  ELSE
    SELECT public.property_sync_finish_job(_job_id, _lease_token, _fields) INTO _owned;
  END IF;

  _followup := public.property_media_finish(_property_id, _provider, _processed_revision);
  RETURN jsonb_build_object('owned', COALESCE(_owned, false), 'followup', _followup);
END $function$;

REVOKE ALL ON FUNCTION public.property_media_finish_job(uuid, uuid, jsonb, uuid, imobi_provider, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_media_finish_job(uuid, uuid, jsonb, uuid, imobi_provider, integer) TO service_role;