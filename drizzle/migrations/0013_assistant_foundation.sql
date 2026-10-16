-- Additive foundation. These are assistant records, not new business policies.
CREATE FUNCTION public.assistant_current_scope()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce((SELECT role::text FROM public.user_roles WHERE user_id = auth.uid()
    AND role::text IN ('admin','financeiro','secretaria','corretor')
    ORDER BY CASE role::text WHEN 'admin' THEN 1 WHEN 'financeiro' THEN 2 WHEN 'secretaria' THEN 3 ELSE 4 END LIMIT 1), 'none')
    || ':' || coalesce((SELECT string_agg(DISTINCT agency::text, ',' ORDER BY agency::text)
      FROM public.user_agencies WHERE user_id = auth.uid() AND agency::text IN ('cordial','morar')), '')
$$;
REVOKE ALL ON FUNCTION public.assistant_current_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assistant_current_scope() TO authenticated, service_role;

CREATE TABLE public.assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  bot_id text NOT NULL CHECK (bot_id IN ('agenda','match','capta','lead','caixa','time','mercado')),
  scope_key text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE INDEX assistant_conversations_owner_idx ON public.assistant_conversations (user_id, updated_at DESC);

CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) <= 16000),
  CHECK (role <> 'assistant' OR content = 'Os resultados desta conversa foram atualizados conforme seu acesso atual.'),
  results jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(results) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, user_id) REFERENCES public.assistant_conversations(id, user_id)
);
CREATE INDEX assistant_messages_conversation_idx ON public.assistant_messages (conversation_id, created_at, id);

CREATE TABLE public.assistant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  conversation_id uuid,
  bot_id text NOT NULL,
  scope_key text NOT NULL,
  tool text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id, user_id) REFERENCES public.assistant_conversations(id, user_id)
);
CREATE INDEX assistant_audit_owner_idx ON public.assistant_audit (user_id, created_at DESC);

CREATE TABLE public.assistant_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  usage_day date NOT NULL,
  turns integer NOT NULL CHECK (turns BETWEEN 0 AND 1000),
  PRIMARY KEY (user_id, usage_day)
);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_daily_usage ENABLE ROW LEVEL SECURITY;

-- Browsers can read only. No forged assistant responses, quota, or audit events.
REVOKE ALL ON public.assistant_conversations, public.assistant_messages, public.assistant_audit, public.assistant_daily_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.assistant_conversations, public.assistant_messages, public.assistant_audit, public.assistant_daily_usage TO authenticated;
GRANT ALL ON public.assistant_conversations, public.assistant_messages, public.assistant_audit, public.assistant_daily_usage TO service_role;
CREATE POLICY assistant_conversations_read ON public.assistant_conversations FOR SELECT TO authenticated
  USING ((user_id = auth.uid() AND scope_key = public.assistant_current_scope()) OR (user_id <> auth.uid() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY assistant_messages_read ON public.assistant_messages FOR SELECT TO authenticated
  USING ((user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.assistant_conversations c WHERE c.id = conversation_id AND c.scope_key = public.assistant_current_scope())) OR (user_id <> auth.uid() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY assistant_audit_read ON public.assistant_audit FOR SELECT TO authenticated
  USING ((user_id = auth.uid() AND scope_key = public.assistant_current_scope()) OR (user_id <> auth.uid() AND public.has_role(auth.uid(), 'admin')));
CREATE POLICY assistant_daily_usage_read ON public.assistant_daily_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Internal server bookkeeping only. The user ID comes from verified middleware.
-- One atomic increment under concurrent requests; midnight is in Brasília.
CREATE FUNCTION public.assistant_take_daily_quota(p_user_id uuid, p_limit integer DEFAULT 80)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'invalid_quota'; END IF;
  INSERT INTO public.assistant_daily_usage (user_id, usage_day, turns)
    VALUES (p_user_id, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
  ON CONFLICT (user_id, usage_day) DO UPDATE SET turns = assistant_daily_usage.turns + 1
    WHERE assistant_daily_usage.turns < p_limit
  RETURNING turns INTO v_count;
  RETURN v_count IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.assistant_take_daily_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_take_daily_quota(uuid, integer) TO service_role;
