CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO authenticated;
GRANT ALL ON public.user_push_tokens TO service_role;

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users manage own push tokens"
  ON public.user_push_tokens FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_idx ON public.user_push_tokens (user_id);

CREATE OR REPLACE FUNCTION public.push_tokens_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_user_push_tokens_updated_at ON public.user_push_tokens;
CREATE TRIGGER update_user_push_tokens_updated_at
  BEFORE UPDATE ON public.user_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.push_tokens_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT push_outbox_status_check CHECK (status IN ('pending', 'sent', 'skipped', 'failed'))
);

GRANT ALL ON public.push_outbox TO service_role;
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
-- No policies: server-only queue.

CREATE INDEX IF NOT EXISTS push_outbox_pending_idx
  ON public.push_outbox (created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.notifications_enqueue_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted boolean := false;
BEGIN
  INSERT INTO public.push_outbox (notification_id, user_id)
  VALUES (NEW.id, NEW.user_id)
  ON CONFLICT (notification_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/push-worker',
        headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_Nbi9BQM7hr8zs6w3L5PvXg_tt-UvXb7"}'::jsonb,
        body := '{"limit": 25}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notifications_enqueue_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_enqueue_push_trg ON public.notifications;
CREATE TRIGGER notifications_enqueue_push_trg
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_enqueue_push();