-- lovable-cron-fallback-reviewed: retry de push aprovado pelo dono (1 min, só chama HTTP com pendente); agenda-reminders já existia a cada minuto, apenas troca de credencial
-- 1) Colunas e estados novos (aditivo)
ALTER TABLE public.push_outbox
  ADD COLUMN IF NOT EXISTS event_at timestamptz,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedup_key text,
  ADD COLUMN IF NOT EXISTS sent_tokens text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS summary_id uuid,
  ADD COLUMN IF NOT EXISTS tipo text;

ALTER TABLE public.push_outbox DROP CONSTRAINT IF EXISTS push_outbox_status_check;
ALTER TABLE public.push_outbox ADD CONSTRAINT push_outbox_status_check CHECK (status = ANY (ARRAY[
  'pending','processing','sent','skipped','failed','failed_final','expired','summarized']));

CREATE UNIQUE INDEX IF NOT EXISTS push_outbox_dedup_key_uidx ON public.push_outbox (dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_outbox_due_idx ON public.push_outbox (next_attempt_at) WHERE status IN ('pending','failed') AND next_attempt_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_outbox_expired_idx ON public.push_outbox (user_id) WHERE status = 'expired' AND summary_id IS NULL;

-- 2) Credencial interna no cofre (gerada no próprio banco, nunca em texto no código)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_worker_token') THEN
    PERFORM vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'internal_worker_token',
      'Credencial interna das rotinas automáticas (push, agenda).');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.internal_worker_headers()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('Content-Type','application/json','apikey', s.decrypted_secret,'x-api-key', s.decrypted_secret)
    FROM vault.decrypted_secrets s WHERE s.name = 'internal_worker_token' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.internal_worker_headers() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.internal_worker_token_matches(_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(length(_token) >= 32 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets s WHERE s.name = 'internal_worker_token' AND s.decrypted_secret = _token), false);
$$;
REVOKE ALL ON FUNCTION public.internal_worker_token_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_worker_token_matches(text) TO service_role;

