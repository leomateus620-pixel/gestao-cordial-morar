
-- 1. Deliveries table for idempotency
CREATE TABLE IF NOT EXISTS public.agenda_reminder_deliveries (
  event_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  offset_min integer NOT NULL,
  user_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'notification',
  PRIMARY KEY (event_id, offset_min, user_id, channel)
);

GRANT SELECT ON public.agenda_reminder_deliveries TO authenticated;
GRANT ALL ON public.agenda_reminder_deliveries TO service_role;

ALTER TABLE public.agenda_reminder_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_secretaria_view_deliveries"
ON public.agenda_reminder_deliveries FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  OR user_id = auth.uid()
);

-- 2. Indexes for the dispatcher
CREATE INDEX IF NOT EXISTS agenda_events_inicio_idx
  ON public.agenda_events(inicio)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS agenda_reminders_event_ativo_idx
  ON public.agenda_event_reminders(event_id, ativo);

-- 3. Trigger: on new event insert, ensure the 3 default internal reminders exist
CREATE OR REPLACE FUNCTION public.agenda_events_default_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.agenda_event_reminders (event_id, tipo, antecedencia_min, ativo, canal_futuro)
  VALUES
    (NEW.id, 'interno', 1440, true, false),
    (NEW.id, 'interno', 60, true, false),
    (NEW.id, 'interno', 30, true, false)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_events_default_reminders ON public.agenda_events;
CREATE TRIGGER trg_agenda_events_default_reminders
AFTER INSERT ON public.agenda_events
FOR EACH ROW EXECUTE FUNCTION public.agenda_events_default_reminders();

-- 4. Backfill 3 default reminders for FUTURE events that don't have them
INSERT INTO public.agenda_event_reminders (event_id, tipo, antecedencia_min, ativo, canal_futuro)
SELECT e.id, 'interno', v.min, true, false
FROM public.agenda_events e
CROSS JOIN (VALUES (1440), (60), (30)) AS v(min)
WHERE e.deleted_at IS NULL
  AND e.inicio > now()
  AND NOT EXISTS (
    SELECT 1 FROM public.agenda_event_reminders r
    WHERE r.event_id = e.id
      AND r.tipo = 'interno'
      AND r.antecedencia_min = v.min
  );
