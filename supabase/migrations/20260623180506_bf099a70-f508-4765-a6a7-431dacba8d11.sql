
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
  recipient_email TEXT,
  email_type TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','sent','failed','skipped')),
  provider TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX email_logs_one_sent_per_type
  ON public.email_logs (attendance_id, email_type)
  WHERE status = 'sent';

CREATE INDEX email_logs_attendance_idx ON public.email_logs (attendance_id);

GRANT SELECT ON public.email_logs TO authenticated;
GRANT ALL ON public.email_logs TO service_role;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can read email logs"
  ON public.email_logs
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE TRIGGER email_logs_touch_updated_at
  BEFORE UPDATE ON public.email_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
