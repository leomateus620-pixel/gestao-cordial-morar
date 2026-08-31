UPDATE public.provider_code_reservations
SET status = 'released', property_id = NULL, updated_at = now()
WHERE property_id IS NULL
  AND status = 'committed'
  AND provider = 'cordial'
  AND code IN ('1341','1342','1343','1344','1345','1346');

DELETE FROM public.properties
WHERE id = '9a4423c7-1d5d-45ab-9e27-fd373acb14b5'
  AND (codigo IS NULL OR codigo = '')
  AND (codigo_morar IS NULL OR codigo_morar = '');