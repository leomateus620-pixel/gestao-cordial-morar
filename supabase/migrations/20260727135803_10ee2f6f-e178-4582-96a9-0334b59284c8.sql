DROP POLICY IF EXISTS agenciamentos_delete_admin ON public.agenciamentos;
CREATE POLICY agenciamentos_delete_all_authenticated
  ON public.agenciamentos
  FOR DELETE
  TO authenticated
  USING (true);