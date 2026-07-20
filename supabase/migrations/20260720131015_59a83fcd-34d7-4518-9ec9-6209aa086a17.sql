
CREATE OR REPLACE FUNCTION public.agenda_can_access(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agenda_events e
    WHERE e.id = _event_id
      AND e.deleted_at IS NULL
      AND (
        e.created_by = auth.uid()
        OR e.owner_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
        OR EXISTS (
          SELECT 1 FROM public.agenda_event_participants p
          WHERE p.event_id = e.id AND p.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_can_edit(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agenda_events e
    WHERE e.id = _event_id
      AND (
        e.created_by = auth.uid()
        OR e.owner_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  );
$$;

DROP POLICY IF EXISTS "Agenda: ver compromissos visíveis" ON public.agenda_events;
CREATE POLICY "Agenda: ver compromissos visíveis"
ON public.agenda_events FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.agenda_event_participants p
      WHERE p.event_id = agenda_events.id AND p.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Agenda: editar próprio ou admin" ON public.agenda_events;
CREATE POLICY "Agenda: editar próprio ou admin"
ON public.agenda_events FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR owner_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR owner_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
);

DROP POLICY IF EXISTS "Agenda: excluir próprio ou admin" ON public.agenda_events;
CREATE POLICY "Agenda: excluir próprio ou admin"
ON public.agenda_events FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
);
