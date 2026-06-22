
-- Google Calendar connections (per-user OAuth tokens)
CREATE TABLE public.google_calendar_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.google_calendar_connections TO authenticated;
GRANT ALL ON public.google_calendar_connections TO service_role;

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own google connection"
  ON public.google_calendar_connections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own google connection"
  ON public.google_calendar_connections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER touch_google_calendar_connections
  BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- New columns on agenda_events for Google sync metadata
ALTER TABLE public.agenda_events
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;

-- Notifications table (in-app bell)
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  link TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);
