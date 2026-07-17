
DROP POLICY IF EXISTS "agenciamentos_select_own_or_admin" ON public.agenciamentos;
DROP POLICY IF EXISTS "agenciamentos_update_own_or_admin" ON public.agenciamentos;

CREATE POLICY "agenciamentos_select_own_admin_or_secretaria"
  ON public.agenciamentos FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );

CREATE POLICY "agenciamentos_update_own_admin_or_secretaria"
  ON public.agenciamentos FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );
