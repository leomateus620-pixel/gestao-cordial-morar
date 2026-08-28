DROP POLICY IF EXISTS "Admins can delete properties" ON public.properties;

CREATE POLICY "Admins and brokers can delete properties"
ON public.properties
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'corretor'::app_role)
);