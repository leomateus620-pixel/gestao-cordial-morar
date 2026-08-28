-- properties: mesmos direitos para admin, corretor e secretaria
DROP POLICY IF EXISTS "Admins and secretaria can insert properties" ON public.properties;
DROP POLICY IF EXISTS "Admins and secretaria can update properties" ON public.properties;
DROP POLICY IF EXISTS "Admins and brokers can delete properties" ON public.properties;

CREATE POLICY "Equipe pode cadastrar imoveis"
ON public.properties FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'corretor'::app_role)
);

CREATE POLICY "Equipe pode editar imoveis"
ON public.properties FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'corretor'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'corretor'::app_role)
);

CREATE POLICY "Equipe pode excluir imoveis"
ON public.properties FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'corretor'::app_role)
);

-- filas de processamento visíveis para a mesma equipe
DROP POLICY IF EXISTS "Admins acompanham a fila de fotos" ON public.property_image_jobs;
CREATE POLICY "Equipe acompanha a fila de fotos"
ON public.property_image_jobs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'corretor'::app_role)
);

DROP POLICY IF EXISTS "Admins acompanham a fila do Drive" ON public.property_drive_jobs;
CREATE POLICY "Equipe acompanha a fila do Drive"
ON public.property_drive_jobs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'secretaria'::app_role)
  OR has_role(auth.uid(), 'corretor'::app_role)
);