-- 3) Gatilho: fila + disparo imediato de UM item, sem engolir erro
CREATE OR REPLACE FUNCTION public.notifications_enqueue_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _outbox_id uuid;
BEGIN
  INSERT INTO public.push_outbox (notification_id, user_id, tipo, event_at, queued_at, next_attempt_at, dedup_key)
  VALUES (NEW.id, NEW.user_id, NEW.tipo, COALESCE(NEW.created_at, now()), now(), now() + interval '1 minute',
          COALESCE(NEW.dedup_key, concat_ws(':', NEW.tipo, COALESCE(NEW.entity_id::text, NEW.id::text), NEW.user_id::text)))
  ON CONFLICT DO NOTHING
  RETURNING id INTO _outbox_id;

  IF _outbox_id IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/push-worker',
        headers := public.internal_worker_headers(),
        body := jsonb_build_object('notification_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.push_outbox
         SET last_error = left('wake: ' || SQLERRM, 500), last_error_at = now()
       WHERE id = _outbox_id;
    END;
  END IF;
  RETURN NEW;
END $$;

-- 4) Claim de um item e dos vencidos (atômico)
CREATE OR REPLACE FUNCTION public.push_outbox_claim_one(_notification_id uuid)
RETURNS TABLE(id uuid, notification_id uuid, user_id uuid, attempts integer, event_at timestamptz, tipo text, sent_tokens text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT o.id FROM public.push_outbox o
     WHERE o.notification_id = _notification_id
       AND o.status IN ('pending','failed') AND o.attempts < 5
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.push_outbox o SET status = 'processing', claimed_at = now()
    FROM c WHERE o.id = c.id
  RETURNING o.id, o.notification_id, o.user_id, o.attempts, o.event_at, o.tipo, o.sent_tokens;
$$;

CREATE OR REPLACE FUNCTION public.push_outbox_claim_due(_limit integer DEFAULT 25)
RETURNS TABLE(id uuid, notification_id uuid, user_id uuid, attempts integer, event_at timestamptz, tipo text, sent_tokens text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH reclaimed AS (
    UPDATE public.push_outbox o SET status = 'pending', claimed_at = NULL, next_attempt_at = now()
     WHERE o.status = 'processing' AND o.next_attempt_at IS NOT NULL
       AND o.claimed_at < now() - interval '2 minutes' AND o.attempts < 5
    RETURNING o.id
  ), c AS (
    SELECT o.id FROM public.push_outbox o
     WHERE o.status IN ('pending','failed') AND o.attempts < 5
       AND o.next_attempt_at IS NOT NULL AND o.next_attempt_at <= now()
     ORDER BY o.next_attempt_at
     LIMIT GREATEST(LEAST(COALESCE(_limit, 25), 100), 1)
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.push_outbox o SET status = 'processing', claimed_at = now()
    FROM c WHERE o.id = c.id
  RETURNING o.id, o.notification_id, o.user_id, o.attempts, o.event_at, o.tipo, o.sent_tokens;
$$;

-- Resumo: pega os expirados ainda não resumidos, agrupa por usuário e marca como resumidos
CREATE OR REPLACE FUNCTION public.push_outbox_take_expired()
RETURNS TABLE(user_id uuid, summary_id uuid, total integer, tipos jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH t AS (
    SELECT o.id, o.user_id FROM public.push_outbox o
     WHERE o.status = 'expired' AND o.summary_id IS NULL
     FOR UPDATE SKIP LOCKED
  ), s AS (
    SELECT DISTINCT t.user_id, gen_random_uuid() AS sid FROM t
  ), u AS (
    UPDATE public.push_outbox o SET status = 'summarized', summary_id = s.sid, processed_at = now()
      FROM t JOIN s ON s.user_id = t.user_id
     WHERE o.id = t.id
    RETURNING o.user_id, o.summary_id, o.tipo
  )
  SELECT x.user_id, x.summary_id, sum(x.n)::int, jsonb_object_agg(x.tipo, x.n)
    FROM (SELECT u.user_id, u.summary_id, COALESCE(u.tipo, 'system') AS tipo, count(*) AS n
            FROM u GROUP BY 1, 2, 3) x
   GROUP BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.push_outbox_claim_one(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_outbox_claim_due(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_outbox_take_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_outbox_claim_one(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_outbox_claim_due(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_outbox_take_expired() TO service_role;

-- 5) Saúde da entrega (só admin) e alerta de pendente > 2 min
CREATE OR REPLACE FUNCTION public.get_push_delivery_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'pending', (SELECT count(*) FROM push_outbox WHERE status IN ('pending','processing','failed') AND next_attempt_at IS NOT NULL),
    'stuck', (SELECT count(*) FROM push_outbox WHERE status IN ('pending','processing','failed') AND next_attempt_at IS NOT NULL AND queued_at < now() - interval '2 minutes'),
    'oldest_pending_at', (SELECT min(queued_at) FROM push_outbox WHERE status IN ('pending','processing','failed') AND next_attempt_at IS NOT NULL),
    'sent_24h', (SELECT count(*) FROM push_outbox WHERE status = 'sent' AND sent_at > now() - interval '24 hours'),
    'avg_delay_s', (SELECT round(avg(extract(epoch FROM sent_at - event_at))::numeric, 1) FROM push_outbox WHERE status = 'sent' AND sent_at > now() - interval '24 hours'),
    'p95_delay_s', (SELECT round((percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM sent_at - event_at)))::numeric, 1) FROM push_outbox WHERE status = 'sent' AND sent_at > now() - interval '24 hours'),
    'failed_final_24h', (SELECT count(*) FROM push_outbox WHERE status = 'failed_final' AND processed_at > now() - interval '24 hours'),
    'summarized_24h', (SELECT count(*) FROM push_outbox WHERE status = 'summarized' AND processed_at > now() - interval '24 hours'),
    'recent_errors', (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM (
        SELECT tipo, status, attempts, last_error, last_error_at FROM push_outbox
         WHERE last_error_at > now() - interval '24 hours' ORDER BY last_error_at DESC LIMIT 5) e)
  ) INTO _r;
  RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.get_push_delivery_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_push_delivery_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.push_outbox_stuck_alert()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer := 0; _stuck integer; _bucket bigint := floor(extract(epoch FROM now()) / 1800);
BEGIN
  SELECT count(*) INTO _stuck FROM push_outbox
   WHERE status IN ('pending','processing','failed') AND next_attempt_at IS NOT NULL
     AND queued_at < now() - interval '2 minutes';
  IF _stuck = 0 THEN RETURN 0; END IF;
  WITH ins AS (
    INSERT INTO public.notifications (user_id, tipo, category, titulo, mensagem, link, lida, dedup_key)
    SELECT DISTINCT r.user_id, 'push_atrasado', 'system', 'Avisos no celular atrasados',
           _stuck || ' aviso(s) aguardando envio há mais de 2 minutos. Veja em Configurações › Entrega de push.',
           '/configuracoes', false, 'push-stuck:' || _bucket || ':' || r.user_id
      FROM public.user_roles r WHERE r.role = 'admin'
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO _n FROM ins;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.push_outbox_stuck_alert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_outbox_stuck_alert() TO service_role;

-- 6) Venda realizada -> só administradores
CREATE OR REPLACE FUNCTION public.notify_sale_created_admins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _admin uuid;
BEGIN
  FOR _admin IN SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, tipo, category, titulo, mensagem, link, lida, entity_type, entity_id, dedup_key, imobiliaria)
      VALUES (_admin, 'venda_realizada', 'financial',
              'Venda realizada' || COALESCE(' · ' || NULLIF(trim(NEW.property_name), ''), ''),
              concat_ws(' · ', NULLIF(trim(NEW.responsible_agent), ''),
                        CASE WHEN NEW.sale_value IS NOT NULL THEN 'R$ ' || to_char(NEW.sale_value, 'FM999G999G999D00') END),
              '/vendas?id=' || NEW.id, false, 'sale', NEW.id,
              'venda_realizada:' || NEW.id || ':' || _admin, NEW.imobiliaria)
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'venda_realizada notification failed for %: %', _admin, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS real_estate_sales_notify_admins ON public.real_estate_sales;
CREATE TRIGGER real_estate_sales_notify_admins
  AFTER INSERT ON public.real_estate_sales
  FOR EACH ROW EXECUTE FUNCTION public.notify_sale_created_admins();

-- 7) Crons: retry de 1 min e agenda com credencial interna
SELECT cron.schedule('push-outbox-retry', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/push-worker',
    headers := public.internal_worker_headers(),
    body := '{"mode":"retry"}'::jsonb)
  WHERE EXISTS (SELECT 1 FROM public.push_outbox WHERE status IN ('pending','processing','failed','expired') AND next_attempt_at IS NOT NULL);
$cron$);

SELECT cron.schedule('agenda-reminders-dispatch', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/agenda-reminders',
    headers := public.internal_worker_headers(),
    body := '{}'::jsonb);
$cron$);

SELECT cron.schedule('agenda-photo-digest', '0 11 * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/agenda-photo-digest',
    headers := public.internal_worker_headers(),
    body := '{}'::jsonb);
$cron$);
