CREATE OR REPLACE FUNCTION public.cordial_site_can_publish(_actor uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $canpub$ SELECT _actor IS NOT NULL AND NOT public.has_role(_actor,'meta_reviewer') AND (public.has_role(_actor,'admin') OR EXISTS(
  SELECT 1 FROM public.user_agencies ua WHERE ua.user_id=_actor AND ua.agency IN ('cordial','ambas'))) $canpub$;