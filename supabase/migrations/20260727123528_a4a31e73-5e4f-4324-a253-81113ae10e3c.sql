-- 1. Column linking agenda events to agenciamentos
ALTER TABLE public.agenda_events
  ADD COLUMN IF NOT EXISTS agenciamento_id uuid REFERENCES public.agenciamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agenda_events_agenciamento_id_idx
  ON public.agenda_events(agenciamento_id);

CREATE INDEX IF NOT EXISTS agenda_events_tipo_inicio_idx
  ON public.agenda_events(tipo, inicio);

-- 2. Broaden read access for photo/video events to all authenticated operational users.
CREATE OR REPLACE FUNCTION public.agenda_can_access(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
        OR (
          e.tipo IN ('fotos'::public.agenda_tipo, 'video'::public.agenda_tipo)
          AND auth.uid() IS NOT NULL
          AND (
            public.has_role(auth.uid(), 'admin'::public.app_role)
            OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
            OR public.has_role(auth.uid(), 'corretor'::public.app_role)
          )
        )
      )
  );
$$;