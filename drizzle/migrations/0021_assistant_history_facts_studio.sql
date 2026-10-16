ALTER TABLE public.assistant_messages DROP CONSTRAINT IF EXISTS assistant_messages_check;
ALTER TABLE public.assistant_messages ADD COLUMN IF NOT EXISTS card_summary jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.assistant_messages ADD CONSTRAINT assistant_messages_card_summary_check CHECK (jsonb_typeof(card_summary) = 'array');
ALTER TABLE public.assistant_conversations ADD COLUMN IF NOT EXISTS pending_choice jsonb;
ALTER TABLE public.assistant_conversations ADD COLUMN IF NOT EXISTS pending_action jsonb;
ALTER TABLE public.assistant_conversations ADD CONSTRAINT assistant_conversations_pending_choice_check CHECK (pending_choice IS NULL OR jsonb_typeof(pending_choice) = 'object');
ALTER TABLE public.assistant_conversations ADD CONSTRAINT assistant_conversations_pending_action_check CHECK (pending_action IS NULL OR jsonb_typeof(pending_action) = 'object');

CREATE TABLE IF NOT EXISTS public.assistant_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  ref_id text,
  texto text NOT NULL CHECK (char_length(texto) <= 280),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_facts_user_idx ON public.assistant_facts(user_id, created_at DESC);
REVOKE ALL ON public.assistant_facts FROM PUBLIC, anon;
GRANT SELECT, DELETE ON public.assistant_facts TO authenticated;
GRANT ALL ON public.assistant_facts TO service_role;
ALTER TABLE public.assistant_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistant_facts_select_own ON public.assistant_facts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY assistant_facts_delete_own ON public.assistant_facts FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.assistant_fact_put(p_tipo text, p_ref_id text, p_texto text, p_expires_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF char_length(coalesce(p_texto,'')) = 0 OR char_length(p_texto) > 280 THEN RAISE EXCEPTION 'invalid_fact_text'; END IF;
  INSERT INTO public.assistant_facts(user_id, tipo, ref_id, texto, expires_at)
  VALUES (auth.uid(), p_tipo, p_ref_id, p_texto, p_expires_at) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.assistant_fact_put(text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_fact_put(text, text, text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assistant_facts_purge_expired() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH deleted AS (DELETE FROM public.assistant_facts WHERE expires_at IS NOT NULL AND expires_at < now() RETURNING 1)
  SELECT count(*)::int FROM deleted;
$$;
REVOKE ALL ON FUNCTION public.assistant_facts_purge_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_facts_purge_expired() TO service_role;

CREATE TABLE IF NOT EXISTS public.studio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  marca text NOT NULL CHECK (marca IN ('cordial','morar')),
  formato text NOT NULL CHECK (formato IN ('story','feed_quadrado','feed_retrato','carrossel','video_vertical')),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aprovado','arquivado')),
  textos jsonb NOT NULL DEFAULT '{}'::jsonb,
  aprovado_por uuid,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.studio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.studio_projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('imagem','video','legenda')),
  storage_path text NOT NULL,
  width integer,
  height integer,
  source_photo_hash text,
  photo_integrity text NOT NULL DEFAULT 'original' CHECK (photo_integrity IN ('original')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.studio_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.studio_projects(id) ON DELETE SET NULL,
  actor uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER studio_projects_touch_updated_at BEFORE UPDATE ON public.studio_projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

REVOKE ALL ON public.studio_projects, public.studio_assets, public.studio_audit FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.studio_projects TO authenticated;
GRANT SELECT, INSERT ON public.studio_assets TO authenticated;
GRANT SELECT, INSERT ON public.studio_audit TO authenticated;
GRANT ALL ON public.studio_projects, public.studio_assets, public.studio_audit TO service_role;
ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public._studio_daily_counter (
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT current_date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
REVOKE ALL ON public._studio_daily_counter FROM PUBLIC, anon, authenticated;
GRANT ALL ON public._studio_daily_counter TO service_role;
ALTER TABLE public._studio_daily_counter ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.studio_daily_limit_ok(_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit integer := 30; _count integer;
BEGIN
  INSERT INTO public._studio_daily_counter (user_id, day, count) VALUES (_user_id, current_date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = public._studio_daily_counter.count + 1
  RETURNING count INTO _count;
  RETURN _count <= _limit;
END; $$;
REVOKE EXECUTE ON FUNCTION public.studio_daily_limit_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_daily_limit_ok(uuid) TO authenticated, service_role;

CREATE POLICY studio_projects_select ON public.studio_projects FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'));
CREATE POLICY studio_projects_insert ON public.studio_projects FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.studio_daily_limit_ok(auth.uid()));
CREATE POLICY studio_projects_update ON public.studio_projects FOR UPDATE TO authenticated
  USING ((owner_id = auth.uid() AND status = 'rascunho') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'))
  WITH CHECK ((owner_id = auth.uid() AND status IN ('rascunho','arquivado')) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'));
CREATE POLICY studio_assets_select ON public.studio_assets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.studio_projects p WHERE p.id = project_id AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'))));
CREATE POLICY studio_assets_insert ON public.studio_assets FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.studio_projects p WHERE p.id = project_id AND p.owner_id = auth.uid() AND p.status = 'rascunho'));
CREATE POLICY studio_audit_select ON public.studio_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria') OR actor = auth.uid());
CREATE POLICY studio_audit_insert ON public.studio_audit FOR INSERT TO authenticated WITH CHECK (actor = auth.uid());

CREATE OR REPLACE FUNCTION public.studio_project_approve(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.studio_projects;
BEGIN
  SELECT * INTO _row FROM public.studio_projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'nao_encontrado'); END IF;
  IF NOT (_row.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_permissao');
  END IF;
  UPDATE public.studio_projects SET status = 'aprovado', aprovado_por = auth.uid(), aprovado_em = now() WHERE id = p_project_id;
  INSERT INTO public.studio_audit (project_id, actor, action, details) VALUES (p_project_id, auth.uid(), 'aprovar', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.studio_project_approve(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_project_approve(uuid) TO authenticated, service_role;

CREATE POLICY "studio_assets_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'studio-assets' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria') OR (storage.foldername(name))[1] = auth.uid()::text));
CREATE POLICY "studio_assets_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'studio-assets' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "studio_assets_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'studio-assets' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria') OR (storage.foldername(name))[1] = auth.uid()::text));

NOTIFY pgrst, 'reload schema';