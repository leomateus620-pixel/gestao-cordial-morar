DROP POLICY IF EXISTS "Agenda: ver compromissos visíveis" ON public.agenda_events;

CREATE POLICY "Agenda: ver compromissos visíveis"
ON public.agenda_events
FOR SELECT
TO authenticated
USING (
  current_user_has_notification_agency_access((imobiliaria)::text)
  AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'secretaria'::app_role)
    OR agenda_is_participant(id)
  )
);