CREATE OR REPLACE FUNCTION public.list_corretores()
 RETURNS TABLE(id uuid, nome text, email text, iniciais text, cargo text, role app_role)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.nome, p.email, p.iniciais, p.cargo, ur.role
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('corretor'::public.app_role, 'admin'::public.app_role)
    AND auth.uid() IS NOT NULL
    AND p.is_internal = false
  ORDER BY p.nome;
$function$;