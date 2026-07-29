CREATE OR REPLACE FUNCTION public.agenda_is_participant(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agenda_event_participants participant
    WHERE participant.event_id = _event_id
      AND participant.user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.agenda_is_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_is_participant(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Agenda: ver compromissos visíveis" ON public.agenda_events;
CREATE POLICY "Agenda: ver compromissos visíveis"
ON public.agenda_events
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND public.current_user_has_notification_agency_access(imobiliaria::TEXT)
  AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR public.agenda_is_participant(id)
  )
);

DROP POLICY IF EXISTS "Agenda: editar próprio ou admin" ON public.agenda_events;
CREATE POLICY "Agenda: editar próprio ou admin"
ON public.agenda_events
FOR UPDATE
TO authenticated
USING (
  public.current_user_has_notification_agency_access(imobiliaria::TEXT)
  AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  )
)
WITH CHECK (
  public.current_user_has_notification_agency_access(imobiliaria::TEXT)
  AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  )
);

DELETE FROM public.agenda_events WHERE titulo IN ('probe','probe1','probe2','probe3');