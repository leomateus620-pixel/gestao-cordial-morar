CREATE TABLE public.agenda_google_sync_queue (
  event_id uuid PRIMARY KEY REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.agenda_google_sync_queue TO service_role;

ALTER TABLE public.agenda_google_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE INDEX agenda_google_sync_queue_next_attempt_idx
  ON public.agenda_google_sync_queue (next_attempt_at);

CREATE TRIGGER agenda_google_sync_queue_touch
  BEFORE UPDATE ON public.agenda_google_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();