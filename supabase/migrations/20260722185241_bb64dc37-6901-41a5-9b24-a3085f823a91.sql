
CREATE TABLE public.agenda_event_google_syncs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  google_event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

GRANT SELECT ON public.agenda_event_google_syncs TO authenticated;
GRANT ALL ON public.agenda_event_google_syncs TO service_role;
ALTER TABLE public.agenda_event_google_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sync rows readable" ON public.agenda_event_google_syncs
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );

CREATE INDEX idx_agenda_event_google_syncs_event ON public.agenda_event_google_syncs(event_id);
CREATE INDEX idx_agenda_event_google_syncs_user ON public.agenda_event_google_syncs(user_id);

CREATE TRIGGER trg_agenda_event_google_syncs_touch
  BEFORE UPDATE ON public.agenda_event_google_syncs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
