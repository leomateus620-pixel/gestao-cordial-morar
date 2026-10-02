CREATE OR REPLACE FUNCTION public.property_drive_rename_on_codes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.codigo_cordial IS DISTINCT FROM OLD.codigo_cordial OR NEW.codigo_morar IS DISTINCT FROM OLD.codigo_morar)
     AND EXISTS (SELECT 1 FROM public.property_drive_folders f WHERE f.property_id = NEW.id AND f.property_folder_id IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.property_drive_jobs j WHERE j.property_id = NEW.id AND j.status IN ('pending','processing','retry')) THEN
    BEGIN
      INSERT INTO public.property_drive_jobs (property_id) VALUES (NEW.id)
      ON CONFLICT (property_id) WHERE status IN ('pending','processing','retry') DO NOTHING;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END $function$;