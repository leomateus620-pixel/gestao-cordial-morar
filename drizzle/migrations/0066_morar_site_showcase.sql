CREATE TABLE public.morar_site_showcase_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  paused boolean NOT NULL DEFAULT false,
  prepare_dow smallint NOT NULL DEFAULT 0 CHECK (prepare_dow BETWEEN 0 AND 6),
  prepare_hour smallint NOT NULL DEFAULT 18 CHECK (prepare_hour BETWEEN 0 AND 23),
  activate_hour smallint NOT NULL DEFAULT 6 CHECK (activate_hour BETWEEN 0 AND 23),
  last_run_at timestamptz,
  last_run_summary text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.morar_site_showcase_settings(id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE public.morar_site_showcase_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  property_id uuid NOT NULL,
  public_id uuid NOT NULL,
  media_id uuid NOT NULL,
  media_version text NOT NULL,
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual')),
  state text NOT NULL DEFAULT 'agendado' CHECK (state IN ('agendado','gerando','aguardando_revisao','pronto','ativo','encerrado','falhou','incerto','recusado','substituido')),
  use_original boolean NOT NULL DEFAULT false,
  model text,
  prompt_version text,
  storage_path text,
  checksum text,
  width int,
  height int,
  focal_x numeric NOT NULL DEFAULT 0.5 CHECK (focal_x BETWEEN 0 AND 1),
  focal_y numeric NOT NULL DEFAULT 0.5 CHECK (focal_y BETWEEN 0 AND 1),
  attempts int NOT NULL DEFAULT 0,
  lease uuid,
  lease_until timestamptz,
  error text,
  approved_by uuid,
  approved_at timestamptz,
  active_from timestamptz,
  active_until timestamptz,
  score numeric,
  score_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, property_id, media_id, media_version)
);
CREATE UNIQUE INDEX morar_site_showcase_one_current ON public.morar_site_showcase_weeks(week_start) WHERE state NOT IN ('recusado','substituido');
CREATE UNIQUE INDEX morar_site_showcase_one_active ON public.morar_site_showcase_weeks((true)) WHERE state = 'ativo';

CREATE TABLE public.morar_site_showcase_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.morar_site_showcase_weeks(id) ON DELETE CASCADE,
  attempt_no int NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text CHECK (outcome IN ('ok','falhou','incerto','pausado')),
  message text,
  requested_by uuid,
  UNIQUE (week_id, attempt_no)
);

CREATE TABLE public.morar_site_showcase_lock (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  lease uuid,
  lease_until timestamptz
);
INSERT INTO public.morar_site_showcase_lock(id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.morar_site_showcase_settings, public.morar_site_showcase_weeks, public.morar_site_showcase_attempts TO authenticated;
GRANT ALL ON public.morar_site_showcase_settings, public.morar_site_showcase_weeks, public.morar_site_showcase_attempts, public.morar_site_showcase_lock TO service_role;
REVOKE ALL ON public.morar_site_showcase_lock FROM PUBLIC, anon, authenticated;

ALTER TABLE public.morar_site_showcase_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.morar_site_showcase_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.morar_site_showcase_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.morar_site_showcase_lock ENABLE ROW LEVEL SECURITY;

CREATE POLICY showcase_settings_read ON public.morar_site_showcase_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria'));
CREATE POLICY showcase_weeks_read ON public.morar_site_showcase_weeks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria'));
CREATE POLICY showcase_attempts_read ON public.morar_site_showcase_attempts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria'));
CREATE POLICY meta_reviewer_block ON public.morar_site_showcase_settings AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
CREATE POLICY meta_reviewer_block ON public.morar_site_showcase_weeks AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
CREATE POLICY meta_reviewer_block ON public.morar_site_showcase_attempts AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
CREATE POLICY meta_reviewer_block ON public.morar_site_showcase_lock AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));

