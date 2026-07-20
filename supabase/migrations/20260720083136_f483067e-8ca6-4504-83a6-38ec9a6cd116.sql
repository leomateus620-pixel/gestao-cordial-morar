
DROP POLICY IF EXISTS clients_select_own_or_admin ON public.clients;
DROP POLICY IF EXISTS clients_update_own_or_admin ON public.clients;

CREATE POLICY clients_select_visible ON public.clients
FOR SELECT
USING (
  created_by = auth.uid()
  OR assigned_broker_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
);

CREATE POLICY clients_update_editable ON public.clients
FOR UPDATE
USING (
  created_by = auth.uid()
  OR assigned_broker_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR assigned_broker_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
);

DROP POLICY IF EXISTS "Users select own attendances or admin" ON public.attendances;
DROP POLICY IF EXISTS "Users update own attendances or admin" ON public.attendances;

CREATE POLICY "Users select attendances visible" ON public.attendances
FOR SELECT
USING (
  created_by = auth.uid()
  OR corretor_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
);

CREATE POLICY "Users update attendances editable" ON public.attendances
FOR UPDATE
USING (
  created_by = auth.uid()
  OR corretor_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR corretor_id = (auth.uid())::text
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
);
