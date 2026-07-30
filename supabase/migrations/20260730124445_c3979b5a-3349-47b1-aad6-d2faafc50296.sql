DROP POLICY IF EXISTS "Agenda: editar próprio ou admin" ON public.agenda_events;
CREATE POLICY "Agenda: editar próprio ou admin"
ON public.agenda_events
FOR UPDATE
TO authenticated
USING (
  public.current_user_has_notification_agency_access(imobiliaria::text)
  AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR public.agenda_is_participant(id)
  )
)
WITH CHECK (
  public.current_user_has_notification_agency_access(imobiliaria::text)
  AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR public.agenda_is_participant(id)
  )
);

DROP POLICY IF EXISTS "Agenda: excluir próprio ou admin" ON public.agenda_events;
CREATE POLICY "Agenda: excluir próprio ou admin"
ON public.agenda_events
FOR DELETE
TO authenticated
USING (
  public.current_user_has_notification_agency_access(imobiliaria::text)
  AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR public.agenda_is_participant(id)
  )
);