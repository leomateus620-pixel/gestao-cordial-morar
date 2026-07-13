CREATE OR REPLACE FUNCTION public.list_corretores()
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  iniciais text,
  cargo text,
  role public.app_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.email, p.iniciais, p.cargo, ur.role
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('corretor'::public.app_role, 'admin'::public.app_role)
    AND auth.uid() IS NOT NULL
  ORDER BY p.nome;
$$;

REVOKE ALL ON FUNCTION public.list_corretores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_corretores() TO authenticated;