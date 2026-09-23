CREATE TABLE IF NOT EXISTS public.backup_20260923_targets_trigger_def AS
SELECT now() AS saved_at, pg_get_functiondef('public.property_targets_mark_images_pending()'::regprocedure) AS def;
REVOKE ALL ON public.backup_20260923_targets_trigger_def FROM anon, authenticated;
GRANT ALL ON public.backup_20260923_targets_trigger_def TO service_role;
ALTER TABLE public.backup_20260923_targets_trigger_def ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.property_targets_mark_images_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _hash text;
BEGIN
  IF NEW.publish_targets IS NOT DISTINCT FROM OLD.publish_targets THEN RETURN NEW; END IF;
  -- Ocultar/excluir/retirada: só muda a intenção; fotos não são tocadas.
  IF COALESCE(cardinality(NEW.publish_targets), 0) = 0 OR NEW.removal_state IS NOT NULL THEN
    RETURN NEW;
  END IF;
  _hash := public.property_expected_watermark_hash(NEW.publish_targets);
  -- Só fotos novas (com destino gravado), fora do legado e sem exclusão pendente.
  UPDATE public.property_images i
     SET desired_destination_hash = _hash,
         processing_status = CASE
           WHEN i.destination_hash IS NOT DISTINCT FROM _hash THEN i.processing_status
           WHEN i.original_storage_path IS NULL THEN 'failed_permanent'
           ELSE 'pending' END,
         processing_error_code = CASE
           WHEN i.destination_hash IS NOT DISTINCT FROM _hash THEN i.processing_error_code
           WHEN i.original_storage_path IS NULL THEN 'original_ausente'
           ELSE NULL END,
         processing_error_message = CASE
           WHEN i.destination_hash IS NOT DISTINCT FROM _hash THEN i.processing_error_message
           WHEN i.original_storage_path IS NULL THEN 'Original ausente: a marca do novo destino não pode ser refeita; foto bloqueada para envio.'
           ELSE NULL END
   WHERE i.property_id = NEW.id
     AND NOT COALESCE(i.pending_remote_delete, false)
     AND i.desired_destination_hash IS NOT NULL
     AND i.desired_destination_hash IS DISTINCT FROM _hash
     AND NOT EXISTS (SELECT 1 FROM public.property_image_legacy_review r
                      WHERE r.image_id = i.id AND r.review_status = 'open');
  RETURN NEW;
END $function$;