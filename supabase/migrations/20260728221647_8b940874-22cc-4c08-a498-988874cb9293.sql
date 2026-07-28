DROP POLICY IF EXISTS "rental_drive_folders_read" ON public.rental_drive_folders;
CREATE POLICY "rental_drive_folders_read"
ON public.rental_drive_folders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.rental_contracts c
    WHERE c.id = rental_drive_folders.contract_id
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Authenticated can read sheet config" ON public.financeiro_sheet_config;
CREATE POLICY "Admins can read sheet config"
ON public.financeiro_sheet_config
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));