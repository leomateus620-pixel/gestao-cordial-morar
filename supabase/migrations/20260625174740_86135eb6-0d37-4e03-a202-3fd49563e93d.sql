
CREATE TABLE IF NOT EXISTS public.agenda_event_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text,
  response_status text NOT NULL DEFAULT 'needsAction',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, email)
);

CREATE INDEX IF NOT EXISTS agenda_guests_event_idx ON public.agenda_event_guests(event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_event_guests TO authenticated;
GRANT ALL ON public.agenda_event_guests TO service_role;

ALTER TABLE public.agenda_event_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Convidados: ver via acesso ao evento"
ON public.agenda_event_guests FOR SELECT TO authenticated
USING (public.agenda_can_access(event_id));

CREATE POLICY "Convidados: gravar via edit do evento"
ON public.agenda_event_guests FOR INSERT TO authenticated
WITH CHECK (public.agenda_can_edit(event_id));

CREATE POLICY "Convidados: atualizar via edit"
ON public.agenda_event_guests FOR UPDATE TO authenticated
USING (public.agenda_can_edit(event_id))
WITH CHECK (public.agenda_can_edit(event_id));

CREATE POLICY "Convidados: deletar via edit"
ON public.agenda_event_guests FOR DELETE TO authenticated
USING (public.agenda_can_edit(event_id));

CREATE TRIGGER agenda_guests_touch_updated
BEFORE UPDATE ON public.agenda_event_guests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
