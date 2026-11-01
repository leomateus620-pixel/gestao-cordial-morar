-- lovable-cron-fallback-reviewed: Realce worker (até 2 fotos por execução, lease por item); a cada minuto mantém o lote andando mesmo com a aba fechada.
CREATE OR REPLACE FUNCTION public.realce_can_use() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria') OR public.has_role(auth.uid(),'corretor'))
$$;
CREATE OR REPLACE FUNCTION public.realce_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'admin')
$$;
REVOKE ALL ON FUNCTION public.realce_can_use(), public.realce_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realce_can_use(), public.realce_is_admin() TO authenticated, service_role;

CREATE TABLE public.realce_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT 'Teste de realce',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX realce_tests_user_idx ON public.realce_tests(user_id, created_at DESC);

CREATE TABLE public.realce_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.realce_tests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  position int NOT NULL DEFAULT 0,
  original_name text NOT NULL,
  original_path text NOT NULL,
  original_mime text NOT NULL,
  original_bytes bigint NOT NULL DEFAULT 0,
  work_path text NOT NULL,
  work_width int NOT NULL,
  work_height int NOT NULL,
  selected boolean NOT NULL DEFAULT true,
  technique text CHECK (technique IN ('ia','preset')),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','na_fila','processando','pronta','falha','incerto')),
  provider text,
  model text,
  attempts int NOT NULL DEFAULT 0,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  result_path text,
  result_width int,
  result_height int,
  result_note text,
  error_message text,
  decision text CHECK (decision IN ('realcada','original')),
  queued_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT realce_items_paths_scoped CHECK (
    original_path LIKE user_id::text || '/' || test_id::text || '/%' AND work_path LIKE user_id::text || '/' || test_id::text || '/%'
    AND (result_path IS NULL OR result_path LIKE user_id::text || '/' || test_id::text || '/%'))
);
CREATE INDEX realce_items_test_idx ON public.realce_items(test_id, position);
CREATE INDEX realce_items_queue_idx ON public.realce_items(status, next_attempt_at) WHERE status IN ('na_fila','processando');

CREATE TABLE public.realce_item_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.realce_items(id) ON DELETE CASCADE,
  test_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX realce_item_events_item_idx ON public.realce_item_events(item_id, created_at);

GRANT SELECT, INSERT, DELETE ON public.realce_tests TO authenticated;
GRANT UPDATE (title, updated_at) ON public.realce_tests TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.realce_items TO authenticated;
GRANT UPDATE (selected, decision, position, updated_at) ON public.realce_items TO authenticated;
GRANT SELECT ON public.realce_item_events TO authenticated;
GRANT ALL ON public.realce_tests, public.realce_items, public.realce_item_events TO service_role;

ALTER TABLE public.realce_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realce_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realce_item_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY realce_tests_select ON public.realce_tests FOR SELECT TO authenticated
  USING (public.realce_can_use() AND (user_id = auth.uid() OR public.realce_is_admin()));
CREATE POLICY realce_tests_insert ON public.realce_tests FOR INSERT TO authenticated
  WITH CHECK (public.realce_can_use() AND user_id = auth.uid());
CREATE POLICY realce_tests_update ON public.realce_tests FOR UPDATE TO authenticated
  USING (public.realce_can_use() AND user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY realce_tests_delete ON public.realce_tests FOR DELETE TO authenticated
  USING (public.realce_can_use() AND user_id = auth.uid());

CREATE POLICY realce_items_select ON public.realce_items FOR SELECT TO authenticated
  USING (public.realce_can_use() AND (user_id = auth.uid() OR public.realce_is_admin()));
CREATE POLICY realce_items_insert ON public.realce_items FOR INSERT TO authenticated
  WITH CHECK (public.realce_can_use() AND user_id = auth.uid() AND status = 'rascunho' AND result_path IS NULL
    AND EXISTS (SELECT 1 FROM public.realce_tests t WHERE t.id = test_id AND t.user_id = auth.uid()));
CREATE POLICY realce_items_update ON public.realce_items FOR UPDATE TO authenticated
  USING (public.realce_can_use() AND user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY realce_items_delete ON public.realce_items FOR DELETE TO authenticated
  USING (public.realce_can_use() AND user_id = auth.uid() AND status <> 'processando');

CREATE POLICY realce_events_select ON public.realce_item_events FOR SELECT TO authenticated
  USING (public.realce_can_use() AND (user_id = auth.uid() OR public.realce_is_admin()));

CREATE POLICY meta_reviewer_block ON public.realce_tests AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
CREATE POLICY meta_reviewer_block ON public.realce_items AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));
CREATE POLICY meta_reviewer_block ON public.realce_item_events AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'meta_reviewer')) WITH CHECK (NOT public.has_role(auth.uid(),'meta_reviewer'));

