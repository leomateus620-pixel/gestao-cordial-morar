ALTER TABLE public.provider_catalog_items DROP CONSTRAINT IF EXISTS provider_catalog_items_kind_check;
ALTER TABLE public.provider_catalog_items ADD CONSTRAINT provider_catalog_items_kind_check
  CHECK (kind = ANY (ARRAY['city','property_type','characteristic','broker','owner']));

DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
   WHERE conrelid='public.provider_value_maps'::regclass AND conname='provider_value_maps_domain_check';
  IF d IS NOT NULL THEN
    ALTER TABLE public.provider_value_maps DROP CONSTRAINT provider_value_maps_domain_check;
    ALTER TABLE public.provider_value_maps ADD CONSTRAINT provider_value_maps_domain_check
      CHECK (domain = ANY (ARRAY['city','property_type','characteristic','area_unit','broker','owner']));
  END IF;
END $$;