CREATE OR REPLACE FUNCTION public.morar_site_showcase_active()
RETURNS TABLE(week_id uuid, public_id uuid, media_id uuid, media_version text, edited boolean, checksum text, storage_path text, width int, height int, focal_x numeric, focal_y numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, w.public_id, w.media_id, w.media_version,
    (NOT w.use_original AND w.storage_path IS NOT NULL AND w.approved_at IS NOT NULL),
    w.checksum, w.storage_path, w.width, w.height, w.focal_x, w.focal_y
  FROM public.morar_site_showcase_weeks w
  JOIN public.morar_site_eligible e ON e.public_id = w.public_id
  JOIN public.morar_site_authorized_media m ON m.id = w.media_id AND m.version = w.media_version AND m.public_id = w.public_id
  WHERE w.state = 'ativo'
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.morar_site_showcase_active() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_showcase_active() TO service_role;

CREATE OR REPLACE FUNCTION public.morar_site_showcase_take_lock(_lease uuid, _seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.morar_site_showcase_lock SET lease=_lease, lease_until=now()+make_interval(secs=>_seconds)
   WHERE id AND (lease_until IS NULL OR lease_until < now() OR lease=_lease);
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.morar_site_showcase_release_lock(_lease uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.morar_site_showcase_lock SET lease=NULL, lease_until=NULL WHERE id AND lease=_lease;
$$;
REVOKE ALL ON FUNCTION public.morar_site_showcase_take_lock(uuid,int), public.morar_site_showcase_release_lock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_showcase_take_lock(uuid,int), public.morar_site_showcase_release_lock(uuid) TO service_role;

-- Ativação atômica (as duas marcas): valida candidato e troca a semana ativa na mesma transação.
CREATE OR REPLACE FUNCTION public.cordial_site_showcase_activate(_week uuid, _original boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.cordial_site_showcase_weeks;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cordial_site_showcase_activate'));
  SELECT * INTO r FROM public.cordial_site_showcase_weeks WHERE id = _week FOR UPDATE;
  IF NOT FOUND OR r.state IN ('recusado','substituido','gerando') THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cordial_site_eligible e JOIN public.cordial_site_authorized_media m ON m.public_id = e.public_id
                  WHERE e.public_id = r.public_id AND m.id = r.media_id AND m.version = r.media_version) THEN RETURN false; END IF;
  UPDATE public.cordial_site_showcase_weeks SET state='encerrado', active_until=now(), updated_at=now() WHERE state='ativo' AND id <> _week;
  UPDATE public.cordial_site_showcase_weeks SET state='ativo',
    use_original = (_original OR approved_at IS NULL OR storage_path IS NULL),
    active_from = CASE WHEN state='ativo' THEN active_from ELSE now() END, active_until=NULL, updated_at=now()
   WHERE id=_week;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.morar_site_showcase_activate(_week uuid, _original boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.morar_site_showcase_weeks;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('morar_site_showcase_activate'));
  SELECT * INTO r FROM public.morar_site_showcase_weeks WHERE id = _week FOR UPDATE;
  IF NOT FOUND OR r.state IN ('recusado','substituido','gerando') THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.morar_site_eligible e JOIN public.morar_site_authorized_media m ON m.public_id = e.public_id
                  WHERE e.public_id = r.public_id AND m.id = r.media_id AND m.version = r.media_version) THEN RETURN false; END IF;
  UPDATE public.morar_site_showcase_weeks SET state='encerrado', active_until=now(), updated_at=now() WHERE state='ativo' AND id <> _week;
  UPDATE public.morar_site_showcase_weeks SET state='ativo',
    use_original = (_original OR approved_at IS NULL OR storage_path IS NULL),
    active_from = CASE WHEN state='ativo' THEN active_from ELSE now() END, active_until=NULL, updated_at=now()
   WHERE id=_week;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.cordial_site_showcase_activate(uuid,boolean), public.morar_site_showcase_activate(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_showcase_activate(uuid,boolean), public.morar_site_showcase_activate(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.morar_site_showcase_dispatch() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
DECLARE origin text; request_id bigint;
BEGIN
  SELECT value#>>'{}' INTO origin FROM public.app_settings WHERE key = 'site_media_worker_origin';
  IF origin IS NULL OR btrim(origin) !~ '^https://[^/?#]+/?$' THEN RETURN NULL; END IF;
  request_id := net.http_post(url := rtrim(btrim(origin),'/') || '/api/public/hooks/morar-showcase', headers := public.internal_worker_headers(), body := '{}'::jsonb, timeout_milliseconds := 300000);
  RETURN request_id;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.morar_site_showcase_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.morar_site_showcase_dispatch() TO service_role;

DO $$ BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('public.internal_worker_headers()') IS NOT NULL THEN
    PERFORM cron.schedule('morar-showcase', '37 * * * *', 'SELECT public.morar_site_showcase_dispatch()');
  END IF;
END $$;