-- Storage privado: <user>/<test>/...
CREATE POLICY realce_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'realce' AND public.realce_can_use() AND ((storage.foldername(name))[1] = auth.uid()::text OR public.realce_is_admin()));
CREATE POLICY realce_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'realce' AND public.realce_can_use() AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (SELECT 1 FROM public.realce_tests t WHERE t.id::text = (storage.foldername(name))[2] AND t.user_id = auth.uid()));
CREATE POLICY realce_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'realce' AND public.realce_can_use() AND (storage.foldername(name))[1] = auth.uid()::text);

-- Enfileirar (idempotente): só rascunho/falha/incerto do próprio usuário; limite diário de IA.
CREATE OR REPLACE FUNCTION public.realce_enqueue(p_item_ids uuid[], p_technique text)
RETURNS TABLE(id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE used int; wanted int; daily_limit constant int := 60;
BEGIN
  IF NOT public.realce_can_use() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_technique NOT IN ('ia','preset') THEN RAISE EXCEPTION 'invalid_technique'; END IF;
  IF p_technique = 'ia' THEN
    SELECT count(*) INTO used FROM public.realce_item_events e
      WHERE e.user_id = auth.uid() AND e.status = 'na_fila' AND e.detail = 'ia' AND e.created_at > now() - interval '24 hours';
    SELECT count(*) INTO wanted FROM public.realce_items i
      WHERE i.id = ANY(p_item_ids) AND i.user_id = auth.uid() AND i.status IN ('rascunho','falha','incerto');
    IF used + wanted > daily_limit THEN RAISE EXCEPTION 'daily_limit' USING DETAIL = (daily_limit - used)::text; END IF;
  END IF;
  RETURN QUERY
  WITH upd AS (
    UPDATE public.realce_items i SET
      status = CASE WHEN p_technique = 'ia' THEN 'na_fila' ELSE 'processando' END,
      technique = p_technique, error_message = NULL, result_note = NULL,
      next_attempt_at = now(), queued_at = now(), lease_until = NULL, attempts = 0, updated_at = now()
    WHERE i.id = ANY(p_item_ids) AND i.user_id = auth.uid() AND i.status IN ('rascunho','falha','incerto')
    RETURNING i.id, i.status, i.test_id, i.user_id
  ), ev AS (
    INSERT INTO public.realce_item_events(item_id, test_id, user_id, status, detail)
    SELECT u.id, u.test_id, u.user_id, 'na_fila', p_technique FROM upd u
  )
  SELECT u.id, u.status FROM upd u;
END $$;

-- Resultado do preset (processado no aparelho, sem IA).
CREATE OR REPLACE FUNCTION public.realce_save_preset(p_item uuid, p_path text, p_width int, p_height int, p_duration_ms int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.realce_items;
BEGIN
  IF NOT public.realce_can_use() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO it FROM public.realce_items WHERE id = p_item AND user_id = auth.uid() FOR UPDATE;
  IF it.id IS NULL OR it.technique <> 'preset' OR it.status <> 'processando' THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF p_path NOT LIKE it.user_id::text || '/' || it.test_id::text || '/result/%' THEN RAISE EXCEPTION 'invalid_path'; END IF;
  UPDATE public.realce_items SET status = 'pronta', provider = 'preset-natural', model = NULL, result_path = p_path,
    result_width = p_width, result_height = p_height, finished_at = now(), started_at = coalesce(started_at, queued_at),
    duration_ms = p_duration_ms, updated_at = now() WHERE id = p_item;
  INSERT INTO public.realce_item_events(item_id, test_id, user_id, status, detail) VALUES (it.id, it.test_id, it.user_id, 'pronta', 'preset');
END $$;

CREATE OR REPLACE FUNCTION public.realce_fail_preset(p_item uuid, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.realce_can_use() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.realce_items SET status = 'falha', error_message = left(p_message, 200), finished_at = now(), updated_at = now()
    WHERE id = p_item AND user_id = auth.uid() AND technique = 'preset' AND status = 'processando';
END $$;

REVOKE ALL ON FUNCTION public.realce_enqueue(uuid[], text), public.realce_save_preset(uuid, text, int, int, int), public.realce_fail_preset(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.realce_enqueue(uuid[], text), public.realce_save_preset(uuid, text, int, int, int), public.realce_fail_preset(uuid, text) TO authenticated, service_role;

-- Reivindicação pelo servidor (lease). Item 'processando' com lease vencido vira 'incerto' (não reenvia sozinho).
CREATE OR REPLACE FUNCTION public.realce_claim(p_limit int, p_user uuid DEFAULT NULL, p_item uuid DEFAULT NULL)
RETURNS SETOF public.realce_items LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH stale AS (
    UPDATE public.realce_items SET status = 'incerto', lease_until = NULL, updated_at = now(),
      error_message = 'O envio à IA foi interrompido sem resposta. Pode ter sido processado; tente novamente se quiser.'
    WHERE status = 'processando' AND technique = 'ia' AND lease_until < now()
    RETURNING id, test_id, user_id
  )
  INSERT INTO public.realce_item_events(item_id, test_id, user_id, status, detail) SELECT id, test_id, user_id, 'incerto', 'lease' FROM stale;
  RETURN QUERY
  UPDATE public.realce_items i SET status = 'processando', lease_until = now() + interval '6 minutes',
    attempts = i.attempts + 1, started_at = coalesce(i.started_at, now()), updated_at = now()
  WHERE i.id IN (
    SELECT c.id FROM public.realce_items c
    WHERE c.status = 'na_fila' AND c.technique = 'ia' AND coalesce(c.next_attempt_at, now()) <= now()
      AND (p_user IS NULL OR c.user_id = p_user) AND (p_item IS NULL OR c.id = p_item)
    ORDER BY c.queued_at, c.position LIMIT greatest(1, least(p_limit, 3)) FOR UPDATE SKIP LOCKED)
  RETURNING i.*;
END $$;
REVOKE ALL ON FUNCTION public.realce_claim(int, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.realce_claim(int, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.realce_worker_dispatch() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net AS $$
DECLARE origin text; request_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.realce_items WHERE status IN ('na_fila','processando'))
     AND NOT EXISTS (SELECT 1 FROM public.realce_tests WHERE created_at < now() - interval '30 days') THEN RETURN NULL; END IF;
  SELECT value#>>'{}' INTO origin FROM public.app_settings WHERE key = 'site_media_worker_origin';
  IF origin IS NULL OR btrim(origin) !~ '^https://[^/?#]+/?$' THEN RETURN NULL; END IF;
  request_id := net.http_post(url := rtrim(btrim(origin),'/') || '/api/public/hooks/realce-worker', headers := public.internal_worker_headers(), body := '{}'::jsonb, timeout_milliseconds := 300000);
  RETURN request_id;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.realce_worker_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.realce_worker_dispatch() TO service_role;

DO $$ BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('public.internal_worker_headers()') IS NOT NULL THEN
    PERFORM cron.schedule('realce-worker', '* * * * *', 'SELECT public.realce_worker_dispatch()');
  END IF;
END $$;