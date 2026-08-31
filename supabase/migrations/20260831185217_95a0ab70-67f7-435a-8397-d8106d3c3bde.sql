DELETE FROM public.agenciamentos
WHERE property_id IS NULL
  AND source = 'property_registration'
  AND created_at > now() - interval '6 hours';

UPDATE public.provider_code_reservations
SET status = 'released', property_id = NULL, updated_at = now()
WHERE property_id IS NULL
  AND status = 'committed'
  AND created_at > now() - interval '6 hours';