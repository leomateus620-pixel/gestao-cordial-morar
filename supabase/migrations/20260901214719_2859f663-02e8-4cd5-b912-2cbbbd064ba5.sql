CREATE OR REPLACE FUNCTION public.agenciamentos_sync_provider_checklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
  IF NEW.status NOT IN ('published', 'partial', 'out_of_sync') THEN
    RETURN NULL;
  END IF;
  IF NEW.property_id IS NULL OR NEW.external_property_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.provider = 'morar' THEN
    UPDATE public.agenciamentos
    SET cadastrado_morar = true,
        cadastrado_site = COALESCE(cadastrado_cordial, false)
    WHERE property_id = NEW.property_id
      AND COALESCE(cadastrado_morar, false) = false
      AND status NOT IN ('cancelado', 'reprovado');
  ELSIF NEW.provider = 'cordial' THEN
    UPDATE public.agenciamentos
    SET cadastrado_cordial = true,
        cadastrado_site = COALESCE(cadastrado_morar, false)
    WHERE property_id = NEW.property_id
      AND COALESCE(cadastrado_cordial, false) = false
      AND status NOT IN ('cancelado', 'reprovado');
  END IF;

  RETURN NULL;
END;
$function$;

-- Backfill: qualquer imóvel já criado no site marca o item correspondente
UPDATE public.agenciamentos a
SET cadastrado_morar = true
WHERE COALESCE(a.cadastrado_morar, false) = false
  AND a.status NOT IN ('cancelado', 'reprovado')
  AND EXISTS (
    SELECT 1 FROM public.property_provider_publications p
    WHERE p.property_id = a.property_id
      AND p.provider = 'morar'
      AND p.external_property_id IS NOT NULL
      AND p.status IN ('published', 'partial', 'out_of_sync')
  );

UPDATE public.agenciamentos a
SET cadastrado_cordial = true
WHERE COALESCE(a.cadastrado_cordial, false) = false
  AND a.status NOT IN ('cancelado', 'reprovado')
  AND EXISTS (
    SELECT 1 FROM public.property_provider_publications p
    WHERE p.property_id = a.property_id
      AND p.provider = 'cordial'
      AND p.external_property_id IS NOT NULL
      AND p.status IN ('published', 'partial', 'out_of_sync')
  );

UPDATE public.agenciamentos
SET cadastrado_site = (COALESCE(cadastrado_morar, false) AND COALESCE(cadastrado_cordial, false))
WHERE cadastrado_site IS DISTINCT FROM (COALESCE(cadastrado_morar, false) AND COALESCE(cadastrado_cordial, false));

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT public._try_uuid(corretor_id) AS cid
    FROM public.agenciamentos
    WHERE public._try_uuid(corretor_id) IS NOT NULL
  LOOP
    PERFORM public.agenciamento_bonus_recalc(r.cid);
  END LOOP;
END $$;